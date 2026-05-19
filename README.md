# x402 Agent Suite

Paanch **paid x402 APIs** jo agent infrastructure ke liye hain — Spend Governor, Receipt Auditor, Risk Gate, API Router, Research Brief.

Har endpoint **USDC** leta hai (Dexter facilitator). Marketplace par **auto-list** hota hai jab real settlement ho.

---

## Agents (kya karta hai har ek)

| Endpoint | Price | Kaam |
|----------|-------|------|
| `POST /api/spend-governor/check` | $0.03 | Daily/per-call budget, host allow/block |
| `POST /api/receipt-auditor/verify` | $0.05 | Settlement / tx verify |
| `POST /api/risk-gate/scan` | $0.08 | URL probe + risk score |
| `POST /api/router/route` | $0.02 | Dexter marketplace se best API |
| `POST /api/research/brief` | $0.20 | Topic ke liye paid-API pipeline |

---

## Step 1 — Install aur configure

```powershell
cd C:\Users\mimra\x402-agent-suite
copy .env.example .env
```

`.env` mein set karo:

- `PAY_TO_ADDRESS` — jahan USDC aaye (Base `0x...` ya Solana address)
- `NETWORK` — `base` ya `solana`
- `PUBLIC_BASE_URL` — deploy ke baad apna domain (listing ke liye zaroori)

```powershell
npm install
npm run dev
```

Health: `http://localhost:3402/health`

---

## Step 2 — Pehli paid call (marketplace ke liye zaroori)

Marketplace **manual register nahi** karta. Jab koi aap ke endpoint par **Dexter facilitator se settle** kare, URL catalog mein queue hoti hai.

### Option A — Demo client (khud test)

```powershell
# .env mein EVM_PRIVATE_KEY (Base USDC) ya SOLANA_PRIVATE_KEY
npm run demo
```

### Option B — OpenDexter (Cursor MCP)

1. Wallet mein thoda USDC deposit (`x402_wallet` MCP tool)
2. Apna public URL use karo (localhost marketplace ko nahi dikhega — **deploy chahiye**)
3. `x402_fetch` se `POST https://your-domain.com/api/spend-governor/check` call karo

### Option C — curl + x402 client

