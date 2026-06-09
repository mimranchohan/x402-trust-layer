---
name: x402-trust-layer
description: >-
  Call x402 Trust Layer paid APIs (guard, proxy, KYM merchant trust, AP2 mandates,
  compliance, disputes) before or after external x402 payments. Use when the user
  wants agent payment preflight, trust scoring, spend policy, receipt audit,
  enterprise mandates, or mentions x402trustlayer.xyz, Trust Layer, or safe x402 pay.
---

# x402 Trust Layer

Paid x402 trust infrastructure for AI agents. **No API keys** — pay per call in USDC on Base + Solana via Dexter facilitator.

- **Base URL:** `https://x402trustlayer.xyz`
- **OpenAPI:** `https://x402trustlayer.xyz/openapi.json`
- **Discovery:** `https://x402trustlayer.xyz/.well-known/x402`
- **Validate URLs list:** `GET https://x402trustlayer.xyz/api/agentic/validate-urls`

## When to use this skill

- Before any external `x402_fetch` to an unknown marketplace host
- When user asks: guard, preflight, trust score, mandate, compliance, dispute, escrow
- Enterprise flows: AP2 intent, Visa chargeback, SOC2 ledger

## Default buyer flow (3 steps)

```text
1. POST /api/x402/proxy  (or /api/guard/pre-x402) — preflight
2. x402_check → x402_fetch on external URL
3. POST /api/receipt-auditor/verify — settlement proof
```

## Primary entry points

| Path | Price | Use when |
|------|-------|----------|
| `POST /api/x402/proxy` | $0.08 | Default — guard + probe + optional attestation |
| `POST /api/guard/pre-x402` | $0.05 | Lightweight allow/deny only |
| `POST /api/pipeline/execute` | $0.25 | NL task + marketplace routing in one call |

## Tier-1 enterprise (finance / risk)

| Path | Price | Purpose |
|------|-------|---------|
| `POST /api/merchant-trust/score` | $0.06 | KYM — pay / caution / avoid |
| `POST /api/mandate/compile` | $0.08 | Signed AP2-style payment mandate |
| `POST /api/mandate/verify` | $0.02 | Check payment within mandate scope |
| `POST /api/rail-optimizer/route` | $0.04 | Visa CLI vs MPP vs Base/Solana x402 |
| `POST /api/compliance/ledger` | $0.12 | CFO/SOC2 reconciliation + ledgerHash |
| `POST /api/dispute/resolve` | $0.10 | Chargeback dossier or refund claim |
| `POST /api/quality-escrow/settle` | $0.10 | Pay-on-delivery verify + auto-refund |

## How to call (OpenDexter MCP)

If OpenDexter MCP is available:

1. `x402_search` — query: `"x402 trust guard pre-x402"` or specific endpoint intent
2. `x402_check` — confirm price on chosen URL
3. `x402_fetch` — pays USDC and returns JSON

Direct URL pattern: `https://x402trustlayer.xyz/api/guard/pre-x402`

## Example: preflight before external pay

```json
POST /api/guard/pre-x402
{
  "agentId": "my-agent-1",
  "walletAddress": "<payer-wallet>",
  "targetUrl": "https://api.example.com/paid-endpoint",
  "estimatedCostUsdc": 0.05,
  "policy": {
    "dailyCapUsdc": 50,
    "perCallCapUsdc": 1,
    "allowedHosts": ["api.example.com"]
  }
}
```

Expect: `allowed`, `securityGrade`, `confidence`, `checks_passed`. If `allowed` is false, do not pay downstream.

## Example: merchant trust (KYM)

```json
POST /api/merchant-trust/score
{
  "host": "api.example.com",
  "washTradePct": 17,
  "verifiedResources": 44,
  "totalResources": 200,
  "p50LatencyMs": 1200
}
```

Expect: `trustScore`, `grade`, `recommendation` (`pay` | `caution` | `avoid`).

## Payment protocol

- Unpaid request → **HTTP 402** + payment requirements
- Retry with **Payment-Signature** (x402 v2) after USDC settles
- GET probes on POST paths also return 402 when unpaid (Agentic/x402gle compatible)

## Seller / listing helpers

| Path | Price | Purpose |
|------|-------|---------|
| `POST /api/seller/audition-coach` | $0.06 | Fix OpenAPI/402 before x402gle ingest |
| `POST /api/market/buy-advisor` | $0.08 | Rank marketplace APIs before spend |

## Do not

- Register `/health` as a paid x402 resource
- Skip preflight on high-value or unknown hosts
- Assume 200 without payment on `/api/*` routes

## More docs

- Repo: `docs/INTEGRATE.md`, `docs/AGENT-CATALOG.md`
- x402gle skills (after audition): `https://x402gle.com/servers/x402trustlayer.xyz/SKILL.md`
