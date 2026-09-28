export const JST = 'Asia/Tokyo';

export function ymd(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: JST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
export function charLen(s) { return [...String(s)].length; }

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
export function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
export function toHalfWidthDigits(s) {
  return String(s).replace(/[０-９．，％]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}
// 文中の数値を抽出（カンマ除去・全角→半角）
export function extractNumbers(s) {
  const t = toHalfWidthDigits(s);
  return (t.match(/\d+(?:[.,]\d+)*/g) || []).map(n => n.replace(/,/g, ''));
}
export function countOccurrences(hay, needle) {
  if (!needle) return 0;
  let i = 0, n = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}
// 外部入力（検索クエリ等）を「データ」として安全に渡すための整形
export function sanitizeExternal(s, max = 80) {
  return String(s).replace(/[\u0000-\u001f\u007f<>`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
