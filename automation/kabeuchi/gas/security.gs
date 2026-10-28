/**
 * セキュリティ壁打ちバディ：差分用メモ（通常は使わない）
 *
 * 【いま貼り直すなら】
 * `Code.gs` をまるごと置き換えてください。セキュリティの開始メールと点検票メールは
 * すでに `Code.gs` に入っています。この `security.gs` を別ファイルで足す必要はありません。
 *
 * リード獲得用のスプシには貼らないでください。壁打ちログ用の既存プロジェクトだけです。
 *
 * サーバーは variant が "security" のときだけ、JSON に variant を付けます。
 *   start     … variant:"security" と verifyUrl（/kabeuchi/security/?t=...）
 *   verified  … { action:"verified", leadId, variant:"security" }
 *   complete  … variant:"security" と bookingUrl
 *   abandoned … variant:"security"（メールは送らない）
 *
 * 【貼り付け手順（Code.gs まるごと）】
 * 1. 壁打ち用 Apps Script（壁打ちログ）を開く
 * 2. Code.gs の内容を、リポジトリの automation/kabeuchi/gas/Code.gs で全部置き換える
 * 3. 以前足した security.gs があれば削除してよい（関数名が二重定義になる）
 * 4. デプロイ → 新しいバージョン
 * 5. URL が変わったら Vercel の GAS_WEBHOOK_URL を更新して Redeploy
 * 6. テスト: /kabeuchi/security/ 申し込み → 件名「【FooDX】セキュリティ壁打ちの開始リンク」
 * 7. テスト: /kabeuchi/ 申し込み → 件名はいままでどおり
 */
