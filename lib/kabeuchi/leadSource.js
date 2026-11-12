/** Normalize inbound `from` / `cta` query values for lead attribution. */
export function normalizeLeadSource(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  return /^[a-z0-9-]{1,48}$/.test(trimmed) ? trimmed : "";
}
