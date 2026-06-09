# Why Use the x402 Agent Suite? (All 20+ Agents)

## The problem

AI agents pay for APIs via x402, but most fleets have **no standard**:

- Budget enforcement before payment
- URL / host risk checks
- Wallet identity tiers
- Receipt verification after settlement
- MPP batch savings for high call volume

Each team rebuilds the same glue code. That is slow, insecure, and expensive.

## What this suite provides

| Layer | Agents | Why pay |
|-------|--------|---------|
| **Killer (v3)** | `x402/proxy`, `mpp/session`, `attestation/*` | One call instead of many; trust + batch savings |
| **Bundle** | `guard/pre-x402`, `pipeline/execute` | Cheapest path for standard fleets |
| **Core** | spend, identity, risk, router, research, receipt | Fine-grained control |
| **Trust** | refund arbiter, settlement graph | Post-payment intelligence |
| **Enterprise** | escrow, evidence locker, budget allocator | Compliance and fleet ops |

## Who should use which endpoint

### Every agent fleet (minimum)

1. **`POST /api/guard/pre-x402`** ($0.05) — before every external `x402_fetch`
2. **`POST /api/receipt-auditor/verify`** ($0.05) — after settlement

### High-volume fleets (10+ calls / session)

3. **`POST /api/mpp/session`** ($0.03) — open → voucher → close for Dexter MPP savings

### Partner / marketplace networks

4. **`POST /api/attestation/issue`** + **`POST /api/attestation/verify`** — require `X-Suite-Attestation` header between agents

### One integration, maximum value

5. **`POST /api/x402/proxy`** ($0.08) — guard + security grade + attestation + probe in **one payment**

### Complex tasks

6. **`POST /api/pipeline/execute`** ($0.25) — plan + guard + facilitator + marketplace routing

## Why not only use free checks?

- **Probe-only** tools do not enforce your budget or identity policy
- **Marketplace search** does not block malicious hosts
- **This suite** returns structured decisions agents can act on (`allowed`, `securityGrade`, `attestationId`)

## Adoption model (honest)

No protocol forces other agents to call you. They adopt because:

1. **Cheaper** than 3–6 separate paid calls
2. **Safer** than skipping preflight
3. **MPP math** saves real USDC on batches
4. **Attestations** enable trust networks between agents

See [INTEGRATE.md](./INTEGRATE.md) and [MARKETPLACES.md](./MARKETPLACES.md).
