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

## Default buyer flow (v2 — certified + semantic)

```text
1. POST /api/mandate/compile → POST /api/mandate/diff (tool trace vs mandate)
2. POST /api/pipeline/trust-v2 ($0.35) OR proxy + buyer-gate separately
3. x402_check → x402_fetch on external URL
4. POST /api/quality-escrow/semantic-settle — delivery verify / auto-refund
5. POST /api/receipt-auditor/verify — settlement proof
```

## Primary entry points

| Path | Price | Use when |
|------|-------|----------|
| `POST /api/pipeline/trust-v2` | $0.35 | **Best** — mandate diff + KYM + guard + buyer gate |
| `POST /api/x402/proxy` | $0.08 | Guard + probe + optional attestation |
| `POST /api/guard/pre-x402` | $0.05 | Lightweight allow/deny only |
| `POST /api/pipeline/execute` | $0.25 | NL task + marketplace routing |

## Tier-1 enterprise (finance / risk)

| Path | Price | Purpose |
|------|-------|---------|
| `POST /api/merchant-trust/score` | $0.06 | KYM — auto x402watch ingest |
| `POST /api/mandate/compile` | $0.08 | Signed AP2-style payment mandate |
| `POST /api/mandate/verify` | $0.02 | Check payment within mandate scope |
| `POST /api/mandate/diff` | $0.04 | Mandate vs MCP tool trace (pre-pay) |
| `POST /api/quality-escrow/semantic-settle` | $0.12 | Intent rubric + schema escrow |
| `POST /api/merchant-trust/certify` | $0.15 | Seller certification + buyer policy |
| `POST /api/trust-network/buyer-gate` | $0.03 | Buyer check for certified sellers |
| `POST /api/trust-network/bond/slash` | $0.03 | Slash seller virtual bond |

**Free:** `GET /api/merchant-trust/certified/:host`, `GET /api/trust-network/catalog`

## OpenDexter MCP workflow

1. `x402_check` on Trust Layer endpoint URL
2. `x402_fetch` — or use **trust-layer-mcp** tool `trust_before_x402_fetch`
3. After external pay: `trust_semantic_settle` + `trust_receipt_verify`

## Payment protocol

- Unpaid request → **HTTP 402** + payment requirements
- Retry with **Payment-Signature** (x402 v2) after USDC settles

## Do not

- Register `/health` as a paid x402 resource
- Skip preflight on high-value or unknown hosts

## More docs

- `docs/TRUST-LAYER-V2-THREE-PILLARS.md`, `docs/AGENT-CATALOG.md`
