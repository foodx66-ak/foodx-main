// お問い合わせフォーム → Resend 送信（Vercel Serverless Function）
// 環境変数:
//   RESEND_API_KEY           … Resend の API キー（必須）
//   CONTACT_TO               … 受信先メール（例: contact@foodx.co.jp）
//   CONTACT_FROM             … 送信元（例: "FooDX お問い合わせ <contact@foodx.co.jp>"）※認証済みドメインのみ
//   TURNSTILE_SITE_KEY       … Cloudflare Turnstile サイトキー（公開可・フロント表示用）
//   TURNSTILE_SECRET_KEY     … Cloudflare Turnstile シークレット（サーバー検証用）
//   ※ CF_TURNSTILE_* / CLOUDFLARE_TURNSTILE_* も同義で受け付けます

const escapeHtml = (value) =>
  String(value == null ? "" : value).replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])
  );

function env(...keys) {
  for (const key of keys) {
    const v = process.env[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function turnstileSiteKey() {
  return env(
    "TURNSTILE_SITE_KEY",
    "CF_TURNSTILE_SITE_KEY",
    "CLOUDFLARE_TURNSTILE_SITE_KEY"
  );
}

function turnstileSecretKey() {
  return env(
    "TURNSTILE_SECRET_KEY",
    "CF_TURNSTILE_SECRET_KEY",
    "CLOUDFLARE_TURNSTILE_SECRET_KEY"
  );
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error("payload too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function clientIp(req) {
  const xf = (req.headers["x-forwarded-for"] || "").toString();
  if (xf) return xf.split(",")[0].trim();
  return (req.headers["x-real-ip"] || "").toString().trim() || undefined;
}

async function verifyTurnstile(token, ip) {
  const secret = turnstileSecretKey();
  if (!secret) return { ok: true, skipped: true };
  if (!token) {
    return { ok: false, error: "ボット確認を完了してください。" };
  }
  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (ip) body.set("remoteip", ip);

    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await resp.json().catch(() => ({}));
    if (data && data.success) return { ok: true };
    console.error("Turnstile verify failed", data && data["error-codes"]);
    return { ok: false, error: "ボット確認に失敗しました。ページを再読み込みして再度お試しください。" };
  } catch (err) {
    console.error("Turnstile verify error", err);
    return { ok: false, error: "ボット確認中にエラーが発生しました。しばらくして再度お試しください。" };
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      turnstileSiteKey: turnstileSiteKey(),
      turnstileEnabled: Boolean(turnstileSecretKey()),
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  let body = req.body;
  if (body == null || typeof body === "string") {
    try {
      const raw = typeof body === "string" ? body : await readRawBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch (_) {
      return res.status(400).json({ ok: false, error: "リクエストの形式が正しくありません。" });
    }
  }

  const topic = (body.topic || "").toString().trim();
  const name = (body.name || "").toString().trim();
  const company = (body.company || "").toString().trim();
  const email = (body.email || "").toString().trim();
  const phone = (body.phone || "").toString().trim();
  const message = (body.message || "").toString().trim();
  const honeypot = (body.company_hp || "").toString().trim();
  const turnstileToken = (
    body.turnstileToken ||
    body["cf-turnstile-response"] ||
    body.cfTurnstileResponse ||
    ""
  )
    .toString()
    .trim();

  // ボット対策（ハニーポットに入力があれば静かに成功扱いで破棄）
  if (honeypot) return res.status(200).json({ ok: true });

  const captcha = await verifyTurnstile(turnstileToken, clientIp(req));
  if (!captcha.ok) {
    return res.status(400).json({ ok: false, error: captcha.error });
  }

  if (!name || !email || !message) {
    return res
      .status(400)
      .json({ ok: false, error: "必須項目（お名前・メールアドレス・お問い合わせ内容）を入力してください。" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "メールアドレスの形式が正しくありません。" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO || "contact@foodx.co.jp";
  const from = process.env.CONTACT_FROM || "FooDX お問い合わせ <contact@foodx.co.jp>";
  if (!apiKey) {
    console.error("RESEND_API_KEY is not set");
    return res.status(500).json({ ok: false, error: "サーバー設定エラーが発生しました。しばらくして再度お試しください。" });
  }

  const rows = [
    ["お問い合わせ種別", topic || "（未選択）"],
    ["お名前", name],
    ["店舗・会社名", company || "（未入力）"],
    ["メールアドレス", email],
    ["電話番号", phone || "（未入力）"],
  ];
  const html = `
    <div style="font-family:sans-serif;color:#1a1a1a;line-height:1.7;">
      <h2 style="margin:0 0 16px;">Webサイトからお問い合わせ</h2>
      <table style="border-collapse:collapse;width:100%;max-width:600px;">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><th align="left" style="padding:8px 12px;background:#f5f5f0;border:1px solid #e2e2dc;white-space:nowrap;">${escapeHtml(
                k
              )}</th><td style="padding:8px 12px;border:1px solid #e2e2dc;">${escapeHtml(v)}</td></tr>`
          )
          .join("")}
      </table>
      <h3 style="margin:20px 0 8px;">お問い合わせ内容</h3>
      <div style="padding:12px;background:#fafaf7;border:1px solid #e2e2dc;white-space:pre-wrap;">${escapeHtml(
        message
      )}</div>
    </div>`;
  const text = [
    "Webサイトからお問い合わせ",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "お問い合わせ内容:",
    message,
  ].join("\n");

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `【お問い合わせ】${topic || "その他"}｜${name}様`,
        html,
        text,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error("Resend API error", resp.status, detail);
      return res
        .status(502)
        .json({ ok: false, error: "送信に失敗しました。時間をおいて再度お試しください。" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("contact handler error", err);
    return res.status(500).json({ ok: false, error: "送信中にエラーが発生しました。" });
  }
}
