// ============================================================
//  SEOサイクル本体（GitHub Actions から定期実行）
//  ① 効果測定 → ② 未マージPRの確認 → ③ 候補抽出 → ④ Claudeで提案
//  → ⑤ 機械検証 → ⑥ 変更・PR作成 → ⑦ 施策ログ記録 → ⑧ Slack通知
//  ※ Publicリポジトリのため、分析内容はログに出さず Slack とスプレッドシートにのみ送る
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, expectedCtr } from './config.mjs';
import { ymd, addDays, sanitizeExternal, countOccurrences } from './util.mjs';
import { listArticles } from './site.mjs';
import { applyMeta, applyInternalLink, touchSitemap, verifyHtml } from './site.mjs';
import { validateProposal } from './guardrails.mjs';
import { windows, pageMetrics, topQueriesForPage, pageTotals } from './gsc.mjs';
import { ensureLedger, readLedger, appendRows, updateRow } from './ledger.mjs';
import { proposeChanges } from './claude.mjs';
import { notify } from './notify.mjs';
import { git, createPullRequest } from './github.mjs';

const REPO_ROOT = process.env.REPO_ROOT || path.resolve(process.cwd(), '../..');
const DRY_RUN = process.env.DRY_RUN === 'true';
const now = new Date();
const today = ymd(now);
const pct = x => `${(x * 100).toFixed(2)}%`;
const norm = u => { try { return decodeURI(u); } catch { return u; } };
const log = s => console.log(`[seo-cycle] ${s}`); // 中身（文面・数値）は出さない

// ---------- ① 効果測定 ----------
async function evaluateDue(rows, messages) {
  for (const r of rows.filter(r => r['ステータス'] === '実施済' && !r['判定'] && r['測定予定日'] && r['測定予定日'] <= today)) {
    const merged = new Date(`${r['マージ日']}T00:00:00+09:00`);
    const win = [ymd(addDays(merged, 4)), ymd(addDays(merged, 4 + CONFIG.WINDOW_DAYS - 1))];
    if (win[1] > ymd(addDays(now, -CONFIG.DATA_DELAY_DAYS))) continue;
    const after = await pageTotals(r['対象URL'], win);
    const beforeCtr = Number(r['実施前CTR']) || 0;
    let verdict;
    if (after.impressions < CONFIG.MEASURE_MIN_IMPRESSIONS) verdict = '判定保留（データ不足）';
    else if (beforeCtr === 0) verdict = after.clicks > 0 ? '効果あり（0→クリック発生）' : '変化なし';
    else if (after.ctr / beforeCtr >= CONFIG.JUDGE_UP) verdict = '効果あり';
    else if (after.ctr / beforeCtr <= CONFIG.JUDGE_DOWN) verdict = '悪化（要確認）';
    else verdict = '変化なし';
    if (!DRY_RUN) await updateRow(r.rowNumber, { '実施後CTR': after.ctr, '実施後表示': after.impressions, '実施後順位': after.position, '判定': verdict, 'ステータス': '効果判定済' });
    messages.push(`• ${r['施策ID']}（${r['種別']}）${decodeURI(new URL(r['対象URL']).pathname)}\n  CTR ${pct(beforeCtr)} → ${pct(after.ctr)}／表示 ${r['実施前表示']} → ${after.impressions}：*${verdict}*`);
  }
}

// ---------- ③ 候補抽出（機械的に決める。Claudeには候補しか渡さない） ----------
function linkAnchorOptions(page) {
  const texts = page.articleHtml.split(/<[^>]+>/);
  const out = [];
  for (const t of texts) {
    for (const s of t.split(/(?<=。)/)) {
      const x = s.trim();
      if (x.endsWith('。') && [...x].length >= 15 && countOccurrences(page.html, x) === 1) out.push(x);
    }
  }
  return out.slice(0, 40);
}

