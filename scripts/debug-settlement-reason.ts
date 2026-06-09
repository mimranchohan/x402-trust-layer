/**
 * Surface server `reason` on settlement 402 (opendexter client only shows `error`).
 */
import dotenv from "dotenv";
import { createX402Client } from "@dexterai/x402/client";
import { createEvmPermit2CapableWallet } from "../src/lib/x402-client-options.js";
import { CHAIN_IDS } from "../src/lib/chains.js";

dotenv.config();

const base = (process.env.PUBLIC_BASE_URL ?? "https://x402trustlayer.xyz").replace(/\/$/, "");
const evmKey = process.env.EVM_PRIVATE_KEY?.trim();
if (!evmKey) throw new Error("EVM_PRIVATE_KEY required");

const wallet = await createEvmPermit2CapableWallet(evmKey, CHAIN_IDS.base);
const client = createX402Client({
  wallets: { evm: wallet },
  preferredNetwork: CHAIN_IDS.base,
  verbose: true,
});

const path = process.argv[2] ?? "/api/guard/pre-x402";
const body = {
  agentId: "demo-fleet-1",
  walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
  targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
  estimatedCostUsdc: 0.05,
  policy: { dailyCapUsdc: 10, perCallCapUsdc: 1, allowedHosts: ["myceliasignal.com"] },
};

// Step 1: unpaid 402
const probe = await fetch(`${base}${path}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const paymentRequired = probe.headers.get("PAYMENT-REQUIRED");
if (!paymentRequired) {
  console.error("No PAYMENT-REQUIRED header", probe.status, await probe.text());
  process.exit(1);
}

// Step 2: pay via client internals — use client.fetch and catch, then raw inspect
try {
  const res = await client.fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  console.log("SUCCESS", res.status, (await res.text()).slice(0, 300));
} catch (e) {
  console.error("client error:", e instanceof Error ? e.message : e);
}
