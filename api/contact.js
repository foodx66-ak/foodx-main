import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY is not configured' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const topic = (body.topic || '').toString().trim();
  const name = (body.name || '').toString().trim();
  const company = (body.company || '').toString().trim();
  const email = (body.email || '').toString().trim();
  const phone = (body.phone || '').toString().trim();
  const message = (body.message || '').toString().trim();

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'name, email and message are required' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid email' });
  }

  const to = process.env.CONTACT_TO || 'foodx66@gmail.com';
  const from = process.env.CONTACT_FROM || 'FooDX お問い合わせ <onboarding@resend.dev>';

  const rows = [
    ['お問い合わせ種別', topic],
    ['お名前', name],
    ['店舗・会社名', company],
    ['メールアドレス', email],
    ['電話番号', phone],
  ];

  const html = `
    <div style="font-family:sans-serif;line-height:1.7;color:#1a1a1a;">
      <h2 style="margin:0 0 16px;">サイトからのお問い合わせ</h2>
      <table style="border-collapse:collapse;width:100%;max-width:640px;">
        ${rows
          .map(
            ([label, value]) => `
          <tr>
            <th style="text-align:left;padding:8px 12px;background:#f6f6f2;border:1px solid #e5e5df;width:160px;white-space:nowrap;">${escapeHtml(
              label
            )}</th>
            <td style="padding:8px 12px;border:1px solid #e5e5df;">${escapeHtml(value) || '-'}</td>
          </tr>`
          )
          .join('')}
      </table>
      <h3 style="margin:20px 0 8px;">お問い合わせ内容</h3>
      <div style="padding:12px;border:1px solid #e5e5df;border-radius:8px;white-space:pre-wrap;">${escapeHtml(
        message
      )}</div>
    </div>`;

  const text = [
    'サイトからのお問い合わせ',
    '',
    `お問い合わせ種別: ${topic}`,
    `お名前: ${name}`,
    `店舗・会社名: ${company}`,
    `メールアドレス: ${email}`,
    `電話番号: ${phone}`,
    '',
    'お問い合わせ内容:',
    message,
  ].join('\n');

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject: `【お問い合わせ】${topic || 'その他'} - ${name}様`,
      html,
      text,
    });

    if (error) {
      console.error('Resend error:', error);
      return res.status(502).json({ error: 'failed to send email' });
    }

    return res.status(200).json({ ok: true, id: data?.id });
  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return {};
  }
}
