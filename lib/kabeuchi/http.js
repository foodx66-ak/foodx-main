import { ipAddress } from "@vercel/functions";

const MAX_BODY_BYTES = 16 * 1024;

const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

export function errorJson(status, code, message) {
  return json(status, { ok: false, code, error: message });
}

export function noStoreHeaders(extra = {}) {
  return { ...BASE_HEADERS, ...extra };
}

function requestHost(request) {
  return (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim().toLowerCase();
}

/**
 * Rejects cross-site POSTs. Browsers always send Origin on POST fetches,
 * so a missing Origin is treated as untrusted.
 */
export function checkPostRequest(request) {
  if (request.method !== "POST") return errorJson(405, "method_not_allowed", "Method Not Allowed");
  const origin = request.headers.get("origin");
  let originHost = "";
  try {
    originHost = origin ? new URL(origin).host.toLowerCase() : "";
  } catch (_) {
    originHost = "";
  }
  if (!originHost || originHost !== requestHost(request)) {
    return errorJson(403, "forbidden_origin", "このページからは送信できません。");
  }
  const type = (request.headers.get("content-type") || "").toLowerCase();
  if (!type.startsWith("application/json")) {
    return errorJson(415, "unsupported_media_type", "リクエストの形式が正しくありません。");
  }
  return null;
}

export async function readJson(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return { error: errorJson(413, "payload_too_large", "入力が長すぎます。") };
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return { error: errorJson(413, "payload_too_large", "入力が長すぎます。") };
  }
  if (!text) return { body: {} };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
    return { body };
  } catch (_) {
    return { error: errorJson(400, "bad_json", "リクエストの形式が正しくありません。") };
  }
}

export function clientIp(request) {
  const fromVercel = ipAddress(request);
  if (fromVercel) return fromVercel;
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || "unknown";
}

export function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return "";
}

export function logError(scope, code) {
  console.error(`[kabeuchi] ${scope} error=${code}`);
}

export function errorCode(err) {
  if (!err) return "unknown";
  return String(err.status || err.code || err.name || "error").slice(0, 60);
}
