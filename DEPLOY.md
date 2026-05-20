# Deployment Guide

Deploy **x402 Agent Suite Pro** (v2 — 15 endpoints) to Railway, Render, or Docker.

## Prerequisites

- GitHub repository: `https://github.com/mimranchohan/x402-agent-suite`
- Solana or Base wallet for `PAY_TO_ADDRESS`
- Railway or Render account (free tier works)

---

## Option A — Railway (GitHub deploy)

### 1. Create the GitHub repository

If the repo does not exist yet:

1. Go to [github.com/new](https://github.com/new)
2. Repository name: `x402-agent-suite`
3. Visibility: **Public**
4. Do **not** add README, .gitignore, or license (empty repo)
5. Click **Create repository**

Push your code:

```bash
cd x402-agent-suite
git init
git add .
git commit -m "Initial commit: x402 agent suite"
git branch -M main
git remote add origin https://github.com/mimranchohan/x402-agent-suite.git
git push -u origin main
```

### 2. Deploy on Railway

1. Open [railway.app](https://railway.app) and sign in with GitHub
2. **New Project** → **Deploy from GitHub repo** → select `x402-agent-suite`
3. Open **Variables** and set:

| Variable | Example |
|----------|---------|
| `PAY_TO_ADDRESS` | Your Solana or EVM receive address |
| `NETWORK` | `solana` or `base` |
| `FACILITATOR_URL` | `https://x402.dexter.cash` |

`PUBLIC_BASE_URL` is optional — the app auto-detects `RAILWAY_PUBLIC_DOMAIN`.

Do **not** add `SOLANA_PRIVATE_KEY` to Railway (server only receives payments).

4. **Settings** → **Networking** → **Generate Domain**
5. Wait for the deploy to finish (~2–3 minutes)

### 3. Verify

```bash
curl https://YOUR-APP.up.railway.app/health
curl https://YOUR-APP.up.railway.app/openapi.json
```

Expected: `{"ok":true,"service":"x402-agent-suite",...}`

### 4. Marketplace discovery

From your local machine, set in `.env`:

```env
PUBLIC_BASE_URL=https://YOUR-APP.up.railway.app
```

Run:

```bash
npm run demo
```

Make at least **3 paid calls** to your public URL, wait ~15 minutes, then search on [open.dexter.cash](https://open.dexter.cash/).

Claim your seller profile: [dexter.cash/sellers](https://dexter.cash/sellers)

---

## Option B — Railway CLI

```bash
npm install -g @railway/cli
railway login
cd x402-agent-suite
railway init
railway variables set PAY_TO_ADDRESS=YourAddress NETWORK=solana FACILITATOR_URL=https://x402.dexter.cash
railway up
railway domain
```

Or run the helper script (Windows):

```powershell
.\scripts\deploy-railway.ps1
```

---

## Option C — Render

1. [render.com](https://render.com) → **New Web Service**
2. Connect the GitHub repo
3. Runtime: **Docker** (uses `./Dockerfile`)
4. Set the same environment variables as Railway
5. Deploy

`RENDER_EXTERNAL_URL` is detected automatically for `PUBLIC_BASE_URL`.

---

## Docker (any host)

```bash
docker build -t x402-agent-suite .
docker run -p 3402:3402 \
  -e PAY_TO_ADDRESS=YourAddress \
  -e NETWORK=solana \
  x402-agent-suite
```

---

## Security checklist

- Never commit `.env` (listed in `.gitignore`)
- Never put private keys on Railway/Render — use them only locally for `npm run demo`
- Rotate any key that was ever pasted in chat or logs
- `PAY_TO_ADDRESS` is safe to set as a platform environment variable (receive-only)

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on Railway | Check deploy logs; ensure `Dockerfile` is in repo root |
| Health check fails | Confirm `PAY_TO_ADDRESS` is set |
| 402 works locally but not in prod | Set `NETWORK` to match your `PAY_TO_ADDRESS` chain |
| Git push "Repository not found" | Create the empty repo on GitHub first (step 1) |
