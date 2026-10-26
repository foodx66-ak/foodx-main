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

/** Trim whitespace/newlines and optional wrapping quotes from secret env values. */
function secret(name) {
  let v = (process.env[name] || "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

export const config = {
  get anthropicApiKey() { return secret("ANTHROPIC_API_KEY"); },
  /** Required when the API key is not scoped to a single workspace. */
  get anthropicWorkspaceId() { return secret("ANTHROPIC_WORKSPACE_ID"); },
  get model() { return (process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5").trim(); },
  get scoringPrompt() { return secret("KABEUCHI_SCORING_PROMPT"); },
  get gasUrl() { return secret("GAS_WEBHOOK_URL"); },
  get gasSecret() { return secret("GAS_SHARED_SECRET"); },
  get turnstileSecret() { return secret("TURNSTILE_SECRET_KEY"); },
  get turnstileSiteKey() { return secret("TURNSTILE_SITE_KEY"); },
  get redisUrl() { return secret("UPSTASH_REDIS_REST_URL") || secret("KV_REST_API_URL"); },
  get redisToken() { return secret("UPSTASH_REDIS_REST_TOKEN") || secret("KV_REST_API_TOKEN"); },
  get limitMs() { return int(process.env.KABEUCHI_LIMIT_MS, 600000); },
  get maxTurns() { return int(process.env.KABEUCHI_MAX_TURNS, 20); },
  get dailyCap() { return int(process.env.KABEUCHI_DAILY_CAP, 10); },
  /** Same IP: max starts per hour (default 5). */
  get rlIpMax() { return int(process.env.KABEUCHI_RL_IP_MAX, 5); },
  /** Same email: max starts per day (default 10). */
  get rlMailMax() { return int(process.env.KABEUCHI_RL_MAIL_MAX, 10); },
  get mock() { return process.env.KABEUCHI_MOCK === "1"; },
  get publicBaseUrl() { return (process.env.PUBLIC_BASE_URL || "https://www.foodx.co.jp").replace(/\/+$/, ""); },
  get bookingUrl() { return bookingUrl(); },
  /** Shared secret for POST /api/kabeuchi/sweep (GitHub Actions). */
  get sweepSecret() { return secret("KABEUCHI_SWEEP_SECRET"); },
  /**
   * Idle time before a session is treated as abandoned (default 2 hours).
   * Override with KABEUCHI_ABANDONED_AFTER_MS for short-path testing.
   */
  get abandonedAfterMs() { return int(process.env.KABEUCHI_ABANDONED_AFTER_MS, 2 * 60 * 60 * 1000); },
};
