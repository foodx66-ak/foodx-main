# 壁打ちバディ GAS 貼り付け用コード

このディレクトリの `.gs` は **Google Apps Script へ手動で貼るための草案**です。サイトの Vercel デプロイには含まれません（`automation/` は `.vercelignore` 対象）。

## 貼る先

**壁打ちログ用の既存 Apps Script** だけです。リード獲得用のスプシや、新規スプシには貼らないでください。Vercel の `GAS_WEBHOOK_URL` が向いているプロジェクトです。

## ファイル

- `Code.gs` … **これ1ファイルで足りる。** start / verified / complete / abandoned / export と、セキュリティ版の開始メール・点検票メールまで含む。既存の Code.gs をまるごと置き換える
- `security.gs` … 差分メモのみ。いまは `Code.gs` を使う
- `abandoned.gs` … フェーズ1当時の差分草案。現行は `Code.gs` に含まれている

## 手順（まるごと貼り直し）

1. 壁打ち用 Apps Script を開く
2. `Code.gs` をリポジトリの内容で全部置き換える
3. 以前追加した `security.gs` があれば削除する（関数の二重定義を避ける）
4. デプロイ → 新しいバージョン（URL が変わる場合は `GAS_WEBHOOK_URL` を更新）
5. `/kabeuchi/security/` で申し込み → 件名が「【FooDX】セキュリティ壁打ちの開始リンク」になること
6. `/kabeuchi/` で申し込み → 件名はいままでどおりであること
