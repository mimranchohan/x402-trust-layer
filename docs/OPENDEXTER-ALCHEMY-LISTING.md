# OpenDexter / Marketplace — Alchemy Guard Bundle

Paste these when listing or sharing the Alchemy + Trust Layer stack.

## Search queries (OpenDexter `x402_search`)

- `x402 trust guard preflight before payment`
- `agent payment guard alchemy`
- `receipt auditor x402 settlement verify`

## Primary URLs to register / promote

| URL | Price | Pitch |
|-----|-------|-------|
| https://x402trustlayer.xyz/api/guard/pre-x402 | $0.05 | Preflight before any x402 pay (incl. Alchemy) |
| https://x402trustlayer.xyz/api/receipt-auditor/verify | $0.05 | On-chain receipt proof after pay |
| https://x402trustlayer.xyz/api/mandate/compile | $0.08 | Enterprise signed spend intent |
| https://x402trustlayer.xyz/api/compliance/ledger | $0.12 | CFO/SOC2 audit export |

## One-line listing

**Alchemy x402 Agent Guard** — Preflight (`/api/guard/pre-x402`) + receipt audit (`/api/receipt-auditor/verify`) for agents paying `x402.alchemy.com`. MCP: `npx @mimranakb/trust-layer-mcp@1.1.0` tool `trust_alchemy_preflight`. Live demo: `npm run demo:alchemy`.

## Buyer flow (3 steps)

```text
1. POST https://x402trustlayer.xyz/api/guard/pre-x402
   targetUrl: https://x402.alchemy.com/base-mainnet/v2
   allowedHosts: ["x402.alchemy.com"]

2. Pay Alchemy via @alchemy/x402 (USDC on Base)

3. POST https://x402trustlayer.xyz/api/receipt-auditor/verify
   transactionHash from PAYMENT-RESPONSE header
```

## Proof links (update after each demo run)

- Product: https://x402trustlayer.xyz
- OpenAPI: https://x402trustlayer.xyz/openapi.json
- npm MCP: https://www.npmjs.com/package/@mimranakb/trust-layer-mcp
- Demo docs: https://github.com/mimranchohan/x402-agent-suite/blob/main/docs/ALCHEMY-LIVE.md

## npm install (agents)

```bash
npx @mimranakb/trust-layer-mcp@1.1.0
npx skills add alchemyplatform/skills --yes
```
