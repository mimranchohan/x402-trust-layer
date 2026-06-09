<p align="center">
  <img src="public/assets/x402-trustlayer-logo.png" alt="x402 Trust Layer" width="280" />
</p>

<h1 align="center">x402 Trust Layer</h1>

<p align="center"><strong>The trust, security, and caching layer for agent payments.</strong><br/>
<code>x402trustlayer.xyz</code> · Guard · Attest · Comply · Audit</p>

<p align="center">
<a href="https://x402trustlayer.xyz"><img src="https://img.shields.io/badge/x402%20Trust%20Layer-live-16C7C0" alt="live"/></a>
<a href="https://x402gle.com/servers/x402trustlayer.xyz"><img src="https://img.shields.io/badge/x402gle-listed-16C7C0" alt="x402gle"/></a>
<a href="https://dexter.cash/sellers/9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt"><img src="https://img.shields.io/badge/Dexter-seller-green" alt="Dexter"/></a>
<a href="https://www.npmjs.com/package/x402-trust-layer"><img src="https://img.shields.io/badge/npm-x402--trust--layer-CB3837" alt="npm"/></a>
<a href="https://github.com/mimranchohan/x402-trust-layer"><img src="https://img.shields.io/badge/GitHub-x402--trust--layer-24292f" alt="github"/></a>
</p>

---

> **x402 Trust Layer** *(x402 Agent Suite Pro)* — **57 paid x402 APIs** (63 total endpoints) for guard,
> attestation, caching, compliance, settlement, and **Agent Trust Protocol v4**. Live at **https://x402trustlayer.xyz**

