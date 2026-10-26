/**
 * Exit checks on the full assistant reply (after streaming).
 * Reasons are short codes only — never log the reply body.
 */

export const GUARD_REPLACEMENT =
  "失礼しました。この点は、実際の状況を伺いながら面談でお答えします。壁打ちを続けますね。";

/** Public fee amounts that may appear in replies (yen). */
const ALLOWED_YEN = new Set([15000, 33000]);

/** Marker framing for the browser client (appended after the streamed body). */
export const REPLACE_MARK_START = "\u001eKB_REPLACE:";
export const REPLACE_MARK_END = "\u001e";

export function encodeReplaceEvent(reasons, text) {
  return (
    REPLACE_MARK_START +
    JSON.stringify({ type: "replace", reasons, text }) +
    REPLACE_MARK_END
  );
}

/**
 * Parse a streamed body that may end with a replace event.
 * @returns {{ text: string, replaced: boolean, reasons: string[] }}
 */
export function parseStreamBody(raw) {
  const src = String(raw || "");
  const start = src.indexOf(REPLACE_MARK_START);
  if (start === -1) return { text: src, replaced: false, reasons: [] };
  const jsonStart = start + REPLACE_MARK_START.length;
  const end = src.indexOf(REPLACE_MARK_END, jsonStart);
  if (end === -1) return { text: src.slice(0, start), replaced: false, reasons: [] };
  try {
    const payload = JSON.parse(src.slice(jsonStart, end));
    if (payload && payload.type === "replace" && typeof payload.text === "string") {
      return {
        text: payload.text,
        replaced: true,
        reasons: Array.isArray(payload.reasons) ? payload.reasons.map(String) : [],
      };
    }
  } catch (_) {
    // fall through: treat as plain text without the broken trailer
  }
  return { text: src.slice(0, start), replaced: false, reasons: [] };
}

function parseYenAmounts(text) {
  const amounts = [];
  const man = text.matchAll(/(\d+(?:\.\d+)?)\s*万円/g);
  for (const m of man) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) amounts.push(Math.round(n * 10000));
  }
  const yen = text.matchAll(/(?:¥|￥)\s*(\d{1,3}(?:,\d{3})*|\d+)/g);
  for (const m of yen) {
    const n = Number(String(m[1]).replace(/,/g, ""));
    if (Number.isFinite(n)) amounts.push(n);
  }
  const yenSuffix = text.matchAll(/(\d{1,3}(?:,\d{3})*|\d+)\s*円/g);
  for (const m of yenSuffix) {
    const n = Number(String(m[1]).replace(/,/g, ""));
    if (Number.isFinite(n)) amounts.push(n);
  }
  return amounts;
}

/**
 * Fee-like amounts only: 万円 always, or 円/¥ of 10,000+ (avoids 最低賃金などの少額).
 * Allowed public fees: 15,000 / 33,000.
 */
export function hasForbiddenPrice(text) {
  const src = String(text || "");
  for (const amount of parseYenAmounts(src)) {
    if (ALLOWED_YEN.has(amount)) continue;
    // Ignore small non-fee numbers (e.g. 1,177円 最低賃金)
    if (amount < 10000) continue;
    return true;
  }
  return false;
}

export function hasGuarantee(text) {
  const src = String(text || "");
  // 「必ず／保証／確実に」 near an outcome verb (either order, short window)
  const patterns = [
    /(?:必ず|保証|確実に)[^。．\n]{0,24}(?:上が|増え|下が|改善|削減|効果)/,
    /(?:上が|増え|下が|改善|削減|効果)[^。．\n]{0,24}(?:必ず|保証|確実に)/,
    /効果を保証/,
    /成果を保証/,
  ];
  return patterns.some((re) => re.test(src));
}

export function hasBlockedName(text, names) {
  const src = String(text || "");
  if (!src || !Array.isArray(names) || names.length === 0) return false;
  return names.some((name) => name && src.includes(name));
}

/**
 * @returns {string[]} reason codes: "price" | "guarantee" | "blocked_name"
 */
export function checkAssistantReply(text, blockedNames = []) {
  const reasons = [];
  if (hasForbiddenPrice(text)) reasons.push("price");
  if (hasGuarantee(text)) reasons.push("guarantee");
  if (hasBlockedName(text, blockedNames)) reasons.push("blocked_name");
  return reasons;
}
