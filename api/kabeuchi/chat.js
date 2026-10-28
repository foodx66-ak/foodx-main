import { waitUntil } from "@vercel/functions";
import { anthropicClient } from "../../lib/kabeuchi/anthropic.js";
import { config } from "../../lib/kabeuchi/config.js";
import { finalize } from "../../lib/kabeuchi/finalize.js";
import { GUARD_REPLACEMENT, checkAssistantReply, encodeReplaceEvent } from "../../lib/kabeuchi/guard.js";
import { aiErrorCode, checkPostRequest, errorCode, errorDetail, errorJson, getCookie, logError, noStoreHeaders, readJson } from "../../lib/kabeuchi/http.js";
import { KNOWLEDGE, SECURITY_CHECKLIST_MARK, SECURITY_KNOWLEDGE, SECURITY_START_SIGNAL, START_SIGNAL, SUMMARY_MARK, buildSystemPrompt, formatRemaining } from "../../lib/kabeuchi/prompt.js";
import { rollbackTurn } from "../../lib/kabeuchi/session.js";
import { acquireAiLock, loadSession, releaseAiLock, saveSession } from "../../lib/kabeuchi/store.js";
import { cookieName, isSecurity, sessionVariant, variantFromRequest } from "../../lib/kabeuchi/variant.js";

const MAX_MESSAGE_CHARS = 1000;
const RETRY = "AIの返答に失敗しました。もう一度送信してください。";

function needsLowThinking(model) {
  // Claude 5.x 系は既定で adaptive thinking が入り、短い max_tokens だと本文が空になりやすい。
  return /claude-(sonnet|opus|haiku)-5/.test(model || "");
}

async function* claudeText(session) {
  const anthropic = anthropicClient();
  const model = config.model;
  // knowledge / 参考情報は cache_control 付きブロック。問題時は KABEUCHI_PROMPT_CACHE=0。
  const system = buildSystemPrompt(session.profile, session.variant);
  const params = {
    model,
    max_tokens: needsLowThinking(model) ? 4096 : 1500,
    system,
    messages: session.history.map((h) => ({ role: h.role, content: h.content })),
  };
  if (needsLowThinking(model)) {
    // 事前の思考を止める。effort 指定は SDK／モデル組み合わせで 400 になることがあるので付けない。
    params.thinking = { type: "between_tools" };
  }
  const stream = anthropic.messages.stream(params);
  let textLen = 0;
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
      textLen += event.delta.text.length;
      yield event.delta.text;
    }
  }
  if (textLen === 0) {
    let stop = "";
    try {
      const final = await stream.finalMessage();
      stop = final?.stop_reason || "";
    } catch (_) {}
    throw Object.assign(new Error("empty reply"), { code: stop ? `empty_reply_${stop}` : "empty_reply" });
  }
}

const MOCK_QUESTION = [
  "ご利用ありがとうございます（これは画面確認用の固定の返答です）。\n\n",
  "いま一番時間を取られている業務は何ですか？\n",
  "- 仕込みや発注\n- シフト作成\n- 集客やSNS\n\n",
  "思いつくものを**ひとつ**教えてください。",
];
const MOCK_SUMMARY = [
  `${SUMMARY_MARK}\n`,
  "お話しいただいた内容を整理しました（画面確認用の固定の返答です）。\n\n",
  "- AIで進められそうなこと：日々の数字の確認と、発注量の目安づくり\n",
  "- まず試すこと：1週間分の売上と発注の記録を、AIに読ませてみる\n\n",
  "> 次の一歩は、面談で具体的な手順を一緒に決めることです。",
];
const SECURITY_MOCK_QUESTION = [
  "ご利用ありがとうございます（これは画面確認用の固定の返答です）。\n\n",
  "いま、お店で困っていることはありますか？\n",
  "- 身に覚えのないログインや、金の要求がある\n- 特に起きてはいないが、点検したい\n\n",
  "近いものを**ひとつ**教えてください。パスワードや管理画面のURLは書かないでください。",
];
const SECURITY_MOCK_CHECKLIST = [
  `${SECURITY_CHECKLIST_MARK}\n`,
  "分かった範囲で整理しました（画面確認用の固定の返答です）。\n\n",
  "- パスワードとアカウント：未確認\n",
  "- メール：未確認\n",
  "- 店舗のパソコンとスマホ：未確認\n",
  "- 予約とお客様の情報：未確認\n",
  "- 会計と決済：未確認\n",
  "- 店のネット回線：未確認\n",
  "- 何か起きたときの初動：未確認\n\n",
  "安全を保証するものではありません。\n",
];

async function* mockText(session, forced) {
  const security = isSecurity(session.variant);
  const question = security ? SECURITY_MOCK_QUESTION : MOCK_QUESTION;
  const closing = security ? SECURITY_MOCK_CHECKLIST : MOCK_SUMMARY;
  const parts = forced || session.userTurns >= 3 ? closing : question;
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 6) {
      await new Promise((r) => setTimeout(r, 30));
      yield part.slice(i, i + 6);
    }
  }
}

function truncate(text) {
  return Array.from(text.trim()).slice(0, MAX_MESSAGE_CHARS).join("");
}

