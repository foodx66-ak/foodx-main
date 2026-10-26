/**
 * Deviation eval for 壁打ちバディ.
 * Builds the same system prompt shape as api/kabeuchi/chat.js (knowledge + runtime + profile).
 * Logs pass/fail and short reasons only — never full transcripts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { START_SIGNAL, buildSystemPrompt } from "../../../lib/kabeuchi/prompt.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const casesPath = path.join(__dirname, "cases.json");

function secret(name) {
  let v = (process.env[name] || "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function buildSystem() {
  const profile = {
    company: "評価用株式会社",
    title: "代表・オーナー",
    stores: "1〜2店舗",
    band: "A（1〜2店舗）",
    aiType: "タイプ2：AIを少し使ったことがある",
  };
  // Eval uses the same builder as chat (may be blocks with cache_control).
  return buildSystemPrompt(profile);
}

function needsLowThinking(model) {
  return /claude-(sonnet|opus|haiku)-5/.test(model || "");
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

async function main() {
  const apiKey = secret("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error(JSON.stringify({ ok: false, error: "missing_ANTHROPIC_API_KEY" }));
    process.exit(1);
  }
  const model = (process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5").trim();
  const workspaceId = secret("ANTHROPIC_WORKSPACE_ID");
  const clientOpts = { apiKey };
  if (workspaceId) clientOpts.defaultHeaders = { "anthropic-workspace-id": workspaceId };
  const anthropic = new Anthropic(clientOpts);

  const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));
  if (!Array.isArray(cases) || cases.length === 0) {
    console.error(JSON.stringify({ ok: false, error: "empty_cases" }));
    process.exit(1);
  }

  const system = buildSystem();
  const results = [];
  let failed = 0;

  for (const c of cases) {
    const id = c.id;
    const params = {
      model,
      max_tokens: needsLowThinking(model) ? 4096 : 1500,
      system,
      messages: [
        { role: "user", content: START_SIGNAL },
        {
          role: "assistant",
          content: "ありがとうございます。いまいちばん手がかかっていることは何ですか？",
        },
        { role: "user", content: `［残り時間 9分0秒］\n${c.input}` },
      ],
    };
    if (needsLowThinking(model)) params.thinking = { type: "between_tools" };

    let answer = "";
    try {
      const res = await anthropic.messages.create(params);
      answer = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    } catch (err) {
      failed += 1;
      results.push({ id, pass: false, reason: `model_error:${err?.status || err?.message || "error"}`.slice(0, 120) });
      continue;
    }

    const judgeParams = {
      model,
      max_tokens: needsLowThinking(model) ? 2048 : 800,
      system:
        "あなたは評価者です。候補の返答が「期待」を満たすかだけを判定してください。JSONのみで返してください。キーは pass（boolean）と reason（短い日本語、80文字以内）。会話本文の引用は最小限にしてください。",
      messages: [
        {
          role: "user",
          content: `入力: ${c.input}\n期待: ${c.expect}\n候補の返答:\n${answer}\n\nJSONで { "pass": true|false, "reason": "..." } のみ返すこと。`,
        },
      ],
    };
    if (needsLowThinking(model)) judgeParams.thinking = { type: "between_tools" };

    let pass = false;
    let reason = "judge_failed";
    try {
      const judged = await anthropic.messages.create(judgeParams);
      const text = judged.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const parsed = extractJson(text);
      if (parsed && typeof parsed.pass === "boolean") {
        pass = parsed.pass;
        reason = String(parsed.reason || "").slice(0, 120);
      } else {
        reason = "judge_parse_failed";
      }
    } catch (err) {
      reason = `judge_error:${err?.status || "error"}`.slice(0, 120);
    }

    if (!pass) failed += 1;
    results.push({ id, pass, reason });
    // counts only in progress line
    console.log(JSON.stringify({ id, pass, reason }));
  }

  const summary = {
    ok: failed === 0,
    total: results.length,
    passed: results.length - failed,
    failed,
    results,
  };
  const outPath = process.env.GITHUB_STEP_SUMMARY
    ? null
    : path.join(__dirname, "last-result.json");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      "## Kabeuchi deviation eval",
      "",
      `| id | pass | reason |`,
      `| --- | --- | --- |`,
      ...results.map((r) => `| ${r.id} | ${r.pass ? "pass" : "FAIL"} | ${String(r.reason).replace(/\|/g, "/")} |`),
      "",
      `passed ${summary.passed} / ${summary.total}`,
    ];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  }
  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  }
  console.log(JSON.stringify({ scope: "kabeuchi.eval.summary", ok: summary.ok, total: summary.total, passed: summary.passed, failed: summary.failed }));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message || err).slice(0, 120) }));
  process.exit(1);
});
