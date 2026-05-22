# x402 Agent Suite Pro v3

[![x402](https://img.shields.io/badge/x402-Agent%20Suite-v3-blue)](https://x402-agent-suite-production.up.railway.app)
[![Dexter](https://img.shields.io/badge/Dexter-seller-green)](https://dexter.cash/sellers/9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt)
[![Agentic Market](https://img.shields.io/badge/Agentic.Market-listing-orange)](https://agentic.market/)

**24 paid x402 APIs** for AI agent fleets. Settles USDC via [Dexter facilitator](https://x402.dexter.cash).

**Live:** https://x402-agent-suite-production.up.railway.app

---

## Start here (3 entry points)

Most agents only need **one** of these:

| Endpoint | Price | Use when |
|----------|-------|----------|
| [`POST /api/x402/proxy`](https://x402-agent-suite-production.up.railway.app/api/x402/proxy) | **$0.08** | Default preflight before any external `x402_fetch` |
| [`POST /api/guard/pre-x402`](https://x402-agent-suite-production.up.railway.app/api/guard/pre-x402) | **$0.05** | Same policy bundle, no downstream probe/attestation |
| [`POST /api/pipeline/execute`](https://x402-agent-suite-production.up.railway.app/api/pipeline/execute) | **$0.25** | Multi-step orchestration + marketplace pick |

Spend-governor, identity-gate, and risk-gate are **included inside guard/proxy** — use them separately only for advanced debugging.

### 3-line integration (copy-paste)

```typescript
// 1) Preflight
const pre = await x402Fetch(`${BASE}/api/x402/proxy`, { method: "POST", body: JSON.stringify({ agentId, walletAddress, targetUrl, estimatedCostUsdc: 0.05, policy }) });
if (!(await pre.json()).allowed) throw new Error("blocked");
// 2) x402_check → x402_fetch(targetUrl)
// 3) POST /api/receipt-auditor/verify
```

Helper: [`packages/x402-preflight`](packages/x402-preflight/README.md)

---

## Killer seller / buyer tools

| Endpoint | Price |
|----------|-------|
| `POST /api/market/buy-advisor` | $0.08 — rank marketplace APIs before you pay |
| `POST /api/seller/audition-coach` | $0.06 — fix OpenAPI/402 issues before Dexter audition |

---

## Advanced (19 routes)

MPP sessions, attestation registry, router, facilitator failover, receipt auditor, escrow, quality monitor, etc. Full list: `GET /` or `GET /openapi.json`.

---

## Discovery (do not register `/health` on x402scan)

| URL | Purpose |
|-----|---------|
| `GET /openapi.json` | AgentCash / x402scan OpenAPI |
| `GET /.well-known/x402` | 24 paid resource URLs |
| `GET /x402/api/services.json` | Bazaar manifest |

Register: [x402scan.com/resources/register](https://www.x402scan.com/resources/register)

---

## Test & score

```bash
npm run probe:production    # unpaid 402 + discovery sync
npm run demo                # paid calls (needs .env payer keys)
# POST /api/seller/audition-coach on production origin
npm run audition:x402gle    # Dexter full ingest (cooldown may apply)
```

Target: **≥75** Dexter score per resource — see [docs/DEXTER-SCORE.md](docs/DEXTER-SCORE.md).

---

## Docs

| Doc | Topic |
|-----|--------|
| [INTEGRATE.md](docs/INTEGRATE.md) | Fleet flow, attestation, 3-line rule |
| [MARKETPLACES.md](docs/MARKETPLACES.md) | Dexter + x402scan + Agentic checklist |
| [DEXTER-SCORE.md](docs/DEXTER-SCORE.md) | Verification 75+ |
| [AGENTIC-MARKET.md](docs/AGENTIC-MARKET.md) | Agentic listing |
| [AUDIT-TABLE.md](docs/AUDIT-TABLE.md) | Route audit template |

---

## Multi-chain (Agentic / Base-first)

```env
NETWORKS=base,solana
PAY_TO_ADDRESS=YourSolanaWallet
PAY_TO_EVM=0xYourEvmWallet
FACILITATOR_URL=https://x402.dexter.cash
```

---

## Quick start

```bash
git clone https://github.com/mimranchohan/x402-agent-suite.git
cd x402-agent-suite
cp .env.example .env
npm install
npm run dev
```

MIT
