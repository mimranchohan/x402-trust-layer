/**
 * Full pipeline demo — pays for each x402 endpoint on your deployed suite.
 */
import dotenv from "dotenv";
import { CHAIN_IDS } from "../lib/chains.js";

const BASE = CHAIN_IDS.base;
import {
  assertDemoPayerNotReceiveWallet,
  assertPayerKeys,
  buildWrapFetchOptions,
  buildX402Fetch,
} from "../lib/x402-client-options.js";

dotenv.config();

const base = process.env.PUBLIC_BASE_URL ?? "http://127.0.0.1:3402";

try {
  assertPayerKeys();
  await assertDemoPayerNotReceiveWallet();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function assertServerUp(): Promise<void> {
  const res = await fetch(`${base}/health`);
  if (!res.ok) throw new Error(`health ${res.status}`);
  const body = (await res.json()) as { endpointCount?: number };
  console.log(`Health OK — ${body.endpointCount ?? "?"} endpoints`);
  console.log(`Demo target: ${base}\n`);
}

await assertServerUp();

const wrapOpts = buildWrapFetchOptions({ verbose: process.env.X402_VERBOSE === "1" });
const x402Fetch = await buildX402Fetch(fetch, wrapOpts);
const solRpc = wrapOpts.rpcUrls?.[CHAIN_IDS.solana];
if (solRpc) {
  console.log(`Solana RPC: ${solRpc} (avoids Dexter proxy StructError on USDC mint)\n`);
}
if (wrapOpts.preferredNetwork) {
  console.log(`Preferred payment network: ${wrapOpts.preferredNetwork}\n`);
}

const PAYMENT_RETRY_MATCH =
  /settlement failed|payment was rejected|insufficient balance|verification failed|facilitator/i;
const PAYMENT_MAX_ATTEMPTS = Number(process.env.DEMO_PAYMENT_MAX_ATTEMPTS ?? 3);
const PAYMENT_RETRY_BASE_MS = Number(process.env.DEMO_PAYMENT_RETRY_MS ?? 6_000);
const stepDelay = (ms = Number(process.env.DEMO_STEP_DELAY_MS ?? 3_500)) => sleep(ms);

async function paidFetch(path: string, init: RequestInit, label = path): Promise<Response | null> {
  for (let attempt = 1; attempt <= PAYMENT_MAX_ATTEMPTS; attempt++) {
    try {
      return await x402Fetch(`${base}${path}`, init);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = PAYMENT_RETRY_MATCH.test(msg);
      if (retryable && attempt < PAYMENT_MAX_ATTEMPTS) {
        const wait = PAYMENT_RETRY_BASE_MS * attempt;
        console.warn(`--- ${label} payment retry ${attempt}/${PAYMENT_MAX_ATTEMPTS - 1} in ${wait}ms ---`, msg);
        await sleep(wait);
        continue;
      }
      console.error(`--- ${label} FAILED ---`, msg);
      if (retryable) {
        if (/facilitator_timeout/i.test(msg)) {
          console.error(
            "  Hint: server facilitator_timeout — on Railway set X402_FACILITATOR_TIMEOUT_MS=90000 (not 25000), redeploy, retry.\n",
          );
        } else if (/facilitator_error_500|Timed out while waiting for transaction/i.test(msg)) {
          console.error(
            "  Hint: Dexter facilitator Base settle failed — sponsored Permit2 tx did not confirm on-chain (upstream infra).",
          );
          console.error(
            "  Retry later, or: X402_PREFERRED_NETWORK=solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp npm run demo",
          );
          console.error("  Diagnose: npx tsx scripts/probe-settle-mismatch.ts\n");
        }
        console.error(
          "  Hint: long demo runs can hit transient Dexter facilitator limits. Retry one route:",
        );
        console.error(`  npm run demo:tail   (or: npx tsx scripts/debug-buy-advisor-pay.ts)\n`);
        console.error(
          "  Check Base wallet: USDC for payments + small ETH for Permit2 gas. X402_VERBOSE=1 for payment trace.\n",
        );
      } else if (msg.includes("verification failed")) {
        console.error(
          "  Hint: transient facilitator glitch — retry usually succeeds (X402_VERBOSE=1 on server/client).\n",
        );
      } else {
        console.error();
      }
      return null;
    }
  }
  return null;
}

async function post(path: string, body: unknown): Promise<unknown | null> {
  const res = await paidFetch(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    path,
  );
  if (!res) return null;

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  console.log(`--- ${path} (${res.status}) ---`);
  if (path === "/api/seller/audition-coach" && parsed && typeof parsed === "object") {
    const coach = parsed as Record<string, unknown>;
    console.log(
      JSON.stringify(
        {
          coached: coach.coached,
          allowed: coach.allowed,
          hostScoreEstimate: coach.hostScoreEstimate,
          routeAuditCount: Array.isArray(coach.routeAudits) ? coach.routeAudits.length : 0,
          confidence: coach.confidence,
          summary: coach.summary,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(text.slice(0, 1200) + (text.length > 1200 ? "..." : ""));
  }
  console.log();
  return parsed;
}

console.log("=== marketplace killers ===\n");

await post("/api/market/buy-advisor", {
  intent: "ETH USD spot price oracle",
  agentId: "demo-fleet-1",
  walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
  policy: { dailyCapUsdc: 10, perCallCapUsdc: 1 },
  maxPriceUsdc: 0.15,
  expectedCalls: 10,
});

await sleep(2000);

await post("/api/seller/audition-coach", {
  origin: base,
  maxRoutes: 24,
});

await sleep(2000);

console.log("=== v3 primary entrypoints ===\n");

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

const attestationIssue = await post("/api/attestation/issue", {
  agentId: "demo-fleet-1",
  walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
  targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
  estimatedCostUsdc: 0.03,
  policy: { dailyCapUsdc: 10, perCallCapUsdc: 1 },
});

await sleep(2000);

const issuedAttestationId =
  attestationIssue &&
  typeof attestationIssue === "object" &&
  "attestation" in attestationIssue &&
  attestationIssue.attestation &&
  typeof attestationIssue.attestation === "object" &&
  "attestationId" in attestationIssue.attestation &&
  typeof attestationIssue.attestation.attestationId === "string"
    ? attestationIssue.attestation.attestationId
    : null;

if (!issuedAttestationId) {
  console.warn("Attestation issue did not return attestationId — verify step may fail.\n");
}

await post("/api/attestation/verify", {
  attestationId: issuedAttestationId ?? "att_verifier_probe_example",
});

await sleep(3500);

const regRes = await paidFetch("/api/attestation/registry", { method: "GET" });
if (regRes) {
  console.log(
    "--- /api/attestation/registry GET ---",
    regRes.status,
    (await regRes.text()).slice(0, 800),
    "\n",
  );
}

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

await stepDelay(5_000);

await post("/api/spend-governor/check", {
  agentId: "demo-fleet-1",
  estimatedCostUsdc: 0.5,
  policy: { dailyCapUsdc: 10, perCallCapUsdc: 1 },
});

await stepDelay();

await post("/api/identity-gate/check", {
  walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
});

await stepDelay();

await post("/api/risk-gate/scan", {
  targetUrl: "https://x402trustlayer.xyz/health",
});

await stepDelay(8_000);

await post("/api/facilitator/failover", {
  targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
  preferNetwork: BASE,
  fastProbe: true,
});

await stepDelay();

await post("/api/router/route", {
  query: "ETH USD spot price oracle",
  maxPriceUsdc: 0.1,
  preferNetwork: BASE,
  skipProbes: true,
});

await stepDelay();

await post("/api/mpp/session-plan", {
  action: "estimate",
  expectedCalls: 50,
  avgPricePerCallUsdc: 0.03,
});

await stepDelay();

await post("/api/receipt-auditor/verify", {
  network: BASE,
  expectedAmountUsdc: 0.05,
  transactionHash:
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  settlement: {
    transaction:
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    amountUsdc: 0.05,
    network: BASE,
    payer: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  },
});

await stepDelay();

await post("/api/settlement-graph/next", {
  lastEndpointPath: "/api/spend-governor/check",
  lastTopic: "budget policy",
});

await stepDelay();

await post("/api/refund-arbiter/evaluate", {
  verificationScore: 82,
  endpointReachable: true,
});

await stepDelay();

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
    "https://x402trustlayer.xyz/health",
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

const escrowRes = await paidFetch(
  "/api/agent-escrow",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "create",
      payerAgentId: "agent-a",
      payeeAgentId: "agent-b",
      amountUsdc: 0.1,
      releaseCondition: "receipt-auditor valid:true",
    }),
  },
  "/api/agent-escrow create",
);
if (escrowRes) {
  console.log("--- /api/agent-escrow create ---", escrowRes.status, await escrowRes.text(), "\n");
}

console.log("Full pipeline demo complete.");
