import crypto from "node:crypto";
import { config } from "../../lib/kabeuchi/config.js";
import { buildTranscript } from "../../lib/kabeuchi/finalize.js";
import { postToGas } from "../../lib/kabeuchi/gas.js";
import { errorCode, errorJson, json, logError } from "../../lib/kabeuchi/http.js";
import { maskPii } from "../../lib/kabeuchi/mask.js";
import {
  clearAbandonedSentMark,
  listIdleActiveSids,
  loadSession,
  removeActive,
  tryMarkAbandonedSent,
} from "../../lib/kabeuchi/store.js";

const BATCH_LIMIT = 40;

function timingSafeEqualString(a, b) {
  const aa = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function authorize(request) {
  const expected = config.sweepSecret;
  if (!expected) {
    return errorJson(503, "sweep_not_configured", "sweep is not configured");
  }
  const got = request.headers.get("x-kabeuchi-sweep-secret") || "";
  if (!timingSafeEqualString(got, expected)) {
    return errorJson(401, "unauthorized", "unauthorized");
  }
  return null;
}

/**
 * Cron/GitHub Actions entry: POST with header x-kabeuchi-sweep-secret.
 * Does not use browser Origin checks (see checkPostRequest).
 */
export async function POST(request) {
  if (request.method !== "POST") {
    return errorJson(405, "method_not_allowed", "Method Not Allowed");
  }
  const denied = authorize(request);
  if (denied) return denied;

  const now = Date.now();
  const before = now - config.abandonedAfterMs;
  let candidates;
  try {
    candidates = await listIdleActiveSids(before, BATCH_LIMIT);
  } catch (err) {
    logError("sweep.list", errorCode(err));
    return errorJson(502, "store_failed", "store failed");
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const sid of candidates) {
    let claimed = false;
    try {
      claimed = await tryMarkAbandonedSent(sid);
      if (!claimed) {
        skipped += 1;
        continue;
      }

      const session = await loadSession(sid);
      if (!session) {
        await removeActive(sid);
        skipped += 1;
        continue;
      }
      if (session.state === "done") {
        await removeActive(sid);
        skipped += 1;
        continue;
      }

      const lastTouchedAt = session.lastTouchedAt || session.lastAiDoneAt || session.createdAt || 0;
      if (lastTouchedAt > before) {
        // Score was stale relative to session; refresh and skip this pass.
        await clearAbandonedSentMark(sid);
        skipped += 1;
        continue;
      }

      const transcript = maskPii(buildTranscript(session.history || []));
      await postToGas({
        action: "abandoned",
        sid,
        leadId: session.leadId || "",
        startedAt: session.createdAt || null,
        lastTouchedAt: lastTouchedAt || null,
        turnCount: session.userTurns || 0,
        band: session.profile?.band || "",
        title: session.profile?.title || "",
        transcript,
      });
      await removeActive(sid);
      sent += 1;
    } catch (err) {
      failed += 1;
      logError("sweep.item", errorCode(err));
      if (claimed) {
        await clearAbandonedSentMark(sid).catch(() => {});
      }
    }
  }

  // Counts and ids only — never log transcript/summary.
  console.log(
    JSON.stringify({
      scope: "kabeuchi.sweep",
      candidates: candidates.length,
      sent,
      skipped,
      failed,
      abandonedAfterMs: config.abandonedAfterMs,
    })
  );

  return json(200, {
    ok: true,
    candidates: candidates.length,
    sent,
    skipped,
    failed,
  });
}
