# Deploy checklist (Railway)

Use this on every release to production.

## 1. Railway variables

| Variable | Required | Example |
|----------|----------|---------|
| `PAY_TO_ADDRESS` | Yes | Solana USDC receive |
| `PAY_TO_EVM` | Yes (Agentic) | Base USDC receive |
| `NETWORKS` | Yes | `base,solana` |
| `FACILITATOR_URL` | No | `https://x402.dexter.cash` |
| `PUBLIC_BASE_URL` | No | Auto from Railway domain if unset |
| `ATTESTATION_HMAC_SECRET` | **Yes** | `openssl rand -hex 32` |
| `ALLOW_VERIFIER_PROBE_IDS` | Optional | `1` for Dexter/x402gle attestation probe |
| `RATE_LIMIT_PER_MIN` | Optional | `120` |

**Never on Railway:** `SOLANA_PRIVATE_KEY`, `EVM_PRIVATE_KEY`

## 2. Deploy

1. Push `main` → Railway auto-deploy (or manual redeploy).
2. Wait for build green (~2–3 min).

## 3. Verify (copy-paste)

```powershell
curl.exe https://x402-agent-suite-production.up.railway.app/health
curl.exe https://x402-agent-suite-production.up.railway.app/openapi.json
npm run probe:production
npm run discovery:discover
```

Expected:

- `/health` → `endpointCount: 24`, `agenticReady: true`
- `probe:production` → all routes `pass402`, `wellKnown.resourceCount: 24`
- OpenAPI → 24 paths (no `/health` in `paths`)

## 4. Paid smoke test (local)

```powershell
set PUBLIC_BASE_URL=https://x402-agent-suite-production.up.railway.app
set EVM_PRIVATE_KEY=0x<separate_payer_wallet>
npm run demo
```

## 5. Marketplaces (manual)

1. [Dexter Verify Now](https://dexter.cash/sellers/9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt) — killer routes
2. [x402scan register](https://www.x402scan.com/resources/register)
3. [x402gle Test now](https://x402gle.com/servers/x402-agent-suite-production.up.railway.app)

## 6. Post-deploy

- [ ] GitHub Actions CI green on `main`
- [ ] 3+ real paid calls from external payer wallet
- [ ] Update `docs/AUDIT-TABLE.md` if route/pricing changed
