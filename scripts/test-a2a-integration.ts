/**
 * End-to-end A2A flow smoke (requires payer keys in env).
 * Usage: npm run test:a2a
 */
import { buildX402Fetch } from "../src/lib/x402-client-options.js";

const BASE = (process.env.PUBLIC_BASE_URL ?? "https://x402trustlayer.xyz").replace(/\/$/, "");

async function main() {
  const evm = process.env.EVM_PRIVATE_KEY?.trim();
  const sol = process.env.SOLANA_PRIVATE_KEY?.trim();
  if (!evm && !sol) {
    console.warn("SKIP: set EVM_PRIVATE_KEY or SOLANA_PRIVATE_KEY for paid A2A integration test");
    process.exit(0);
  }
  console.log("Starting A2A integration test against", BASE);
  const x402Fetch = await buildX402Fetch(fetch, {
    preferredNetwork: "eip155:8453",
  });

  const pre = await x402Fetch(`${BASE}/api/guard/pre-x402`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agentId: "test-agent-a2a",
      walletAddress: process.env.PAY_TO_EVM ?? "0x0000000000000000000000000000000000000001",
      targetUrl: `${BASE}/api/research/brief`,
      estimatedCostUsdc: 0.2,
      policy: { dailyCapUsdc: 5, perCallCapUsdc: 0.25, allowedHosts: ["*"] },
    }),
  });
  const preResult = (await pre.json()) as { allowed?: boolean };
  console.log("Preflight:", preResult.allowed ? "ALLOWED" : "BLOCKED");
  if (!preResult.allowed) throw new Error("Preflight blocked unexpectedly");

  const paid = await x402Fetch(`${BASE}/api/pipeline/execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: "A2A integration test query",
      budgetUsdc: 0.25,
      agentId: "test-agent-a2a",
      walletAddress: process.env.PAY_TO_EVM ?? "0x0000000000000000000000000000000000000001",
      targetUrl: `${BASE}/api/research/brief`,
      estimatedCostUsdc: 0.2,
      policy: { dailyCapUsdc: 5, perCallCapUsdc: 0.25, allowedHosts: ["*"] },
    }),
  });
  console.log("Pipeline status:", paid.status);

  const receipt = paid.headers.get("PAYMENT-RESPONSE");
  if (receipt) {
    const verify = await x402Fetch(`${BASE}/api/receipt-auditor/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        receipt,
        expectedAmountUsdc: 0.25,
        network: "eip155:8453",
      }),
    });
    const v = (await verify.json()) as { valid?: boolean };
    console.log("Receipt verified:", v.valid ?? v);
  }

  console.log("A2A integration test PASSED");
}

main().catch((err) => {
  console.error("A2A integration test FAILED:", err);
  process.exit(1);
});
