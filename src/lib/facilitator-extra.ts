import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";
import { logger } from "./logger.js";

// ─── CDP JWT Auth ──────────────────────────────────────────────────────────────

/**
 * Build a CDP API Key JWT for authenticating to api.cdp.coinbase.com.
 *
 * Auto-detects key type from the raw base64-decoded bytes:
 *   - Starts with 0x30 (DER SEQUENCE) → PKCS#8 EC P-256 → ES256
 *   - Otherwise → raw Ed25519 seed (64 bytes, first 32 = seed) → EdDSA
 */
function derToJoseSig(der: Buffer): Buffer {
  let i = 2;
  if (der[1] & 0x80) i += der[1] & 0x7f;
  const rLen = der[i + 1];
  const r = der.slice(i + 2, i + 2 + rLen);
  i += 2 + rLen;
  const sLen = der[i + 1];
  const s = der.slice(i + 2, i + 2 + sLen);
  const out = Buffer.alloc(64, 0);
  r.copy(out, 32 - Math.min(r.length, 32), Math.max(0, r.length - 32));
  s.copy(out, 64 - Math.min(s.length, 32), Math.max(0, s.length - 32));
  return out;
}

function buildCdpJwt(keyId: string, keySecret: string, method: string, url: string): string {
  const urlObj = new URL(url);
  const uri = `${method.toUpperCase()} ${urlObj.host}${urlObj.pathname}`;
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString("hex");

  // Strip PEM headers/footers if present (e.g. -----BEGIN EC PRIVATE KEY-----)
  // and remove all whitespace before base64-decoding.
  // This handles both raw base64 DER and PEM-formatted keys stored in env vars.
  let b64 = keySecret
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!b64) b64 = keySecret.trim().replace(/\s+/g, "");
  const rawKey = Buffer.from(b64, "base64");

  let alg: string;
  let privateKey: crypto.KeyObject;

  if (rawKey[0] === 0x30) {
    // PKCS#8 DER-encoded EC P-256 key → ES256
    alg = "ES256";
    privateKey = crypto.createPrivateKey({ key: rawKey, format: "der", type: "pkcs8" });
  } else {
    // Raw Ed25519: first 32 bytes = seed → EdDSA
    // Use DER PKCS#8 format (not JWK) to avoid the Node.js ≥18 requirement
    // that OKP JWK keys include the "x" (public key) field alongside "d".
    alg = "EdDSA";
    const seed = rawKey.slice(0, 32);
    // PKCS#8 DER structure for Ed25519 (OID 1.3.101.112 = 0x2b 0x65 0x70)
    const pkcs8Header = Buffer.from([
      0x30, 0x2e, // SEQUENCE (46 bytes)
      0x02, 0x01, 0x00, // version INTEGER 0
      0x30, 0x05, // SEQUENCE AlgorithmIdentifier (5 bytes)
      0x06, 0x03, 0x2b, 0x65, 0x70, // OID 1.3.101.112 (Ed25519)
      0x04, 0x22, // OCTET STRING (34 bytes)
      0x04, 0x20, // inner OCTET STRING (32 bytes = seed)
    ]);
    privateKey = crypto.createPrivateKey({
      key: Buffer.concat([pkcs8Header, seed]),
      format: "der",
      type: "pkcs8",
    });
  }

  const headerObj = { alg, kid: keyId, nonce, typ: "JWT" };
  const payloadObj = { iss: "cdp", aud: ["cdp_service"], nbf: now, exp: now + 120, sub: keyId, uri };
  const headerB64 = Buffer.from(JSON.stringify(headerObj)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sigInput = `${headerB64}.${payloadB64}`;

  let sig: Buffer;
  if (alg === "ES256") {
    const derSig = crypto.sign("SHA256", Buffer.from(sigInput), privateKey);
    sig = derToJoseSig(derSig);
  } else {
    sig = crypto.sign(null, Buffer.from(sigInput), privateKey);
  }

  return `${sigInput}.${sig.toString("base64url")}`;
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
      // No local cache and no bundled fallback.
      // CDP facilitator doesn't expose /supported — don't crash the server.
      // Proceed with empty extras (Permit2 / feePayer enrichment skipped).
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), facilitatorUrl },
        "[facilitator-extra] network fetch failed, no local cache or bundled fallback — using empty extras",
      );
      body = { kinds: [] };
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
