import crypto from "node:crypto";
import { config } from "../../lib/kabeuchi/config.js";
import { postToGas } from "../../lib/kabeuchi/gas.js";
import { checkPostRequest, clientIp, errorCode, errorJson, json, logError, readJson } from "../../lib/kabeuchi/http.js";
import { deleteLead, hashKey, hitLimit, jstDate, newToken, saveLead } from "../../lib/kabeuchi/store.js";

const STORES = ["1〜2店舗", "3〜10店舗", "11店舗以上"];
const AI_USAGE = ["日常的に相談している", "少し使ったことがある", "使ったことがない"];
const EMAIL_RE = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;

const clean = (value) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").trim() : "";

function validate(body) {
  const input = {
    company: clean(body.company),
    name: clean(body.name),
    title: clean(body.title),
    email: clean(body.email).toLowerCase(),
    stores: clean(body.stores),
    aiUsage: clean(body.aiUsage),
    consentPrivacy: body.consentPrivacy === true,
    consentNewsletter: body.consentNewsletter === true,
    turnstileToken: typeof body.turnstileToken === "string" ? body.turnstileToken.slice(0, 2048) : "",
  };
  if (!input.company || !input.name || !input.title || !input.email || !input.stores || !input.aiUsage) {
    return { error: "未入力の項目があります。" };
  }
  if (input.company.length > 100 || input.name.length > 100 || input.title.length > 100) {
    return { error: "会社名・担当者名・肩書きは100文字以内で入力してください。" };
  }
  if (input.email.length > 254 || !EMAIL_RE.test(input.email)) return { error: "メールアドレスの形式が正しくありません。" };
  if (!STORES.includes(input.stores) || !AI_USAGE.includes(input.aiUsage)) return { error: "選択肢から選んでください。" };
  if (!input.consentPrivacy) return { error: "プライバシーポリシーへの同意が必要です。" };
  if (!input.turnstileToken) return { error: "ロボットでないことの確認を完了してください。" };
  return { input };
}

async function verifyTurnstile(token, ip) {
  if (!config.turnstileSecret) throw Object.assign(new Error("turnstile not configured"), { code: "turnstile_env" });
  const form = new URLSearchParams({ secret: config.turnstileSecret, response: token });
  if (ip && ip !== "unknown") form.set("remoteip", ip);
  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(10000),
  });
  const data = await resp.json().catch(() => null);
  return Boolean(data && data.success === true);
}

export async function POST(request) {
  const rejected = checkPostRequest(request);
  if (rejected) return rejected;
  const { body, error } = await readJson(request);
  if (error) return error;

  const { input, error: invalid } = validate(body);
  if (invalid) return errorJson(400, "invalid_input", invalid);

  const ip = clientIp(request);
  try {
    if (!(await verifyTurnstile(input.turnstileToken, ip))) {
      return errorJson(400, "turnstile_failed", "ロボットでないことの確認に失敗しました。もう一度お試しください。");
    }
  } catch (err) {
    logError("start.turnstile", errorCode(err));
    return errorJson(502, "turnstile_unavailable", "確認処理に失敗しました。時間をおいて再度お試しください。");
  }

  const token = newToken();
  try {
    if (await hitLimit(`kb:rl:ip:${hashKey(ip)}`, 3600, config.rlIpMax)) {
      return errorJson(429, "rate_limited", "短時間に何度も送信されています。時間をおいて再度お試しください。");
    }
    if (await hitLimit(`kb:rl:mail:${hashKey(input.email)}`, 86400, config.rlMailMax)) {
      return errorJson(429, "rate_limited", "このメールアドレスでの本日の受付回数を超えました。明日以降にお試しください。");
    }
    const leadId = `kb_${jstDate()}_${crypto.randomBytes(6).toString("hex")}`;
    const lead = {
      leadId,
      company: input.company,
      name: input.name,
      title: input.title,
      email: input.email,
      stores: input.stores,
      aiUsage: input.aiUsage,
      consentNewsletter: input.consentNewsletter,
      createdAt: Date.now(),
    };
    await saveLead(token, lead);
    try {
      const { createdAt: _createdAt, ...fields } = lead;
      await postToGas({ action: "start", ...fields, verifyUrl: `${config.publicBaseUrl}/kabeuchi/?t=${token}` });
    } catch (err) {
      await deleteLead(token).catch(() => {});
      throw err;
    }
  } catch (err) {
    logError("start", errorCode(err));
    return errorJson(502, "start_failed", "受付に失敗しました。時間をおいて再度お試しください。");
  }
  return json(200, { ok: true });
}
