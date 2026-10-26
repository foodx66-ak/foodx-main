import { config } from "../../lib/kabeuchi/config.js";
import { json } from "../../lib/kabeuchi/http.js";

/** Public client bootstrap only — never expose API key metadata. */
export function GET() {
  return json(200, {
    ok: true,
    turnstileSiteKey: config.turnstileSiteKey,
    bookingUrl: config.bookingUrl,
    limitMs: config.limitMs,
  });
}
