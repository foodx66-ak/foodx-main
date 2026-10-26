/**
 * Mask contact-like strings before sending transcripts/summaries to GAS.
 * Does not attempt to mask company/person names (handled elsewhere).
 */

const FULLWIDTH_DIGITS = "０１２３４５６７８９";
const HALFWIDTH_DIGITS = "0123456789";

function toHalfwidthDigits(text) {
  return String(text).replace(/[０-９]/g, (ch) => HALFWIDTH_DIGITS[FULLWIDTH_DIGITS.indexOf(ch)] ?? ch);
}

/** Normalize common fullwidth punctuation used in JP phone/postal strings. */
function normalizeForMatch(text) {
  return toHalfwidthDigits(text)
    .replace(/[‐‑‒–—―ー−]/g, "-")
    .replace(/[（）]/g, (ch) => (ch === "（" ? "(" : ")"))
    .replace(/[＠]/g, "@");
}

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
const URL_RE = /https?:\/\/[^\s<>"')\]）】]+/gi;

/**
 * Domestic (0…) or +81 forms. Digit count must be 10–15 after stripping non-digits.
 * Applied before postal so "090-1234-5678" is not partially eaten as a postal code.
 */
const PHONE_RE =
  /(?:\+81[\s\-]*|0)(?:\d{1,4}|\(\d{1,4}\))[\s\-]*(?:\d{1,4}[\s\-]*){1,3}\d{3,4}/g;

/**
 * Postal: require 〒, or NNN-NNNN / NNNNNNN that does not start with 0
 * (domestic phones start with 0; this avoids 090-1234 false positives).
 */
const POSTAL_RE =
  /〒\s*\d{3}-?\d{4}(?!\d)|(?<!\d)[1-9]\d{2}-\d{4}(?!\d)|〒\s*\d{7}(?!\d)|(?<![\d\-])[1-9]\d{6}(?!\d)/g;

function maskPhoneMatch(match) {
  const digits = match.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return match;
  return "［電話］";
}

function maskNormalized(normalized) {
  let out = normalized;
  out = out.replace(URL_RE, "［URL］");
  out = out.replace(EMAIL_RE, "［メール］");
  out = out.replace(PHONE_RE, maskPhoneMatch);
  out = out.replace(POSTAL_RE, "［郵便番号］");
  return out;
}

/**
 * Apply masking to arbitrary text. Returns empty string for non-strings.
 */
export function maskPii(text) {
  if (text == null) return "";
  if (typeof text !== "string") return String(text);
  if (!text) return "";
  return maskNormalized(normalizeForMatch(text));
}
