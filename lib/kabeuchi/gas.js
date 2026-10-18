import { config } from "./config.js";

const GAS_TIMEOUT_MS = 15000;

/**
 * Apps Script web apps answer POST with a 302 to googleusercontent.com;
 * fetch follows it and the final body is the script's JSON output.
 */
export async function postToGas(payload) {
  if (!config.gasUrl || !config.gasSecret) throw Object.assign(new Error("gas not configured"), { code: "gas_env" });
  const resp = await fetch(config.gasUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: config.gasSecret, ...payload }),
    redirect: "follow",
    signal: AbortSignal.timeout(GAS_TIMEOUT_MS),
  });
  if (!resp.ok) throw Object.assign(new Error("gas http error"), { code: `gas_http_${resp.status}` });
  const data = await resp.json().catch(() => null);
  if (!data || data.ok !== true) throw Object.assign(new Error("gas rejected"), { code: "gas_not_ok" });
  return data;
}
