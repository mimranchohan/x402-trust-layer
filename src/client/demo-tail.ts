/**
 * Re-run only the orchestration routes that often fail after a long `npm run demo` burst.
 * Usage: npm run demo:tail
 */
import dotenv from "dotenv";
import { CHAIN_IDS } from "../lib/chains.js";
import {
  assertDemoPayerNotReceiveWallet,
  assertPayerKeys,
  buildWrapFetchOptions,
  buildX402Fetch,
} from "../lib/x402-client-options.js";

dotenv.config();

const BASE = CHAIN_IDS.base;
const base = process.env.PUBLIC_BASE_URL ?? "https://x402trustlayer.xyz";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

assertPayerKeys();
await assertDemoPayerNotReceiveWallet();

const x402Fetch = await buildX402Fetch(fetch, buildWrapFetchOptions({ verbose: process.env.X402_VERBOSE === "1" }));
console.log(`Demo tail target: ${base}\nPreferred network: ${CHAIN_IDS.base}\n`);

const PAYMENT_RETRY_MATCH =
  /settlement failed|payment was rejected|insufficient balance|verification failed|facilitator/i;

async function post(path: string, body: unknown): Promise<boolean> {
  const maxAttempts = Number(process.env.DEMO_PAYMENT_MAX_ATTEMPTS ?? 3);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await x402Fetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      console.log(`--- ${path} (${res.status}) ---`);
      console.log(text.slice(0, 900) + (text.length > 900 ? "..." : ""));
      console.log();
      return res.ok;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (PAYMENT_RETRY_MATCH.test(msg) && attempt < maxAttempts) {
        const wait = Number(process.env.DEMO_PAYMENT_RETRY_MS ?? 6_000) * attempt;
        console.warn(`retry ${attempt}/${maxAttempts - 1} in ${wait}ms:`, msg);
        await sleep(wait);
        continue;
      }
      console.error(`FAILED ${path}:`, msg, "\n");
      return false;
    }
  }
  return false;
}

const stepDelay = () => sleep(Number(process.env.DEMO_STEP_DELAY_MS ?? 4_000));

let ok = 0;
const routes: Array<[string, unknown]> = [
  [
    "/api/facilitator/failover",
    {
      targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
      preferNetwork: BASE,
      fastProbe: true,
    },
  ],
  [
    "/api/router/route",
    {
      query: "ETH USD spot price oracle",
      maxPriceUsdc: 0.1,
      preferNetwork: BASE,
      skipProbes: true,
    },
  ],
  ["/api/mpp/session-plan", { action: "estimate", expectedCalls: 50, avgPricePerCallUsdc: 0.03 }],
  [
    "/api/receipt-auditor/verify",
    {
      network: BASE,
      expectedAmountUsdc: 0.05,
      transactionHash:
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      settlement: {
        transaction:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        amountUsdc: 0.05,
        network: BASE,
      },
    },
  ],
  ["/api/settlement-graph/next", { lastEndpointPath: "/api/spend-governor/check", lastTopic: "budget policy" }],
  ["/api/refund-arbiter/evaluate", { verificationScore: 82, endpointReachable: true }],
  [
    "/api/budget-allocator/run",
    {
      fleetId: "fleet-alpha",
      poolRemainingUsdc: 2,
      agents: [
        { agentId: "a1", priority: 10, requestedUsdc: 0.5, dailyRemainingUsdc: 5 },
        { agentId: "a2", priority: 5, requestedUsdc: 1, dailyRemainingUsdc: 3 },
      ],
    },
  ],
];

for (const [path, body] of routes) {
  if (await post(path, body)) ok++;
  await stepDelay();
}

console.log(`Tail demo: ${ok}/${routes.length} paid OK`);
process.exit(ok === routes.length ? 0 : 1);
