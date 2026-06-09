/**
 * Pre-flight checks for npm run demo:alchemy (no USDC spent).
 */
import dotenv from "dotenv";

dotenv.config();

const TRUST_BASE = (process.env.TRUST_LAYER_BASE ?? "https://x402trustlayer.xyz").replace(/\/$/, "");

async function fetchWithTimeout(url: string, init: RequestInit, ms = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log("--- Alchemy live demo doctor ---\n");

  let ok = true;

  if (!process.env.EVM_PRIVATE_KEY?.trim()) {
    console.log("❌ EVM_PRIVATE_KEY — missing (required for Alchemy SIWE + Base USDC)");
    ok = false;
  } else {
    try {
      const { getWalletAddress } = await import("@alchemy/x402");
      const { assertDemoPayerNotReceiveWallet } = await import("../src/lib/x402-client-options.js");
      await assertDemoPayerNotReceiveWallet();
      const addr = getWalletAddress(process.env.EVM_PRIVATE_KEY.trim());
      console.log(`✅ EVM_PRIVATE_KEY — ${addr.slice(0, 6)}…${addr.slice(-4)}`);
    } catch (err) {
      console.log(`❌ EVM_PRIVATE_KEY — ${err instanceof Error ? err.message : err}`);
      ok = false;
    }
  }

  try {
    const res = await fetchWithTimeout(`${TRUST_BASE}/health`, { method: "GET" });
    const body = (await res.json()) as { ok?: boolean; endpointCount?: number };
    if (res.ok && body.ok) {
      console.log(`✅ Trust Layer health — ${TRUST_BASE} (${body.endpointCount ?? "?"} endpoints)`);
    } else {
      console.log(`❌ Trust Layer health — HTTP ${res.status}`);
      ok = false;
    }
  } catch (err) {
    console.log(`❌ Trust Layer health — ${err instanceof Error ? err.message : err}`);
    ok = false;
  }

  try {
    const res = await fetchWithTimeout("https://x402.alchemy.com/base-mainnet/v2", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
    });
    console.log(
      `✅ Alchemy gateway reachable — HTTP ${res.status} (401/402/500 without SIWE is expected)`,
    );
  } catch (err) {
    console.log(`❌ Alchemy gateway — ${err instanceof Error ? err.message : err}`);
    ok = false;
  }

  console.log("\nEstimated live demo cost (from your wallet):");
  console.log("  Standard:  ~$0.10 Trust Layer + ~$1.00 Alchemy credit  ≈ $1.10");
  console.log("  Enterprise: ~$0.32 Trust Layer + ~$1.00 Alchemy credit ≈ $1.32");
  console.log("\nRun:");
  console.log("  npm run demo:alchemy");
  console.log("  npm run demo:alchemy:enterprise");

  if (!ok) process.exit(1);
  console.log("\nReady for live demo.");
}

main();
