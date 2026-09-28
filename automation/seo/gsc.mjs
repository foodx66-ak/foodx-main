import { CONFIG } from './config.mjs';
import { googleFetch } from './google.mjs';
import { ymd, addDays } from './util.mjs';

async function query(body) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(CONFIG.SITE_URL)}/searchAnalytics/query`;
  const data = await googleFetch(url, { method: 'POST', body: JSON.stringify(body) });
  return data.rows || [];
}

/** 直近 WINDOW_DAYS と、その前の同じ日数の期間 */
export function windows(now = new Date()) {
  const end = addDays(now, -CONFIG.DATA_DELAY_DAYS);
  const start = addDays(end, -(CONFIG.WINDOW_DAYS - 1));
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(CONFIG.WINDOW_DAYS - 1));
  return { cur: [ymd(start), ymd(end)], prev: [ymd(prevStart), ymd(prevEnd)] };
}

/** ページ別の指標 Map<url, {clicks, impressions, ctr, position}> */
export async function pageMetrics([startDate, endDate]) {
  const rows = await query({ startDate, endDate, dimensions: ['page'], rowLimit: 1000 });
  return new Map(rows.map(r => [r.keys[0], { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }]));
}

/** 1ページの上位クエリ（表示回数順） */
export async function topQueriesForPage(pageUrl, [startDate, endDate], limit = 10) {
  const rows = await query({
    startDate, endDate, dimensions: ['query'], rowLimit: 500,
    dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }] }],
  });
  return rows.sort((a, b) => b.impressions - a.impressions).slice(0, limit)
    .map(r => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
}

/** 任意期間の1ページ合計（効果測定用） */
export async function pageTotals(pageUrl, [startDate, endDate]) {
  const rows = await query({
    startDate, endDate,
    dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }] }],
  });
  const r = rows[0] || {};
  return { clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: r.ctr || 0, position: r.position || 0 };
}
