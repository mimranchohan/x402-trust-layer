import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Simple in-memory rate limit (per IP). Use edge/WAF limits in production at scale. */
export function rateLimitPerMinute(maxRequests: number) {
  const windowMs = 60_000;
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > maxRequests) {
      res.status(429).json({ error: "Too many requests", retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) });
      return;
    }
    next();
  };
}
