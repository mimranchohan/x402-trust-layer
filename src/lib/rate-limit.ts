import type { Request, Response, NextFunction } from "express";
import { hasPaymentSignatureHeader } from "./x402-headers.js";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function pruneExpired(map: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of map.entries()) {
    if (now >= bucket.resetAt) map.delete(key);
  }
}

function startRateLimitCleanup(): void {
  const timer = setInterval(() => {
    const now = Date.now();
    pruneExpired(buckets, now);
    pruneExpired(hourlyBuckets, now);
    pruneExpired(bucketsUnpaid, now);
    pruneExpired(lookupBuckets, now);
  }, 5 * 60_000);
  timer.unref();
}

const hourlyBuckets = new Map<string, Bucket>();
const bucketsUnpaid = new Map<string, Bucket>();
const lookupBuckets = new Map<string, Bucket>();
startRateLimitCleanup();

/**
 * Rate limit paid retries only. Unpaid discovery probes (x402scan, AgentCash) must reach
 * x402 middleware and return 402 — never 429.
 */
export function rateLimitPerMinute(maxRequests: number) {
  const windowMs = 60_000;
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!hasPaymentSignatureHeader(req)) {
      next();
      return;
    }

    const key = clientKey(req);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > maxRequests) {
      res.status(429).json({
        error: "Too many paid requests",
        retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
      });
      return;
    }
    next();
  };
}

/** Free tier endpoints (e.g. agent lookup) — hourly cap per IP */
export function rateLimitPerHour(maxRequests: number) {
  const windowMs = 3_600_000;
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = clientKey(req);
    const now = Date.now();
    let bucket = hourlyBuckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      hourlyBuckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > maxRequests) {
      res.status(429).json({
        error: "Rate limit exceeded",
        retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
        limitPerHour: maxRequests,
      });
      return;
    }
    next();
  };
}

/** Optional cap on unpaid probes per IP (very high — blocks only extreme abuse) */
export function rateLimitUnpaidProbes(maxPerMinute: number) {
  const windowMs = 60_000;
  return (req: Request, res: Response, next: NextFunction): void => {
    if (hasPaymentSignatureHeader(req)) {
      next();
      return;
    }
    const key = clientKey(req);
    const now = Date.now();
    let bucket = bucketsUnpaid.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      bucketsUnpaid.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > maxPerMinute) {
      res.status(429).json({
        error: "Too many discovery probes",
        retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
      });
      return;
    }
    next();
  };
}

/** Free agent lookup — separate from unpaid x402 probes */
export function rateLimitAgentLookup(maxPerHour: number) {
  const windowMs = 3_600_000;
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = clientKey(req);
    const now = Date.now();
    let bucket = lookupBuckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      lookupBuckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > maxPerHour) {
      res.status(429).json({
        error: "Agent lookup rate limit exceeded",
        limitPerHour: maxPerHour,
        retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
      });
      return;
    }
    next();
  };
}
