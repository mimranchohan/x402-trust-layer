# X Posts — All 31 Endpoints

Each post includes a branded card image in `public/social/cards/`.

Copy the text block, attach the matching `.svg` (export as PNG from browser if needed).

---

## 1. x402 Proxy

**Image:** `public/social/cards/x402-proxy.svg`  
**Tier:** Entry & Gateway · **Price:** $0.08/call

```
x402 Proxy — $0.08/call

All-in-one preflight before any external x402 payment — policy, identity, risk, security grade and optional attestation.

POST /api/x402/proxy
Layer: guard

Why: Replaces 3–4 separate gate calls in one purchase. Default guard for agent fleets.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/x402/proxy

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 2. Pre-x402 Guard

**Image:** `public/social/cards/pre-x402-guard.svg`  
**Tier:** Entry & Gateway · **Price:** $0.05/call

```
Pre-x402 Guard — $0.05/call

Spend governor + identity gate + risk gate in one lightweight call.

POST /api/guard/pre-x402
Layer: guard

Why: Cheapest allow/deny decision for high-frequency payment loops.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/guard/pre-x402

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 3. Pipeline Execute

**Image:** `public/social/cards/pipeline-execute.svg`  
**Tier:** Entry & Gateway · **Price:** $0.25/call

```
Pipeline Execute — $0.25/call

One-shot orchestration: guard, NL plan, facilitator routing and marketplace pick.

POST /api/pipeline/execute
Layer: guard

Why: Turns a natural-language task and budget into an executed, audited flow.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/pipeline/execute

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 4. Market Buy-Advisor

**Image:** `public/social/cards/market-buy-advisor.svg`  
**Tier:** Marketplace · **Price:** $0.08/call

```
Market Buy-Advisor — $0.08/call

Jupiter-style buy quote — ranks paid APIs for an intent with policy and MPP advice.

POST /api/market/buy-advisor
Layer: guard

Why: Stops agents overpaying or buying from low-quality marketplace hosts.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/market/buy-advisor

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 5. Seller Audition Coach

**Image:** `public/social/cards/seller-audition-coach.svg`  
**Tier:** Marketplace · **Price:** $0.06/call

```
Seller Audition Coach — $0.06/call

Pre-listing QA: audits OpenAPI, discovery manifests and 402 probes.

POST /api/seller/audition-coach
Layer: guard

Why: Raises verification score before Dexter/x402gle ingest (target ≥75).

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/seller/audition-coach

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 6. Payment-Intent Compiler

**Image:** `public/social/cards/payment-intent-compile.svg`  
**Tier:** Orchestration · **Price:** $0.15/call

```
Payment-Intent Compiler — $0.15/call

Compiles natural-language task + budget into a multi-step x402 execution plan.

POST /api/payment-intent/compile
Layer: settlement

Why: Deterministic planning layer for autonomous spend within budget.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/payment-intent/compile

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 7. Facilitator Failover

**Image:** `public/social/cards/facilitator-failover.svg`  
**Tier:** Orchestration · **Price:** $0.05/call

```
Facilitator Failover — $0.05/call

Ranks x402 facilitators and recommends a healthy failover route.

POST /api/facilitator/failover
Layer: settlement

Why: Avoids settlement failures when a facilitator degrades.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/facilitator/failover

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 8. MPP Session Plan

**Image:** `public/social/cards/mpp-session-plan.svg`  
**Tier:** Orchestration · **Price:** $0.02/call

```
MPP Session Plan — $0.02/call

Estimates MPP batch session savings vs per-call settlement.

POST /api/mpp/session-plan
Layer: settlement

Why: Quantifies when Stripe MPP / Dexter sessions beat individual settlements.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/mpp/session-plan

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 9. MPP Session

**Image:** `public/social/cards/mpp-session.svg`  
**Tier:** Orchestration · **Price:** $0.03/call

```
MPP Session — $0.03/call

MPP session lifecycle: open, voucher, close — batch settlement on Base/Solana.

POST /api/mpp/session
Layer: settlement

Why: Cuts per-call settlement cost for high-frequency agent workloads.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/mpp/session

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 10. Spend Governor

**Image:** `public/social/cards/spend-governor.svg`  
**Tier:** Core Gates · **Price:** $0.03/call

```
Spend Governor — $0.03/call

Enforces per-call and daily USDC spend caps per agent.

