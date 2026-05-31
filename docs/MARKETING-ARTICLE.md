# x402 Agent Suite Pro — Trust Infrastructure for AI Agent Payments

**Production:** https://x402trustlayer.xyz  
**OpenAPI:** https://x402trustlayer.xyz/openapi.json  
**Discovery:** https://x402trustlayer.xyz/x402/api/discover  
**Version:** 3.1.0 · Base + Solana USDC · Dexter facilitator

---

## The problem

AI agents are starting to pay for APIs with **x402** (HTTP 402 + USDC micropayments). Most sellers ship a single paid endpoint. Buyers have no standard way to:

1. **Preflight** spend policy and URL risk before paying  
2. **Prove** trust with a signed attestation other agents can verify  
3. **Audit** receipts and **signal refund eligibility** when delivery fails  

**x402 Agent Suite Pro** is pay-per-call infrastructure for that gap—not a wallet, not a marketplace, but the **control plane** around x402 payments.

---

## What we sell (marketing focus — 5 agents)

### 1. x402 Proxy — `$0.08` · `POST /api/x402/proxy`

**Role:** Default preflight in **one payment**.

| Input (summary) | Output (summary) |
|-----------------|------------------|
| `agentId`, `walletAddress`, `targetUrl`, `estimatedCostUsdc`, `policy` | Guard result, security grade, risk score, optional **attestation issue** |
| Optional: `downstreamMethod`, `issueAttestation`, `preferredChain` | Replaces separate spend + identity + risk calls (~$0.16 → $0.08) |

**Best for:** Any agent about to call a third-party x402 API.

---

### 2. Pipeline Execute — `$0.25` · `POST /api/pipeline/execute`

**Role:** Full orchestration for multi-step agent tasks.

| Input (summary) | Output (summary) |
|-----------------|------------------|
| Guard body + optional `task`, `marketplaceQuery`, `maxBudgetUsdc` | Guard, optional NL plan, facilitator ranking, marketplace pick |
| Optional settlement context | One JSON plan for the next paid hops |

**Best for:** Fleet orchestrators that want **one receipt** instead of 4–5 suite calls.

---

### 3. Attestation Verify — `$0.02` · `POST /api/attestation/verify`

**Role:** Verify HMAC attestation before downstream payment.  
**x402gle quality signal:** **82**

| Input | Output |
|-------|--------|
| `attestationId` | `valid`, `reason`, expiry, grade metadata |

**Best for:** Partner networks that require “signed preflight” proof.

---

### 4. Attestation Registry — `$0.02` · `GET /api/attestation/registry`

**Role:** Fleet-wide trust lookup (real GET JSON).  
**x402gle quality signal:** **78**

| Query | Output |
|-------|--------|
| `minGrade`, `agentId`, `limit` | List of active attestations |

**Best for:** Dashboards, policy engines, verifier crawlers.

---

### 5. Refund Arbiter — `$0.08` · `POST /api/refund-arbiter/evaluate`

**Role:** Buyer protection signals after a paid call disappoints.  
**x402gle quality signal:** **86**

| Input | Output |
|-------|--------|
| `verificationScore`, `responseEmpty`, `responseGeneric`, amount fields | Refund recommendation + rationale |

**Best for:** Marketplaces and agents building **refund policy** without custody.

---

## Trust Pack narrative (under `$0.12` for the three trust APIs)

```text
Issue attestation (optional via Proxy) → Pay downstream x402 API → Verify receipt → Refund arbiter if delivery failed
```

| Step | Endpoint | Price |
|------|----------|-------|
| Preflight + issue | Proxy or `POST /api/attestation/issue` | $0.08 or $0.04 |
| Verify | `POST /api/attestation/verify` | $0.02 |
| Fleet view | `GET /api/attestation/registry` | $0.02 |
| Dispute signal | `POST /api/refund-arbiter/evaluate` | $0.08 |

---

## How payment works (every route)

1. Unpaid request → **402** + `PAYMENT-REQUIRED` (USDC on Solana or Base)  
2. Client signs via **Dexter** (`https://x402.dexter.cash`)  
3. Retry with payment header → **200** + agent JSON + settlement receipt  

**Receive addresses** (published on `/health` and discovery)—never use these as demo payer wallets.

---

## Data & privacy (honest positioning)

| Stored server-side | Not stored |
|--------------------|------------|
| Last 500 attestations (`data/attestations.json`) | Full downstream API responses |
| Spend estimates by `agentId` + day | Payment private keys |
| Last 200 MPP sessions, escrow planning records | Evidence locker bundles (echo only) |
| Rate-limit counters (RAM, ~1 min) | Marketplace search cache |

Payments settle **on-chain** to suite receive wallets; verification via Dexter facilitator. Railway disk is **ephemeral** unless you attach a volume—treat registry as **operational cache**, not legal archive, until Postgres.

---

## Who should integrate

- **Agent frameworks** — hook Proxy before every x402 `fetch`  
- **Marketplaces** — list Trust Pack + Refund Arbiter for buyer confidence  
- **Sellers** — run Attestation Issue so buyers can Verify before pay  
- **Fleet ops** — Pipeline Execute for governed multi-hop spend  

---

## Discovery & listings

| Platform | Action |
|----------|--------|
| Dexter | Seller profile + Bazaar |
| x402scan | Register `openapi.json` |
| Agentic | Validate top 5 URLs |
| x402gle | Re-test after paid GET fix |

---

## CTA

```bash
# Probe unpaid 402
curl https://x402trustlayer.xyz/api/x402/proxy

# Full discovery
curl https://x402trustlayer.xyz/x402/api/discover
```

**GitHub:** https://github.com/mimranchohan/x402-agent-suite  
**Author:** Mimran Chohan · MIT License

---

*24 paid routes ship in production; this article focuses on the five highest-signal agents for go-to-market. Hero preflight (Proxy + Pipeline) drives adoption; Trust Pack (Verify + Registry + Refund) drives credibility.*
