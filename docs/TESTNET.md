# Testnet development

Develop against x402 Trust Layer on **Base Sepolia** and **Solana Devnet** without mainnet USDC.

## Quick start (local)

```env
X402_TESTNET=1
NETWORKS=base-sepolia,solana-devnet
FACILITATOR_URL=https://x402.org/facilitator
PAY_TO_ADDRESS=YourSolanaDevnetAddress
PAY_TO_EVM=0xYourEvmDevnetAddress
```

```bash
npm run dev
```

Health check shows testnet chains:

```bash
curl http://127.0.0.1:3402/health
```

## Facilitators

| Mode | Facilitator | API key |
|------|-------------|---------|
| Testnet (default when `X402_TESTNET=1`) | https://x402.org/facilitator | None |
| Mainnet Dexter | https://x402.dexter.cash | None |
| Mainnet CDP | https://api.cdp.coinbase.com/platform/v2/x402/facilitator | CDP API keys |

## Networks (CAIP-2)

| Chain | Identifier | USDC |
|-------|------------|------|
| Base Sepolia | `eip155:84532` | Test USDC via faucet |
| Solana Devnet | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | Devnet USDC faucet |

## Fund test wallets

### Base Sepolia

Use [CDP faucet](https://docs.cdp.coinbase.com) or:

```bash
cdp evm faucet address=0xYourAddress network=base-sepolia token=usdc
```

### Solana Devnet

```bash
cdp solana faucet address=YourAddress token=usdc
```

Or Solana CLI / public devnet faucets.

## Pay a test endpoint

1. Unpaid probe → HTTP 402 with `Payment-Required` header
2. Sign with testnet wallet + x402 client
3. Retry with `Payment-Signature`

```typescript
import { wrapFetch } from "@dexterai/x402/client";

const x402Fetch = wrapFetch(fetch, {
  evmPrivateKey: process.env.EVM_PRIVATE_KEY!,
  preferredNetwork: "eip155:84532",
});

const res = await x402Fetch("http://127.0.0.1:3402/api/guard/pre-x402", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ /* ... */ }),
});
```

## Production vs testnet

| Variable | Mainnet | Testnet |
|----------|---------|---------|
| `X402_TESTNET` | unset | `1` |
| `NETWORKS` | `base,solana,polygon` | `base-sepolia,solana-devnet` |
| `FACILITATOR_URL` | Dexter or CDP | `https://x402.org/facilitator` |

Railway: use a separate staging service with `X402_TESTNET=1` — do not mix testnet facilitator with mainnet receive addresses.

## CDP alignment

Matches [CDP x402 network support](https://docs.cdp.coinbase.com/x402/network-support):

- x402.org facilitator for Base Sepolia + Solana Devnet (no signup)
- CDP facilitator free tier for mainnet when ready to graduate

## Related

- [INTEGRATE.md](./INTEGRATE.md) — mainnet buyer flow
- [AGENTIC-WALLET.md](./AGENTIC-WALLET.md) — Coinbase Agentic Wallet + Trust Layer
