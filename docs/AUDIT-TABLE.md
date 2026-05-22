# Route audit table (update after `npm run probe:production`)

**Origin:** https://x402-agent-suite-production.up.railway.app  
**Updated:** run locally and paste `scripts/probe-production-result.json` routes section

| Route | Price | Dexter score (est.) | Dexter listed | x402scan | Agentic | Issue | Fix |
|-------|-------|---------------------|---------------|----------|---------|-------|-----|
| POST /api/market/buy-advisor | $0.08 | — | manual Verify | register | validate | new route | demo ×3 |
| POST /api/seller/audition-coach | $0.06 | — | manual Verify | register | — | new route | demo ×3 |
| POST /api/x402/proxy | $0.08 | | ✓ | ✓ | ✓ | | verify-examples |
| POST /api/guard/pre-x402 | $0.05 | | ✓ | ✓ | ✓ | | overlap → guard docs |
| POST /api/pipeline/execute | $0.25 | | ✓ | ✓ | ✓ | | |
| POST /api/mpp/session | $0.03 | | ✓ | ✓ | | | |
| POST /api/attestation/issue | $0.04 | | ✓ | ✓ | | | |
| POST /api/attestation/verify | $0.02 | | ✓ | ✓ | | probe id | fixed synthetic pass |
| GET /api/attestation/registry | $0.02 | | ✓ | ✓ | | GET probe | |
| POST /api/payment-intent/compile | $0.15 | | ✓ | ✓ | | | |
| POST /api/facilitator/failover | $0.05 | | ✓ | ✓ | | | |
| POST /api/mpp/session-plan | $0.02 | | ✓ | ✓ | | | |
| POST /api/spend-governor/check | $0.03 | | ✓ | ✓ | | sub-step of guard | docs only |
| POST /api/identity-gate/check | $0.05 | | ✓ | ✓ | | sub-step of guard | docs only |
| POST /api/risk-gate/scan | $0.08 | | ✓ | ✓ | | sub-step of guard | docs only |
| POST /api/router/route | $0.02 | | ✓ | ✓ | | | |
| POST /api/research/brief | $0.20 | | ✓ | ✓ | | | |
| POST /api/receipt-auditor/verify | $0.05 | | ✓ | ✓ | | | fleet step 3 |
| POST /api/refund-arbiter/evaluate | $0.08 | | ✓ | ✓ | | | |
| POST /api/budget-allocator/run | $0.03 | | ✓ | ✓ | | | |
| POST /api/settlement-graph/next | $0.02 | | ✓ | ✓ | | | |
| POST /api/quality-monitor/probe | $0.03 | | ✓ | ✓ | | | |
| POST /api/evidence-locker/export | $0.10 | | ✓ | ✓ | | | |
| POST /api/agent-escrow | $0.12 | | ✓ | ✓ | | | |

**Not listed:** `GET /health` (free)

## Manual UI (every release)

1. Dexter Verify Now: https://dexter.cash/sellers/9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt  
2. x402scan: https://www.x402scan.com/resources/register  
3. x402gle Test now: https://x402gle.com/servers/x402-agent-suite-production.up.railway.app  
