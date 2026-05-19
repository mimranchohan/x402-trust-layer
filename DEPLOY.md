# Deploy Guide (Railway — recommended)

## Option A — Railway (5 minutes)

### 1. GitHub par code

```powershell
cd C:\Users\mimra\x402-agent-suite
git init
git add .
git commit -m "x402 agent suite — production deploy"
```

GitHub par naya repo banao, phir:

```powershell
git remote add origin https://github.com/YOUR_USER/x402-agent-suite.git
git branch -M main
git push -u origin main
```

### 2. Railway

1. [railway.app](https://railway.app) → Login with GitHub  
2. **New Project** → **Deploy from GitHub repo** → `x402-agent-suite`  
3. **Variables** tab:

| Variable | Value |
|----------|--------|
| `PAY_TO_ADDRESS` | `9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt` |
| `NETWORK` | `solana` |
| `FACILITATOR_URL` | `https://x402.dexter.cash` |

`PUBLIC_BASE_URL` optional — Railway `RAILWAY_PUBLIC_DOMAIN` se auto set hota hai.

4. **Settings** → **Networking** → **Generate Domain**  
5. Deploy complete → open `https://YOUR-APP.up.railway.app/health`

### 3. Marketplace listing

```powershell
curl https://YOUR-APP.up.railway.app/health
```

3–5 paid calls (`npm run demo` with `PUBLIC_BASE_URL` = Railway URL).

Claim seller: [dexter.cash/sellers](https://dexter.cash/sellers)

---

## Option B — Railway CLI (terminal)

```powershell
npm i -g @railway/cli
railway login
cd C:\Users\mimra\x402-agent-suite
railway init
railway variables set PAY_TO_ADDRESS=9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt NETWORK=solana
railway up
railway domain
```

---

## Option C — Render

1. [render.com](https://render.com) → New **Web Service**  
2. Connect GitHub repo  
3. Runtime: **Docker**  
4. Env vars same as Railway table  
5. Deploy

---

## Verify production

```powershell
$URL = "https://YOUR-APP.up.railway.app"
curl "$URL/health"
curl "$URL/openapi.json"
```

Update local `.env` for remote demo:

```env
PUBLIC_BASE_URL=https://YOUR-APP.up.railway.app
```

```powershell
npm run demo
```

---

## Security

- Never commit `.env` (already in `.gitignore`)  
- Rotate `SOLANA_PRIVATE_KEY` if it was ever shared in chat  
- `PAY_TO_ADDRESS` is public (receive-only) — OK to set in Railway vars  
