import { waitUntil } from "@vercel/functions";
import { config } from "../../lib/kabeuchi/config.js";
import { postToGas } from "../../lib/kabeuchi/gas.js";
import { checkPostRequest, clientIp, errorCode, errorJson, json, logError, readJson } from "../../lib/kabeuchi/http.js";
import {
  SESSION_TTL_SEC,
  hashKey,
  hitLimit,
  isToken,
  jstDate,
  newSessionId,
  redis,
  saveLead,
  saveSession,
  takeLead,
} from "../../lib/kabeuchi/store.js";
import {
  cookieName,
  dailyCapFor,
  dailyRedisKey,
  sessionVariant,
  variantFromRequest,
  withVariant,
} from "../../lib/kabeuchi/variant.js";

const BANDS = {
  "1〜2店舗": "A（1〜2店舗）",
  "3〜10店舗": "B（3〜10店舗）",
  "11店舗以上": "C（10店舗超）",
};
const AI_TYPES = {
  "日常的に相談している": "タイプ1：AIに日常的に相談している",
  "少し使ったことがある": "タイプ2：AIを少し使ったことがある",
  "使ったことがない": "タイプ3：AIを使ったことがない",
};

function maskEmail(email) {
  const [local, domain] = String(email).split("@");
  if (!local || !domain) return "";
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

const EXPIRED = "このリンクは使用済みか、有効期限（30分）が切れています。お手数ですが、もう一度お申し込みください。";

export async function POST(request) {
  const rejected = checkPostRequest(request);
  if (rejected) return rejected;
  const { body, error } = await readJson(request);
  if (error) return error;
  if (!isToken(body.token)) return errorJson(410, "token_expired", EXPIRED);

  let lead;
  let sid;
  let leadVariant = "default";
  try {
    if (await hitLimit(`kb:rl:verify:${hashKey(clientIp(request))}`, 3600, 30)) {
      return errorJson(429, "rate_limited", "短時間に何度もアクセスされています。時間をおいて再度お試しください。");
    }
    const requested = variantFromRequest(request, body);
    if (requested.error) {
      return errorJson(400, "variant_mismatch", "ページが一致しません。メールのリンクから開き直してください。");
    }

    lead = await takeLead(body.token);
    if (!lead) return errorJson(410, "token_expired", EXPIRED);
    leadVariant = sessionVariant(lead);
    if (leadVariant !== requested.variant) {
      try {
        await saveLead(body.token, lead);
      } catch (restoreErr) {
        logError("verify.restore", errorCode(restoreErr));
      }
      return errorJson(409, "variant_mismatch", "このリンクは、お申し込みのページで開いてください。");
    }

    const dailyKey = dailyRedisKey(leadVariant, jstDate());
    const r = redis();
    const count = await r.incr(dailyKey);
    if (count === 1) await r.expire(dailyKey, 2 * 86400);
    if (count > dailyCapFor(leadVariant)) return errorJson(503, "daily_cap", "本日の受付は終了しました。");

    sid = newSessionId();
    const session = {
      leadId: lead.leadId,
      emailMasked: maskEmail(lead.email),
      profile: {
        company: lead.company,
        title: lead.title,
        stores: lead.stores,
        band: BANDS[lead.stores] || "",
        aiType: AI_TYPES[lead.aiUsage] || "",
      },
      history: [],
      remainingMs: config.limitMs,
      lastAiDoneAt: null,
      userTurns: 0,
      state: "ready",
      createdAt: Date.now(),
    };
    if (leadVariant === "security") session.variant = "security";
    await saveSession(sid, session);
  } catch (err) {
    logError("verify", errorCode(err));
    return errorJson(502, "verify_failed", "開始の処理に失敗しました。時間をおいて再度お試しください。");
  }

  waitUntil(
    postToGas(withVariant({ action: "verified", leadId: lead.leadId }, leadVariant)).catch((err) => logError("verify.gas", errorCode(err)))
  );

  return json(
    200,
    { ok: true, company: lead.company, limitMs: config.limitMs },
    { "Set-Cookie": `${cookieName(leadVariant)}=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/api/kabeuchi; Max-Age=${SESSION_TTL_SEC}` }
  );
}
