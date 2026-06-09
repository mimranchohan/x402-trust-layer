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

## Default buyer flow (v4 — full trust protocol)

```text
1. POST /api/protocol/pipeline/full-trust ($0.45) — passport, trust v2, fraud, oracle, credit, guard, replay bind
2. x402_check → x402_fetch with header X-Trust-Replay-Binding from step 1
3. POST /api/protocol/execution/issue — Proof of Execution receipt
4. POST /api/quality-escrow/semantic-settle — delivery verify / auto-refund
5. POST /api/receipt-auditor/verify — settlement proof
```

Legacy v2 bundle: `POST /api/pipeline/trust-v2` ($0.35) still available.

## Protocol v4 entry points

| Path | Price | Purpose |
|------|-------|---------|
| `POST /api/protocol/pipeline/full-trust` | $0.45 | **Best** — full protocol before pay |
| `POST /api/protocol/trust-score/v2` | $0.08 | Tamper-resistant trust + HMAC proof |
| `POST /api/protocol/fraud/scan` | $0.10 | Sybil / wash / circular payment graph |
| `POST /api/protocol/execution/issue` | $0.05 | Proof of Execution receipt |
| `POST /api/protocol/credit/score` | $0.06 | Credit bureau 300–900 |

**Free:** `GET /api/protocol/architecture`, `threat-model`, `security/audit`

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
2. `x402_fetch` — or MCP `trust_protocol_full_pipeline` then pay with replay header
3. After external pay: `trust_protocol_execution_receipt` + `trust_semantic_settle` + `trust_receipt_verify`

## Payment protocol

- Unpaid request → **HTTP 402** + payment requirements
- Retry with **Payment-Signature** (x402 v2) after USDC settles

## Do not

- Register `/health` as a paid x402 resource
- Skip preflight on high-value or unknown hosts

## More docs

- `docs/TRUST-LAYER-V2-THREE-PILLARS.md`, `docs/AGENT-CATALOG.md`
