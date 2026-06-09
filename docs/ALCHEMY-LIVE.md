# Alchemy x402 — Live Demo

End-to-end: **Trust Layer guard → Alchemy SIWE + x402 payment → receipt verify → (optional) compliance ledger**.

## Known limitation

Node.js `fetch()` rejects some x402 header names (`Payment-Signature`). This repo uses raw `node:https` with **`PAYMENT-SIGNATURE`** (uppercase). Credit purchase settles even when RPC body returns HTTP 400 without SIWE auth — receipt verify still works via `payment-response` header.

## Quick start

```bash
# 1. Install (includes @alchemy/x402)
npm install

# 2. Copy .env and set payer wallet (NOT your PAY_TO_EVM receive wallet)
#    EVM_PRIVATE_KEY=0x...
#    Wallet needs ~$3 USDC on Base

# 3. Pre-flight (free — no USDC spent)
npm run alchemy:doctor

# 4. Live demo (~$1.10 USDC from your wallet)
npm run demo:alchemy

# 5. Enterprise demo with mandate + ledger (~$1.32 USDC)
npm run demo:alchemy:enterprise
```

## What each step does

| Step | Who gets paid | ~Cost |
|------|---------------|-------|
| Guard preflight | x402trustlayer.xyz (you) | $0.05 |
| Alchemy `eth_blockNumber` | x402.alchemy.com | ~$1.00 credit |
| Receipt verify | x402trustlayer.xyz (you) | $0.05 |
| Mandate compile (enterprise) | x402trustlayer.xyz | $0.08 |
| Mandate verify (enterprise) | x402trustlayer.xyz | $0.02 |
| Compliance ledger (enterprise) | x402trustlayer.xyz | $0.12 |

## MCP (Cursor / Claude)

```json
{
  "mcpServers": {
    "trust-layer": {
      "command": "npx",
      "args": ["-y", "@mimranakb/trust-layer-mcp"],
      "env": { "EVM_PRIVATE_KEY": "0x..." }
    }
  }
}
```

Before any `x402.alchemy.com` call, use tool **`trust_alchemy_preflight`**.

Install Alchemy skill separately:

```bash
npx skills add alchemyplatform/skills --yes
```

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `EVM_PRIVATE_KEY` | Yes | Base payer wallet with USDC |
| `TRUST_LAYER_BASE` | No | Default `https://x402trustlayer.xyz` |
| `ALCHEMY_DEMO_ENTERPRISE` | No | Set `1` or use `--enterprise` flag |
| `ALCHEMY_DEMO_CREDIT_USDC` | No | Default `1` (Alchemy credit estimate) |

## Security audit (2026-06-01)

See [SECURITY-AUDIT.md](./SECURITY-AUDIT.md) for findings and fixes applied in this release.

## Links

- [Alchemy Agentic Gateway](https://www.alchemy.com/docs/alchemy-for-agents.md)
- [Trust Layer OpenAPI](https://x402trustlayer.xyz/openapi.json)
