# Deployment Guide

Deploy **x402 Trust Layer v5.1** (58 paid endpoints) to Railway via Docker.

**Canonical checklist:** [docs/RAILWAY-DEPLOY.md](docs/RAILWAY-DEPLOY.md)  
**Production hardening:** [docs/PRODUCTION-HARDENING.md](docs/PRODUCTION-HARDENING.md)

## Prerequisites

- GitHub: https://github.com/mimranchohan/x402-trust-layer
- Solana + Base (+ optional Polygon) USDC receive wallets
- Railway account

## Railway (recommended)

`railway.toml` uses `builder = "DOCKERFILE"`. The image runs `scripts/docker-entrypoint.sh` so SQLite can write to a volume at **`/app/data`** (not `/app`).

### Variables

| Variable | Required | Value |
|----------|----------|--------|
| `PAY_TO_ADDRESS` | **Yes** | Solana USDC receive |
| `PAY_TO_EVM` | **Yes** | EVM USDC receive |
| `NETWORKS` | **Yes** | `base,solana,polygon` |
| `ATTESTATION_HMAC_SECRET` | **Yes** | `openssl rand -hex 32` |
| `PUBLIC_BASE_URL` | **Yes** (custom domain) | `https://x402trustlayer.xyz` |
| `DATA_DIR` | No | `/app/data` (default; match volume mount) |
| `FACILITATOR_URL` | No | `https://x402.dexter.cash` |

**Never** put payer private keys on Railway.

### Volume

Mount **`/app/data`** only. See troubleshooting in [docs/RAILWAY-DEPLOY.md](docs/RAILWAY-DEPLOY.md) for `dist/index.js` and `SQLITE_CANTOPEN` errors.

### Verify

```bash
curl https://x402trustlayer.xyz/health
npm run probe:production
```

## npm package

Publish or install the server package:

```bash
npm install x402-trust-layer
```

Registry: https://www.npmjs.com/package/x402-trust-layer

Client helpers: `packages/x402-preflight`, `packages/trust-layer-mcp`.
