# FooDX サイトリニューアル — 開発者向け引き渡しメモ

最終更新: 2026-06-26

本リポジトリは、ブラウザでそのまま開けるデザイン実装（Design Component / `*.dc.html`）です。
Next.js 等へ移植する際の「見た目・コピー・構成・配色の正解（実装リファレンス）」として使えます。

---

## 1. ページ構成

| ファイル | 役割 | 主なリンク先 |
|---|---|---|
| `AIkata.dc.html` | **トップ**（AIkata 経営OS）。Hero→課題→特長→料金→代表→**無料診断**→最終CTA | `#diagnosis`, `Contact.dc.html` |
| `AIkataDiagnosis.dc.html` | 簡易診断コンポーネント（トップに `<dc-import>` で埋め込み） | `Contact.dc.html` |
| `GoogleProfile.dc.html` | Googleビジネスプロフィール代行（完全成果報酬MEO） | `Contact.dc.html` |
| `REO.dc.html` | 予約体験最適化 | `Contact.dc.html` |
| `GreaseOzonizer.dc.html` | グリストラップ清掃自動化装置 | `Contact.dc.html` |
| `About.dc.html` | 会社概要・代表プロフィール | `Contact.dc.html` |
| `Contact.dc.html` | お問い合わせフォーム | — |
| `diagnosis-themes.js` | 診断のテーマ定義（20件・**暫定**） | — |
| `assets/` | ロゴ画像（透過版／白文字版） | — |

全ページ共通：ヘッダー／フッターで相互リンク。基調色 `#FFE100`、ダーク `#1A1A1A`、フォントは Noto Sans JP + Inter。

---

## 2. 本番化で「必ず差し替える」3点

### ① Claude API（診断の個別レポート生成）
`AIkataDiagnosis.dc.html` の `_generate()` 内。
現状はプロトタイプ用ヘルパー `window.claude.complete(...)` を使用。

```js
// 現状（プロトタイプ）
text = await window.claude.complete({ messages: [
  { role:'user', content: sys + '\n\n' + userMsg },
]});
```

**本番要件（仕様書準拠）:**
- model: `claude-sonnet-4-6`
- max_tokens: `1000`（固定）
- **API キーはフロントに出さない** → 自社バックエンドでプロキシし、サーバー側で Anthropic API を呼ぶ。
- システムプロンプト（`sys` 変数）とユーザーメッセージ（`userMsg` 変数・Q1〜Q7＋推奨テーマのJSON）はそのまま流用可。
- レスポンスは `data.content` の `type:"text"` ブロックを結合して表示。
- 失敗時はテンプレ文へフォールバック（実装済み：`if (!text || !text.trim()) {...}`）。

```js
// 本番イメージ（サーバープロキシ /api/diagnose を叩く）
const r = await fetch('/api/diagnose', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ system: sys, user: userMsg }),
});
const data = await r.json();
text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
// サーバー側で model:'claude-sonnet-4-6', max_tokens:1000 を指定
```

### ② リード送信先 `{{LEAD_ENDPOINT}}`
同じく `_generate()` 冒頭。

```js
const LEAD_ENDPOINT = '{{LEAD_ENDPOINT}}';   // ← 実際のフォーム送信先/Webhook URL に置換
```

- `{{` を含む間は送信スキップ（安全装置）。URLを入れると自動でPOSTが有効化。
- 送信ボディ（POST・JSON）には Q1〜Q7全回答・推奨テーマ・メアド・タイムスタンプを含む。
- 個人情報・メアドは**URLパラメータに載せずPOSTボディで送信**（実装済み）。
- 店舗数(Q2)・利用システム(Q6)はリードの質判定に重要なので保持済み。

### ③ お問い合わせフォーム（`Contact.dc.html`）
現状は送信で完了画面を出すだけ（実送信なし）。本番のフォームバックエンド／メール送信に接続してください。

---

## 3. 診断テーマの差し替え（`diagnosis-themes.js`）

`window.AIKATA_THEMES` 配列（20件）を、正式な提供テーマに差し替えるだけ。各要素のフォーマット：

```js
{ name:"テーマ名", area:"人件費", pain:5, ease:5, effect:4, summary:"一言サマリー" }
```

- `area` は **売上 / 原価 / 人件費 / 集客 / 仕入れ / 評価制度** のいずれか（スコア計算の領域キー。表記を変えると設問側の連動が切れるので変更不可）。
- `pain`（痛みの出やすさ）/ `ease`（着手しやすさ）/ `effect`（効果の見えやすさ）は 1〜5。
- スコアロジック（`AIkataDiagnosis.dc.html` の `compute()`）：
  `スコア = 痛み×(Q4該当+0.8, Q5最優先+1.2) × 着手しやすさ(Q6で該当システム保有なら+1.2) × (0.6+効果)`
  → 最高得点の1テーマを推奨、2〜4位を「次の一手」に表示。

---

## 4. 設問（`AIkataDiagnosis.dc.html` の `QUESTIONS()`）

| # | 設問 | 形式 |
|---|---|---|
| Q1 | 業態 | 単一・9択 |
| Q2 | 店舗数 | 単一・6択 |
| Q3 | スタッフ規模 | 単一・5択 |
| Q4 | 手間を奪う業務（6領域） | 複数 |
| Q5 | 最優先（Q4の選択肢から動的生成） | 単一 |
| Q6 | 使っているシステム | 複数 |
| Q7 | AI・IT導入経験 | 単一 |

設問文・選択肢・補足ラベル（`AREA_DESC` / `DATA_DESC` / `EXP_DESC` / `SYS_AREA`）はすべて logic クラス内で完結。コピー調整が容易。

---

## 5. ブランド / 配色トークン

- アクセント（基調色）: `#FFE100`（CSS変数 `--accent`、診断側は `--ak-accent`）
- ベース文字 / ダーク背景: `#1A1A1A`
- アクセント濃色（文字用）: `#BA7517`
- フォント: 見出し=Noto Sans JP 900、英字/数値=Inter
- ロゴ: イエロー丸に「AI」＋「AIkata」ワードマーク。会社ロゴ画像は `assets/foodx-logo.png`（明背景用・透過）/ `assets/foodx-logo-white.png`（暗背景用・白文字）

### CTA 配色ルール（重要）
- **メインCTA = 診断**：イエロー塗り（`#FFE100` / 黒文字）
- **サブCTA = 無料相談**：ダーク塗り（明背景）／白アウトライン（暗背景）
導線設計：簡易診断 → リード獲得 → 無料相談の案内、の順。

---

## 6. レスポンシブ

各 `.dc.html` の helmet `<style>` 内にメディアクエリを実装済み（属性セレクタで多カラムグリッドを畳む方式）。
- 〜900px: 3/5カラム→2カラム、左右非対称→1カラム
- 〜600px: 全グリッド1カラム、ヘッダーnav折返し、フッター縦積み、セクション余白圧縮

---

## 7. 残タスク（素材待ち）

- [ ] 実テーマ20件の確定 → `diagnosis-themes.js`
- [ ] 実写真の差し込み（Hero／代表者／導入事例。現状はプレースホルダー）
- [ ] 会社概要の資本金・設立月（未掲載のため省略中）
- [ ] 本番化（上記セクション2の①②③）
