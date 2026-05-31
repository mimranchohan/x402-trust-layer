# x402 Trust Layer Skill

## Product Summary

x402 Trust Layer is the **control plane** between AI agents and the open x402 marketplace. 31 paid HTTP APIs decide whether to pay, whom to trust, which rail to use, and how to audit or dispute settlements. No API keys — USDC micropayments on Base, Solana, and Polygon.

- **Base URL:** https://x402trustlayer.xyz
- **OpenAPI:** https://x402trustlayer.xyz/openapi.json
- **Discovery:** https://x402trustlayer.xyz/.well-known/x402
- **Install skill:** `npx skills add https://x402trustlayer.xyz`

## When to Use

- Before any external `x402_fetch` to an unknown marketplace host
- Fleet spend policy enforcement (daily/per-call caps)
- Know-Your-Merchant trust scoring before payment
- AP2-style signed payment mandates for enterprise agents
- Receipt verification and SOC2/CFO compliance ledgers
- Disputes, quality escrow, cross-rail routing (Visa CLI, MPP, USDC)
- With **Coinbase Agentic Wallet MCP** — always preflight first

## Quick Reference

### Default 3-step buyer flow

```text
1. POST /api/x402/proxy          ($0.08) — preflight
2. x402_check → x402_fetch       (external API)
3. POST /api/receipt-auditor/verify ($0.05) — proof
```

### Primary entry points

| Path | Price | Use when |
|------|-------|----------|
| POST /api/x402/proxy | $0.08 | Default all-in-one preflight |
| POST /api/guard/pre-x402 | $0.05 | Lightweight allow/deny |
| POST /api/pipeline/execute | $0.25 | NL task + marketplace routing |

### Tier-1 enterprise

| Path | Price | Purpose |
|------|-------|----------|
| POST /api/merchant-trust/score | $0.06 | KYM trust — pay/caution/avoid |
| POST /api/mandate/compile | $0.08 | Signed AP2 payment mandate |
| POST /api/mandate/verify | $0.02 | Verify payment within mandate |
| POST /api/rail-optimizer/route | $0.04 | Visa CLI vs MPP vs Base/Solana |
| POST /api/compliance/ledger | $0.12 | CFO/SOC2 reconciliation |
| POST /api/dispute/resolve | $0.10 | Chargeback dossier / refund claim |
| POST /api/quality-escrow/settle | $0.10 | Pay-on-delivery + auto-refund |

## Workflow: safe autonomous purchase

1. `POST /api/mandate/compile` — human intent → signed scope
2. `POST /api/merchant-trust/score` — KYM on target host
3. `POST /api/rail-optimizer/route` — pick best payment rail
4. `POST /api/x402/proxy` — preflight (spend + identity + risk)
5. External `x402_fetch` on marketplace URL
6. `POST /api/quality-escrow/settle` — verify response quality
7. `POST /api/receipt-auditor/verify` — on-chain proof
8. `POST /api/compliance/ledger` — audit record

## Agentic Wallet MCP integration

Coinbase `npx @coinbase/payments-mcp` gives agents wallet + x402 pay. **Always call Trust Layer first:**

```text
User task → POST /api/guard/pre-x402 (Trust Layer)
         → if allowed: Agentic Wallet MCP discovers + pays external API
         → POST /api/receipt-auditor/verify (Trust Layer)
```

Spend limits: configure in Agentic Wallet UI; enforce policy in Trust Layer `policy` object.

## MCP tools (@x402trustlayer/mcp)

| Tool | Maps to |
|------|---------|
| trust_preflight_proxy | POST /api/x402/proxy |
| trust_guard_preflight | POST /api/guard/pre-x402 |
| trust_merchant_score | POST /api/merchant-trust/score |
| trust_mandate_verify | POST /api/mandate/verify |
| trust_receipt_verify | POST /api/receipt-auditor/verify |

Setup: `EVM_PRIVATE_KEY` or `SOLANA_PRIVATE_KEY` in env. Run: `npx @x402trustlayer/mcp`

## npm helper

```bash
npm install x402-agent-suite-preflight @dexterai/x402
```

## Idempotency

Paid POST retries: send `Idempotency-Key: <uuid>` with the same body after payment.

## Webhooks (beta)

`POST /api/webhooks/register` with fleetId, url, events[].

## Common Gotchas

- Unpaid POST → HTTP 402. Retry with Payment-Signature after USDC settles.
- Testnet: `X402_TESTNET=1` + x402.org facilitator.
- Production requires `ATTESTATION_HMAC_SECRET` (32+ chars).

## Resources

- Full catalog: https://x402trustlayer.xyz/llms-full.txt
- Integration: docs/INTEGRATE.md on GitHub
- Agentic Wallet: docs/AGENTIC-WALLET.md on GitHub
