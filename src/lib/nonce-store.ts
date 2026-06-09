import { db } from "./db.js";
import { assertSafeOutboundUrl } from "./ssrf.js";
import { logger } from "./logger.js";

const checkNonce = db.prepare("SELECT 1 AS ok FROM used_nonces WHERE nonce = ?");
const insertNonce = db.prepare(
  "INSERT OR IGNORE INTO used_nonces (nonce, network) VALUES (?, ?)",
);
const cleanOld = db.prepare("DELETE FROM used_nonces WHERE used_at < ?");

const REDIS_REST_URL = (process.env.UPSTASH_REDIS_REST_URL ?? "").trim();
const REDIS_REST_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim();
const REDIS_URL = (process.env.REDIS_URL ?? "").trim();

type RedisSetNx = (key: string, ttlSec: number) => Promise<boolean>;

let redisSetNx: RedisSetNx | null = null;
let redisInit: Promise<void> | null = null;

async function ensureRedis(): Promise<boolean> {
  if (redisSetNx) return true;
  if (!REDIS_URL) return false;
  if (!redisInit) {
    redisInit = (async () => {
      try {
        const mod = await import("redis");
        const client = mod.createClient({ url: REDIS_URL });
        client.on("error", (err: Error) => logger.warn({ err: err.message }, "[nonce-store] redis client error"));
        await client.connect();
        redisSetNx = async (key, ttlSec) => {
          const r = await client.set(key, "1", { NX: true, EX: ttlSec });
          return r === "OK";
        };
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[nonce-store] REDIS_URL set but redis package unavailable — using SQLite only");
      }
    })();
  }
  await redisInit;
  return !!redisSetNx;
}

async function redisRestSetNx(key: string, ttlSec: number): Promise<boolean> {
  if (!REDIS_REST_URL || !REDIS_REST_TOKEN) return false;
  assertSafeOutboundUrl(REDIS_REST_URL);
  if (!REDIS_REST_URL.startsWith("https://")) {
    throw new Error("Redis REST must be HTTPS");
  }
  const res = await fetch(REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["SET", key, "1", "NX", "EX", String(ttlSec)]),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { result?: string | null };
  return data.result === "OK";
}

function sqliteClaim(key: string, network: string): boolean {
  if (checkNonce.get(key)) return false;
  insertNonce.run(key, network);
  return true;
}

let _sqliteCleanCounter = 0;
const SQLITE_CLEAN_EVERY = 50; // ~2% of calls, deterministic

function maybeCleanSqlite(): void {
  if (++_sqliteCleanCounter >= SQLITE_CLEAN_EVERY) {
    _sqliteCleanCounter = 0;
    cleanOld.run(Math.floor(Date.now() / 1000) - 86_400 * 7);
  }
}

/** Claim a nonce/idempotency key once (payment, protocol replay, idempotency). */
export async function claimNonceKey(
  rawKey: string,
  network = "unknown",
  ttlSec = 86_400 * 7,
): Promise<boolean> {
  const key = rawKey.trim();
  if (!key || key.length < 8) return true;

  const storeKey = key.length > 200 ? key.slice(0, 200) : key;

  if (await ensureRedis()) {
    const ok = await redisSetNx!(`x402:nonce:${storeKey}`, ttlSec);
    if (ok) {
      sqliteClaim(storeKey, network);
      return true;
    }
    return false;
  }

  if (REDIS_REST_URL && REDIS_REST_TOKEN) {
    const ok = await redisRestSetNx(`x402:nonce:${storeKey}`, ttlSec);
    if (ok) {
      sqliteClaim(storeKey, network);
      return true;
    }
    if (checkNonce.get(storeKey)) return false;
    return false;
  }

  maybeCleanSqlite();
  if (checkNonce.get(storeKey)) return false;
  insertNonce.run(storeKey, network);
  return true;
}

export function isNonceKeyUsed(rawKey: string): boolean {
  const key = rawKey.trim();
  if (!key || key.length < 8) return false;
  const storeKey = key.length > 200 ? key.slice(0, 200) : key;
  return !!checkNonce.get(storeKey);
}

export function extractIdempotencyKey(req: { headers: Record<string, unknown> }): string | undefined {
  const raw =
    req.headers["idempotency-key"] ??
    req.headers["x-idempotency-key"];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && v.trim().length >= 8 ? v.trim() : undefined;
}
