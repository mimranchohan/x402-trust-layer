# Railway deploy checklist

## Required environment variables

| Variable | Example | Notes |
|----------|---------|--------|
| `ATTESTATION_HMAC_SECRET` | `openssl rand -hex 32` | 32+ chars; mandates & HMAC proofs |
| `PAY_TO_EVM` | `0x...` | Base USDC payee |
| `NETWORKS` | `base,solana,polygon` | Discovery chains |
| `PUBLIC_BASE_URL` | `https://x402trustlayer.xyz` | Must match custom domain |
| `NODE_ENV` | `production` | Set by Railway |

## Recommended

| Variable | Purpose |
|----------|---------|
| `DATA_DIR` | `/data` when using a Railway volume (SQLite persistence) |
| `DB_PATH` | Override full DB file path (optional) |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Multi-replica nonce / replay |
| `WEBHOOK_ADMIN_SECRET` | Register/list webhooks |
| `ALLOW_ZK_SIMULATE=1` | Protocol ZK demo route in prod |
| `CORS_ORIGINS` | Comma-separated browser origins |

## Persistent SQLite (important)

Without a volume, `trust-layer.db` resets on every redeploy.

1. Railway → service → **Volumes** → Add mount path `/data`
2. Set variable: `DATA_DIR=/data`
3. Redeploy

Health should report `db: ok` after boot.

## Verify after deploy

```bash
curl https://x402trustlayer.xyz/health
curl https://x402trustlayer.xyz/.well-known/x402/v2
curl https://x402trustlayer.xyz/.well-known/agent.json
```

## x402gle audition (when cooldown clear)

```bash
npm run list:x402gle:missing
npm run audition:x402gle:endpoints
```

Funded Base USDC payer required. See `docs/X402GLE-COOLDOWN.md` if `cooldown_active`.
