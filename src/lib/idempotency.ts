import type { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import { hasPaymentSignatureHeader } from "./x402-headers.js";
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const TTL_MS = 24 * 60 * 60 * 1000;
const STORE_PATH = join(process.cwd(), "data", "idempotency.json");
const CLAIM_DIR = join(process.cwd(), "data", "idempotency-claims");

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

function claimFilePath(cacheKeyStr: string): string {
  const hash = createHash("sha256").update(cacheKeyStr).digest("hex");
  return join(CLAIM_DIR, `${hash}.claim`);
}

function tryClaimInFlight(cacheKeyStr: string): boolean {
  mkdirSync(CLAIM_DIR, { recursive: true });
  const file = claimFilePath(cacheKeyStr);
  try {
    writeFileSync(file, String(Date.now()), { flag: "wx" });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
}

function releaseClaim(cacheKeyStr: string): void {
  const file = claimFilePath(cacheKeyStr);
  try {
    if (existsSync(file)) unlinkSync(file);
  } catch {
    /* ignore */
  }
}

function bodyHash(req: Request): string {
  const raw = JSON.stringify(req.body ?? {});
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function hasPaymentHeader(req: Request): boolean {
  return hasPaymentSignatureHeader(req);
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
  const keyStr = cacheKey(route, key);
  const store = prune(loadStore());
  const hit = store[keyStr];
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
    const retry = prune(loadStore())[keyStr];
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
    if (res.statusCode >= 200 && res.statusCode < 300 && hasPaymentHeader(req)) {
      const store = prune(loadStore());
      store[routeKey] = {
        status: res.statusCode,
        body,
        createdAt: Date.now(),
        route: req.path,
        bodyHash: bodyHash(req),
      };
      saveStore(store);
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
