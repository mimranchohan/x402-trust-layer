/**
 * Pay every paid route once (GET probe) for Bazaar / x402gle settlement signal.
 *
 * Modes:
 *   USE_CDP_FACILITATOR=1  -> CDP Facilitator (api.cdp.coinbase.com) + EVM wallet via @dexterai/x402/client
 *   (default)              -> OpenDexter CLI  (npx @dexterai/opendexter@latest fetch)
 *
 * Run: node scripts/bazaar-settle-all.mjs
 * Optional env:
 *   ORIGIN=https://x402trustlayer.xyz
 *   METHOD=GET
 *   DELAY_MS=2500
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

const origin = (process.env.ORIGIN ?? "https://x402trustlayer.xyz").replace(/\/$/, "");
const method = (process.env.METHOD ?? "GET").toUpperCase();
const delayMs = Number(process.env.DELAY_MS ?? 2500);
const useCdp = process.env.USE_CDP_FACILITATOR === "1";
const out = join(dirname(fileURLToPath(import.meta.url)), "bazaar-settle-result.json");

const CDP_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402/facilitator";

// ────────────────────────────────────────────────
// CDP JWT helpers (standalone -- no TS imports)
// ────────────────────────────────────────────────

function derEcdsaToJwtSig(der) {
  let pos = 2;
  if (der[1] & 0x80) pos += der[1] & 0x7f;
  pos++; // skip INTEGER tag for r
  const rLen = der[pos++];
  let r = der.slice(pos, pos + rLen);
  pos += rLen;
  pos++; // skip INTEGER tag for s
  const sLen = der[pos++];
  let s = der.slice(pos, pos + sLen);
  while (r.length > 32 && r[0] === 0x00) r = r.slice(1);
  while (s.length > 32 && s[0] === 0x00) s = s.slice(1);
  const out = Buffer.alloc(64);
  r.copy(out, 32 - r.length);
  s.copy(out, 64 - s.length);
  return out;
}

function buildCdpJwt(keyId, privateKeyPem, reqMethod, url) {
  const urlObj = new URL(url);
  const uri = reqMethod.toUpperCase() + " " + urlObj.host + urlObj.pathname;
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString("hex");
  const headerObj = { alg: "ES256", kid: keyId, nonce, typ: "JWT" };
  const payloadObj = { iss: "coinbase-cloud", nbf: now, exp: now + 120, sub: keyId, uri };
  const headerB64 = Buffer.from(JSON.stringify(headerObj)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sigInput = headerB64 + "." + payloadB64;
  const pem = privateKeyPem.includes("\\n") ? privateKeyPem.replace(/\\n/g, "\n") : privateKeyPem;
  const privateKey = crypto.createPrivateKey({ key: pem, format: "pem" });
  const sign = crypto.createSign("SHA256");
  sign.update(sigInput);
  const derSig = sign.sign(privateKey);
  const rawSig = derEcdsaToJwtSig(derSig);
  return sigInput + "." + rawSig.toString("base64url");
}

function getCdpAuthHeader(reqMethod, url) {
  const keyId = process.env.CDP_API_KEY_ID?.trim();
  const keySecret = process.env.CDP_API_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  try {
    return "Bearer " + buildCdpJwt(keyId, keySecret, reqMethod, url);
  } catch (err) {
    console.warn("[cdp-jwt] Failed:", err?.message ?? String(err));
    return null;
  }
}

// ────────────────────────────────────────────────
// Global fetch interceptor -- injects CDP JWT auth
// for any request targeting api.cdp.coinbase.com
// ────────────────────────────────────────────────

function installCdpFetchInterceptor() {
  const _origFetch = globalThis.fetch;
  globalThis.fetch = async function cdpInterceptedFetch(input, init) {
    init = init ?? {};
    const url = typeof input === "string" ? input
      : input instanceof URL ? input.href
      : input.url;
    if (url && url.startsWith("https://api.cdp.coinbase.com")) {
      const reqMethod = (init.method ?? "POST").toUpperCase();
      const auth = getCdpAuthHeader(reqMethod, url);
      if (auth) {
        const existingHeaders = Object.fromEntries(new Headers(init.headers ?? {}));
        init = { ...init, headers: { ...existingHeaders, Authorization: auth } };
      }
    }
    return _origFetch(input, init);
  };
}

// ────────────────────────────────────────────────
// Fetch catalog of URLs to settle
// ────────────────────────────────────────────────

const catalogRes = await fetch(origin + "/api/agentic/validate-urls");
if (!catalogRes.ok) throw new Error("validate-urls " + catalogRes.status);
const catalog = await catalogRes.json();
const urls = catalog.urls ?? [];
if (!urls.length) throw new Error("No URLs from /api/agentic/validate-urls");

const results = [];

// ════════════════════════════════════════════════
// CDP FACILITATOR MODE
// ════════════════════════════════════════════════

if (useCdp) {
  console.log("\nSettling " + urls.length + " routes on " + origin + " via CDP Facilitator (" + method + ")...\n");

  const evmKey = process.env.EVM_PRIVATE_KEY?.trim();
  if (!evmKey) throw new Error("CDP mode requires EVM_PRIVATE_KEY in env");
  if (!process.env.CDP_API_KEY_ID?.trim()) throw new Error("CDP mode requires CDP_API_KEY_ID in env");
  if (!process.env.CDP_API_KEY_SECRET?.trim()) throw new Error("CDP mode requires CDP_API_KEY_SECRET in env");

  installCdpFetchInterceptor();
  console.log("[cdp] JWT fetch interceptor installed");

  const { wrapFetch } = await import("@dexterai/x402/client");

  const x402Fetch = wrapFetch(fetch, {
    evmPrivateKey: evmKey,
    facilitatorUrl: CDP_FACILITATOR_URL,
    preferredNetwork: "eip155:8453",
    verbose: true,
  });
  console.log("[cdp] x402 fetch wrapper ready\n");

  for (const url of urls) {
    process.stdout.write(url + " ... ");
    try {
      const res = await x402Fetch(url, { method });
      const extResp = res.headers.get("x-extension-responses") ?? res.headers.get("EXTENSION-RESPONSES") ?? "";
      const x402Paid = res.headers.get("x-402-paid") ?? res.headers.get("x-payment-response") ?? "";
      const settled = res.status < 400 || extResp.length > 0 || x402Paid.length > 0;
      let tx = null;
      try { const pr = JSON.parse(x402Paid || "{}"); tx = pr.transaction ?? pr.txHash ?? pr.tx ?? null; } catch { /* ok */ }
      results.push({ url, settled, status: res.status, tx, error: null });
      console.log(settled
        ? "OK status=" + res.status + (tx ? " tx=" + String(tx).slice(0, 14) + "..." : "")
        : "FAIL status=" + res.status);
    } catch (err) {
      const msg = err?.message ?? String(err);
      results.push({ url, settled: false, status: 0, tx: null, error: msg.slice(0, 240) });
      console.log("ERROR " + msg.slice(0, 120));
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

// ════════════════════════════════════════════════
// OPENDEXTER CLI MODE (default / fallback)
// ════════════════════════════════════════════════

else {
  console.log("\nSettling " + urls.length + " routes on " + origin + " via OpenDexter CLI (" + method + ")...\n");

  for (const url of urls) {
    process.stdout.write(url + " ... ");
    const args = ["-y", "@dexterai/opendexter@latest", "fetch", url, "--method", method];
    const proc = spawnSync("npx", args, {
      encoding: "utf8",
      shell: true,
      timeout: 120_000,
      env: process.env,
    });
    const stdout = proc.stdout ?? "";
    const settled = /"settled"\s*:\s*true/.test(stdout);
    const tx = stdout.match(/"transaction"\s*:\s*"(0x[a-fA-F0-9]+)"/)?.[1] ?? null;
    const statusMatch = stdout.match(/"status"\s*:\s*(\d+)/);
    const status = statusMatch ? Number(statusMatch[1]) : proc.status;
    const err = proc.status !== 0 && !settled ? (proc.stderr ?? stdout).slice(0, 240) : null;
    results.push({ url, settled, status, tx, error: err ?? null });
    console.log(settled ? "OK tx=" + tx?.slice(0, 14) + "..." : "FAIL " + (err ?? proc.status));
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

// ────────────────────────────────────────────────
// Write results
// ────────────────────────────────────────────────

const summary = {
  origin,
  method,
  mode: useCdp ? "cdp-facilitator" : "opendexter-cli",
  at: new Date().toISOString(),
  total: results.length,
  settled: results.filter((r) => r.settled).length,
  failed: results.filter((r) => !r.settled).length,
  results,
};
writeFileSync(out, JSON.stringify(summary, null, 2), "utf8");
console.log("\nDone: " + summary.settled + "/" + summary.total + " settled (" + summary.mode + "). Wrote " + out);
if (summary.failed) process.exit(1);
