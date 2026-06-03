import type { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import { hasPaymentSignatureHeader } from "./x402-headers.js";
import { db } from "./db.js";

const TTL_SEC = 24 * 60 * 60;

type CachedEntry = {
  status: number;
  body: unknown;
  createdAt: number;
  route: string;
  bodyHash: string;
};

const getCache = db.prepare(
  "SELECT status, body, body_hash, route, created_at FROM idempotency_cache WHERE cache_key = ?",
);
const insertCache = db.prepare(`
  INSERT OR REPLACE INTO idempotency_cache (cache_key, status, body, body_hash, route, created_at)
  VALUES (?, ?, ?, ?, ?, unixepoch())
`);
const claimInflight = db.prepare(
  "INSERT OR IGNORE INTO idempotency_inflight (cache_key, created_at) VALUES (?, unixepoch())",
);
const releaseInflight = db.prepare("DELETE FROM idempotency_inflight WHERE cache_key = ?");
const pruneCache = db.prepare(
  "DELETE FROM idempotency_cache WHERE created_at < unixepoch() - ?",
);
const pruneInflight = db.prepare(
  "DELETE FROM idempotency_inflight WHERE created_at < unixepoch() - 3600",
);

function maybePrune(): void {
  if (Math.random() < 0.02) {
    pruneCache.run(TTL_SEC);
    pruneInflight.run();
  }
}

function cacheKey(route: string, idempotencyKey: string): string {
  return `${route}::${idempotencyKey}`;
}

function bodyHash(req: Request): string {
  const raw = JSON.stringify(req.body ?? {});
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function rowToEntry(row: {
  status: number;
  body: string;
  body_hash: string;
  route: string;
  created_at: number;
}): CachedEntry {
  return {
    status: row.status,
    body: JSON.parse(row.body) as unknown,
    bodyHash: row.body_hash,
    route: row.route,
    createdAt: row.created_at * 1000,
  };
}

function tryClaimInFlight(cacheKeyStr: string): boolean {
  const r = claimInflight.run(cacheKeyStr);
  return r.changes > 0;
}

function releaseClaim(cacheKeyStr: string): void {
  releaseInflight.run(cacheKeyStr);
}

function loadHit(keyStr: string): CachedEntry | null {
  maybePrune();
  const row = getCache.get(keyStr) as
    | {
        status: number;
        body: string;
        body_hash: string;
        route: string;
        created_at: number;
      }
    | undefined;
  if (!row) return null;
  const entry = rowToEntry(row);
  if (Date.now() - entry.createdAt >= TTL_SEC * 1000) return null;
  return entry;
}

/** Return cached paid response when Idempotency-Key matches (CDP-style safe retries). */
export function idempotencyPreCheck(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = String(req.headers["idempotency-key"] ?? "").trim();
  if (!key || key.length > 128) return void next();
  if (!hasPaymentSignatureHeader(req)) return void next();

  const route = req.path;
  const keyStr = cacheKey(route, key);
  const hit = loadHit(keyStr);
  if (hit) {
    if (hit.bodyHash !== bodyHash(req)) {
      res.status(409).json({
        error: "Idempotency-Key reused with different request body",
        idempotencyKey: key,
      });
      return;
    }
    res.setHeader("Idempotency-Replayed", "true");
    res.status(hit.status).json(hit.body);
    return;
  }

  if (!tryClaimInFlight(keyStr)) {
    const retry = loadHit(keyStr);
    if (retry) {
      if (retry.bodyHash !== bodyHash(req)) {
        res.status(409).json({
          error: "Idempotency-Key reused with different request body",
          idempotencyKey: key,
        });
        return;
      }
      res.setHeader("Idempotency-Replayed", "true");
      res.status(retry.status).json(retry.body);
      return;
    }
    res.status(409).json({
      error: "Idempotency-Key already in progress",
      idempotencyKey: key,
    });
    return;
  }

  (req as Request & { idempotencyClaimKey?: string }).idempotencyClaimKey = keyStr;
  next();
}

export function idempotencyCapture(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = String(req.headers["idempotency-key"] ?? "").trim();
  if (!key || key.length > 128) return void next();

  const claimKeyStr = (req as Request & { idempotencyClaimKey?: string }).idempotencyClaimKey;
  const routeKey = cacheKey(req.path, key);

  const origJson = res.json.bind(res);
  res.json = ((body?: unknown) => {
    if (res.statusCode >= 200 && res.statusCode < 300 && hasPaymentSignatureHeader(req)) {
      insertCache.run(
        routeKey,
        res.statusCode,
        JSON.stringify(body ?? null),
        bodyHash(req),
        req.path,
      );
    }
    if (claimKeyStr) releaseClaim(claimKeyStr);
    return origJson(body);
  }) as Response["json"];

  const origEnd = res.end.bind(res);
  res.end = ((...args: Parameters<typeof res.end>) => {
    if (claimKeyStr) releaseClaim(claimKeyStr);
    return origEnd(...args);
  }) as typeof res.end;

  next();
}
