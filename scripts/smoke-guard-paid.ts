/**
 * Cheaper paid smoke: POST /api/guard/pre-x402 (~$0.05) — no semantic escrow / OpenAI.
 */
import dotenv from "dotenv";
import { assertPayerKeys, buildWrapFetchOptions, buildX402Fetch } from "../src/lib/x402-client-options.js";

dotenv.config();
const base = (process.env.PUBLIC_BASE_URL ?? "https://x402trustlayer.xyz").replace(/\/$/, "");

assertPayerKeys();
const x402Fetch = await buildX402Fetch(
  fetch,
  buildWrapFetchOptions({ verbose: process.env.X402_VERBOSE === "1" }),
);

const payer = process.env.PAY_TO_EVM ?? "0x0000000000000000000000000000000000000001";
const res = await x402Fetch(`${base}/api/guard/pre-x402`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    agentId: "smoke-guard",
    walletAddress: payer,
    targetUrl: `${base}/health`,
    estimatedCostUsdc: 0.05,
    policy: { dailyCapUsdc: 10, perCallCapUsdc: 1 },
  }),
});

const text = await res.text();
console.log("Status:", res.status);
console.log(text.slice(0, 1500));
if (!res.ok) process.exit(1);
console.log("\nOK — guard pre-x402 paid settlement works");
