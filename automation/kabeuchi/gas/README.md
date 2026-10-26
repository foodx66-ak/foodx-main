# 壁打ちバディ GAS 貼り付け用コード

このディレクトリの `.gs` は **Google Apps Script へ手動で貼るための草案**です。サイトの Vercel デプロイには含まれません（`automation/` は `.vercelignore` 対象）。

## ファイル

- `abandoned.gs` … `action: "abandoned"` / `complete` のシート反映と、同じ `sid` の上書き
- `export.gs` … `action: "export"`（`since` 以降の行を JSON で返す。隔週学習用）

手順の詳細は各ファイル末尾のコメントを参照してください。**既存の doPost / 列構成に合わせて調整が必要**です。
