/**
 * Demo: pay for your own x402 endpoints (buyer path).
 * Requires EVM_PRIVATE_KEY (Base) or SOLANA_PRIVATE_KEY in .env
 */
import dotenv from "dotenv";
import { wrapFetch } from "@dexterai/x402/client";

dotenv.config();

// 127.0.0.1 avoids Windows resolving localhost to ::1 when the server only binds IPv4
const base = process.env.PUBLIC_BASE_URL ?? "http://127.0.0.1:3402";
const evmKey = process.env.EVM_PRIVATE_KEY?.trim();
const solKey = process.env.SOLANA_PRIVATE_KEY?.trim();

if (!evmKey && !solKey) {
  console.error("Set EVM_PRIVATE_KEY or SOLANA_PRIVATE_KEY in .env to run the demo payer.");
  process.exit(1);
}

async function assertServerUp(): Promise<void> {
  try {
    const res = await fetch(`${base}/health`);
    if (!res.ok) throw new Error(`health returned ${res.status}`);
  } catch {
    console.error(`
Cannot reach server at ${base}

Start the server first (separate terminal):
  cd C:\\Users\\mimra\\x402-agent-suite
  npm run dev

Wait until you see: "x402 Agent Suite listening on ..."
Then run: npm run demo
`);
    process.exit(1);
  }
}

await assertServerUp();

const x402Fetch = wrapFetch(
  fetch,
  evmKey
    ? { evmPrivateKey: evmKey }
    : { walletPrivateKey: solKey! },
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(path: string, body: unknown) {
  try {
    const res = await x402Fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log(`\n--- ${path} (${res.status}) ---\n${text}\n`);
  } catch (err) {
    console.error(`\n--- ${path} FAILED ---\n`, err);
    console.error("Tip: check server terminal is still running (npm run dev).\n");
  }
}

await post("/api/spend-governor/check", {
  agentId: "demo-agent-1",
  estimatedCostUsdc: 0.01,
  targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
  network: "eip155:8453",
  policy: { dailyCapUsdc: 5, perCallCapUsdc: 0.25, allowedHosts: ["myceliasignal.com"] },
});

await sleep(2500);

await post("/api/router/route", {
  query: "ETH price oracle",
  preferNetwork: "base",
  maxPriceUsdc: 0.05,
});

await sleep(2500);

await post("/api/research/brief", {
  topic: "Ethereum L2 fees",
  includePrice: true,
});

console.log("Demo complete. Check server logs for settlement callbacks.");
