import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";
import { logger } from "./logger.js";

// ─── CDP JWT Auth ──────────────────────────────────────────────────────────────

/**
 * Convert DER-encoded ECDSA signature to raw R||S format (IEEE P1363) for JWT ES256.
 * Node.js crypto.createSign() returns DER; JWT spec requires raw 64-byte R||S.
 */
function derEcdsaToJwtSig(der: Buffer): Buffer {
  let pos = 2;
  if (der[1] & 0x80) pos += der[1] & 0x7f;
  pos++;
  const rLen = der[pos++];
  let r: Buffer = der.slice(pos, pos + rLen);
  pos += rLen;
  pos++;
  const sLen = der[pos++];
  let s: Buffer = der.slice(pos, pos + sLen);
  while (r.length > 32 && r[0] === 0x00) r = r.slice(1);
  while (s.length > 32 && s[0] === 0x00) s = s.slice(1);
  const out = Buffer.alloc(64);
  r.copy(out, 32 - r.length);
  s.copy(out, 64 - s.length);
  return out;
}

/**
 * Build a CDP API Key JWT (ES256) for authenticating to api.cdp.coinbase.com.
 */
function buildCdpJwt(keyId: string, privateKeyPem: string, method: string, url: string): string {
  const urlObj = new URL(url);
  const uri = `${method.toUpperCase()} ${urlObj.host}${urlObj.pathname}`;
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString("hex");
  const headerObj = { alg: "ES256", kid: keyId, nonce, typ: "JWT" };
  const payloadObj = { iss: "coinbase-cloud", nbf: now, exp: now + 120, sub: keyId, uri };
  const headerB64 = Buffer.from(JSON.stringify(headerObj)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sigInput = `${headerB64}.${payloadB64}`;
  const pem = privateKeyPem.includes("\\n")
    ? privateKeyPem.replace(/\\n/g, "\n")
    : privateKeyPem;
  const privateKey = crypto.createPrivateKey({ key: pem, format: "pem" });
  const sign = crypto.createSign("SHA256");
  sign.update(sigInput);
  const derSig = sign.sign(privateKey);
  const rawSig = derEcdsaToJwtSig(derSig);
  return `${sigInput}.${rawSig.toString("base64url")}`;
}

/**
 * Generate CDP Authorization header. Returns null if keys not configured.
 */
function getCdpAuthHeader(method: string, url: string): string | null {
  const keyId = process.env.CDP_API_KEY_ID?.trim();
  const keySecret = process.env.CDP_API_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  try {
    const jwt = buildCdpJwt(keyId, keySecret, method, url);
    return `Bearer ${jwt}`;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[cdp-auth] Failed to generate CDP JWT — check CDP_API_KEY_ID/SECRET format",
    );
    return null;
  }
}

function getCacheFilePath(): string {
  const dataDir = process.env.DATA_DIR?.trim() || path.join(process.cwd(), "data");
  return path.join(dataDir, "facilitator-supported.json");
}

function getFallbackFilePath(): string {
  return path.join(process.cwd(), "public", "data", "facilitator-supported-fallback.json");
}

// ─── Global fetch interceptor ─────────────────────────────────────────────────
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url || "";

  let isBypass = false;
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      isBypass = init.headers.get("x-bypass-interceptor") === "true";
    } else if (Array.isArray(init.headers)) {
      isBypass = (init.headers as string[][]).some(
        ([k, v]) => k.toLowerCase() === "x-bypass-interceptor" && v === "true",
      );
    } else {
      isBypass = (init.headers as Record<string, string>)["x-bypass-interceptor"] === "true";
    }
  }

  // ── 1. Local cache for /supported (Dexter / x402.org) ──
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
        /* ignore */
      }
    }
    if (!data) {
      const fallbackPath = getFallbackFilePath();
      if (existsSync(fallbackPath)) {
        try {
          data = readFileSync(fallbackPath, "utf8");
        } catch {
          /* ignore */
        }
      }
    }
    if (data) {
      return Promise.resolve(
        new Response(data, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
  }

  // ── 2. CDP JWT auth injection ──
  if (urlStr.includes("api.cdp.coinbase.com")) {
    const method = (init?.method ?? "GET").toUpperCase();
    const auth = getCdpAuthHeader(method, urlStr);
    if (auth) {
      let mergedHeaders: HeadersInit;
      if (init?.headers instanceof Headers) {
        const h = new Headers(init.headers);
        h.set("Authorization", auth);
        mergedHeaders = h;
      } else if (Array.isArray(init?.headers)) {
        mergedHeaders = [
          ...(init.headers as [string, string][]),
          ["Authorization", auth] as [string, string],
        ];
      } else {
        mergedHeaders = {
          ...((init?.headers as Record<string, string>) ?? {}),
          Authorization: auth,
        };
      }
      return originalFetch(input, { ...init, headers: mergedHeaders });
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
      signal: AbortSignal.timeout(
        Number(process.env.X402_FACILITATOR_TIMEOUT_MS ?? 5_000),
      ),
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
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[facilitator-extra] network fetch failed, falling back to local cache",
        );
        const raw = readFileSync(cachePath, "utf8");
        body = JSON.parse(raw) as { kinds?: SupportedKind[] };
      } catch (fallbackErr) {
        throw new Error(
          `Facilitator fetch failed (${err instanceof Error ? err.message : String(err)}) and local cache load failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
        );
      }
    } else if (existsSync(fallbackPath)) {
      try {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[facilitator-extra] network fetch failed and no local cache, falling back to pre-bundled cache",
        );
        const raw = readFileSync(fallbackPath, "utf8");
        body = JSON.parse(raw) as { kinds?: SupportedKind[] };
      } catch (fallbackErr) {
        throw new Error(
          `Facilitator fetch failed (${err instanceof Error ? err.message : String(err)}) and pre-bundled cache load failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
        );
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
  cacheLoadedAt = Date.now();
  try {
    await refreshFacilitatorExtras();
  } catch (err) {
    cacheLoadedAt = Date.now();
    throw err;
  }
}

/**
 * Merge facilitator extras into 402 accepts so EVM clients use Permit2 on Base.
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
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[facilitator-extra] refresh failed",
      );
    });
  };
  setInterval(tick, intervalMs).unref?.();
}
