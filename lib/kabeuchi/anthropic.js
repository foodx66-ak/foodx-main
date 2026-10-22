import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";

/** Shared Anthropic client (workspace header when the key requires it). */
export function anthropicClient() {
  if (!config.anthropicApiKey) {
    throw Object.assign(new Error("no api key"), { code: "no_api_key" });
  }
  const opts = { apiKey: config.anthropicApiKey };
  if (config.anthropicWorkspaceId) {
    opts.defaultHeaders = { "anthropic-workspace-id": config.anthropicWorkspaceId };
  }
  return new Anthropic(opts);
}
