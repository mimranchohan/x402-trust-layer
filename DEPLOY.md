# Deployment Guide

Deploy **x402 Agent Suite Pro v3.1** (24 paid endpoints) to Railway, Render, or Docker.

**Quick path:** [DEPLOY-CHECKLIST.md](docs/DEPLOY-CHECKLIST.md)

## Prerequisites

- GitHub: https://github.com/mimranchohan/x402-agent-suite
- Solana + Base USDC receive wallets
- Railway or Render account

---

## Railway (recommended)

### Variables

| Variable | Required | Value |
|----------|----------|--------|
| `PAY_TO_ADDRESS` | **Yes** | Solana USDC receive |
| `PAY_TO_EVM` | **Yes** | Base USDC receive (Agentic) |
| `NETWORKS` | **Yes** | `base,solana` |
| `ATTESTATION_HMAC_SECRET` | **Yes** | `openssl rand -hex 32` |
| `FACILITATOR_URL` | No | `https://x402.dexter.cash` |
| `PUBLIC_BASE_URL` | No | Auto from Railway domain |
| `ALLOW_VERIFIER_PROBE_IDS` | No | `1` for Dexter empty-body probe |
| `RATE_LIMIT_PER_MIN` | No | `120` |

**Never:** `SOLANA_PRIVATE_KEY`, `EVM_PRIVATE_KEY` on Railway.

### Steps

1. Railway → **Deploy from GitHub** → `x402-agent-suite`
2. Set variables above → **Generate Domain**
3. Verify:

```bash
curl https://YOUR-APP.up.railway.app/health
npm run probe:production
```

4. Local paid smoke (separate payer wallet):

```bash
set PUBLIC_BASE_URL=https://YOUR-APP.up.railway.app
set EVM_PRIVATE_KEY=0x...
npm run demo
```

---

## CI / GitHub Actions

On every push to `main`:

- `npm run typecheck`
- `npm run verify:bazaar`
- OpenAPI drift check
- `npm run probe:production` against production

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## Docker

```bash
docker build -t x402-agent-suite .
docker run -p 3402:3402 \
  -e PAY_TO_ADDRESS=... \
  -e PAY_TO_EVM=0x... \
  -e NETWORKS=base,solana \
  -e ATTESTATION_HMAC_SECRET=... \
  x402-agent-suite
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Boot crash `ATTESTATION_HMAC_SECRET` | Set 32+ char secret on Railway |
| Payment verification failed | Payer wallet ≠ receive wallet; match `PUBLIC_BASE_URL` |
| CI probe fails | Deploy latest `main` to production first |
| x402scan free route warning | Expected for `/health` — register `/api/*` only |

See [SECURITY.md](docs/SECURITY.md) and [CHANGELOG.md](CHANGELOG.md).
