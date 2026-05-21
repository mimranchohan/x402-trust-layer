# x402 Agent Suite Pro v3

**20 paid x402 APIs** for AI agent fleets — multi-chain, MPP sessions, security grades, and trust attestations. Settles USDC via the [Dexter facilitator](https://x402.dexter.cash).

**Live:** https://x402-agent-suite-production.up.railway.app

## Killer apps (v3 — start here)

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /api/x402/proxy` | $0.08 | Guard + security grade + attestation + probe — **one payment** |
| `POST /api/mpp/session` | $0.03 | MPP open → voucher → close (batch settlement savings) |
| `POST /api/attestation/issue` | $0.04 | Signed preflight attestation for trust networks |
| `POST /api/attestation/verify` | $0.02 | Verify attestation before downstream pay |
| `GET /api/attestation/registry` | $0.02 | Query valid attestations |

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

Health returns `chains` and `networks` arrays.

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

Paid settlements index resources on [Dexter sellers](https://dexter.cash/sellers) within ~15–30 minutes.

## Deploy

[Railway](DEPLOY.md) — set `PAY_TO_ADDRESS`, `NETWORKS`, redeploy.

## License

MIT
