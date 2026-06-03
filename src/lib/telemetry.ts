type CounterName =
  | "http_requests"
  | "x402_settlements"
  | "x402_settlement_failures"
  | "replay_blocked"
  | "idempotency_replay";

const counters: Record<CounterName, number> = {
  http_requests: 0,
  x402_settlements: 0,
  x402_settlement_failures: 0,
  replay_blocked: 0,
  idempotency_replay: 0,
};

const startedAt = Date.now();

export function incCounter(name: CounterName, delta = 1): void {
  counters[name] += delta;
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
  return {
    service: "x402-trust-layer",
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    counters: { ...counters },
    nonceBackend: process.env.REDIS_URL
      ? "redis"
      : process.env.UPSTASH_REDIS_REST_URL
        ? "upstash-rest"
        : "sqlite",
  };
}
