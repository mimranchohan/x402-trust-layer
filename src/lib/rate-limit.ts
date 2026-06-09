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
    pruneExpired(walletBuckets, now);
  }, 5 * 60_000);
  timer.unref();
}

const hourlyBuckets = new Map<string, Bucket>();
const bucketsUnpaid = new Map<string, Bucket>();
const lookupBuckets = new Map<string, Bucket>();

/**
 * Per-wallet / per-agentId sliding-window bucket.
 * Keyed on `walletAddress` or `agentId` from request body — not IP, so it works correctly
 * behind load balancers and reverse proxies where all traffic shares one source IP.
 */
const walletBuckets = new Map<string, Bucket>();

/** Default per-wallet request cap per minute (overridable via AGENT_RATE_LIMIT_PER_MIN env var) */
export const AGENT_RATE_LIMIT_PER_MIN = Math.max(
  1,
  Number(process.env.AGENT_RATE_LIMIT_PER_MIN ?? "30"),
);

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

/**
 * Per-wallet / per-agentId rate limiter.
 *
 * Reads `walletAddress` or `agentId` from `req.body` (whichever is present first).
 * Falls through to `next()` when neither field exists so existing IP-based limits still apply.
 *
 * Usage:
 *   router.use(rateLimitPerWallet(AGENT_RATE_LIMIT_PER_MIN));
 *
 * The limit is configurable via the AGENT_RATE_LIMIT_PER_MIN environment variable (default 30).
 */
export function rateLimitPerWallet(maxPerMin: number) {
  const windowMs = 60_000;
  return (req: Request, res: Response, next: NextFunction): void => {
    // Extract wallet/agent identity from body — body-parser must run before this middleware
    const raw: unknown =
      (req.body as Record<string, unknown> | undefined)?.walletAddress ??
      (req.body as Record<string, unknown> | undefined)?.agentId;
    const wallet = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!wallet) {
      next();
      return;
    }

    const now = Date.now();
    let bucket = walletBuckets.get(wallet);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      walletBuckets.set(wallet, bucket);
    }
    bucket.count += 1;
    if (bucket.count > maxPerMin) {
      res.status(429).json({
        error: "Per-wallet rate limit exceeded",
        limitPerMinute: maxPerMin,
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
