// 施策ログ（Google スプレッドシート）。PRには理由を書かず、ここに残す（Publicリポジトリ対策）
import { CONFIG } from './config.mjs';
import { googleFetch } from './google.mjs';

export const HEADERS = [
  '施策ID', '作成日', '対象URL', 'ファイル', '種別', '変更前', '変更後', '根拠',
  '実施前CTR', '実施前表示', '実施前順位', '基準期間', 'PR', 'ステータス',
  'マージ日', '測定予定日', '実施後CTR', '実施後表示', '実施後順位', '判定',
];
const col = name => HEADERS.indexOf(name);
const colLetter = i => String.fromCharCode(65 + i);
const base = () => `https://sheets.googleapis.com/v4/spreadsheets/${process.env.LEDGER_SHEET_ID}`;
const tab = encodeURIComponent(CONFIG.LEDGER_TAB);

export async function ensureLedger() {
  const meta = await googleFetch(`${base()}?fields=sheets.properties.title`);
  if (!meta.sheets.some(s => s.properties.title === CONFIG.LEDGER_TAB)) {
    await googleFetch(`${base()}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: CONFIG.LEDGER_TAB } } }] }) });
    await googleFetch(`${base()}/values/${tab}!A1?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [HEADERS] }) });
  }
}

/** 全行を {rowNumber, ...列名: 値} で返す */
export async function readLedger() {
  const data = await googleFetch(`${base()}/values/${tab}!A1:${colLetter(HEADERS.length - 1)}`);
  const [, ...rows] = data.values || [];
  return rows.map((r, i) => {
    const o = { rowNumber: i + 2 };
    HEADERS.forEach((h, j) => { o[h] = r[j] ?? ''; });
    return o;
  });
}

export async function appendRows(objs) {
  if (!objs.length) return;
  const values = objs.map(o => HEADERS.map(h => o[h] ?? ''));
  await googleFetch(`${base()}/values/${tab}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values }) });
}

/** 1行の一部の列を更新 */
export async function updateRow(rowNumber, fields) {
  const data = Object.entries(fields).map(([k, v]) => ({ range: `${CONFIG.LEDGER_TAB}!${colLetter(col(k))}${rowNumber}`, values: [[v]] }));
  await googleFetch(`${base()}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) });
}
