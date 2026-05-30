# Testing the suite end-to-end

This is the practical guide for exercising every endpoint in the suite against the
live deployment. There are three ways to do it, from "no wallet, no spend" to
"real USDC, full settlement". Pick the one that matches what you're trying to prove.

- **Unpaid probe** — confirm every route is alive and correctly returns `402`. No wallet, no cost.
- **Paid call (one endpoint)** — pay a single endpoint and read the real response.
- **Full paid pass** — walk all 31 endpoints with real settlement (what we run before a release).

Base URL used throughout:

```
BASE=https://x402-agent-suite-production.up.railway.app
```

Every paid route costs $0.02–$0.25 in USDC and settles on Base or Solana via the
Dexter facilitator. Sub-dollar by design, but it *is* real money — keep a per-call cap on.

---

## 1. Unpaid probe (free, no wallet)

The fastest sanity check. A healthy paid route answers an unpaid request with `402 Payment Required`.

```bash
# Whole-suite discovery + unpaid 402 sweep (built into the repo)
npm run probe:production

# Or hit discovery surfaces directly
curl -s $BASE/health | jq             # endpointCount should be 31
curl -s $BASE/api/agents | jq         # every route + price + tier
curl -s $BASE/openapi.json | jq '.paths | keys'
curl -s $BASE/.well-known/x402 | jq   # 31 payable resource URLs

# Probe a single route unpaid — expect HTTP 402
curl -i -X POST $BASE/api/merchant-trust/score
```

This proves the paywall, discovery, and routing are correct without spending anything.

---

## 2. Paid call against one endpoint

You need a wallet that can sign x402 (gasless USDC). Two common clients:

### Option A — OpenDexter MCP (what we use from Cursor)

Once the OpenDexter wallet is funded with a little USDC, call any endpoint with the
`x402_fetch` tool. It reads the `402` challenge, pays, and returns the response:

```jsonc
// x402_fetch arguments
{
  "url": "https://x402-agent-suite-production.up.railway.app/api/merchant-trust/score",
  "method": "POST",
  "body": "{\"host\":\"orbisapi.com\",\"washTradePct\":17,\"verifiedResources\":1225,\"totalResources\":34539}",
  "maxAmountUsdc": 0.10            // per-call safety cap
}
```

> The OpenDexter `x402_fetch` tool does not expose a chain selector — it defaults to
> Base. To settle on Solana instead, advertise Solana first in the suite's payment
> options (set `NETWORKS=solana,base`) and redeploy, or fund the wallet on Solana only.

### Option B — a standalone x402 CLI / SDK

Any x402 client works (e.g. `@dexterai/x402` `wrapFetch`, or a community CLI). The flow is always:

```bash
# 1. preview cost + schema (no payment)
x402 check  $BASE/api/rail-optimizer/route

# 2. pay + fetch
x402 fetch  $BASE/api/rail-optimizer/route \
  --method POST \
  --body '{"amountUsdc":2.0,"disputable":true}' \
  --max-amount 0.10
```

---

## 3. Full paid pass — all 31 endpoints

The recommended order, with ready-to-send request bodies. Stateful endpoints
(mandate, attestation, MPP session, escrow) return an id you feed into the next call.

### Tier-1 enterprise agents

| # | Endpoint | Method | Example body |
|---|----------|--------|--------------|
| 1 | `/api/merchant-trust/score` | POST | `{"host":"orbisapi.com","washTradePct":17,"verifiedResources":1225,"totalResources":34539,"observedTxns":7006,"observedVolumeUsdc":37.91,"p50LatencyMs":2475}` |
| 2 | `/api/mandate/compile` | POST | `{"principal":"cardholder:acme","agentId":"buyer-1","intent":"Buy ETH/USD oracle data under $0.50/call","maxPerTxUsdc":0.5,"dailyCapUsdc":10,"allowedMerchants":["myceliasignal.com"],"allowedRails":["base-x402","visa-cli"]}` |
| 3 | `/api/mandate/verify` | POST | `{"mandateId":"<from #2>","proposed":{"amountUsdc":0.3,"merchant":"myceliasignal.com","rail":"base-x402"}}` |
| 4 | `/api/rail-optimizer/route` | POST | `{"amountUsdc":2.0,"disputable":true,"expectedCalls":1}` |
| 5 | `/api/compliance/ledger` | POST | `{"organizationId":"acme","period":"2026-05","records":[{"merchant":"api.nansen.ai","amountUsdc":0.02,"rail":"base-x402","category":"analytics","transactionHash":"0xabc"},{"merchant":"api.example.com","amountUsdc":5,"rail":"visa-cli","category":"data"}],"policy":{"monthlyCapUsdc":1000,"perMerchantCapUsdc":3,"requireTxHash":true}}` |
| 6 | `/api/dispute/resolve` | POST | `{"rail":"visa-cli","merchant":"api.example.com","amountUsdc":1.0,"reason":"non_delivery","evidence":{"actualResponseEmpty":true,"receiptValid":false}}` |
| 7 | `/api/quality-escrow/settle` | POST | `{"action":"settle","amountUsdc":0.05,"payeeMerchant":"api.example.com","releaseThreshold":70,"expectedProfile":{"requiredKeys":["price","symbol"],"forbidEmpty":true},"actualResponse":{"bodyKeys":["price","symbol","ts"],"byteLength":64}}` |

