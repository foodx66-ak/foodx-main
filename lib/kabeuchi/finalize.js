import { anthropicClient } from "./anthropic.js";
import { config } from "./config.js";
import { postToGas } from "./gas.js";
import { errorCode, logError } from "./http.js";
import { maskPii } from "./mask.js";
import { removeActive } from "./store.js";

export function buildTranscript(history) {
  return history
    .filter((h) => h.display != null)
    .map((h) => `${h.role === "user" ? "利用者" : "AI"}：${h.display}`)
    .join("\n\n");
}

export function parseScoring(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return { flags: ["判定の解析に失敗"] };
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (_) {
    return { flags: ["判定の解析に失敗"] };
  }
}

async function score(transcript) {
  if (!config.scoringPrompt || config.mock) return null;
  const anthropic = anthropicClient();
  const scoringParams = {
    model: config.model,
    max_tokens: 2000,
    system: config.scoringPrompt,
    messages: [{ role: "user", content: "<会話ログ>\n" + transcript + "\n</会話ログ>" }],
  };
  if (/claude-(sonnet|opus|haiku)-5/.test(config.model)) {
    scoringParams.thinking = { type: "between_tools" };
  }
  const res = await anthropic.messages.create(scoringParams);
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return parseScoring(text);
}

/**
 * @param {string} sid
 * @param {object} session
 */
export async function finalize(sid, session) {
  try {
    await removeActive(sid).catch(() => {});
    const lastAssistant = [...session.history].reverse().find((h) => h.role === "assistant");
    const summaryRaw = lastAssistant ? lastAssistant.content : "";
    const transcriptRaw = buildTranscript(session.history);
    let scoring = null;
    try {
      scoring = await score(transcriptRaw);
    } catch (err) {
      logError("finalize.scoring", errorCode(err));
      scoring = { flags: ["判定の呼び出しに失敗"] };
    }
    const summary = maskPii(summaryRaw);
    const transcript = maskPii(transcriptRaw);
    await postToGas({
      action: "complete",
      sid,
      leadId: session.leadId,
      startedAt: session.createdAt || null,
      lastTouchedAt: session.lastTouchedAt || null,
      turnCount: session.userTurns || 0,
      band: session.profile?.band || "",
      title: session.profile?.title || "",
      summary,
      transcript,
      scoring,
    });
  } catch (err) {
    logError("finalize", errorCode(err));
  }
}