function buildCandidates(pages, cur, prev, rows) {
  const recent = new Set(rows
    .filter(r => r['ステータス'] === 'PR作成' || (r['作成日'] && r['作成日'] >= ymd(addDays(now, -CONFIG.COOLDOWN_DAYS))))
    .map(r => r['ファイル']));
  const curN = new Map([...cur].map(([k, v]) => [norm(k), v]));
  const prevN = new Map([...prev].map(([k, v]) => [norm(k), v]));

  const list = [];
  for (const p of pages) {
    if (recent.has(p.file)) continue;
    const m = curN.get(norm(p.canonical));
    if (!m) continue;
    const types = [];
    if (m.impressions >= CONFIG.META_MIN_IMPRESSIONS && m.position <= CONFIG.META_MAX_POSITION && m.ctr < expectedCtr(m.position) * CONFIG.META_CTR_RATIO) types.push('meta');
    const hasTopLink = p.linksInArticle.some(h => h === '/' || h === `${CONFIG.ORIGIN}/`);
    if (m.impressions >= CONFIG.LINK_MIN_IMPRESSIONS && !hasTopLink) types.push('internal_link');
    if (!types.length) continue;
    const score = m.impressions * Math.max(0, expectedCtr(m.position) - m.ctr) + (types.includes('internal_link') ? m.impressions * 0.005 : 0);
    list.push({ page: p, metrics: m, prevMetrics: prevN.get(norm(p.canonical)) || null, types, score });
  }
  return list.sort((a, b) => b.score - a.score).slice(0, CONFIG.MAX_CANDIDATES);
}

