# @mimranakb/trust-layer-mcp

MCP server exposing 6 core [x402 Trust Layer](https://x402trustlayer.xyz) tools for AI agents.

## Tools

| Tool | Endpoint | Price |
|------|----------|-------|
| `trust_alchemy_preflight` | POST /api/guard/pre-x402 (Alchemy preset) | $0.05 |
| `trust_preflight_proxy` | POST /api/x402/proxy | $0.08 |
| `trust_guard_preflight` | POST /api/guard/pre-x402 | $0.05 |
| `trust_merchant_score` | POST /api/merchant-trust/score | $0.06 |
| `trust_mandate_verify` | POST /api/mandate/verify | $0.02 |
| `trust_receipt_verify` | POST /api/receipt-auditor/verify | $0.05 |

## Alchemy x402 flow

1. `trust_alchemy_preflight` — before any `x402.alchemy.com` call
2. Call Alchemy via `@alchemy/x402` (SIWE + payment)
3. `trust_receipt_verify` — after `PAYMENT-RESPONSE` header

See [docs/ALCHEMY-LIVE.md](../../docs/ALCHEMY-LIVE.md).

## Setup

```bash
export EVM_PRIVATE_KEY=0x...   # or SOLANA_PRIVATE_KEY
export TRUST_LAYER_BASE=https://x402trustlayer.xyz  # optional
```

### Claude Code / Cursor

```json
{
  "mcpServers": {
    "trust-layer": {
      "command": "npx",
      "args": ["-y", "@mimranakb/trust-layer-mcp"]
    }
  }
}
```

### With Coinbase Agentic Wallet

Use **both** `@coinbase/payments-mcp` and `@x402trustlayer/mcp`. Always call `trust_guard_preflight` before Agentic Wallet pays downstream.

See [docs/AGENTIC-WALLET.md](../../docs/AGENTIC-WALLET.md).

## Local dev

```bash
cd packages/trust-layer-mcp && npm install && npm run build
node dist/index.js
```
