// 自動PRがマージ／クローズされたとき、施策ログのステータスを更新する
import { CONFIG } from './config.mjs';
import { ymd, addDays } from './util.mjs';
import { readLedger, updateRow } from './ledger.mjs';
import { notify } from './notify.mjs';

const prUrl = process.env.PR_URL;
const merged = process.env.PR_MERGED === 'true';
const now = new Date();

const rows = (await readLedger()).filter(r => r['PR'] === prUrl && r['ステータス'] === 'PR作成');
for (const r of rows) {
  await updateRow(r.rowNumber, merged
    ? { 'ステータス': '実施済', 'マージ日': ymd(now), '測定予定日': ymd(addDays(now, CONFIG.MEASURE_AFTER_DAYS)) }
    : { 'ステータス': '却下' });
}
if (rows.length) {
  await notify(merged
    ? `:white_check_mark: SEO施策 ${rows.length}件をマージしました。効果測定は ${ymd(addDays(now, CONFIG.MEASURE_AFTER_DAYS))} 以降の定期実行で自動判定します。\nSearch Consoleで対象URLのインデックス登録をリクエストすると反映が早まります。`
    : `:x: SEO施策のPRがマージされずにクローズされました（${rows.length}件を「却下」として記録）。`);
}
console.log(`[on-merge] updated=${rows.length}`);
