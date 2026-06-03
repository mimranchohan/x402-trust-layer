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
| `DATA_DIR` | `/app/data` when volume mount is `/app/data` (see below) |
| `DB_PATH` | Override full DB file path (optional) |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Multi-replica nonce / replay |
| `WEBHOOK_ADMIN_SECRET` | Register/list webhooks |
| `ALLOW_ZK_SIMULATE=1` | Protocol ZK demo route in prod |
| `CORS_ORIGINS` | Comma-separated browser origins |

## Persistent SQLite (important)

Without a volume, `trust-layer.db` resets on every redeploy.

### Add volume (Railway UI)

Volumes are **not** a button inside service Settings. Use:

- **Ctrl+K** (or Cmd+K) on the project canvas → **Add Volume**, or  
- CLI: `railway volume add --mount-path /app/data`

### Mount path (critical — wrong path crashes the app)

| Mount path | Result |
|------------|--------|
| **`/app/data`** | Correct — SQLite persists, app code stays in `/app/dist` |
| `/app` or `/app/dist` | **WRONG** — empty volume hides your app → `Cannot find module '/app/dist/index.js'` |

### Variables

Use **`/app/data`** (matches Docker `WORKDIR /app`):

```text
DATA_DIR=/app/data
```

Or delete `DATA_DIR` on Railway — Dockerfile already sets `DATA_DIR=/app/data`.

**Do not** set `DATA_DIR=/data` unless the volume is mounted at `/data`.

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

## Troubleshooting: `Cannot find module '/app/dist/index.js'`

Logs show **Mounting volume** then this error → the volume is almost certainly mounted at **`/app`** or **`/app/dist`**, not `/app/data`. An empty volume replaces that directory in the container, so Node cannot see the built app.

**Fix (pick one):**

1. **Correct the mount** — Railway → project canvas → select the volume → set mount path to **`/app/data`**. Set `DATA_DIR=/app/data` (or remove `DATA_DIR` to use the Dockerfile default). Redeploy.
2. **Confirm quickly** — Detach the volume from the service, redeploy once. If `/health` returns 200, the image is fine; re-attach the volume only at `/app/data`.

The Docker image **does** include `dist/index.js` (see `Dockerfile` `COPY --from=build`). This error is runtime layout, not a failed TypeScript build.

If there is **no** volume and the error persists, open the latest **Build** logs and confirm `npm run build` ran in the Docker build stage (builder must stay `DOCKERFILE` in `railway.toml`).
