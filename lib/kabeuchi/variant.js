import { config } from "./config.js";

export const DEFAULT_VARIANT = "default";
export const SECURITY_VARIANT = "security";

/** Missing or unknown values stay on the existing wall-bounce flow. */
export function normalizeVariant(value) {
  return value === SECURITY_VARIANT ? SECURITY_VARIANT : DEFAULT_VARIANT;
}

export function isSecurity(value) {
  return normalizeVariant(value) === SECURITY_VARIANT;
}

export function cookieName(variant) {
  return isSecurity(variant) ? "kb_sec_sid" : "kb_sid";
}

/** Daily cap counters are separate. IP / email limit keys stay shared. */
export function dailyRedisKey(variant, ymd) {
  return isSecurity(variant) ? `kb:daily:security:${ymd}` : `kb:daily:${ymd}`;
}

export function dailyCapFor(variant) {
  return isSecurity(variant) ? config.securityDailyCap : config.dailyCap;
}

export function pagePath(variant) {
  return isSecurity(variant) ? "/kabeuchi/security/" : "/kabeuchi/";
}

export function verifyUrl(variant, token, base) {
  const root = String(base || "").replace(/\/+$/, "");
  return `${root}${pagePath(variant)}?t=${token}`;
}

export function sessionVariant(session) {
  return session && session.variant === SECURITY_VARIANT ? SECURITY_VARIANT : DEFAULT_VARIANT;
}

/**
 * Security pages send X-Kb-Variant and, on POST, body.variant.
 * Requests with neither stay on the default cookie and prompt.
 * @returns {{ variant: "default" | "security", error?: undefined } | { variant?: undefined, error: "variant_mismatch" }}
 */
export function variantFromRequest(request, body) {
  const header = String(request?.headers?.get?.("x-kb-variant") || "").trim();
  const fromBody = body && typeof body.variant === "string" ? body.variant.trim() : "";
  const headerNorm = header ? normalizeVariant(header) : "";
  const bodyNorm = fromBody ? normalizeVariant(fromBody) : "";
  if (headerNorm && bodyNorm && headerNorm !== bodyNorm) return { error: "variant_mismatch" };
  return { variant: normalizeVariant(bodyNorm || headerNorm) };
}

/** Attach variant only for security, so default GAS payloads stay unchanged. */
export function withVariant(payload, variant) {
  if (!isSecurity(variant)) return payload;
  return { ...payload, variant: SECURITY_VARIANT };
}
