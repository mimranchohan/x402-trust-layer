# x402 Agent Suite

Five **paid x402 APIs** for agent infrastructure: Spend Governor, Receipt Auditor, Risk Gate, API Router, and Research Brief.

Every endpoint accepts **USDC** via the [Dexter facilitator](https://x402.dexter.cash). After real settlements, endpoints are **auto-listed** on the [OpenDexter marketplace](https://dexter.cash/opendexter).

## Endpoints

| Endpoint | Price (USDC) | Description |
|----------|--------------|-------------|
| `POST /api/spend-governor/check` | $0.03 | Daily/per-call budget, host allow/block |
| `POST /api/receipt-auditor/verify` | $0.05 | Settlement / transaction verification |
| `POST /api/risk-gate/scan` | $0.08 | URL probe + risk score before paying |
| `POST /api/router/route` | $0.02 | Find the best verified x402 API for a query |
| `POST /api/research/brief` | $0.20 | Research pipeline + cost estimate for a topic |

## Quick start

```bash
git clone https://github.com/mimranchohan/x402-agent-suite.git
cd x402-agent-suite
cp .env.example .env
# Edit .env: PAY_TO_ADDRESS, NETWORK (base | solana)
npm install
npm run dev
```

Health check: `http://127.0.0.1:3402/health`

Paid demo (requires `SOLANA_PRIVATE_KEY` or `EVM_PRIVATE_KEY` in `.env`):

```bash
npm run demo
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PAY_TO_ADDRESS` | Yes | Wallet that receives USDC (Solana or EVM) |
| `NETWORK` | Yes | `solana` or `base` |
| `PORT` | No | Default `3402` (Railway sets this automatically) |
| `PUBLIC_BASE_URL` | No | Public HTTPS URL after deploy (auto on Railway) |
| `FACILITATOR_URL` | No | Default `https://x402.dexter.cash` |
| `SOLANA_PRIVATE_KEY` | Demo only | Payer wallet — never commit |
| `EVM_PRIVATE_KEY` | Demo only | Payer wallet for Base — never commit |

## Agent pipeline

```
Task
  → Spend Governor   (allowed?)
  → Risk Gate          (safe URL?)
  → API Router         (best API?)
  → downstream x402_fetch
  → Receipt Auditor    (payment OK?)
```

OpenDexter / MCP call order:

1. `x402_fetch` → `/api/spend-governor/check`
2. `x402_fetch` → `/api/risk-gate/scan`
3. `x402_fetch` → `/api/router/route`
4. `x402_fetch` → chosen marketplace URL
5. `x402_fetch` → `/api/receipt-auditor/verify`

## Marketplace listing

No manual registration. Flow:

```
Payment settles via Dexter
  → URL queued in catalog
  → AI verification (~15 min)
  → Score ≥ 75 → live in search
```

After deploy:

1. Make **3–5 real paid calls** to your public URL
2. Claim your seller profile at [dexter.cash/sellers](https://dexter.cash/sellers) (same `PAY_TO_ADDRESS`)
3. Search on [open.dexter.cash](https://open.dexter.cash/) or via OpenDexter `x402_search`

Docs: [Publishing and Discovery](https://docs.dexter.cash/docs/build-with-x402/publishing-and-discovery/)

## Deploy

See **[DEPLOY.md](./DEPLOY.md)** for Railway, Render, and Docker instructions.

## Example requests (after x402 payment)

**Spend Governor**

```http
POST /api/spend-governor/check
Content-Type: application/json

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
{
  "network": "eip155:8453",
  "transactionHash": "0x...",
  "expectedAmountUsdc": 0.03,
  "payTo": "0xYourPayTo"
}
```

**Risk Gate**

```json
{
  "targetUrl": "https://api.myceliasignal.com/oracle/price/eth/usd",
  "policy": { "perCallCapUsdc": 0.25 }
}
```

**Router**

```json
{
  "query": "ETH USD oracle",
  "preferNetwork": "base",
  "maxPriceUsdc": 0.05
}
```

**Research brief**

```json
{
  "topic": "Solana DEX volume today",
  "includePrice": true
}
```

## Project structure

```
src/
  agents/          # Five agent modules
  lib/             # Marketplace, probe, ledger
  client/demo.ts   # Paid demo client
  index.ts         # Express + x402 middleware
openapi.json       # Discovery / quality score
data/              # Local spend ledger (gitignored)
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Set PAY_TO_ADDRESS in .env` | Create `.env` from `.env.example` |
| `ECONNREFUSED` on demo | Run `npm run dev` in another terminal |
| `npm` wrong folder | `cd` into project root (must contain `package.json`) |
| Marketplace empty in router | Facilitator catalog may be down; Lab fallback is used |
| `uuid` / `npm audit` warnings | Transitive Solana deps; see overrides in `package.json` |

## Links

- [Dexter Merchant Quickstart](https://docs.dexter.cash/docs/build-with-x402/merchant-quickstart/)
- [Publishing and Discovery](https://docs.dexter.cash/docs/build-with-x402/publishing-and-discovery/)
- [OpenDexter](https://dexter.cash/opendexter)

## License

MIT
