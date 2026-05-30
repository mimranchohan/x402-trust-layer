# x402 Agent Suite Pro v3

[![x402](https://img.shields.io/badge/x402-Agent%20Suite-v3-blue)](https://x402-agent-suite-production.up.railway.app)
[![Dexter](https://img.shields.io/badge/Dexter-seller-green)](https://dexter.cash/sellers/9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt)
[![Agentic Market](https://img.shields.io/badge/Agentic.Market-listing-orange)](https://agentic.market/)

**31 paid x402 APIs** for AI agent fleets (24 core + 7 Tier-1 enterprise agents). Settles USDC via [Dexter facilitator](https://x402.dexter.cash).

**Live:** https://x402-agent-suite-production.up.railway.app

## x402gle verified

Recent route auditions (paid, live response scoring):

- `POST /api/pipeline/execute` — **93** pass  
  https://x402gle.com/audition/04540084-c255-44fd-957a-1487eafaa23d
- `POST /api/mpp/session-plan` — **86** pass  
  https://x402gle.com/audition/4e16c507-5c6e-4b9e-96e2-a1cba9732a55
- `POST /api/quality-monitor/probe` — **82** pass  
  https://x402gle.com/audition/fbad6aad-d2f8-4ccb-9684-3f6474c03784

Whole-origin discovery is healthy (`24/24` routes registered from OpenAPI). x402gle whole-server runs mark routes as `pending` while background scoring completes; use per-route audition links above for immediate proof.

**Docs:** [Agent Catalog (all 31 agents)](docs/AGENT-CATALOG.md) · [Architecture](docs/ARCHITECTURE.md) · [Security](docs/SECURITY.md) · [Deploy checklist](docs/DEPLOY-CHECKLIST.md) · [Roadmap](docs/ROADMAP.md) · [Changelog](CHANGELOG.md)

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

## Tier-1 enterprise agents (new)

The control-plane layer for the Visa CLI / AP2 era — trust, verifiable intent, cross-rail routing, compliance, disputes, and quality-gated settlement. Full reference: [docs/AGENT-CATALOG.md](docs/AGENT-CATALOG.md).

| Endpoint | Price | What it solves |
|----------|-------|----------------|
| `POST /api/merchant-trust/score` | $0.06 | Know-Your-Merchant trust + wash-trading score before paying |
| `POST /api/mandate/compile` | $0.08 | Signed, scoped AP2-style payment mandate from intent |
| `POST /api/mandate/verify` | $0.02 | Verify mandate signature + scope a proposed payment |
| `POST /api/rail-optimizer/route` | $0.04 | Best rail across Visa CLI / Stripe MPP / Circle / Base / Solana |
| `POST /api/compliance/ledger` | $0.12 | CFO/SOC2-grade spend reconciliation + policy flags |
| `POST /api/dispute/resolve` | $0.10 | Visa chargeback dossier or on-chain refund claim |
| `POST /api/quality-escrow/settle` | $0.10 | Quality-gated escrow with auto-refund |

---

## Advanced (24 core routes)

MPP sessions, attestation registry, router, facilitator failover, receipt auditor, escrow, quality monitor, etc. Full list: `GET /` or `GET /openapi.json`.

---

## Discovery (do not register `/health` on x402scan)

| URL | Purpose |
|-----|---------|
| `GET /openapi.json` | AgentCash / x402scan OpenAPI |
| `GET /.well-known/x402` | 31 paid resource URLs |
| `GET /x402/api/services.json` | Bazaar manifest |

Register: [x402scan.com/resources/register](https://www.x402scan.com/resources/register)

---

## Test & score

```bash
npm run probe:production    # unpaid 402 + discovery sync
npm run demo                # paid calls — payer keys in .env; restart `npm run dev` after pull (resource URL = request Host)
# POST /api/seller/audition-coach on production origin
npm run audition:x402gle    # Dexter full ingest (cooldown may apply)
```

Target: **≥75** Dexter score per resource — see [docs/DEXTER-SCORE.md](docs/DEXTER-SCORE.md).

---

## Docs

| Doc | Topic |
|-----|--------|
| [AGENT-CATALOG.md](docs/AGENT-CATALOG.md) | Enterprise reference for all 31 agents |
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