Docs: [Merchant Quickstart](https://docs.dexter.cash/docs/build-with-x402/merchant-quickstart/)

---

## Step 3 — Internet par deploy

Marketplace ko **public HTTPS URL** chahiye.

| Platform | Notes |
|----------|--------|
| **Railway / Render / Fly.io** | Node app, `PORT`, env vars |
| **VPS** | `npm run build && npm start` behind nginx |
| **Dexter Lab** | No-code deploy option: [Dexter Lab](https://docs.dexter.cash/docs/dexter-lab/) |

Deploy ke baad:

1. `PUBLIC_BASE_URL=https://api.yourdomain.com` set karo
2. `openapi.json` reachable ho: `https://api.yourdomain.com/openapi.json`
3. Kam az kam **3–5 real paid calls** khud ya testers se karwao (verifier ko traffic chahiye)

---

## Step 4 — Marketplace listing (auto-discovery)

Official flow: [Publishing and Discovery](https://docs.dexter.cash/docs/build-with-x402/publishing-and-discovery/)

### Kya hota hai automatically

```
Payment settles (Dexter facilitator)
    → URL catalog queue
    → AI verification (~15 min)
    → Score >= 75 → marketplace LIVE
```

**Aap ko alag se "submit listing" nahi karna.**

### Ranking improve karne ke liye

1. **Specific JSON** — generic text mat do  
2. **Reliable** — failures rank girate hain  
3. **Chota response** — 30KB se kam preferred  
4. **Price** — $0.25 se kam = full paid verification  
5. **`openapi.json`** — already included at `/openapi.json`

### Seller profile (trust)

1. [dexter.cash/sellers](https://dexter.cash/sellers) kholo  
2. Apna **`payTo` wallet** claim karo (wahi `PAY_TO_ADDRESS`)  
3. Name, logo, tagline, category bharo  

### Dhoondhna / verify

- Search: [open.dexter.cash](https://open.dexter.cash/) ya OpenDexter `x402_search`  
- API: `GET https://api.dexter.cash/api/facilitator/marketplace/resources?search=spend+governor`

---

## Step 5 — Paisa kaise aata hai

1. Agent / user aap ka endpoint call karta hai  
2. `402 Payment Required`  
3. USDC `PAY_TO_ADDRESS` par settle  
4. Aap ka handler JSON return karta hai  

**Revenue tips:**

- Spend Governor + Receipt Auditor ko **bundle** becho teams ko  
- Research Brief par sab se zyada margin ($0.20)  
- Router cheap rakho ($0.02) taake volume aaye  

---

## Agent pipeline (sab ko ek saath)

```
Task
  → Spend Governor (allow?)
  → Risk Gate (safe URL?)
  → API Router (best API?)
  → [downstream x402_fetch]
  → Receipt Auditor (tx OK?)
```

Cursor / OpenDexter example order:

1. `x402_fetch` → `/api/spend-governor/check`  
2. `x402_fetch` → `/api/risk-gate/scan`  
3. `x402_fetch` → `/api/router/route`  
4. `x402_fetch` → chosen marketplace URL  
5. `x402_fetch` → `/api/receipt-auditor/verify`  

---

## Example requests (after payment)

**Spend Governor**

```json
POST /api/spend-governor/check
{
  "agentId": "prod-bot-1",
  "estimatedCostUsdc": 0.01,
  "targetUrl": "https://api.myceliasignal.com/oracle/price/eth/usd",
  "network": "eip155:8453",
  "policy": {
    "dailyCapUsdc": 10,
    "perCallCapUsdc": 0.5,
    "allowedHosts": ["myceliasignal.com", "api.dexter.cash"]
  }
}
```

**Receipt Auditor**

```json
POST /api/receipt-auditor/verify
{
  "network": "eip155:8453",
  "transactionHash": "0x...",
  "expectedAmountUsdc": 0.03,
  "payTo": "0xYourPayTo"
}
```

**Risk Gate**

```json
POST /api/risk-gate/scan
{
  "targetUrl": "https://api.myceliasignal.com/oracle/price/eth/usd",
  "policy": { "perCallCapUsdc": 0.25 }
}
```

**Router**

```json
POST /api/router/route
{
  "query": "ETH USD oracle",
  "preferNetwork": "base",
  "maxPriceUsdc": 0.05
}
```

**Research**

```json
POST /api/research/brief
{
  "topic": "Solana DEX volume today",
  "includePrice": true
}
```

---

## npm warnings (uuid / audit)

After `npm install` you may see:

| Message | Meaning | Action |
|---------|---------|--------|
| `uuid@8.3.2 deprecated` | Comes from `jayson` → `@solana/web3.js` (transitive). Not your code. | **Safe to ignore** for now. Goes away when Dexter/Solana update deps. |
| `4 high severity vulnerabilities` | Usually `bigint-buffer` via `@solana/spl-token` (bundled with `@dexterai/x402`). | Run `npm install` again (this repo overrides `bigint-buffer` with `bigint-buffer-safe`). Then `npm audit`. |

```powershell
npm install
npm audit
npm audit fix
```

If audit still reports issues, run `npm audit` and check the **path** — if it is only under `@solana/*`, your Express routes do not call that code unless you use Solana features. Base-only deploy has low runtime exposure.

Do **not** force `uuid@11` via overrides unless you test Solana payments end-to-end — old `jayson` may break.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Server won't start | `PAY_TO_ADDRESS` missing in `.env` |
| 402 but no settlement | Wallet mein USDC + sahi chain |
| Marketplace par nahi dikha | Public URL + real settle; 15 min wait |
| Low quality score | Faster responses, real data, fix uptime |
| `demo` fails | `EVM_PRIVATE_KEY` with Base USDC |

---

## Project structure

```
src/
  agents/          # 5 agent logic modules
  lib/             # marketplace, probe, ledger
  client/demo.ts   # payer demo
  index.ts         # Express + x402 middleware
openapi.json       # Discovery / quality
data/              # spend ledger (local, gitignored)
```

---

## Links

- [Dexter Merchant Quickstart](https://docs.dexter.cash/docs/build-with-x402/merchant-quickstart/)
- [Publishing and Discovery](https://docs.dexter.cash/docs/build-with-x402/publishing-and-discovery/)
- [Marketplace API](https://docs.dexter.cash/docs/use-dexter/marketplace-and-discovery/)
- [OpenDexter](https://dexter.cash/opendexter)
