// node --test test/  で実行（Google / Claude / GitHub には接続しない）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readArticle, applyMeta, applyInternalLink, touchSitemap, verifyHtml } from '../site.mjs';
import { validateProposal } from '../guardrails.mjs';

const HTML = `<!DOCTYPE html><html lang="ja"><head>
<title>Googleマップと集客の関係性｜FooDX合同会社</title>
<meta name="description" content="月間10億人が使うGoogleマップは、日本でも利用率99%超の生活インフラ。">
<link rel="canonical" href="https://www.foodx.co.jp/lab/test-article">
<meta property="og:title" content="Googleマップと集客の関係性">
<meta property="og:description" content="月間10億人が使うGoogleマップは、日本でも利用率99%超の生活インフラ。">
<script type="application/ld+json">{"@type":"BlogPosting","headline":"x"}</script>
</head><body><article class="article"><h1>Googleマップと集客の関係性</h1>
<p>ある調査では、<strong>Googleマップで検索したユーザーの73%が、その後実際に店舗を訪れた</strong>というデータもあります。これは、Googleマップが強力な集客ツールであることを示しています。</p>
<p>約7割のユーザーが週に1回以上利用しています。</p>
</article><footer><a href="/">AIkata</a></footer></body></html>`;

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-'));
  fs.mkdirSync(path.join(dir, 'lab', 'test-article'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'lab', 'test-article', 'index.html'), HTML);
  const page = readArticle(dir, 'lab/test-article/index.html');
  const ctx = {
    pagesByFile: new Map([[page.file, page]]),
    candidateFiles: new Set([page.file]),
    allowedTypesByFile: new Map([[page.file, ['meta', 'internal_link']]]),
    linkTargets: new Set(['/', '/lab/other']),
  };
  return { page, ctx };
}
const GOOD_TITLE = 'Googleマップの利用率は99%超｜飲食店集客に直結するデータ';
const GOOD_DESC = 'Googleマップは月間10億人以上が使い、日本の利用率は99%超。検索したユーザーの73%が実際に来店するというデータもあります。飲食店の集客に欠かせない理由を解説します。';

test('本文にある数値だけを使った meta 提案は通る', () => {
  const { ctx } = fixture();
  assert.deepEqual(validateProposal({ file: 'lab/test-article/index.html', type: 'meta', new_title: GOOD_TITLE, new_description: GOOD_DESC, rationale: 'r' }, ctx), []);
});

test('本文にない数値（捏造）は却下', () => {
  const { ctx } = fixture();
  const errs = validateProposal({ file: 'lab/test-article/index.html', type: 'meta', new_title: 'Googleマップで来店数が3倍に｜飲食店集客の実例データ', rationale: 'r' }, ctx);
  assert.ok(errs.some(e => e.includes('ページにない数値 3')));
});

test('誇大表現・HTML・範囲外ファイル・許可外の種類は却下', () => {
  const { ctx } = fixture();
  assert.ok(validateProposal({ file: 'lab/test-article/index.html', type: 'meta', new_title: '必ず集客できるGoogleマップ活用術｜飲食店向け', rationale: 'r' }, ctx).some(e => e.includes('禁止表現')));
  assert.ok(validateProposal({ file: 'lab/test-article/index.html', type: 'meta', new_title: '<script>x</script>Googleマップ活用の基本', rationale: 'r' }, ctx).some(e => e.includes('HTML')));
  assert.ok(validateProposal({ file: 'AIkata.dc.html', type: 'meta', new_title: GOOD_TITLE, rationale: 'r' }, ctx).some(e => e.includes('許可範囲外')));
  assert.ok(validateProposal({ file: 'lab/test-article/index.html', type: 'redirect', rationale: 'r' }, ctx).some(e => e.includes('許可外')));
});

test('meta を適用すると title / description / og が揃い、タグ数は変わらない', () => {
  const { page } = fixture();
  const after = applyMeta(page.html, { new_title: GOOD_TITLE, new_description: GOOD_DESC });
  assert.ok(after.includes(`<title>${GOOD_TITLE}</title>`));
  assert.ok(after.includes(`<meta property="og:title" content="${GOOD_TITLE}">`));
  assert.ok(after.includes(`<meta name="description" content="${GOOD_DESC}">`));
  verifyHtml(page.html, after, 0);
});

test('内部リンク：本文の文の直後に1文だけ挿入され、タグは <a></a> の2つだけ増える', () => {
  const { page, ctx } = fixture();
  const p = { file: page.file, type: 'internal_link', after_text: 'これは、Googleマップが強力な集客ツールであることを示しています。', sentence: '集客を経営全体の改善につなげたい方は「AIkata（アイカタ）」をご覧ください。', anchor: 'AIkata（アイカタ）', href: '/', rationale: 'r' };
  assert.deepEqual(validateProposal(p, ctx), []);
  const after = applyInternalLink(page.html, p);
  assert.ok(after.includes('示しています。集客を経営全体の改善につなげたい方は「<a href="/">AIkata（アイカタ）</a>」をご覧ください。'));
  verifyHtml(page.html, after, 2);
});

test('内部リンク：基準文が本文にない／許可外リンク先は却下', () => {
  const { page, ctx } = fixture();
  const base = { file: page.file, type: 'internal_link', sentence: '詳しくはAIkataをご覧ください。', anchor: 'AIkata', href: '/', rationale: 'r' };
  assert.ok(validateProposal({ ...base, after_text: '存在しない文です。' }, ctx).length > 0);
  assert.ok(validateProposal({ ...base, after_text: 'これは、Googleマップが強力な集客ツールであることを示しています。', href: 'https://evil.example/' }, ctx).some(e => e.includes('許可リスト外')));
});

test('sitemap の lastmod を該当URLだけ更新', () => {
  const xml = '<url><loc>https://www.foodx.co.jp/lab/a</loc><lastmod>2025-08-25</lastmod></url>\n<url><loc>https://www.foodx.co.jp/lab/b</loc><lastmod>2025-01-01</lastmod></url>';
  const r = touchSitemap(xml, 'https://www.foodx.co.jp/lab/a', '2026-10-01');
  assert.ok(r.touched && r.xml.includes('lab/a</loc><lastmod>2026-10-01') && r.xml.includes('lab/b</loc><lastmod>2025-01-01'));
});
