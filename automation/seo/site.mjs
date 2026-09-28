// サイトのファイル（静的HTML）を読み、決まった箇所だけを書き換える
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.mjs';
import { decodeEntities, escapeHtml, countOccurrences } from './util.mjs';

const RE = {
  title: /<title>([\s\S]*?)<\/title>/,
  description: /<meta name="description" content="([^"]*)">/,
  ogTitle: /<meta property="og:title" content="([^"]*)">/,
  ogDescription: /<meta property="og:description" content="([^"]*)">/,
  canonical: /<link rel="canonical" href="([^"]*)">/,
  h1: /<h1[^>]*>([\s\S]*?)<\/h1>/,
  article: /<article[^>]*>([\s\S]*?)<\/article>/,
};

export function stripTags(html) {
  return decodeEntities(String(html).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** lab/<slug>/index.html を列挙して、ページ情報を返す */
export function listArticles(repoRoot) {
  const labDir = path.join(repoRoot, CONFIG.ARTICLE_GLOB_DIR);
  return fs.readdirSync(labDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !CONFIG.EXCLUDED_ARTICLE_DIRS.includes(d.name))
    .map(d => path.join(CONFIG.ARTICLE_GLOB_DIR, d.name, 'index.html'))
    .filter(rel => fs.existsSync(path.join(repoRoot, rel)))
    .map(rel => readArticle(repoRoot, rel))
    .filter(a => a.canonical);
}

export function readArticle(repoRoot, rel) {
  const html = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  const g = re => { const m = html.match(re); return m ? m[1] : null; };
  const articleHtml = g(RE.article) || '';
  const title = g(RE.title) ? decodeEntities(g(RE.title)) : null;
  const description = g(RE.description) ? decodeEntities(g(RE.description)) : null;
  return {
    file: rel,
    html,
    canonical: g(RE.canonical),
    title,
    description,
    h1: g(RE.h1) ? stripTags(g(RE.h1)) : null,
    articleHtml,
    plainText: stripTags(articleHtml),
    // 数値照合に使う「ページに既にある文字」：本文＋現在の title / description（属性内の文字も含める）
    fullText: [title, description, stripTags(html)].filter(Boolean).join(' '),
    linksInArticle: [...articleHtml.matchAll(/href="([^"]*)"/g)].map(m => m[1]),
  };
}

function replaceOnce(html, re, buildReplacement, label) {
  const all = html.match(new RegExp(re.source, 'g')) || [];
  if (all.length !== 1) throw new Error(`${label} が1か所ではありません（${all.length}件）`);
  return html.replace(re, buildReplacement);
}

/** meta 変更：title / description と og の同期 */
export function applyMeta(html, { new_title, new_description }) {
  let out = html;
  if (new_title) {
    const t = escapeHtml(new_title);
    out = replaceOnce(out, RE.title, `<title>${t}</title>`, '<title>');
    if (RE.ogTitle.test(out)) out = replaceOnce(out, RE.ogTitle, `<meta property="og:title" content="${t}">`, 'og:title');
  }
  if (new_description) {
    const d = escapeHtml(new_description);
    out = replaceOnce(out, RE.description, `<meta name="description" content="${d}">`, 'meta description');
    if (RE.ogDescription.test(out)) out = replaceOnce(out, RE.ogDescription, `<meta property="og:description" content="${d}">`, 'og:description');
  }
  return out;
}

/** 内部リンク追加：after_text（本文中に1回だけ現れる文字列）の直後に1文を挿入 */
export function applyInternalLink(html, { after_text, sentence, anchor, href }) {
  if (countOccurrences(html, after_text) !== 1) throw new Error('挿入位置の基準文がファイル内で1回だけ現れません');
  const art = html.match(RE.article);
  if (!art || !art[0].includes(after_text)) throw new Error('挿入位置が <article> の外です');
  const i = sentence.indexOf(anchor);
  const linked = escapeHtml(sentence.slice(0, i)) + `<a href="${escapeHtml(href)}">${escapeHtml(anchor)}</a>` + escapeHtml(sentence.slice(i + anchor.length));
  return html.replace(after_text, after_text + linked);
}

/** sitemap.xml の該当URLの lastmod を更新 */
export function touchSitemap(xml, canonical, today) {
  const line = new RegExp(`(<loc>${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc><lastmod>)[0-9-]+(</lastmod>)`);
  if (!line.test(xml)) return { xml, touched: false };
  return { xml: xml.replace(line, `$1${today}$2`), touched: true };
}

/** 変更後のHTMLが壊れていないかの機械チェック */
export function verifyHtml(before, after, expectedTagDelta) {
  const tags = s => (s.match(/</g) || []).length;
  if (tags(after) - tags(before) !== expectedTagDelta) throw new Error(`タグ数の変化が想定外です（想定 ${expectedTagDelta}）`);
  for (const m of after.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    JSON.parse(m[1]); // 構文エラーなら例外
  }
  const diff = Math.abs(Buffer.byteLength(after) - Buffer.byteLength(before));
  if (diff > CONFIG.MAX_BYTES_DIFF) throw new Error(`変更量が上限を超えています（${diff} bytes）`);
}
