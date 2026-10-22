import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { postToGas } from "./gas.js";
import { errorCode, logError } from "./http.js";

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
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
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

export async function finalize(session) {
  try {
    const lastAssistant = [...session.history].reverse().find((h) => h.role === "assistant");
    const summary = lastAssistant ? lastAssistant.content : "";
    const transcript = buildTranscript(session.history);
    let scoring = null;
    try {
      scoring = await score(transcript);
    } catch (err) {
      logError("finalize.scoring", errorCode(err));
      scoring = { flags: ["判定の呼び出しに失敗"] };
    }
    await postToGas({ action: "complete", leadId: session.leadId, summary, transcript, scoring });
  } catch (err) {
    logError("finalize", errorCode(err));
  }
}
