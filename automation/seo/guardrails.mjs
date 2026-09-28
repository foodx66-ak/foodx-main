// Claudeの提案を「機械的に」検証する。1つでも違反があればその提案は捨てる。
import { CONFIG } from './config.mjs';
import { charLen, extractNumbers, countOccurrences } from './util.mjs';

function numbersAllowed(text, page) {
  const known = new Set(extractNumbers(page.fullText));
  return extractNumbers(text).filter(n => !known.has(n));
}

function commonTextChecks(text, page, label, errors) {
  if (/[<>\n\r]/.test(text)) errors.push(`${label}：HTMLや改行を含めない`);
  const bad = CONFIG.BANNED_PHRASES.filter(p => text.includes(p));
  if (bad.length) errors.push(`${label}：禁止表現 ${bad.join(', ')}`);
  const unknown = numbersAllowed(text, page);
  if (unknown.length) errors.push(`${label}：ページにない数値 ${unknown.join(', ')}`);
}

/**
 * @param proposal Claudeの提案1件
 * @param ctx { pagesByFile, candidateFiles:Set, allowedTypesByFile:Map, linkTargets:Set }
 * @returns string[] エラー（空なら合格）
 */
export function validateProposal(proposal, ctx) {
  const errors = [];
  const page = ctx.pagesByFile.get(proposal.file);

  if (!/^lab\/[^/]+\/index\.html$/.test(proposal.file || '')) errors.push('対象ファイルが許可範囲外');
  if (!page) { errors.push('対象ファイルが存在しない'); return errors; }
  if (!ctx.candidateFiles.has(proposal.file)) errors.push('候補に選ばれていないページ');
  if (!CONFIG.ALLOWED_CHANGE_TYPES.includes(proposal.type)) errors.push(`変更の種類が許可外：${proposal.type}`);
  if (!(ctx.allowedTypesByFile.get(proposal.file) || []).includes(proposal.type)) errors.push('このページでは許可されていない種類');

  if (proposal.type === 'meta') {
    const { new_title, new_description } = proposal;
    if (!new_title && !new_description) errors.push('title / description のどちらも無い');
    if (new_title) {
      const n = charLen(new_title);
      if (n < CONFIG.TITLE_LEN[0] || n > CONFIG.TITLE_LEN[1]) errors.push(`titleの文字数 ${n}`);
      if (new_title === page.title) errors.push('titleが現状と同じ');
      commonTextChecks(new_title, page, 'title', errors);
    }
    if (new_description) {
      const n = charLen(new_description);
      if (n < CONFIG.DESCRIPTION_LEN[0] || n > CONFIG.DESCRIPTION_LEN[1]) errors.push(`descriptionの文字数 ${n}`);
      commonTextChecks(new_description, page, 'description', errors);
    }
  }

  if (proposal.type === 'internal_link') {
    const { after_text, sentence, anchor, href } = proposal;
    if (!after_text || !sentence || !anchor || !href) { errors.push('リンク提案の項目不足'); return errors; }
    if (!ctx.linkTargets.has(href)) errors.push(`リンク先が許可リスト外：${href}`);
    if (page.linksInArticle.includes(href)) errors.push('本文内に同じリンクが既にある');
    if (href === new URL(page.canonical).pathname) errors.push('自分自身へのリンク');
    if (countOccurrences(page.html, after_text) !== 1) errors.push('挿入位置の基準文がHTML内で1回だけ現れない');
    if (!page.articleHtml.includes(after_text)) errors.push('挿入位置が本文の外');
    if (/[<>]/.test(after_text)) errors.push('基準文にタグを含めない');
    if (!sentence.includes(anchor)) errors.push('アンカー文字列が文中にない');
    if (charLen(sentence) > CONFIG.LINK_SENTENCE_MAX) errors.push('追加文が長すぎる');
    commonTextChecks(sentence, page, '追加文', errors);
  }
  return errors;
}
