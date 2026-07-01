// AIkata 簡易診断 — テーマ定義（暫定）
// ▼ 実テーマが決まったらこの配列だけ差し替えてください。
// area: 売上 / 原価 / 人件費 / 集客 / 仕入れ / 評価制度
// pain(痛みの出やすさ) / ease(着手しやすさ) / effect(効果の見えやすさ) は 1〜5
window.AIKATA_THEMES = [
  { name: "シフト・勤怠の準自動化", area: "人件費", pain: 5, ease: 5, effect: 4, summary: "毎週の手作りシフトを「8割AI・2割調整」に。" },
  { name: "人件費ダッシュボード", area: "人件費", pain: 4, ease: 4, effect: 4, summary: "人時売上高・労働分配率をリアルタイムで可視化。" },
  { name: "採用・定着サポート", area: "人件費", pain: 4, ease: 3, effect: 3, summary: "募集〜オンボーディングを仕組み化し離職を抑制。" },
  { name: "発注・仕入れの準自動化", area: "仕入れ", pain: 4, ease: 3, effect: 4, summary: "在庫・納品・販売の3データ統合で発注を仕組み化。" },
  { name: "在庫・棚卸しの省力化", area: "仕入れ", pain: 4, ease: 4, effect: 3, summary: "棚卸しをスマホ入力に。ロスと欠品を同時に削減。" },
  { name: "仕入れ価格モニタリング", area: "仕入れ", pain: 3, ease: 3, effect: 3, summary: "食材価格の変動を追跡し、原価高騰に先回り。" },
  { name: "FL管理・経理の可視化", area: "原価", pain: 5, ease: 2, effect: 4, summary: "POS連携でFL比率をダッシュボード化。" },
  { name: "メニュー別収益分析", area: "原価", pain: 4, ease: 3, effect: 4, summary: "売れ筋×利益のABC分析で「稼ぐ一皿」を特定。" },
  { name: "原価率アラート", area: "原価", pain: 4, ease: 3, effect: 3, summary: "原価率が基準を超えたら自動で通知・要因提示。" },
  { name: "売上予測・需要予測", area: "売上", pain: 4, ease: 3, effect: 4, summary: "曜日・天候・イベントから来客と売上を予測。" },
  { name: "客単価アップ施策", area: "売上", pain: 3, ease: 3, effect: 4, summary: "セット・追加提案をデータで設計し客単価を底上げ。" },
  { name: "日次サマリーの自動化", area: "売上", pain: 3, ease: 5, effect: 3, summary: "閉店後の売上日報をAIが自動作成・配信。" },
  { name: "Googleクチコミ運用", area: "集客", pain: 5, ease: 4, effect: 5, summary: "クチコミ依頼〜返信を仕組み化し評価を底上げ。" },
  { name: "MEO・マップ最適化", area: "集客", pain: 4, ease: 4, effect: 5, summary: "Googleマップ検索で上位表示を狙い新規を獲得。" },
  { name: "リピート・CRM強化", area: "集客", pain: 4, ease: 3, effect: 4, summary: "来店データを蓄積し再来店を自動で後押し。" },
  { name: "予約体験の最適化", area: "集客", pain: 4, ease: 3, effect: 4, summary: "予約導線・媒体・無断キャンセル対策を一気通貫で。" },
  { name: "SNS発信の省力化", area: "集客", pain: 3, ease: 4, effect: 3, summary: "投稿案・画像をAIが下書きし発信を継続可能に。" },
  { name: "評価制度・KPI設計", area: "評価制度", pain: 4, ease: 2, effect: 3, summary: "店長・スタッフのKPIを設計しダッシュボード運用。" },
  { name: "スタッフ評価の見える化", area: "評価制度", pain: 3, ease: 3, effect: 3, summary: "目標と達成度を可視化しモチベーションを向上。" },
  { name: "マニュアル・教育のAI化", area: "評価制度", pain: 3, ease: 4, effect: 3, summary: "業務マニュアルをAIで整備し教育を標準化。" }
];
