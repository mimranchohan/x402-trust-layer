import { db } from "./db.js";

type CounterName =
  | "http_requests"
  | "x402_settlements"
  | "x402_settlement_failures"
  | "replay_blocked"
  | "idempotency_replay";

const incStmt = db.prepare(`
  INSERT INTO telemetry_counters(name, value) VALUES(?, ?)
  ON CONFLICT(name) DO UPDATE SET value = value + ?, updated_at = unixepoch()
`);

const startedAt = Date.now();

export function incCounter(name: CounterName, delta = 1): void {
  incStmt.run(name, delta, delta);
}

export function telemetryMiddleware(
  _req: import("express").Request,
  _res: import("express").Response,
  next: import("express").NextFunction,
): void {
  incCounter("http_requests");
  next();
}

export function metricsPayload(): Record<string, unknown> {
  const rows = db
    .prepare("SELECT name, value FROM telemetry_counters")
    .all() as { name: string; value: number }[];
  const counters: Record<string, number> = {
    http_requests: 0,
    x402_settlements: 0,
    x402_settlement_failures: 0,
    replay_blocked: 0,
    idempotency_replay: 0,
  };
  for (const r of rows) counters[r.name] = r.value;

  return {
    service: "x402-trust-layer",
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    counters,
    nonceBackend: process.env.REDIS_URL
      ? "redis"
      : process.env.UPSTASH_REDIS_REST_URL
        ? "upstash-rest"
        : "sqlite",
  };
}
