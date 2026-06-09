# x402 Trust Layer — Enterprise marketplace submission (31 endpoints)

**Canonical origin:** https://x402trustlayer.xyz  
**OpenAPI:** https://x402trustlayer.xyz/openapi.json  
**x402gle:** https://x402gle.com/servers/x402trustlayer.xyz  
**x402scan origin ID:** `afedd8dd-8c79-4123-bf7e-56f8c7836a1e`  
**Last registered:** 31/31 on x402scan (OpenAPI-first)

---

## One-line pitch

**x402 Trust Layer** — 31 paid enterprise x402 APIs for agent fleets: preflight guard, KYM merchant trust, AP2 mandates, cross-rail routing, compliance ledgers, disputes, quality escrow, and pipeline orchestration on **Base + Solana USDC** (Dexter facilitator).

---

## x402scan listing blurb (paste)

x402 Trust Layer is enterprise payment infrastructure for autonomous AI agents using HTTP 402 + USDC. Four layers — **Guard → Attestation → Compliance → Settlement Ops** — with 31 paid routes from $0.02–$0.25 per call. Includes Know-Your-Merchant scoring, AP2-style mandate compile/verify, CFO-grade compliance ledger, Visa chargeback dossiers, quality-gated escrow, and one-call pipeline orchestration. Multi-chain: Base + Solana via Dexter. No API keys — payment is the gate.

**Production:** https://x402trustlayer.xyz  
**OpenAPI:** https://x402trustlayer.xyz/openapi.json  
**Discovery:** https://x402trustlayer.xyz/.well-known/x402

---

## x402gle host description (enterprise)

x402 Trust Layer is the trust and compliance middleware for agents that send or receive x402 micropayments. Built for **enterprise agent fleets**, payment ops teams, and marketplace integrators who need structured preflight, attestation, audit trails, and post-settlement dispute workflows — not just raw payment execution.

**When to use:** Gate spend before any paid API call; verify partner agents via attestation registry; compile AP2-style mandates; reconcile fleet spend for SOC2/CFO; resolve disputes and quality-gated escrow after settlement.

**When not to use:** Raw payment settlement (use x402 client + facilitator directly); non-x402 HTTP security scanning; real-time streaming risk monitoring.

**Start here:** `POST /api/x402/proxy` ($0.08) → `POST /api/pipeline/execute` ($0.25) for multi-step flows.

---

## Tier-1 enterprise agents (7 routes)

| Route | Price | Enterprise use |
|-------|-------|----------------|
| `POST /api/merchant-trust/score` | $0.06 | Know-Your-Merchant + wash-trade score before paying unknown hosts |
| `POST /api/mandate/compile` | $0.08 | AP2-style signed payment mandate from human/agent intent |
| `POST /api/mandate/verify` | $0.02 | Verify mandate scope matches proposed payment |
| `POST /api/rail-optimizer/route` | $0.04 | Cross-rail: Visa CLI, Stripe MPP, Circle, Base, Solana |
| `POST /api/compliance/ledger` | $0.12 | Tamper-evident CFO/SOC2 spend reconciliation |
| `POST /api/dispute/resolve` | $0.10 | Visa chargeback dossier or on-chain refund claim |
| `POST /api/quality-escrow/settle` | $0.10 | Quality-gated escrow with auto-refund on bad responses |

---

## Full catalog (31 paid endpoints)

| # | Method | Path | Price | Layer |
|---|--------|------|-------|-------|
| 1 | POST | /api/x402/proxy | $0.08 | Guard |
| 2 | POST | /api/guard/pre-x402 | $0.05 | Guard |
| 3 | POST | /api/risk-gate/scan | $0.08 | Guard |
| 4 | POST | /api/spend-governor/check | $0.03 | Guard |
| 5 | POST | /api/identity-gate/check | $0.05 | Guard |
| 6 | POST | /api/merchant-trust/score | $0.06 | Guard |
| 7 | POST | /api/attestation/issue | $0.04 | Attestation |
| 8 | POST | /api/attestation/verify | $0.02 | Attestation |
| 9 | GET | /api/attestation/registry | $0.02 | Attestation |
| 10 | POST | /api/mandate/compile | $0.08 | Attestation |
| 11 | POST | /api/mandate/verify | $0.02 | Attestation |
| 12 | POST | /api/compliance/ledger | $0.12 | Compliance |
| 13 | POST | /api/evidence-locker/export | $0.10 | Compliance |
| 14 | POST | /api/receipt-auditor/verify | $0.05 | Compliance |
| 15 | POST | /api/refund-arbiter/evaluate | $0.08 | Compliance |
| 16 | POST | /api/dispute/resolve | $0.10 | Compliance |
| 17 | POST | /api/quality-escrow/settle | $0.10 | Compliance |
| 18 | POST | /api/pipeline/execute | $0.25 | Settlement Ops |
| 19 | POST | /api/payment-intent/compile | $0.15 | Settlement Ops |
| 20 | POST | /api/facilitator/failover | $0.05 | Settlement Ops |
| 21 | POST | /api/rail-optimizer/route | $0.04 | Settlement Ops |
| 22 | POST | /api/mpp/session | $0.03 | Settlement Ops |
| 23 | POST | /api/mpp/session-plan | $0.02 | Settlement Ops |
| 24 | POST | /api/router/route | $0.02 | Settlement Ops |
| 25 | POST | /api/settlement-graph/next | $0.02 | Settlement Ops |
| 26 | POST | /api/budget-allocator/run | $0.03 | Settlement Ops |
| 27 | POST | /api/agent-escrow | $0.12 | Settlement Ops |
| 28 | POST | /api/quality-monitor/probe | $0.03 | Settlement Ops |
| 29 | POST | /api/research/brief | $0.20 | Settlement Ops |
| 30 | POST | /api/market/buy-advisor | $0.08 | Settlement Ops |
| 31 | POST | /api/seller/audition-coach | $0.06 | Settlement Ops |

**Free (monitoring only):** `GET /health`, `GET /.well-known/x402` catalog

---

## Re-register commands

```powershell
# x402scan — all 31 from OpenAPI
node scripts/register-x402scan.mjs https://x402trustlayer.xyz

# x402gle — refresh listing + service profiles
npm run audition:x402gle -- https://x402trustlayer.xyz

# x402gle — immediate paid score on one route (example)
npx @dexterai/opendexter audition https://x402trustlayer.xyz/api/pipeline/execute --json
```

---

## Ownership proofs

- Base: `0xD56013Abd05E588f2d025193FCe90416816BDBBC`
- Solana: `9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt`

---

## x402gle quality snapshot (custom domain)

| Route | Score |
|-------|-------|
| Quality Monitor Probe | 96 |
| Agent Escrow | 92 |
| Identity Gate | 92 |
| Attestation Issue | 92 |
| Merchant Trust | 92 |
| Refund Arbiter | 92 |
| Compliance Ledger | 88 |
| Rail Optimizer | 88 |
| Pipeline Execute | 86 |
| MPP Session Plan | 85 |

Routes below 75 (improve via per-route **Test now** on x402gle): Audition Coach (32), MPP Session (32), Buy Advisor (66), x402 Proxy (61), Mandate Verify (52), Quality Escrow (68), Payment Compile (72).
