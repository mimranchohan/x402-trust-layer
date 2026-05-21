# x402 Agent Suite Pro v3

[![x402](https://img.shields.io/badge/x402-Agent%20Suite-v3-blue)](https://x402-agent-suite-production.up.railway.app)
[![Dexter](https://img.shields.io/badge/Dexter-seller-green)](https://dexter.cash/sellers/9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt)
[![Agentic Market](https://img.shields.io/badge/Agentic.Market-listing-orange)](https://agentic.market/)

**22 paid x402 APIs** for AI agent fleets — multi-chain, MPP sessions, security grades, and trust attestations. Settles USDC via the [Dexter facilitator](https://x402.dexter.cash).

**Live:** https://x402-agent-suite-production.up.railway.app

## Copy-paste: preflight before every paid call

```typescript
import { wrapFetch } from "@dexterai/x402/client";

const BASE = "https://x402-agent-suite-production.up.railway.app";
const x402Fetch = wrapFetch(fetch, { walletPrivateKey: process.env.SOLANA_PRIVATE_KEY! });

// 1) Preflight (one payment — guard + security + attestation)
const pre = await x402Fetch(`${BASE}/api/x402/proxy`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    agentId: "my-agent-1",
    walletAddress: process.env.PAY_TO_ADDRESS,
    targetUrl: "https://downstream-x402-api.example/endpoint",
    estimatedCostUsdc: 0.05,
    policy: { dailyCapUsdc: 10, perCallCapUsdc: 1 },
    issueAttestation: true,
  }),
});
const gate = await pre.json();
if (!gate.allowed) throw new Error(gate.summary);

// 2) Pay downstream API
const data = await x402Fetch(gate.targetUrl ?? "https://downstream-x402-api.example/endpoint");
```

Or use the helper package: [`packages/x402-preflight`](packages/x402-preflight/README.md).

## Killer apps (v3 — start here)

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /api/x402/proxy` | $0.08 | Guard + security grade + attestation + probe — **one payment** |
| `POST /api/mpp/session` | $0.03 | MPP open → voucher → close (batch settlement savings) |
| `POST /api/attestation/issue` | $0.04 | Signed preflight attestation for trust networks |
| `POST /api/attestation/verify` | $0.02 | Verify attestation before downstream pay |
| `GET /api/attestation/registry` | $0.02 | Query valid attestations |

## Discovery (AgentCash / Agentic / x402scan)

- **AgentCash OpenAPI:** `GET /openapi.json` (`x-payment-info`, `info.x-guidance`, request schemas)
- **x402scan fan-out:** `GET /.well-known/x402`
- Guide: [docs/AGENTCASH.md](docs/AGENTCASH.md)
- Register: [x402scan.com/resources/register](https://www.x402scan.com/resources/register)

## Discovery (Agentic Market / Bazaar)

| URL | Purpose |
|-----|---------|
| `/x402/api/services.json` | Bazaar manifest — all routes `discoverable: true` |
| `/x402/api/discover` | Agent discovery catalog |
| `/.well-known/x402.json` | Well-known x402 config |
| `/openapi.json` | OpenAPI 3.1 |

See [AGENTIC-MARKET.md](docs/AGENTIC-MARKET.md) for listing on https://agentic.market/

## Bundles

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /api/guard/pre-x402` | $0.05 | Spend + identity + risk + security grade |
| `POST /api/pipeline/execute` | $0.25 | Full orchestration in one call |

## Documentation (English)

| Doc | Topic |
|-----|--------|
| [WHY-USE-THESE-SERVICES.md](docs/WHY-USE-THESE-SERVICES.md) | Why agents should pay for each layer |
| [INTEGRATE.md](docs/INTEGRATE.md) | OpenDexter / TypeScript integration |
| [AGENTIC-MARKET.md](docs/AGENTIC-MARKET.md) | List all agents on agentic.market |
| [SECURITY.md](docs/SECURITY.md) | Security grades, policies, attestations |
| [MULTI-CHAIN.md](docs/MULTI-CHAIN.md) | Solana + Base + Polygon |
| [MARKETPLACES.md](docs/MARKETPLACES.md) | Dexter + listing beyond Dexter |
| [DEXTER-SCORE.md](docs/DEXTER-SCORE.md) | Verification score 75+ |

## Multi-chain

```env
NETWORKS=solana,base
PAY_TO_ADDRESS=YourSolanaWallet
PAY_TO_EVM=0xYourEvmWallet
```

## Quick start

```bash
git clone https://github.com/mimranchohan/x402-agent-suite.git
cd x402-agent-suite
cp .env.example .env
npm install
npm run dev
```

## Demo (production indexing)

```bash
PUBLIC_BASE_URL=https://x402-agent-suite-production.up.railway.app
npm run demo
```

## Deploy

[Railway](DEPLOY.md) — set `PAY_TO_ADDRESS`, `NETWORKS`, redeploy.

## License

MIT
