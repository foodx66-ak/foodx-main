import crypto from "node:crypto";
import { Redis } from "@upstash/redis";
import { config } from "./config.js";

export const TOKEN_TTL_SEC = 30 * 60;
export const SESSION_TTL_SEC = 24 * 60 * 60;
export const AI_LOCK_TTL_SEC = 90;

const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const SID_RE = /^[A-Za-z0-9_-]{43}$/;

let client = null;

export function redis() {
  if (!client) {
    if (!config.redisUrl || !config.redisToken) throw Object.assign(new Error("redis not configured"), { code: "redis_env" });
    client = new Redis({ url: config.redisUrl, token: config.redisToken, automaticDeserialization: false });
  }
  return client;
}

export const newToken = () => crypto.randomBytes(24).toString("base64url");
export const newSessionId = () => crypto.randomBytes(32).toString("base64url");
export const isToken = (value) => typeof value === "string" && TOKEN_RE.test(value);
export const isSessionId = (value) => typeof value === "string" && SID_RE.test(value);

/** Keyed hash so that rate-limit keys never contain raw e-mail addresses or IPs. */
export function hashKey(value) {
  return crypto.createHmac("sha256", config.gasSecret || "kabeuchi").update(String(value)).digest("base64url").slice(0, 32);
}

export function jstDate(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
}

export async function hitLimit(key, ttlSec, max) {
  const r = redis();
  const count = await r.incr(key);
  if (count === 1) await r.expire(key, ttlSec);
  return count > max;
}

export async function saveLead(token, lead) {
  await redis().set(`kb:t:${token}`, JSON.stringify(lead), { ex: TOKEN_TTL_SEC });
}

export async function deleteLead(token) {
  await redis().del(`kb:t:${token}`);
}

export async function takeLead(token) {
  const raw = await redis().getdel(`kb:t:${token}`);
  return raw ? JSON.parse(raw) : null;
}

export async function loadSession(sid) {
  if (!isSessionId(sid)) return null;
  const raw = await redis().get(`kb:s:${sid}`);
  return raw ? JSON.parse(raw) : null;
}

export async function saveSession(sid, session) {
  await redis().set(`kb:s:${sid}`, JSON.stringify(session), { ex: SESSION_TTL_SEC });
}

export async function acquireAiLock(sid) {
  const res = await redis().set(`kb:lock:${sid}`, "1", { nx: true, ex: AI_LOCK_TTL_SEC });
  return res === "OK";
}

export async function hasAiLock(sid) {
  return (await redis().exists(`kb:lock:${sid}`)) === 1;
}

export async function releaseAiLock(sid) {
  await redis().del(`kb:lock:${sid}`);
}