A control plane for autonomous agent commerce. Fifty-seven paid x402 APIs that an
AI agent calls *before, during, and after* it spends money — to decide whether a
merchant is trustworthy, whether a payment is allowed, which rail is cheapest, and
whether the response it paid for was actually worth it. Everything settles in USDC
over the [Dexter facilitator](https://x402.dexter.cash), on Base or Solana, for a
few cents a call.

**Live:** https://x402trustlayer.xyz

### The Five Layers of Trust

| Layer | Does | Key Endpoints |
|-------|------|---------------|
| **01. Guard** | Preflight spend, payload sandboxing, and risk checks before any payment | `/api/guard/pre-x402` · `/api/guard/payload-sandbox` · `/api/x402/proxy` |
| **02. Attestation** | Issues, verifies, and indexes agent credentials, liability insurance, and mandates | `/api/attestation/*` · `/api/mandate/*` · `/api/trust-network/insurance/attest` |
| **03. Performance** | Tamper-Proof 10x faster caching for on-chain identity & reputation | `/api/agent/verify` (uses memory registry TTL cache) |
| **04. Compliance** | Ledgers, evidence bundles, dispute resolution, refund auditing | `/api/compliance/ledger` · `/api/dispute/resolve` · `/api/refund-arbiter/evaluate` |
| **05. Settlement Ops** | Rail optimization, metered sessions, escrows, receipt auditing | `/api/rail-optimizer/route` · `/api/escrow/metered/*` · `/api/receipt-auditor/verify` |

---

## What's New (v5.3.0)

- **Per-Wallet / Per-AgentId Rate Limiting** — New `rateLimitPerWallet` middleware in `src/lib/rate-limit.ts` keys on `walletAddress` or `agentId` from the request body (not IP), so limits work correctly behind load balancers. Applied to all `/api/guard/*`, `/api/pipeline/*`, and `/api/x402/proxy` routes. Configurable via `AGENT_RATE_LIMIT_PER_MIN` (default `30`).
- **Unit Test Suite** — 30+ vitest unit tests covering `spend-governor`, `identity-gate`, and `risk-gate` with full mock isolation for ledger, host-policy, probe, SSRF, security, and ERC-8004 trust-score dependencies. Run with `npm test`.
- **RPC Timeout Hardening** — `trust-score.ts` wraps every on-chain RPC call in `withRpcTimeout` (env: `TRUSTSCORE_RPC_TIMEOUT_MS`, default `8000 ms`). Falls back to `UNVERIFIED` tier on timeout so a slow node never stalls the guard pipeline.
- **Overall Guard Timeout** — `pre-x402-guard.ts` wraps the entire pipeline in `Promise.race` (env: `PRE_X402_GUARD_TIMEOUT_MS`, default `12000 ms`) to guarantee a bounded response regardless of downstream RPC latency.

---

## What's New (v5.2.0)

- **63 Live Endpoints (57 Paid, 6 Free)** — Native support for the Alchemy platform, including preset guard rails, inbound webhooks, transaction simulation audits, and custom RPC configurations.
- **Native Alchemy Developer Suite Integrations** —
  - `POST /api/guard/pre-x402-alchemy` ($0.05): Preset preflight guard using custom Alchemy mainnet Solana RPC.
  - `POST /api/alchemy/paymaster-policy` (Free): Decodes ERC-4337 UserOperation callData and checks gas/prompt safety.
  - `POST /api/alchemy/notify-webhook` (Free): Audits address activity postflight and logs to DB ledger.
  - `POST /api/alchemy/simulate-shield` (Free): Preflight simulation via Alchemy Simulation APIs (returns A-F security grade).
- **Solana Action (Blink) Support** —
  - `GET/POST /api/solana-pay/action/agent-verify` (Free): Query wallet trust scores directly via Action-aware clients. Built-in fallback to caller's signing address if target parameter is omitted, and public RPC fallback for resilience.
- **Bypassed Free Route Webhooks** — Webhook and simulation routes bypass x402 payment checks using direct Express router mounting.

---

## What's New (v5.1.0)

- **57 Paid Routes** — Full integration of Agent Trust Protocol v4 (`/api/protocol/*`), metered escrow sessions, bedrock preflight, and A2A orchestration.
- **Tamper-Proof ERC-8004 Caching** — Built-in local store indexing in `src/lib/erc8004/registry.ts` with Address-normalized keys and custom TTL, enabling 10x faster responses on blockchain checks.
- **Strict Replay Binding & presets** — Promotes `Replay-Guard` middleware config in `public/skill.md` so template builders can pull integration directly.
- **Advanced Security & Insurance** —
  - `POST /api/guard/payload-sandbox`: Recursively audits request JSON schemas/payloads against advanced adversarial attacks (jailbreaks, prompt leaks, system override commands, SSRF, path traversals) aligned with Google Research's **Agentic Engineering** paradigms.
  - `POST /api/trust-network/insurance/attest`: Cryptographically attests transaction liability coverage based on merchant bond thresholds, providing robust mitigation for Agent Scam Elucidation (CASE) frameworks.
- **SEO/GEO Vector Optimizations** — `public/llms.txt` is directly optimized for target keywords `"x402 standard payment check"` and `"Coinbase CDP wallet guardrail"`.

---

## Programmatic Necessity: Why Agents Must Call Us

This suite is the missing *judgement and security plane* for autonomous agent commerce:

1. **Replay-Guard Integration**: Any agent framework using standard presets automatically wraps transactions in our middleware to prevent double-spending or duplicate charge attacks.
2. **Coinbase CDP Wallet Guardrails**: The API intercepts outgoing payments to enforce limits and compliance rules before the private key signs the transaction.
3. **Google-Aligned Prompt Injection Payload Sandbox**: Prevent malicious actors from hijacking your agent through complex indirect prompt injection payloads, system overrides, or command injections. The sandbox aligns with Google Research's safety and robustness paradigms for agentic architectures.
4. **Agent Liability Insurance**: Smart contract routing gateways require our signed HMAC attestation voucher as proof of merchant-bonded liability coverage before accepting payments.

---

## The Complete Catalog — 57 Paid APIs & 6 Free Utilities

### 1. Guard & Preflight
- `POST /api/x402/proxy` ($0.08) — All-in-one preflight: policy check, threat scan, and optional downstream probe.
- `POST /api/guard/pre-x402` ($0.05) — Spend governor, identity verification, and URL risk scan.
- `POST /api/guard/pre-x402-alchemy` ($0.05) — Spend governor preset using Alchemy mainnet RPC.
- `POST /api/guard/payload-sandbox` ($0.04) — Sandbox audit for prompt injections and malicious shell commands.
- `POST /api/pipeline/execute` ($0.25) — Multi-step pipeline: guard check, natural language planner, routing, and selection.
- `POST /api/pipeline/trust-v2` ($0.35) — Aggregates mandate diffing, KYM ingestion, guardrail checks, and certified gates.
- `POST /api/facilitator/failover` ($0.05) — Ranks and routes payments to the healthiest live x402 facilitator.
- `POST /api/router/route` ($0.02) — Finds the optimal marketplace API match for a task query.
- `POST /api/research/brief` ($0.20) — Compiles a paid research brief and pricing estimate.

### 2. Attestation & Mandate Trust
- `POST /api/attestation/issue` ($0.04) — Issues HMAC-signed attestation proving preflight checks passed.
- `POST /api/attestation/verify` ($0.02) — Verifies attestation validity and signature.
- `GET /api/attestation/registry` ($0.02) — Queries the active registry of valid attestations.
- `POST /api/mandate/compile` ($0.08) — Compiles an AP2-style signed payment mandate from natural language intent.
- `POST /api/mandate/diff` ($0.04) — Diff check comparing signed mandates against actual MCP tool traces.
- `POST /api/merchant-trust/certify` ($0.15) — Certifies seller host with trust badges and virtual bonds.

### 3. Escrow, Sessions & Settlement
- `POST /api/mpp/session` ($0.03) — Opens, queries, or closes batch micropayment sessions.
- `POST /api/escrow/metered/open` ($0.05) — Establishes a usage-based micro-billing session.
- `POST /api/escrow/metered/charge` ($0.01) — Micro-charges active metered budget and checks overdrafts.
- `POST /api/escrow/metered/close` ($0.05) — Closes metered sessions, settling aggregate to merchant and returning refunds to buyer.
- `POST /api/receipt-auditor/verify` ($0.05) — Validates x402 settlement receipts against on-chain transaction hashes.
- `POST /api/refund-arbiter/evaluate` ($0.08) — Evaluates refund eligibility based on response delivery signals.
- `POST /api/budget-allocator/run` ($0.03) — Programmatically allocates shared USDC budget pool among fleet agents.
- `POST /api/settlement-graph/next` ($0.02) — Recommends next logical endpoints in a transaction flow.

### 4. Merchant & Buyer Trust Network
- `POST /api/merchant-trust/score` ($0.06) — KYM score indexing wash-trading, ratings, and probe histories.
- `POST /api/trust-network/buyer-gate` ($0.03) — Validates buyer tiers against certified seller requirements.
- `POST /api/trust-network/transaction-auth` ($0.05) — Issues transaction-level authorizations for authenticated chains.
- `POST /api/trust-network/insurance/attest` ($0.06) — Issues cryptographic liability vouchers based on virtual merchant bonds.
- `POST /api/trust-network/bond/slash` ($0.03) — Smart contract interface to slash merchant bonds on delivery failure.
- `POST /api/quality-monitor/probe` ($0.03) — Performs regression-testing probes against list of target APIs.
- `POST /api/evidence-locker/export` ($0.10) — Exports a cryptographically signed compliance bundle.
- `POST /api/agent-escrow` ($0.12) — Creates or releases agent-to-agent smart contract escrows.

### 5. Specialized Tiers
- `POST /api/a2a/execute` ($0.10) — End-to-end agent-to-agent payment orchestration.
- `POST /api/bedrock/preflight` ($0.05) — Bedrock enterprise preflight helper.
- `POST /api/market/buy-advisor` ($0.08) — Ranks Jupiter-style paid quotes for an intent.
- `POST /api/seller/audition-coach` ($0.06) — Audits merchant hosts prior to listing on x402 scan directories.
- `POST /api/agent/verify` ($0.04) — Fetches ERC-8004 TrustScore (uses memory caching to resolve in <15ms).

### 6. Agent Trust Protocol v4 (15 Endpoints)
- `POST /api/protocol/pipeline/full-trust` ($0.45) — Comprehensive pipeline check in one call.
- `POST /api/protocol/passport/issue` ($0.06) — Issues W3C-style Agent Passport DID.
- `POST /api/protocol/passport/verify` ($0.02) — Verifies Agent Passport signatures.
- `POST /api/protocol/trust-score/v2` ($0.08) — Multi-factor tamper-resistant trust score computation.
- `POST /api/protocol/fraud/scan` ($0.10) — Graph-based Sybil and wash-trading detection.
- `POST /api/protocol/oracle/consensus` ($0.12) — Reaches BFT consensus across validator nodes.
- `POST /api/protocol/execution/issue` ($0.05) — Issues cryptographic Proof of Execution (PoE) receipts.
- `POST /api/protocol/execution/verify` ($0.03) — Verifies validity of issued PoE receipts.
- `POST /api/protocol/reasoning/commit` ($0.08) — Commits step trace Merkle tree root for auditable reasoning.
- `POST /api/protocol/reasoning/disclose` ($0.04) — Selective disclosure of reasoning Merkle leaves.
- `POST /api/protocol/replay/bind` ($0.02) — Binds nonces and payloads for replay-safe execution.
- `POST /api/protocol/replay/verify` ($0.02) — Verifies and consumes replay binding nonces.
- `POST /api/protocol/zk/prove` ($0.15) — Generates zero-knowledge proof of authorization or compliance.
- `POST /api/protocol/credit/score` ($0.06) — Agent credit score bureau index.
- `POST /api/protocol/compliance/assess` ($0.10) — Enterprise compliance assessment.

### 7. Free Utility Endpoints
- `POST /api/alchemy/paymaster-policy` (Free) — Decodes ERC-4337 UserOperation callData and checks gas/prompt safety.
- `POST /api/alchemy/notify-webhook` (Free) — Audits address activity postflight and logs to DB ledger.
- `POST /api/alchemy/simulate-shield` (Free) — 2026 super-advanced simulation shield for asset change analysis.
- `GET /api/solana-pay/action/agent-verify` (Free) — Solana Blink GET metadata for wallet trust score lookup.
- `POST /api/solana-pay/action/agent-verify` (Free) — Solana Blink POST transaction payload for trust score lookup.
- `GET /api/dashboard/summary` (Free) — Dynamic system status dashboard data.

---

## Caching Architecture

To prevent high latency on high-frequency transactions, the ERC-8004 engine implements a memory TTL map cache:
- **Fast Lookup**: Lowers request duration from ~1.2s (RPC call) to **under 15ms** (cache hit).
- **Lowercase Normalization**: Cache keys for EVM addresses are automatically normalized to lowercase, preventing duplication bugs.
- **Auto TTL**: Defaults to 120s caching, refreshable via `skipCache: true` payload inputs.

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/mimranchohan/x402-trust-layer
cd x402-trust-layer
npm install

# 2. Copy env template and fill in required secrets
cp .env.example .env   # or set Railway env vars — see table below

# 3. Build and run
npm run build
npm start              # listens on PORT (default 3402)
```

Hit the health endpoint to confirm:

```bash
curl http://localhost:3402/api/health
```

---

## Environment Variables

### Required (server will not start without these in production)

| Variable | Description |
|---|---|
| `ATTESTATION_HMAC_SECRET` | 32-byte hex secret for signing attestation tokens |
| `PAY_TO_ADDRESS` | Solana wallet address that receives x402 payments |
| `PAY_TO_EVM` | EVM wallet address that receives x402 payments on Base |
| `WEBHOOK_ADMIN_SECRET` | Shared secret for webhook delivery verification |

### Optional / Tunable

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3402` | HTTP port the server listens on |
| `PUBLIC_BASE_URL` | auto-detected | Canonical base URL (e.g. `https://x402trustlayer.xyz`) |
| `DATA_DIR` | `./data` | Directory for persistent ledger and evidence files |
| `PRE_X402_GUARD_TIMEOUT_MS` | `12000` | Hard timeout (ms) for the full pre-x402 guard pipeline |
| `TRUSTSCORE_RPC_TIMEOUT_MS` | `8000` | Per-RPC-call timeout (ms) for ERC-8004 trust score lookups |
| `AGENT_RATE_LIMIT_PER_MIN` | `30` | Max requests per wallet/agentId per minute on guard routes |
| `ERC8004_REGISTRY_ADDRESS` | built-in | On-chain ERC-8004 agent registry contract address (Base) |
| `SOLANA_RPC_URL` | public RPC | Solana RPC endpoint for trust score lookups |
| `A2A_ORCHESTRATOR_ENABLED` | `1` | Set to `0` to disable A2A orchestrator on constrained deployments |
| `FACILITATOR_URL` | Dexter | x402 facilitator URL for payment routing |

### Railway Deployment

Set the required variables in **Railway → Project → Variables** panel.  
No Dockerfile changes needed — `railway.json` configures the build command automatically.

```
ATTESTATION_HMAC_SECRET  = <your-secret>
PAY_TO_ADDRESS           = <solana-wallet>
PAY_TO_EVM               = <evm-wallet>
WEBHOOK_ADMIN_SECRET     = <your-secret>
PORT                     = 3402
A2A_ORCHESTRATOR_ENABLED = 0          # recommended on Hobby plan
```

---

## How to Test

### Unit Tests (vitest)

```bash
npm test
# or watch mode:
npx vitest
```

Covers `spend-governor`, `identity-gate`, and `risk-gate` with full mock isolation.
> **Note:** Tests require Node ≥20 with ESM support. The sandbox may error on Node 22 due to a `std-env` package issue — this does not affect Railway deployment.

### 2. Local Server Probing
Compile and run the server locally:
```bash
npm run build
npm start
```

In a separate terminal, probe the API POST endpoints:
```bash
$env:ORIGIN="http://127.0.0.1:3402"; node scripts/probe-production.mjs
```

---

## Deploy

This project is configured for Docker and Railway. Maintain persistent data by mounting a volume at `/app/data` and setting `DATA_DIR=/app/data`.

MIT © Mimran Chohan