POST /api/spend-governor/check
Layer: guard

Why: Hard budget guardrail — the floor of every preflight decision.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/spend-governor/check

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 11. Identity Gate

**Image:** `public/social/cards/identity-gate.svg`  
**Tier:** Core Gates · **Price:** $0.05/call

```
Identity Gate — $0.05/call

Wallet identity tier and risk scoring before paid calls.

POST /api/identity-gate/check
Layer: guard

Why: Blocks low-trust or unfunded wallets from mainnet spend.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/identity-gate/check

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 12. Risk Gate

**Image:** `public/social/cards/risk-gate.svg`  
**Tier:** Core Gates · **Price:** $0.08/call

```
Risk Gate — $0.08/call

Probes URL safety, HTTPS and x402 payment requirements.

POST /api/risk-gate/scan
Layer: guard

Why: Detects unreachable, mispriced or unsafe endpoints before payment.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/risk-gate/scan

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 13. API Router

**Image:** `public/social/cards/router.svg`  
**Tier:** Core Gates · **Price:** $0.02/call

```
API Router — $0.02/call

Routes capability queries to the best verified x402 marketplace API.

POST /api/router/route
Layer: guard

Why: Capability-based routing instead of hard-coded endpoints.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/router/route

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 14. Research Brief

**Image:** `public/social/cards/research-brief.svg`  
**Tier:** Core Gates · **Price:** $0.20/call

```
Research Brief — $0.20/call

Builds a paid-API research pipeline and cost estimate for any topic.

POST /api/research/brief
Layer: guard

Why: Turns a research goal into a concrete, budgeted API plan.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/research/brief

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 15. Receipt Auditor

**Image:** `public/social/cards/receipt-auditor.svg`  
**Tier:** Core Gates · **Price:** $0.05/call

```
Receipt Auditor — $0.05/call

Verifies x402 settlement receipts and on-chain transaction alignment.

POST /api/receipt-auditor/verify
Layer: settlement

Why: Proof that payment settled for the correct amount on-chain.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/receipt-auditor/verify

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 16. Attestation Issue

**Image:** `public/social/cards/attestation-issue.svg`  
**Tier:** Attestation · **Price:** $0.04/call

```
Attestation Issue — $0.04/call

Issues HMAC-signed preflight attestation for partner agent networks.

POST /api/attestation/issue
Layer: attestation

Why: Gate partner interactions on verifiable credential status.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/attestation/issue

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 17. Attestation Verify

**Image:** `public/social/cards/attestation-verify.svg`  
**Tier:** Attestation · **Price:** $0.02/call

```
Attestation Verify — $0.02/call

Verifies attestation signature, expiry and registry lookup.

POST /api/attestation/verify
Layer: attestation

Why: Confirm a partner attestation before trusting their response.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/attestation/verify

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 18. Attestation Registry

**Image:** `public/social/cards/attestation-registry.svg`  
**Tier:** Attestation · **Price:** $0.02/call

```
Attestation Registry — $0.02/call

Query trust registry of valid agent attestations.

GET /api/attestation/registry
Layer: attestation

Why: Fleet controllers reject paid calls without valid X-Suite-Attestation.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/attestation/registry

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 19. Refund Arbiter

**Image:** `public/social/cards/refund-arbiter.svg`  
**Tier:** Trust · **Price:** $0.08/call

```
Refund Arbiter — $0.08/call

Evaluates buyer refund eligibility from verification signals.

POST /api/refund-arbiter/evaluate
Layer: compliance

Why: Programmatic refund decisions when an API underdelivers.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/refund-arbiter/evaluate

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 20. Settlement Graph

**Image:** `public/social/cards/settlement-graph.svg`  
**Tier:** Intelligence · **Price:** $0.02/call

```
Settlement Graph — $0.02/call

Recommends next paid APIs to call after a settlement receipt.

POST /api/settlement-graph/next
Layer: settlement

Why: Drives multi-step agent journeys and reduces search steps.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/settlement-graph/next

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 21. Quality Monitor

**Image:** `public/social/cards/quality-monitor.svg`  
**Tier:** Intelligence · **Price:** $0.03/call

```
Quality Monitor — $0.03/call

Regression-probes up to 10 x402 endpoints and returns quality scores.

POST /api/quality-monitor/probe
Layer: guard

Why: Continuous SLA monitoring of a fleet's API dependencies.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/quality-monitor/probe

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 22. Budget Allocator

**Image:** `public/social/cards/budget-allocator.svg`  
**Tier:** Enterprise · **Price:** $0.03/call

```
Budget Allocator — $0.03/call

