import { config } from "../../lib/kabeuchi/config.js";
import { json } from "../../lib/kabeuchi/http.js";

export function GET() {
  const key = config.anthropicApiKey;
  return json(200, {
    ok: true,
    turnstileSiteKey: config.turnstileSiteKey,
    bookingUrl: config.bookingUrl,
    limitMs: config.limitMs,
    // 秘密は返さない。Preview にキーが届いているかの切り分け用。
    anthropic: {
      configured: Boolean(key),
      looksLikeKey: /^sk-ant-/.test(key),
      model: config.model,
    },
  });
}
