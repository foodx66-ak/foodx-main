# 壁打ちバディ GAS 貼り付け用コード

`automation/` は `.vercelignore` 対象のため、サイト配信には含まれません。**Apps Script へ手動で貼る**前提です。

## 使うファイル

| ファイル | 扱い |
|---|---|
| **`Code.gs`** | **これだけ貼る**（start / verified / complete / abandoned / export 一式） |
| `abandoned.gs` | 統合済み・貼らない（参照用） |
| `export.gs` | 統合済み・貼らない（参照用） |

## セットアップ手順（概要）

1. リード用 Google スプレッドシートを開く → 拡張機能 → Apps Script  
2. `Code.gs` の内容をエディタに貼る（既存の空 `コード.gs` を置き換えで可）  
3. プロジェクトの設定 → スクリプトプロパティ  
   - `GAS_SHARED_SECRET`（必須・Vercel と同じ値）  
   - `SPREADSHEET_ID`（任意・スプレッドシートに紐づいていない場合のみ。URL の `/d/XXXX/` の XXXX）  
4. **デプロイ → 新しいデプロイ**（コード変更のたびに「新バージョン」）→ 種類「ウェブアプリ」  
   - 実行ユーザー: **自分**  
   - アクセスできるユーザー: **全員**  
5. デプロイ後の URL を Vercel / GitHub Secrets の `GAS_WEBHOOK_URL` に設定  
6. Vercel の `GAS_SHARED_SECRET` がスクリプトプロパティと同じか確認 → 変更したら **Redeploy**  

詳細はエージェント報告または `Code.gs` 先頭コメントを参照。
