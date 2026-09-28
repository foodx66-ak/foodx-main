// Slack Incoming Webhook へ通知（Actionsのログには中身を出さない＝Publicリポジトリ対策）
export async function notify(text) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) { console.log('[notify] SLACK_WEBHOOK_URL 未設定のため通知をスキップ'); return; }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!res.ok) console.log(`[notify] Slack送信失敗 ${res.status}`);
}
