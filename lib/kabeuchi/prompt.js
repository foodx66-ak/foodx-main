import fs from "node:fs";

export const KNOWLEDGE = fs.readFileSync(new URL("./knowledge.md", import.meta.url), "utf8");

export const RUNTIME_RULES = `<実行時の約束>
- 利用者の発言の先頭には、システムが［残り時間 ○分○秒］を付けます。利用者には見えていないので、残り時間には触れなくて構いません。
- 残り2分を切ったら、新しい質問をせずにまとめに入ってください。
- ［時間切れ］が付いた発言が来たら、質問をせず、そこまでの内容でまとめを出してください。
- まとめを出すときは、1行目を「【まとめ】」だけにしてください。まとめ以外の返答では「【まとめ】」を使わないでください。
- スマートフォンで読まれます。短い文で書き、見出しや太字は最小限にしてください。
</実行時の約束>`;

export const START_SIGNAL = "（利用者が壁打ちを始めました。挨拶は1文だけにして、最初の質問をしてください）";
export const SUMMARY_MARK = "【まとめ】";

export function contextBlock(profile) {
  return `<システムから渡される情報>
会社名：${profile.company}／回答者の肩書き：${profile.title}／店舗数：${profile.stores}／規模帯：${profile.band}／AIの使い方のタイプ：${profile.aiType}
</システムから渡される情報>`;
}

export function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}分${total % 60}秒`;
}

/** Optional industry news file. Missing/empty → no <参考情報> block. */
export function loadIndustryNews() {
  try {
    const text = fs.readFileSync(new URL("./industry_news.md", import.meta.url), "utf8").trim();
    return text;
  } catch (_) {
    return "";
  }
}

/**
 * System prompt as content blocks so knowledge (+ news) can use prompt cache.
 * Profile / runtime rules stay in a trailing uncached block (varies per session).
 *
 * Set KABEUCHI_PROMPT_CACHE=0 to fall back to a plain string (legacy; no cache breakpoints).
 */
export function buildSystemPrompt(profile) {
  const news = loadIndustryNews();
  const useCache = process.env.KABEUCHI_PROMPT_CACHE !== "0";

  if (!useCache) {
    const parts = [KNOWLEDGE];
    if (news) parts.push(`<参考情報>\n${news}\n</参考情報>`);
    parts.push(RUNTIME_RULES, contextBlock(profile));
    return parts.join("\n\n");
  }

  /** @type {{ type: "text", text: string, cache_control?: { type: "ephemeral" } }[]} */
  const blocks = [
    {
      type: "text",
      text: KNOWLEDGE,
      cache_control: { type: "ephemeral" },
    },
  ];
  if (news) {
    blocks.push({
      type: "text",
      text: `<参考情報>\n${news}\n</参考情報>`,
      cache_control: { type: "ephemeral" },
    });
  }
  blocks.push({
    type: "text",
    text: [RUNTIME_RULES, contextBlock(profile)].join("\n\n"),
  });
  return blocks;
}
