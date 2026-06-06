/**
 * One-shot paid probe for /api/market/buy-advisor settlement debugging.
 * Usage: X402_VERBOSE=1 npx tsx scripts/debug-buy-advisor-pay.ts
 */
import dotenv from "dotenv";
import { buildX402Fetch, buildWrapFetchOptions, assertPayerKeys } from "../src/lib/x402-client-options.js";

dotenv.config();

const base = (process.env.PUBLIC_BASE_URL ?? "https://x402trustlayer.xyz").replace(/\/$/, "");

assertPayerKeys();

const nativeFetch = globalThis.fetch;
const tracingFetch: typeof fetch = async (input, init) => {
  const res = await nativeFetch(input, init);
  if (res.status === 402 && init?.headers) {
    const headers = init.headers as Record<string, string> | Headers;
    const sig =
      headers instanceof Headers
        ? headers.get("PAYMENT-SIGNATURE")
        : (headers as Record<string, string>)["PAYMENT-SIGNATURE"];
    if (sig) {
      try {
        const failBody = await res.clone().json();
        console.error("SETTLE_FAIL_BODY:", JSON.stringify(failBody));
      } catch {
        console.error("SETTLE_FAIL_BODY: (non-json)", (await res.clone().text()).slice(0, 300));
      }
    }
  }
  return res;
};

const body = {
  intent: "ETH USD spot price oracle",
  agentId: "demo-fleet-1",
  walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
  policy: { dailyCapUsdc: 10, perCallCapUsdc: 1 },
  maxPriceUsdc: 0.15,
  expectedCalls: 10,
};

const x402Fetch = await buildX402Fetch(tracingFetch, buildWrapFetchOptions({ verbose: process.env.X402_VERBOSE === "1" }));

console.log("Target:", `${base}/api/market/buy-advisor`);
console.log("Preferred network:", buildWrapFetchOptions().preferredNetwork ?? "(auto)");

const path = process.argv[2] ?? "/api/market/buy-advisor";
const payloads: Record<string, unknown> = {
  "/api/market/buy-advisor": body,
  "/api/guard/pre-x402": {
    agentId: "demo-fleet-1",
    walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
    targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
    estimatedCostUsdc: 0.05,
    policy: { dailyCapUsdc: 10, perCallCapUsdc: 1, allowedHosts: ["myceliasignal.com"] },
  },
};

const t0 = Date.now();
try {
  const res = await x402Fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payloads[path] ?? body),
  });
  const text = await res.text();
  console.log("OK", res.status, `${Date.now() - t0}ms`);
  console.log(text.slice(0, 800));
} catch (err) {
  console.error("FAIL", `${Date.now() - t0}ms`, err instanceof Error ? err.message : err);
  process.exit(1);
}
