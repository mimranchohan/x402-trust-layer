# Route audit table

**Origin:** https://x402-agent-suite-production.up.railway.app  
**Suite version:** 3.1.0  
**Update:** `npm run probe:production` → `scripts/probe-production-result.json`

## Security posture (v3.1)

| Control | Status |
|---------|--------|
| SSRF deny-before-fetch | ✅ `lib/ssrf.ts` |
| Attestation HMAC secret | ✅ requires `ATTESTATION_HMAC_SECRET` in prod |
| Rate limit `/api/*` | ✅ 120/min/IP default |
| OpenAPI paid paths only | ✅ 24 paths (no free routes in `paths`) |
| Verifier probe backdoor | ⚠️ gated `ALLOW_VERIFIER_PROBE_IDS=1` |
| MPP/escrow payer binding | ⏳ roadmap P2 |

## Routes

| Route | Price | Security | Dexter | x402scan | Notes |
|-------|-------|----------|--------|----------|-------|
| POST /api/market/buy-advisor | $0.08 | SSRF safe | Verify | register | buyer entry |
| POST /api/seller/audition-coach | $0.06 | SSRF safe | Verify | register | seller QA |
| POST /api/x402/proxy | $0.08 | SSRF safe | ✓ | ✓ | primary entry |
| POST /api/guard/pre-x402 | $0.05 | SSRF safe | ✓ | ✓ | light guard |
| POST /api/pipeline/execute | $0.25 | SSRF safe | ✓ | ✓ | orchestration |
| POST /api/mpp/session | $0.03 | state in-memory | ✓ | ✓ | |
| POST /api/attestation/issue | $0.04 | HMAC signed | ✓ | ✓ | |
| POST /api/attestation/verify | $0.02 | HMAC verify | ✓ | ✓ | probe gated |
| GET /api/attestation/registry | $0.02 | limit ≤100 | ✓ | ✓ | |
| POST /api/payment-intent/compile | $0.15 | — | ✓ | ✓ | |
| POST /api/facilitator/failover | $0.05 | SSRF safe | ✓ | ✓ | |
| POST /api/mpp/session-plan | $0.02 | — | ✓ | ✓ | |
| POST /api/spend-governor/check | $0.03 | host policy | ✓ | ✓ | |
| POST /api/identity-gate/check | $0.05 | heuristic | ✓ | ✓ | |
| POST /api/risk-gate/scan | $0.08 | SSRF safe | ✓ | ✓ | |
| POST /api/router/route | $0.02 | — | ✓ | ✓ | |
| POST /api/research/brief | $0.20 | — | ✓ | ✓ | |
| POST /api/receipt-auditor/verify | $0.05 | Solana fail-closed | ✓ | ✓ | |
| POST /api/refund-arbiter/evaluate | $0.08 | — | ✓ | ✓ | |
| POST /api/budget-allocator/run | $0.03 | — | ✓ | ✓ | |
| POST /api/settlement-graph/next | $0.02 | — | ✓ | ✓ | |
| POST /api/quality-monitor/probe | $0.03 | SSRF safe | ✓ | ✓ | |
| POST /api/evidence-locker/export | $0.10 | — | ✓ | ✓ | |
| POST /api/agent-escrow | $0.12 | in-memory | ✓ | ✓ | |

**Free (not in OpenAPI paths):** `GET /health`, `GET /.well-known/x402`

## Release checklist

1. [Deploy checklist](./DEPLOY-CHECKLIST.md)
2. [Security](./SECURITY.md)
3. [Roadmap](./ROADMAP.md)
4. Dexter: https://dexter.cash/sellers/9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt
5. x402scan: https://www.x402scan.com/resources/register