### Entry points & orchestration

| # | Endpoint | Method | Example body |
|---|----------|--------|--------------|
| 8 | `/api/x402/proxy` | POST | `{"agentId":"buyer-1","walletAddress":"0xYourWallet","targetUrl":"https://api.myceliasignal.com/oracle/price/eth/usd","estimatedCostUsdc":0.05,"policy":{"dailyCapUsdc":10,"perCallCapUsdc":0.5},"issueAttestation":true}` |
| 9 | `/api/guard/pre-x402` | POST | `{"agentId":"buyer-1","walletAddress":"0xYourWallet","targetUrl":"https://api.myceliasignal.com/oracle/price/eth/usd","estimatedCostUsdc":0.05,"network":"eip155:8453","policy":{"dailyCapUsdc":10,"perCallCapUsdc":0.5,"allowedHosts":["myceliasignal.com"]}}` |
| 10 | `/api/pipeline/execute` | POST | `{"agentId":"buyer-1","walletAddress":"0xYourWallet","targetUrl":"https://api.myceliasignal.com/oracle/price/eth/usd","estimatedCostUsdc":0.05,"network":"eip155:8453","policy":{"dailyCapUsdc":10,"perCallCapUsdc":0.5,"allowedHosts":["myceliasignal.com"]},"task":"ETH oracle with guard and routing","maxBudgetUsdc":1,"marketplaceQuery":"ETH USD spot price oracle","preferNetwork":"base"}` |
| 11 | `/api/payment-intent/compile` | POST | `{"task":"Buy ETH oracle data under one dollar with guard and receipt audit","maxBudgetUsdc":1,"agentId":"buyer-1","externalCallEstimateUsdc":0.05}` |
| 12 | `/api/facilitator/failover` | POST | `{"targetUrl":"https://api.myceliasignal.com/oracle/price/eth/usd","preferNetwork":"base"}` |
| 13 | `/api/mpp/session-plan` | POST | `{"action":"estimate","expectedCalls":25,"avgPricePerCallUsdc":0.03,"network":"base"}` |

### Core gates

| # | Endpoint | Method | Example body |
|---|----------|--------|--------------|
| 14 | `/api/spend-governor/check` | POST | `{"agentId":"buyer-1","estimatedCostUsdc":0.03,"targetUrl":"https://api.myceliasignal.com/oracle/price/eth/usd","network":"eip155:8453","policy":{"dailyCapUsdc":10,"perCallCapUsdc":0.5,"allowedHosts":["myceliasignal.com"]}}` |
| 15 | `/api/identity-gate/check` | POST | `{"walletAddress":"0xYourWallet","maxTierSpendUsdc":10,"requireMainnet":true}` |
| 16 | `/api/risk-gate/scan` | POST | `{"targetUrl":"https://api.myceliasignal.com/oracle/price/eth/usd","estimatedCostUsdc":0.05,"policy":{"perCallCapUsdc":0.5}}` |
| 17 | `/api/router/route` | POST | `{"query":"ETH USD spot price oracle","preferNetwork":"base","maxPriceUsdc":0.1}` |
| 18 | `/api/research/brief` | POST | `{"topic":"Ethereum network fees today","includePrice":true}` |
| 19 | `/api/receipt-auditor/verify` | POST | `{"network":"eip155:8453","expectedAmountUsdc":0.05,"transactionHash":"0x<settled tx>","settlement":{"transaction":"0x<settled tx>","amountUsdc":0.05,"network":"eip155:8453","payer":"0xYourWallet"}}` |

