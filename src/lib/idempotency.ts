import type { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TTL_MS = 24 * 60 * 60 * 1000;
const STORE_PATH = join(process.cwd(), "data", "idempotency.json");

type CachedEntry = {
  status: number;
  body: unknown;
  createdAt: number;
  route: string;
  bodyHash: string;
};

type Store = Record<string, CachedEntry>;

function loadStore(): Store {
  try {
    if (!existsSync(STORE_PATH)) return {};
    return JSON.parse(readFileSync(STORE_PATH, "utf8")) as Store;
  } catch {
    return {};
  }
}

function saveStore(store: Store): void {
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function prune(store: Store): Store {
  const now = Date.now();
  const out: Store = {};
  for (const [k, v] of Object.entries(store)) {
    if (now - v.createdAt < TTL_MS) out[k] = v;
  }
  return out;
}

function cacheKey(route: string, idempotencyKey: string): string {
  return `${route}::${idempotencyKey}`;
}

function bodyHash(req: Request): string {
  const raw = JSON.stringify(req.body ?? {});
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function hasPaymentHeader(req: Request): boolean {
  return Boolean(
    req.headers["payment-signature"] ||
      req.headers["x-payment"] ||
      req.headers["x402-payment"],
  );
}

/** Return cached paid response when Idempotency-Key matches (CDP-style safe retries). */
export function idempotencyPreCheck(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = String(req.headers["idempotency-key"] ?? "").trim();
  if (!key || key.length > 128) return void next();
  if (!hasPaymentHeader(req)) return void next();

  const route = req.path;
  const store = prune(loadStore());
  const hit = store[cacheKey(route, key)];
  if (!hit) return void next();

  if (hit.bodyHash !== bodyHash(req)) {
    res.status(409).json({
      error: "Idempotency-Key reused with different request body",
      idempotencyKey: key,
    });
    return;
  }

  res.setHeader("Idempotency-Replayed", "true");
  res.status(hit.status).json(hit.body);
}

export function idempotencyCapture(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = String(req.headers["idempotency-key"] ?? "").trim();
  if (!key || key.length > 128) return void next();

  const origJson = res.json.bind(res);
  res.json = ((body?: unknown) => {
    if (res.statusCode >= 200 && res.statusCode < 300 && hasPaymentHeader(req)) {
      const store = prune(loadStore());
      store[cacheKey(req.path, key)] = {
        status: res.statusCode,
        body,
        createdAt: Date.now(),
        route: req.path,
        bodyHash: bodyHash(req),
      };
      saveStore(store);
    }
    return origJson(body);
  }) as Response["json"];

  next();
}