Allocates shared USDC pool across agent fleet by priority.

POST /api/budget-allocator/run
Layer: guard

Why: Fair, priority-weighted budget distribution at fleet scale.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/budget-allocator/run

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 23. Evidence Locker

**Image:** `public/social/cards/evidence-locker.svg`  
**Tier:** Enterprise · **Price:** $0.10/call

```
Evidence Locker — $0.10/call

Exports tamper-evident compliance bundles for x402 settlements.

POST /api/evidence-locker/export
Layer: compliance

Why: Audit-grade evidence export for finance and security review.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/evidence-locker/export

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 24. Agent Escrow

**Image:** `public/social/cards/agent-escrow.svg`  
**Tier:** Enterprise · **Price:** $0.12/call

```
Agent Escrow — $0.12/call

Create, status or release agent-to-agent USDC escrow records.

POST /api/agent-escrow
Layer: settlement

Why: Conditional payment between agents — release on verified condition.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/agent-escrow

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 25. Merchant Trust (KYM)

**Image:** `public/social/cards/merchant-trust.svg`  
**Tier:** Tier-1 Enterprise · **Price:** $0.06/call

```
Merchant Trust (KYM) — $0.06/call

Know-Your-Merchant trust score with wash-trading and verification signals.

POST /api/merchant-trust/score
Layer: guard

Why: Only public KYM oracle — pay / caution / avoid before any merchant payment.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/merchant-trust/score

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 26. Mandate Compile

**Image:** `public/social/cards/mandate-compile.svg`  
**Tier:** Tier-1 Enterprise · **Price:** $0.08/call

```
Mandate Compile — $0.08/call

Compiles AP2-style signed payment mandate from human intent and guardrails.

POST /api/mandate/compile
Layer: attestation

Why: Tamper-resistant intent → execution audit trail for Visa CLI / AP2 fleets.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/mandate/compile

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 27. Mandate Verify

**Image:** `public/social/cards/mandate-verify.svg`  
**Tier:** Tier-1 Enterprise · **Price:** $0.02/call

```
Mandate Verify — $0.02/call

Verifies mandate signature and scopes a proposed payment against it.

POST /api/mandate/verify
Layer: attestation

Why: Merchants confirm agent payment is within authorized human intent.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/mandate/verify

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 28. Rail Optimizer

**Image:** `public/social/cards/rail-optimizer.svg`  
**Tier:** Tier-1 Enterprise · **Price:** $0.04/call

```
Rail Optimizer — $0.04/call

Picks best rail: Visa CLI, Stripe MPP, Circle, Base x402 or Solana x402.

POST /api/rail-optimizer/route
Layer: settlement

Why: Unifies card and stablecoin rails in one cost + protection decision.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/rail-optimizer/route

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 29. Compliance Ledger

**Image:** `public/social/cards/compliance-ledger.svg`  
**Tier:** Tier-1 Enterprise · **Price:** $0.12/call

```
Compliance Ledger — $0.12/call

SOC2/tax-ready spend reconciliation with policy flags and tamper hash.

POST /api/compliance/ledger
Layer: compliance

Why: CFO-grade audit trail for autonomous agent spend at enterprise scale.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/compliance/ledger

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 30. Dispute Resolver

**Image:** `public/social/cards/dispute-resolve.svg`  
**Tier:** Tier-1 Enterprise · **Price:** $0.10/call

```
Dispute Resolver — $0.10/call

Visa chargeback dossier or on-chain refund claim builder.

POST /api/dispute/resolve
Layer: compliance

Why: Automates dispute filing for Visa CLI and refund routes for stablecoin rails.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/dispute/resolve

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```

---

## 31. Quality Escrow

**Image:** `public/social/cards/quality-escrow.svg`  
**Tier:** Tier-1 Enterprise · **Price:** $0.10/call

```
Quality Escrow — $0.10/call

Quality-gated escrow — release on pass, auto-refund on response mismatch.

POST /api/quality-escrow/settle
Layer: settlement

Why: Closes trust gap on final stablecoin settlements with no chargeback recourse.

No API keys. Pay with USDC on Base or Solana.

https://x402trustlayer.xyz/api/quality-escrow/settle

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
```
