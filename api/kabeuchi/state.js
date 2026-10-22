import { config } from "../../lib/kabeuchi/config.js";
import { errorCode, errorJson, getCookie, json, logError } from "../../lib/kabeuchi/http.js";
import { currentRemainingMs, rollbackTurn } from "../../lib/kabeuchi/session.js";
import { hasAiLock, loadSession } from "../../lib/kabeuchi/store.js";

export async function GET(request) {
  const sid = getCookie(request, "kb_sid");
  let session;
  try {
    session = await loadSession(sid);
    if (session && session.state === "ai" && !(await hasAiLock(sid))) rollbackTurn(session);
  } catch (err) {
    logError("state", errorCode(err));
    return errorJson(502, "store_failed", "読み込みに失敗しました。");
  }
  if (!session) return errorJson(401, "no_session", "セッションがありません。");

  return json(200, {
    ok: true,
    state: session.state,
    remainingMs: Math.round(currentRemainingMs(session)),
    limitMs: config.limitMs,
    company: session.profile.company,
    emailMasked: session.emailMasked || "",
    bookingUrl: config.bookingUrl,
    messages: session.history
      .filter((h) => h.display != null)
      .map((h) => ({ role: h.role, text: h.display })),
  });
}
