/**
 * Diagnose facilitator settle failures: compare client-facing 402 accepts vs settle requirements.
 * Usage: npx tsx scripts/probe-settle-mismatch.ts [/api/market/buy-advisor]
 */
import dotenv from "dotenv";
import {
  assertPayerKeys,
  buildWrapFetchOptions,
  buildX402Fetch,
} from "../src/lib/x402-client-options.js";
import { enrichAcceptFromFacilitator, refreshFacilitatorExtras } from "../src/lib/facilitator-extra.js";

dotenv.config();

const base = (process.env.PUBLIC_BASE_URL ?? "https://x402trustlayer.xyz").replace(/\/$/, "");
const path = process.argv[2] ?? "/api/market/buy-advisor";
const facilitatorUrl = (process.env.X402_FACILITATOR_URL ?? "https://x402.dexter.cash").replace(
  /\/$/,
  "",
);

const bodies: Record<string, unknown> = {
  "/api/market/buy-advisor": {
    intent: "ETH USD spot price oracle",
    agentId: "probe-settle",
    walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
    policy: { dailyCapUsdc: 10, perCallCapUsdc: 1 },
    maxPriceUsdc: 0.15,
    expectedCalls: 10,
  },
  "/api/guard/pre-x402": {
    agentId: "probe-settle",
    walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
    targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
    estimatedCostUsdc: 0.05,
    policy: { dailyCapUsdc: 10, perCallCapUsdc: 1, allowedHosts: ["myceliasignal.com"] },
  },
};

function decodeHeader(b64: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Record<string, unknown>;
}

function sdkStyleExtra(facilitatorExtra: Record<string, unknown> | undefined, decimals = 6) {
  return {
    ...(facilitatorExtra?.feePayer ? { feePayer: facilitatorExtra.feePayer } : {}),
    decimals: facilitatorExtra?.decimals ?? decimals,
    name: facilitatorExtra?.name,
    version: facilitatorExtra?.version,
  };
}

function headerSig(init?: RequestInit): string | undefined {
  const h = init?.headers;
  if (!h) return undefined;
  if (h instanceof Headers) return h.get("PAYMENT-SIGNATURE") ?? undefined;
  const rec = h as Record<string, string>;
  return rec["PAYMENT-SIGNATURE"] ?? rec["payment-signature"];
}

assertPayerKeys();

await refreshFacilitatorExtras(facilitatorUrl);
const supportedRes = await fetch(`${facilitatorUrl}/supported`);
const supported = (await supportedRes.json()) as {
  kinds?: { network: string; scheme: string; extra?: Record<string, unknown> }[];
};
const baseKind = supported.kinds?.find((k) => k.network === "eip155:8453" && k.scheme === "exact");

console.log("Facilitator Base extra:", JSON.stringify(baseKind?.extra ?? null, null, 2));
console.log("SDK-stripped extra (what server caches):", JSON.stringify(sdkStyleExtra(baseKind?.extra), null, 2));

const unpaid = await fetch(`${base}${path}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(bodies[path] ?? bodies["/api/market/buy-advisor"]),
});
const header = unpaid.headers.get("PAYMENT-REQUIRED") ?? "";
const bodyJson = (await unpaid.json()) as { accepts?: Record<string, unknown>[] };
const parsed = decodeHeader(header);
const baseAccept =
  (parsed.accepts as Record<string, unknown>[] | undefined)?.find(
    (a) => a.network === "eip155:8453",
  ) ??
  bodyJson.accepts?.find((a) => a.network === "eip155:8453");

console.log("\nClient-facing Base accept extra:", JSON.stringify(baseAccept?.extra ?? null, null, 2));

let capturedSig = "";
const nativeFetch = globalThis.fetch;
const captureFetch: typeof fetch = async (input, init) => {
  const sig = headerSig(init);
  if (sig) {
    capturedSig = sig;
    return new Response(JSON.stringify({ probe: "captured before merchant settle" }), { status: 499 });
  }
  return nativeFetch(input, init);
};

const x402Fetch = await buildX402Fetch(captureFetch, buildWrapFetchOptions({ verbose: true }));
try {
  await x402Fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bodies[path] ?? bodies["/api/market/buy-advisor"]),
  });
} catch {
  // expected when captureFetch returns 499
}

if (!capturedSig) {
  console.error("Failed to capture PAYMENT-SIGNATURE");
  process.exit(1);
}

const decoded = decodeHeader(capturedSig);
const signedAccepted = decoded.accepted as Record<string, unknown> | undefined;

console.log("\nSigned accepted.network:", signedAccepted?.network);
console.log("Signed accepted.extra:", JSON.stringify(signedAccepted?.extra ?? null, null, 2));
console.log("Signed payload keys:", Object.keys((decoded.payload as object) ?? {}));

const settleReqFromCache = {
  scheme: "exact",
  network: "eip155:8453",
  amount: signedAccepted?.amount,
  maxAmountRequired: signedAccepted?.maxAmountRequired ?? signedAccepted?.amount,
  asset: signedAccepted?.asset,
  payTo: signedAccepted?.payTo,
  maxTimeoutSeconds: signedAccepted?.maxTimeoutSeconds ?? 120,
  extra: sdkStyleExtra(baseKind?.extra),
};

async function callFacilitator(label: string, requirements: Record<string, unknown>) {
  const payload = {
    x402Version: 2,
    paymentPayload: decoded,
    paymentRequirements: requirements,
  };
  for (const endpoint of ["verify", "settle"] as const) {
    const res = await fetch(`${facilitatorUrl}/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log(`\n[${label}] /${endpoint} HTTP ${res.status}`);
    console.log(text.slice(0, 1200));
  }
}

await callFacilitator("sdk-cache-style (no permit2)", settleReqFromCache);
await callFacilitator("signed-accepted", signedAccepted as Record<string, unknown>);

const enriched = { ...(baseAccept ?? {}) };
enrichAcceptFromFacilitator(enriched);
const settleReqEnriched = {
  scheme: "exact",
  network: "eip155:8453",
  amount: signedAccepted?.amount,
  maxAmountRequired: signedAccepted?.maxAmountRequired ?? signedAccepted?.amount,
  asset: signedAccepted?.asset,
  payTo: signedAccepted?.payTo,
  maxTimeoutSeconds: signedAccepted?.maxTimeoutSeconds ?? 120,
  extra: enriched.extra,
};
await callFacilitator("enriched-extra", settleReqEnriched as Record<string, unknown>);