### MPP, attestation, trust, intelligence, enterprise

| # | Endpoint | Method | Example body |
|---|----------|--------|--------------|
| 20 | `/api/mpp/session` (open) | POST | `{"action":"open","expectedCalls":25,"avgPricePerCallUsdc":0.03,"chain":"base","agentId":"buyer-1","maxBudgetUsdc":1}` |
| 21 | `/api/mpp/session` (close) | POST | `{"action":"close","sessionId":"<from #20>","chain":"base"}` |
| 22 | `/api/attestation/issue` | POST | `{"agentId":"buyer-1","walletAddress":"0xYourWallet","targetUrl":"https://api.myceliasignal.com/oracle/price/eth/usd","estimatedCostUsdc":0.03,"policy":{"dailyCapUsdc":10,"perCallCapUsdc":0.5}}` |
| 23 | `/api/attestation/verify` | POST | `{"attestationId":"<from #22>"}` |
| 24 | `/api/attestation/registry` | GET | query: `?minGrade=C&limit=5` |
| 25 | `/api/refund-arbiter/evaluate` | POST | `{"verificationScore":25,"responseEmpty":true,"responseGeneric":false,"endpointReachable":true}` |
| 26 | `/api/settlement-graph/next` | POST | `{"lastEndpointPath":"/api/merchant-trust/score","lastTopic":"merchant trust","maxRecommendations":3}` |
| 27 | `/api/quality-monitor/probe` | POST | `{"urls":["https://api.myceliasignal.com/oracle/price/eth/usd","https://x402-agent-suite-production.up.railway.app/api/health"]}` |
| 28 | `/api/budget-allocator/run` | POST | `{"fleetId":"acme","poolRemainingUsdc":5,"agents":[{"agentId":"a1","priority":10,"requestedUsdc":2,"dailyRemainingUsdc":5},{"agentId":"a2","priority":5,"requestedUsdc":3,"dailyRemainingUsdc":5}]}` |
| 29 | `/api/evidence-locker/export` | POST | `{"organizationId":"acme","records":[{"endpoint":"/api/merchant-trust/score","amountUsdc":0.06,"network":"eip155:8453","transactionHash":"0x<tx>","timestamp":"2026-05-30T11:10:00.000Z"}]}` |
| 30 | `/api/agent-escrow` (create) | POST | `{"action":"create","payerAgentId":"buyer-1","payeeAgentId":"merchant-1","amountUsdc":0.05,"releaseCondition":"receipt-auditor valid:true"}` |
| 31 | `/api/agent-escrow` (release) | POST | `{"action":"release","escrowId":"<from #30>"}` |

### Killer seller/buyer tools

| Endpoint | Method | Example body |
|----------|--------|--------------|
| `/api/market/buy-advisor` | POST | `{"intent":"ETH USD spot price oracle for trading bot","agentId":"buyer-1","walletAddress":"0xYourWallet","preferNetwork":"base","maxPriceUsdc":0.15,"expectedCalls":12,"dryRunTarget":true}` |
| `/api/seller/audition-coach` | POST | `{"origin":"https://x402-agent-suite-production.up.railway.app","maxRoutes":10}` |

---

## What a healthy result looks like

Every paid call returns HTTP `200`, the agent's JSON payload, and a settlement block:

```jsonc
{
  "data": { /* agent output + trust envelope: confidence, checks_passed, sources */ },
  "payment": {
    "settled": true,
    "details": {
      "amountPaid": "60000",            // atomic USDC (6 decimals) → $0.06
      "network": "eip155:8453",         // Base
      "transaction": "0x…",             // verify on basescan.org
      "success": true
    }
  }
}
```

If you get `402` back from a paid client, the wallet has no funds on the chosen
chain. If you get `400`, the request body failed schema validation — check the
example bodies above.

---

## Budget for a full pass

A complete one-pass run of all 31 endpoints costs roughly **$2.30 USDC** on Base.
Stateful endpoints (MPP, escrow, mandate, attestation) add a few extra calls because
each action is billed separately. Keep ~$3 on the wallet to run a full pass comfortably.
