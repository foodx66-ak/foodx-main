const int = (value, fallback) => {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const DEFAULT_BOOKING_PATH = "/contact?topic=" + encodeURIComponent("AIkata（経営OS）");

function bookingUrl() {
  const raw = (process.env.KABEUCHI_BOOKING_URL || "").trim();
  if (raw.startsWith("https://") || (raw.startsWith("/") && !raw.startsWith("//"))) return raw;
  return DEFAULT_BOOKING_PATH;
}

export const config = {
  get anthropicApiKey() { return process.env.ANTHROPIC_API_KEY || ""; },
  get model() { return process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"; },
  get scoringPrompt() { return process.env.KABEUCHI_SCORING_PROMPT || ""; },
  get gasUrl() { return process.env.GAS_WEBHOOK_URL || ""; },
  get gasSecret() { return process.env.GAS_SHARED_SECRET || ""; },
  get turnstileSecret() { return process.env.TURNSTILE_SECRET_KEY || ""; },
  get turnstileSiteKey() { return process.env.TURNSTILE_SITE_KEY || ""; },
  get redisUrl() { return process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || ""; },
  get redisToken() { return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || ""; },
  get limitMs() { return int(process.env.KABEUCHI_LIMIT_MS, 600000); },
  get maxTurns() { return int(process.env.KABEUCHI_MAX_TURNS, 20); },
  get dailyCap() { return int(process.env.KABEUCHI_DAILY_CAP, 50); },
  get mock() { return process.env.KABEUCHI_MOCK === "1"; },
  get publicBaseUrl() { return (process.env.PUBLIC_BASE_URL || "https://www.foodx.co.jp").replace(/\/+$/, ""); },
  get bookingUrl() { return bookingUrl(); },
};
