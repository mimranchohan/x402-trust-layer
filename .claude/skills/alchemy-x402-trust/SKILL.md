---
name: alchemy-x402-trust
description: >-
  Live Alchemy Agentic Gateway (x402.alchemy.com) with x402 Trust Layer guard and
  receipt audit. Use before any Alchemy x402 API call from an AI agent.
---

# Alchemy x402 + Trust Layer

## When to use

- User calls `x402.alchemy.com` or Alchemy Agentic Gateway
- User installed `npx skills add alchemyplatform/skills`
- User wants safe agent payments for Alchemy Node/Data APIs

## Required env

- `EVM_PRIVATE_KEY` — Base wallet with USDC (NOT seller receive wallet)
- Optional: `@mimranakb/trust-layer-mcp` in MCP config

## Flow (always)

```text
1. trust_alchemy_preflight (or POST /api/guard/pre-x402 with allowedHosts: ["x402.alchemy.com"])
2. @alchemy/x402 — signSiwe + wrapFetchWithPayment → Alchemy call
3. trust_receipt_verify from PAYMENT-RESPONSE header tx hash
4. (enterprise) POST /api/compliance/ledger
```

## Live demo in repo

```bash
npm run alchemy:doctor    # free checks
npm run demo:alchemy      # ~$1.10 USDC
npm run demo:alchemy:enterprise  # ~$1.32 USDC
```

Docs: `docs/ALCHEMY-LIVE.md`

## Do not

- Skip guard because Alchemy is "trusted infrastructure"
- Use PAY_TO_EVM wallet as payer
- Commit EVM_PRIVATE_KEY
