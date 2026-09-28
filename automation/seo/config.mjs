// ============================================================
//  設定（ここだけ触れば挙動を変えられる）
//  ※ このリポジトリはPublic。秘密情報はここに書かず GitHub Secrets へ。
// ============================================================
export const CONFIG = {
  SITE_URL: 'sc-domain:foodx.co.jp',
  ORIGIN: 'https://www.foodx.co.jp',

  // --- 自動で触ってよい範囲（許可リスト） ---
  ARTICLE_GLOB_DIR: 'lab',                 // lab/<slug>/index.html のみ
  ALLOWED_CHANGE_TYPES: ['meta', 'internal_link'],
  EXCLUDED_ARTICLE_DIRS: [                 // 自動で触らせたくない記事のディレクトリ名
    '-グルメサイト時代-の終焉飲食店とユーザーのニーズが変化し-新たな時代が幕を開ける-0', // 重複記事（-0）。統合・canonical整理は人が判断する
  ],
  LINK_TARGETS_EXTRA: [                    // 記事以外で内部リンク先に使ってよいURL
    { href: '/', label: 'AIkata（トップページ）' },
  ],

  // --- 1サイクルあたりの上限 ---
  MAX_CHANGES_PER_CYCLE: 2,                // 施策は最大2件（効果の切り分けのため）
  MAX_CANDIDATES: 3,                       // Claudeに渡す候補ページ数
  COOLDOWN_DAYS: 42,                       // 一度変えたページは6週間触らない
  MAX_BYTES_DIFF: 1500,                    // 1ファイルあたりの変更量上限

  // --- 候補の判定基準 ---
  WINDOW_DAYS: 28,                         // 分析期間（2週間では母数が少なすぎるため28日）
  DATA_DELAY_DAYS: 3,
  META_MIN_IMPRESSIONS: 50,
  META_MAX_POSITION: 15,
  META_CTR_RATIO: 0.5,                     // 期待CTRの半分未満なら meta 改善候補
  LINK_MIN_IMPRESSIONS: 30,

  // --- 文面の制約 ---
  TITLE_LEN: [15, 40],
  DESCRIPTION_LEN: [70, 160],
  LINK_SENTENCE_MAX: 120,
  BANNED_PHRASES: ['No.1', 'NO.1', 'ナンバーワン', '業界一', '最安', '日本一', '必ず', '絶対', '保証', '確実に'],

  // --- 効果測定 ---
  MEASURE_AFTER_DAYS: 35,                  // マージ後35日で判定（28日分のデータ＋反映遅延）
  MEASURE_MIN_IMPRESSIONS: 30,
  JUDGE_UP: 1.3,                           // CTRが1.3倍以上 → 効果あり
  JUDGE_DOWN: 0.8,                         // 0.8倍以下 → 悪化（要確認）

  // --- 外部サービス ---
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
  LEDGER_TAB: '自動施策ログ',
  BRANCH_PREFIX: 'seo-auto/',
};

// 掲載順位ごとの期待CTR（控えめな目安。候補抽出にのみ使う）
export function expectedCtr(position) {
  if (position <= 1.5) return 0.25;
  if (position <= 2.5) return 0.15;
  if (position <= 3.5) return 0.10;
  if (position <= 4.5) return 0.07;
  if (position <= 5.5) return 0.05;
  if (position <= 7.5) return 0.04;
  if (position <= 10.5) return 0.025;
  return 0.01;
}
