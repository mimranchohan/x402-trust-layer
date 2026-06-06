import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

function getCacheFilePath(): string {
  const dataDir = process.env.DATA_DIR?.trim() || path.join(process.cwd(), "data");
  return path.join(dataDir, "facilitator-supported.json");
}

function getFallbackFilePath(): string {
  return path.join(process.cwd(), "public", "data", "facilitator-supported-fallback.json");
}

// Intercept global fetch for facilitator /supported endpoint to return local cache instantly
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as any).url || "";
  
  let isBypass = false;
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      isBypass = init.headers.get("x-bypass-interceptor") === "true";
    } else if (Array.isArray(init.headers)) {
      isBypass = init.headers.some(([k, v]) => k.toLowerCase() === "x-bypass-interceptor" && v === "true");
    } else {
      isBypass = (init.headers as Record<string, string>)["x-bypass-interceptor"] === "true";
    }
  }

  if (
    urlStr.endsWith("/supported") &&
    (urlStr.includes("dexter.cash") || urlStr.includes("x402.org")) &&
    !isBypass
  ) {
    const cachePath = getCacheFilePath();
    let data = "";
    if (existsSync(cachePath)) {
      try {
        data = readFileSync(cachePath, "utf8");
      } catch {
        // ignore
      }
    }
    if (!data) {
      const fallbackPath = getFallbackFilePath();
      if (existsSync(fallbackPath)) {
        try {
          data = readFileSync(fallbackPath, "utf8");
        } catch {
          // ignore
        }
      }
    }
    if (data) {
      return Promise.resolve(new Response(data, {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));
    }
  }
  return originalFetch(input, init);
};

type SupportedKind = {
  scheme: string;
  network: string;
  extra?: Record<string, unknown>;
};

let extrasByNetworkScheme = new Map<string, Record<string, unknown>>();
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

function cacheKey(network: string, scheme: string): string {
  return `${network}|${scheme}`;
}

/** Load facilitator /supported extras (permit2 on Base, feePayer on Solana, etc.). */
export async function refreshFacilitatorExtras(
  facilitatorUrl = config.facilitatorUrl,
): Promise<void> {
  const base = facilitatorUrl.replace(/\/$/, "");
  let body: { kinds?: SupportedKind[] };
  const cachePath = getCacheFilePath();
  try {
    const res = await fetch(`${base}/supported`, {
      headers: { "x-bypass-interceptor": "true" },
      signal: AbortSignal.timeout(Number(process.env.X402_FACILITATOR_TIMEOUT_MS ?? 5_000)),
    });
    if (!res.ok) {
      throw new Error(`Facilitator /supported HTTP ${res.status}`);
    }
    body = (await res.json()) as { kinds?: SupportedKind[] };
    try {
      writeFileSync(cachePath, JSON.stringify(body, null, 2), "utf8");
    } catch {
      // ignore write error
    }
  } catch (err) {
    const fallbackPath = getFallbackFilePath();
    if (existsSync(cachePath)) {
      try {
        console.warn(`[facilitator-extra] network fetch failed, falling back to local cache: ${err instanceof Error ? err.message : String(err)}`);
        const raw = readFileSync(cachePath, "utf8");
        body = JSON.parse(raw) as { kinds?: SupportedKind[] };
      } catch (fallbackErr) {
        throw new Error(`Facilitator fetch failed (${err instanceof Error ? err.message : String(err)}) and local cache load failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
      }
    } else if (existsSync(fallbackPath)) {
      try {
        console.warn(`[facilitator-extra] network fetch failed and no local cache, falling back to pre-bundled cache: ${err instanceof Error ? err.message : String(err)}`);
        const raw = readFileSync(fallbackPath, "utf8");
        body = JSON.parse(raw) as { kinds?: SupportedKind[] };
      } catch (fallbackErr) {
        throw new Error(`Facilitator fetch failed (${err instanceof Error ? err.message : String(err)}) and pre-bundled cache load failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
      }
    } else {
      throw err;
    }
  }

  const next = new Map<string, Record<string, unknown>>();
  for (const kind of body.kinds ?? []) {
    if (kind.extra && kind.network && kind.scheme) {
      next.set(cacheKey(kind.network, kind.scheme), kind.extra);
    }
  }
  extrasByNetworkScheme = next;
  cacheLoadedAt = Date.now();
}

export async function ensureFacilitatorExtras(): Promise<void> {
  if (Date.now() - cacheLoadedAt < CACHE_TTL_MS) return;
  cacheLoadedAt = Date.now(); // set immediately to avoid parallel stampedes
  try {
    await refreshFacilitatorExtras();
  } catch (err) {
    // Keep cacheLoadedAt updated so we don't spin-retry on every request
    cacheLoadedAt = Date.now();
    throw err;
  }
}


/**
 * Merge facilitator extras into 402 accepts so EVM clients use Permit2 on Base
 * (Dexter facilitator returns 500 if payer signs EIP-712 but settle expects permit2).
 */
export function enrichAcceptFromFacilitator(accept: {
  network?: string;
  scheme?: string;
  extra?: Record<string, unknown>;
}): void {
  if (!accept.network) return;
  const scheme = accept.scheme ?? "exact";
  const facilitatorExtra = extrasByNetworkScheme.get(cacheKey(accept.network, scheme));
  if (!facilitatorExtra) return;
  accept.extra = { ...facilitatorExtra, ...accept.extra };
}

export function startFacilitatorExtrasRefresh(intervalMs = CACHE_TTL_MS): void {
  const tick = () => {
    void refreshFacilitatorExtras().catch((err) => {
      console.warn(
        "[facilitator-extra] refresh failed:",
        err instanceof Error ? err.message : err,
      );
    });
  };
  setInterval(tick, intervalMs).unref?.();
}
