# x402 Agent Suite Pro

**15 paid x402 APIs** for production AI agent fleets — orchestration, trust, routing, audit, and enterprise controls. All endpoints settle in USDC via the [Dexter facilitator](https://x402.dexter.cash).

**Live:** https://x402-agent-suite-production.up.railway.app

## Agents

### Orchestration
| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /api/payment-intent/compile` | $0.15 | NL task → multi-step execution plan |
| `POST /api/facilitator/failover` | $0.05 | Multi-facilitator health + routing |
| `POST /api/mpp/session-plan` | $0.02 | MPP batch settlement estimator |

### Core pipeline
| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /api/spend-governor/check` | $0.03 | Budget / policy enforcement |
| `POST /api/identity-gate/check` | $0.05 | Wallet risk tier |
| `POST /api/risk-gate/scan` | $0.08 | Pre-call URL risk probe |
| `POST /api/router/route` | $0.02 | Marketplace API selection |
| `POST /api/research/brief` | $0.20 | Research pipeline builder |
| `POST /api/receipt-auditor/verify` | $0.05 | Settlement verification |

### Trust & intelligence
| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /api/refund-arbiter/evaluate` | $0.08 | Refund eligibility |
| `POST /api/settlement-graph/next` | $0.02 | Next-call recommendations |
| `POST /api/quality-monitor/probe` | $0.03 | Endpoint regression scores |

### Enterprise
| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /api/budget-allocator/run` | $0.03 | Fleet budget allocation |
| `POST /api/evidence-locker/export` | $0.10 | Compliance audit export |
| `POST /api/agent-escrow` | $0.12 | Agent-to-agent escrow |

**Free metadata:** `GET /api/pipeline/full` — recommended call order.

## Full pipeline

```
payment-intent/compile
  → spend-governor
  → identity-gate
  → risk-gate
  → facilitator/failover
  → router/route
  → (downstream x402 API)
  → receipt-auditor
  → settlement-graph/next
  → refund-arbiter (if needed)
```

## Quick start

```bash
git clone https://github.com/mimranchohan/x402-agent-suite.git
cd x402-agent-suite
cp .env.example .env
npm install
npm run dev
```

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `PAY_TO_ADDRESS` | Yes | USDC receive wallet |
| `NETWORK` | Yes | `solana` or `base` |
| `PUBLIC_BASE_URL` | Deploy | Public HTTPS URL |
| `SOLANA_PRIVATE_KEY` | Demo | Local payer only — never commit |

## Demo (production)

```bash
# .env
PUBLIC_BASE_URL=https://x402-agent-suite-production.up.railway.app
npm run demo
```

## Deploy

See [DEPLOY.md](./DEPLOY.md). Railway auto-deploys from `main` when connected.

## Marketplace

Endpoints auto-list on [OpenDexter](https://open.dexter.cash/) after real settlements. Claim seller profile at [dexter.cash/sellers](https://dexter.cash/sellers) (use `/seller` dashboard for wallet sign-in).

## License

MIT
