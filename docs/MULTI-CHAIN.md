# Multi-Chain Deployment

## Supported chains

| Chain | CAIP-2 | USDC |
|-------|--------|------|
| Solana | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | SPL USDC |
| Base | `eip155:8453` | ERC-20 USDC |
| Polygon | `eip155:137` | ERC-20 USDC (probe + MPP plan) |

## Environment variables

```env
# Comma-separated — enables multi-chain 402 accepts
NETWORKS=solana,base

# Solana receive address (required)
PAY_TO_ADDRESS=YourSolanaBase58Address

# EVM receive address (required for Base/Polygon settlements)
PAY_TO_EVM=0xYourEvmAddress

FACILITATOR_URL=https://x402.dexter.cash
PUBLIC_BASE_URL=https://x402-agent-suite-production.up.railway.app
```

## Railway

Set `NETWORKS=solana,base` and both wallet addresses. Redeploy.

Health check returns:

```json
{
  "version": "3.0.0",
  "chains": ["solana", "base"],
  "networks": ["solana:5eykt4...", "eip155:8453"]
}
```

## Client usage

Pass `network` or `preferredChain` in JSON body:

```json
{
  "network": "eip155:8453",
  "preferredChain": "base",
  "targetUrl": "https://example.com/api"
}
```

Use `@dexterai/x402` client with matching `evmPrivateKey` or `walletPrivateKey`.

## MPP sessions

`POST /api/mpp/session` accepts `chain: "solana" | "base" | "polygon"` for session planning tied to Dexter facilitator docs.