export async function POST(request) {
  const rejected = checkPostRequest(request);
  if (rejected) return rejected;
  const { body, error } = await readJson(request);
  if (error) return error;

  const requested = variantFromRequest(request, body);
  if (requested.error) {
    return errorJson(400, "variant_mismatch", "ページが一致しません。メールのリンクから開き直してください。");
  }
  const sid = getCookie(request, cookieName(requested.variant));
  let session;
  try {
    session = await loadSession(sid);
  } catch (err) {
    logError("chat.load", errorCode(err));
    return errorJson(502, "store_failed", RETRY);
  }
  if (!session) return errorJson(401, "no_session", "セッションが見つかりません。もう一度お申し込みください。");
  if (sessionVariant(session) !== requested.variant) {
    return errorJson(401, "no_session", "セッションが見つかりません。もう一度お申し込みください。");
  }
  if (session.state === "done") return errorJson(410, "done", "この壁打ちは終了しています。");
  const knowledgeText = isSecurity(session.variant) ? SECURITY_KNOWLEDGE : KNOWLEDGE;
  if (!config.mock && knowledgeText.includes("KNOWLEDGE_PLACEHOLDER")) {
    logError("chat", "knowledge_missing");
    return errorJson(503, "not_ready", "現在準備中です。時間をおいて再度お試しください。");
  }

  try {
    if (!(await acquireAiLock(sid))) return errorJson(409, "busy", "AIが返答中です。返答が終わるまでお待ちください。");
  } catch (err) {
    logError("chat.lock", errorCode(err));
    return errorJson(502, "store_failed", RETRY);
  }

  let forced = false;
  try {
    session = await loadSession(sid);
    if (!session) {
      await releaseAiLock(sid);
      return errorJson(401, "no_session", "セッションが見つかりません。もう一度お申し込みください。");
    }
    if (session.state === "done") {
      await releaseAiLock(sid);
      return errorJson(410, "done", "この壁打ちは終了しています。");
    }
    if (session.state === "ai") rollbackTurn(session);

    const now = Date.now();
    const pending = { state: session.state, historyLen: session.history.length, userTurns: session.userTurns };

    if (session.state === "ready") {
      const signal = isSecurity(session.variant) ? SECURITY_START_SIGNAL : START_SIGNAL;
      session.history.push({ role: "user", content: signal, display: null, meta: "開始" });
    } else {
      session.remainingMs -= now - (session.lastAiDoneAt || now);
      const message = typeof body.message === "string" ? truncate(body.message) : "";
      forced = session.remainingMs <= 0 || body.action === "timeup" || session.userTurns + 1 >= config.maxTurns;
      if (!message && !forced) {
        await saveSession(sid, session);
        await releaseAiLock(sid);
        return errorJson(400, "empty_message", "メッセージを入力してください。");
      }
      const meta = forced ? "時間切れ" : `残り${formatRemaining(session.remainingMs)}`;
      const content = forced
        ? `［時間切れ］\n${message || "（利用者の入力はありません）"}`
        : `［残り時間 ${formatRemaining(session.remainingMs)}］\n${message}`;
      session.history.push({ role: "user", content, display: message || null, meta });
      session.userTurns += 1;
    }

    session.pending = pending;
    session.state = "ai";
    await saveSession(sid, session);
  } catch (err) {
    logError("chat.prepare", errorCode(err));
    await releaseAiLock(sid).catch(() => {});
    return errorJson(502, "store_failed", RETRY);
  }

  const fail = async (scope, err) => {
    logError(scope, errorCode(err));
    try {
      rollbackTurn(session);
      await saveSession(sid, session);
    } catch (saveErr) {
      logError(`${scope}.rollback`, errorCode(saveErr));
    }
    await releaseAiLock(sid).catch(() => {});
  };

  const source = (config.mock ? mockText(session, forced) : claudeText(session))[Symbol.asyncIterator]();
  let first;
  try {
    do {
      first = await source.next();
    } while (!first.done && !first.value);
    if (first.done) throw Object.assign(new Error("empty reply"), { code: "empty_reply" });
  } catch (err) {
    await fail("chat.ai", err);
    return errorJson(502, aiErrorCode(err), RETRY, errorDetail(err));
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (text) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch (_) {
          // client went away; keep generating so the reply is still saved
        }
      };
      let full = first.value;
      push(first.value);
      try {
        for (let next = await source.next(); !next.done; next = await source.next()) {
          full += next.value;
          push(next.value);
        }
      } catch (err) {
        await fail("chat.stream", err);
        try { controller.error(err); } catch (_) {}
        return;
      }

      try {
        delete session.pending;
        const endMark = isSecurity(session.variant) ? SECURITY_CHECKLIST_MARK : SUMMARY_MARK;
        const wasDone = forced || full.trimStart().startsWith(endMark);
        let reply = full;
        const reasons = checkAssistantReply(full, config.blockedNames);
        if (reasons.length) {
          reply = GUARD_REPLACEMENT;
          // sid + reason codes only — never the reply body
          console.log(JSON.stringify({ scope: "kabeuchi.guard", sid, reasons }));
          push(encodeReplaceEvent(reasons, reply));
        }
        session.history.push({ role: "assistant", content: reply, display: reply });
        session.lastAiDoneAt = Date.now();
        session.state = wasDone ? "done" : "user";
        await saveSession(sid, session);
        await releaseAiLock(sid);
        if (session.state === "done") waitUntil(finalize(sid, session));
      } catch (err) {
        logError("chat.save", errorCode(err));
      }
      try { controller.close(); } catch (_) {}
    },
  });

  return new Response(stream, {
    status: 200,
    headers: noStoreHeaders({
      "Content-Type": "text/plain; charset=utf-8",
      "X-Kb-Remaining-Ms": String(Math.max(0, Math.round(session.remainingMs))),
      "X-Kb-Forced": forced ? "1" : "0",
      "X-Accel-Buffering": "no",
    }),
  });
}