async function main() {
  log(`start dry_run=${DRY_RUN}`);
  const messages = [];
  await ensureLedger(); // シートが無ければ見出し付きで作成（DRY RUNでも作る＝初回の準備を兼ねる）
  const rows = await readLedger();

  const evalMsgs = [];
  await evaluateDue(rows, evalMsgs);
  if (evalMsgs.length) messages.push(`*効果測定*\n${evalMsgs.join('\n')}`);

  // ② 未マージのPRが残っていれば、新しい施策は出さない（積み上げない）
  const pending = rows.filter(r => r['ステータス'] === 'PR作成');
  if (pending.length) {
    messages.push(`*未マージのPRがあるため、今回は新しい施策を作りません*\n${[...new Set(pending.map(r => r['PR']))].join('\n')}`);
    return finish(messages);
  }

  const pages = listArticles(REPO_ROOT);
  const w = windows(now);
  const [cur, prev] = await Promise.all([pageMetrics(w.cur), pageMetrics(w.prev)]);
  const cands = buildCandidates(pages, cur, prev, rows);
  log(`candidates=${cands.length}`);
  if (!cands.length) {
    messages.push('*今回の施策：なし*\n基準を満たす候補ページがありませんでした（無理に変更しません）。');
    return finish(messages);
  }

  for (const c of cands) c.queries = await topQueriesForPage(c.page.canonical, w.cur);

  const linkTargets = [
    ...CONFIG.LINK_TARGETS_EXTRA,
    ...pages.map(p => ({ href: new URL(p.canonical).pathname, label: p.title })),
  ];
  const payload = cands.map(c => ({
    file: c.page.file,
    url: decodeURI(c.page.canonical),
    allowed_types: c.types,
    metrics_28d: { clicks: c.metrics.clicks, impressions: c.metrics.impressions, ctr: +c.metrics.ctr.toFixed(4), position: +c.metrics.position.toFixed(1) },
    metrics_prev_28d: c.prevMetrics && { clicks: c.prevMetrics.clicks, impressions: c.prevMetrics.impressions, ctr: +c.prevMetrics.ctr.toFixed(4), position: +c.prevMetrics.position.toFixed(1) },
    top_queries: c.queries.map(q => ({ query: sanitizeExternal(q.query), impressions: q.impressions, clicks: q.clicks, position: +q.position.toFixed(1) })),
    current: { title: c.page.title, description: c.page.description, h1: c.page.h1 },
    link_anchor_options: c.types.includes('internal_link') ? linkAnchorOptions(c.page) : undefined,
    article_text: c.page.plainText.slice(0, 5000),
  }));

  const { changes, skipped_reason } = await proposeChanges(payload, linkTargets);

  // ⑤ 機械検証
  const ctx = {
    pagesByFile: new Map(pages.map(p => [p.file, p])),
    candidateFiles: new Set(cands.map(c => c.page.file)),
    allowedTypesByFile: new Map(cands.map(c => [c.page.file, c.types])),
    linkTargets: new Set(linkTargets.map(t => t.href)),
  };
  const accepted = [], rejected = [];
  const usedFiles = new Set();
  for (const ch of changes) {
    const errs = validateProposal(ch, ctx);
    if (usedFiles.has(ch.file)) errs.push('同じページへの2件目の変更');
    if (errs.length) rejected.push({ ch, errs }); else { accepted.push(ch); usedFiles.add(ch.file); }
  }
  log(`proposed=${changes.length} accepted=${accepted.length} rejected=${rejected.length}`);

  const describe = ch => {
    const p = ctx.pagesByFile.get(ch.file);
    const name = decodeURI(new URL(p.canonical).pathname);
    if (ch.type === 'meta') return `• *meta* ${name}\n  title：${p.title} → ${ch.new_title || '（変更なし）'}\n  description：${ch.new_description ? ch.new_description : '（変更なし）'}\n  根拠：${ch.rationale}`;
    return `• *内部リンク* ${name}\n  追加文：${ch.sentence}（→ ${ch.href}）\n  根拠：${ch.rationale}`;
  };
  if (rejected.length) messages.push(`*検証で却下した提案*\n${rejected.map(r => `• ${r.ch.type} ${r.ch.file}：${r.errs.join(' / ')}`).join('\n')}`);
  if (!accepted.length) {
    messages.push(`*今回の施策：なし*${skipped_reason ? `\n${skipped_reason}` : ''}`);
    return finish(messages);
  }
  if (DRY_RUN) {
    messages.push(`*[DRY RUN] 実行されれば以下のPRを作ります*\n${accepted.map(describe).join('\n')}`);
    return finish(messages);
  }

  // ⑥ 変更 → commit → push → PR
  const branch = `${CONFIG.BRANCH_PREFIX}${today}`;
  git(['checkout', '-b', branch], REPO_ROOT);
  const sitemapPath = path.join(REPO_ROOT, 'sitemap.xml');
  const ledgerRows = [];
  accepted.forEach((ch, i) => {
    const p = ctx.pagesByFile.get(ch.file);
    const abs = path.join(REPO_ROOT, ch.file);
    const before = fs.readFileSync(abs, 'utf8');
    const after = ch.type === 'meta' ? applyMeta(before, ch) : applyInternalLink(before, ch);
    verifyHtml(before, after, ch.type === 'meta' ? 0 : 2);
    fs.writeFileSync(abs, after);
    const sm = touchSitemap(fs.readFileSync(sitemapPath, 'utf8'), p.canonical, today);
    if (sm.touched) fs.writeFileSync(sitemapPath, sm.xml);
    git(['add', '--', ch.file, ...(sm.touched ? ['sitemap.xml'] : [])], REPO_ROOT);
    git(['commit', '-m', `seo(auto): ${ch.type} ${path.dirname(ch.file).split('/').pop()}`], REPO_ROOT);

    const c = cands.find(c => c.page.file === ch.file);
    ledgerRows.push({
      '施策ID': `${today}-${i + 1}`, '作成日': today, '対象URL': p.canonical, 'ファイル': ch.file, '種別': ch.type,
      '変更前': ch.type === 'meta' ? `title: ${p.title}\ndescription: ${p.description}` : '',
      '変更後': ch.type === 'meta' ? `title: ${ch.new_title || '(変更なし)'}\ndescription: ${ch.new_description || '(変更なし)'}` : `${ch.sentence} → ${ch.href}`,
      '根拠': ch.rationale,
      '実施前CTR': c.metrics.ctr, '実施前表示': c.metrics.impressions, '実施前順位': c.metrics.position,
      '基準期間': `${w.cur[0]}〜${w.cur[1]}`, 'ステータス': 'PR作成',
    });
  });
  git(['push', 'origin', branch], REPO_ROOT);
  const prUrl = await createPullRequest({
    head: branch,
    title: `SEO自動サイクル ${today}（${accepted.length}件）`,
    body: [
      '自動SEOサイクルによる変更です。',
      '',
      ...accepted.map(ch => `- ${ch.type}: \`${ch.file}\``),
      '',
      '根拠・効果測定は非公開の施策ログに記録しています。',
      'マージすると効果測定のスケジュールが自動で登録されます。不要ならクローズしてください。',
    ].join('\n'),
  });
  ledgerRows.forEach(r => { r['PR'] = prUrl; });
  await appendRows(ledgerRows);

  messages.push(`*今回の施策（${accepted.length}件）— 確認してマージしてください*\n${prUrl}\n${accepted.map(describe).join('\n')}`);
  return finish(messages);
}

async function finish(messages) {
  const head = `:mag: *foodx.co.jp SEO自動サイクル ${today}*${DRY_RUN ? '（DRY RUN）' : ''}`;
  await notify([head, ...messages].join('\n\n'));
  log('done');
}

main().catch(async e => {
  console.error(`[seo-cycle] 失敗: ${e.message}`);
  await notify(`:warning: *SEO自動サイクルが失敗しました（${today}）*\n${e.message}\nGitHub Actions の実行履歴を確認してください。`);
  process.exit(1);
});
