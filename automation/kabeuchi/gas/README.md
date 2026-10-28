# 壁打ちバディ GAS 貼り付け用コード

このディレクトリの `.gs` は **Google Apps Script へ手動で貼るための草案**です。サイトの Vercel デプロイには含まれません（`automation/` は `.vercelignore` 対象）。

## フェーズ1

- `abandoned.gs` … `action: "abandoned"` / `complete` のシート反映と、同じ `sid` の上書き
- `security.gs` … セキュリティ壁打ち（`variant: "security"`）の開始メールと点検票メール。action は増やさない。関数を貼るだけでは件名は変わらない。`Code.gs` の `sendStartMail_` 先頭に `if (String(body.variant || "") === "security") return sendSecurityStartMail_(body);` を足してから再デプロイする

手順の詳細は各ファイル末尾のコメントを参照してください。
