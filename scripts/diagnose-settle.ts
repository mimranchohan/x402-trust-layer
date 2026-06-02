/**
 * Capture facilitator settle failure reason from production (manual x402 pay).
 */
import dotenv from "dotenv";
import { wrapFetch, createEvmKeypairWallet } from "@dexterai/x402/client";
import { buildWrapFetchOptions } from "../src/lib/x402-client-options.js";

dotenv.config();

const url = "https://x402trustlayer.xyz/api/quality-escrow/semantic-settle";
const body = {
  action: "settle",
  deliveryIntent: "ETH/USD spot oracle price with symbol",
  releaseThreshold: 72,
  expectedProfile: { requiredKeys: ["price", "symbol"], forbidEmpty: true },
  actualResponse: {
    fields: { price: 3450.12, symbol: "ETH" },
    sample: '{"price":3450.12,"symbol":"ETH"}',
    byteLength: 48,
    empty: false,
  },
};

const probe = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const payRequired = probe.headers.get("payment-required");
console.log("probe status", probe.status, "payment-required", payRequired ? "yes" : "no");

const x402Fetch = wrapFetch(fetch, buildWrapFetchOptions({ verbose: true }));
const res = await x402Fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
}).catch(async () => {
  // wrapFetch throws — replay with last signed header if we had it
  return null;
});

if (res && res.ok) {
  console.log("SUCCESS", await res.text());
  process.exit(0);
}

// Low-level: build payment manually from probe header
if (!payRequired) {
  console.error("No PAYMENT-REQUIRED on probe");
  process.exit(1);
}

const requirements = JSON.parse(Buffer.from(payRequired, "base64").toString("utf8")) as {
  accepts: Array<Record<string, unknown>>;
  resource: unknown;
};
const accept = requirements.accepts[0];
const evmKey = process.env.EVM_PRIVATE_KEY?.trim();
if (!evmKey) throw new Error("EVM_PRIVATE_KEY required");

const wallet = await createEvmKeypairWallet(evmKey);
// Use wrapFetch only for adapter — import from client bundle is heavy; retry once more and parse error response via custom handler

const innerFetch = async (input: RequestInfo, init?: RequestInit) => {
  const r = await fetch(input, init);
  if (r.status === 402 && init?.headers && "PAYMENT-SIGNATURE" in (init.headers as Record<string, string>)) {
    const txt = await r.clone().text();
    console.log("\n--- settle failure body ---\n", txt);
    try {
      const j = JSON.parse(txt) as { error?: string; reason?: string };
      console.log("reason:", j.reason ?? "(none)");
    } catch {
      /* */
    }
  }
  return r;
};

const x402Fetch2 = wrapFetch(innerFetch, buildWrapFetchOptions({ verbose: true }));
try {
  const r2 = await x402Fetch2(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  console.log("paid status", r2.status, await r2.text());
} catch (e) {
  console.error("final error", e instanceof Error ? e.message : e);
  process.exit(1);
}
