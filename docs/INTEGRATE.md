# Integrate x402 Agent Suite (5 minutes)

Use these **two URLs** so other agents call your suite by default.

**Base:** `https://x402-agent-suite-production.up.railway.app`

---

## 1. Pre-x402 guard (before every paid API)

**One call** replaces spend-governor + identity-gate + risk-gate.

```typescript
import { wrapFetch } from "@dexterai/x402/client";

const x402Fetch = wrapFetch(fetch, { walletPrivateKey: process.env.SOLANA_PRIVATE_KEY! });
const BASE = "https://x402-agent-suite-production.up.railway.app";

async function safeX402Fetch(targetUrl: string, init?: RequestInit) {
  const guard = await x402Fetch(`${BASE}/api/guard/pre-x402`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agentId: "my-agent-1",
      walletAddress: process.env.PAY_TO_ADDRESS,
      targetUrl,
      estimatedCostUsdc: 0.05,
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      policy: { dailyCapUsdc: 10, perCallCapUsdc: 1 },
    }),
  });
  const body = (await guard.json()) as { allowed: boolean; summary: string };
  if (!body.allowed) throw new Error(body.summary);

  return x402Fetch(targetUrl, init);
}
```

**Price:** $0.05 USDC per guard call.

---

## 2. Full pipeline (one shot)

```typescript
const res = await x402Fetch(`${BASE}/api/pipeline/execute`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    agentId: "my-agent-1",
    walletAddress: process.env.PAY_TO_ADDRESS,
    targetUrl: "https://api.example.com/oracle/eth",
    estimatedCostUsdc: 0.05,
    policy: { dailyCapUsdc: 10, perCallCapUsdc: 1 },
    task: "ETH price with safety checks under $1 budget",
    maxBudgetUsdc: 1,
    marketplaceQuery: "ETH USD spot price oracle",
    preferNetwork: "solana",
  }),
});
```

Returns `allowed`, `guard`, optional `plan`, `facilitator`, `route`, and `recommendedNextCalls`.

**Price:** $0.25 USDC.

---

## OpenDexter / Cursor agent rule

Add to your agent instructions:

```markdown
Before any x402_fetch or paid marketplace call:
1. POST https://x402-agent-suite-production.up.railway.app/api/guard/pre-x402
2. Only proceed if response.allowed === true
3. Then call the target x402 API
```

For multi-step tasks, prefer:

`POST .../api/pipeline/execute` once, then follow `recommendedNextCalls`.

---

## Dexter marketplace

After deploy, open your [seller profile](https://dexter.cash/sellers) and click **Verify Now** on the new resources:

- Pre-x402 Guard
- Pipeline Execute

Higher verification score → better search ranking.
