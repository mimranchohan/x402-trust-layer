/**
 * Full pipeline demo — pays for each x402 endpoint on your deployed suite.
 */
import dotenv from "dotenv";
import { wrapFetch } from "@dexterai/x402/client";

dotenv.config();

const base = process.env.PUBLIC_BASE_URL ?? "http://127.0.0.1:3402";
const evmKey = process.env.EVM_PRIVATE_KEY?.trim();
const solKey = process.env.SOLANA_PRIVATE_KEY?.trim();

if (!evmKey && !solKey) {
  console.error("Set EVM_PRIVATE_KEY or SOLANA_PRIVATE_KEY in .env");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function assertServerUp(): Promise<void> {
  const res = await fetch(`${base}/health`);
  if (!res.ok) throw new Error(`health ${res.status}`);
  const body = (await res.json()) as { endpointCount?: number };
  console.log(`Health OK — ${body.endpointCount ?? "?"} endpoints\n`);
}

await assertServerUp();

const x402Fetch = wrapFetch(
  fetch,
  evmKey ? { evmPrivateKey: evmKey } : { walletPrivateKey: solKey! },
);

async function post(path: string, body: unknown) {
  try {
    const res = await x402Fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log(`--- ${path} (${res.status}) ---`);
    console.log(text.slice(0, 1200) + (text.length > 1200 ? "..." : ""));
    console.log();
  } catch (err) {
    console.error(`--- ${path} FAILED ---`, err, "\n");
  }
}

console.log("=== v3 killer apps ===\n");

await post("/api/x402/proxy", {
  agentId: "demo-fleet-1",
  walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
  targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
  estimatedCostUsdc: 0.05,
  policy: { dailyCapUsdc: 10, perCallCapUsdc: 1 },
  issueAttestation: true,
});

await sleep(2000);

await post("/api/mpp/session", {
  action: "open",
  expectedCalls: 30,
  avgPricePerCallUsdc: 0.03,
  chain: "solana",
  agentId: "demo-fleet-1",
});

await sleep(2000);

await post("/api/attestation/issue", {
  agentId: "demo-fleet-1",
  walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
  targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
  estimatedCostUsdc: 0.03,
  policy: { dailyCapUsdc: 10, perCallCapUsdc: 1 },
});

await sleep(2000);

await post("/api/guard/pre-x402", {
  agentId: "demo-fleet-1",
  walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
  targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
  estimatedCostUsdc: 0.05,
  network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  policy: { dailyCapUsdc: 10, perCallCapUsdc: 1, allowedHosts: ["myceliasignal.com"] },
});

await sleep(2000);

await post("/api/pipeline/execute", {
  agentId: "demo-fleet-1",
  walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
  targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
  estimatedCostUsdc: 0.05,
  policy: { dailyCapUsdc: 10, perCallCapUsdc: 1 },
  task: "ETH oracle with guard and routing under one dollar",
  maxBudgetUsdc: 1,
  marketplaceQuery: "ETH USD spot price oracle",
  preferNetwork: "solana",
});

await sleep(2000);

await post("/api/payment-intent/compile", {
  task: "ETH price check with risk scan and audit trail, max budget $1",
  maxBudgetUsdc: 1,
  agentId: "demo-fleet-1",
  externalCallEstimateUsdc: 0.05,
});

await sleep(2000);

await post("/api/spend-governor/check", {
  agentId: "demo-fleet-1",
  estimatedCostUsdc: 0.5,
  policy: { dailyCapUsdc: 10, perCallCapUsdc: 1 },
});

await sleep(1500);

await post("/api/identity-gate/check", {
  walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
});

await sleep(1500);

await post("/api/risk-gate/scan", {
  targetUrl: "https://x402-agent-suite-production.up.railway.app/health",
});

await sleep(1500);

await post("/api/facilitator/failover", {
  targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
  preferNetwork: "solana",
});

await sleep(1500);

await post("/api/router/route", {
  query: "ETH price oracle",
  maxPriceUsdc: 0.1,
});

await sleep(1500);

await post("/api/mpp/session-plan", {
  action: "estimate",
  expectedCalls: 50,
  avgPricePerCallUsdc: 0.03,
});

await sleep(1500);

await post("/api/receipt-auditor/verify", {
  network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  expectedAmountUsdc: 0.03,
});

await sleep(1500);

await post("/api/settlement-graph/next", {
  lastEndpointPath: "/api/spend-governor/check",
  lastTopic: "budget policy",
});

await sleep(1500);

await post("/api/refund-arbiter/evaluate", {
  verificationScore: 82,
  endpointReachable: true,
});

await sleep(1500);

await post("/api/budget-allocator/run", {
  fleetId: "fleet-alpha",
  poolRemainingUsdc: 2,
  agents: [
    { agentId: "a1", priority: 10, requestedUsdc: 0.5, dailyRemainingUsdc: 5 },
    { agentId: "a2", priority: 5, requestedUsdc: 1, dailyRemainingUsdc: 3 },
  ],
});

await sleep(1500);

await post("/api/quality-monitor/probe", {
  urls: [
    "https://x402-agent-suite-production.up.railway.app/health",
    "https://api.myceliasignal.com/oracle/price/eth/usd",
  ],
});

await sleep(1500);

await post("/api/evidence-locker/export", {
  organizationId: "demo-org",
  records: [
    {
      endpoint: "/api/spend-governor/check",
      amountUsdc: 0.03,
      network: "solana",
      timestamp: new Date().toISOString(),
    },
  ],
});

await sleep(1500);

const escrowRes = await x402Fetch(`${base}/api/agent-escrow`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    action: "create",
    payerAgentId: "agent-a",
    payeeAgentId: "agent-b",
    amountUsdc: 0.1,
    releaseCondition: "receipt-auditor valid:true",
  }),
});
console.log("--- /api/agent-escrow create ---", escrowRes.status, await escrowRes.text(), "\n");

console.log("Full pipeline demo complete.");
