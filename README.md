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
<img src="https://img.shields.io/badge/version-v5.5.0-blue" alt="v5.5.0"/>
<img src="https://img.shields.io/badge/Stripe-x402%20Compatible-635BFF" alt="Stripe x402"/>
<img src="https://img.shields.io/badge/A2A-v1.2-4285F4" alt="A2A v1.2"/>
<img src="https://img.shields.io/badge/ERC--8004-mainnet-orange" alt="ERC-8004 mainnet"/>
<img src="https://img.shields.io/badge/Wallet%20Sessions-enabled-16C7C0" alt="Wallet Sessions"/>
</p>

---

> **x402 Trust Layer** *(x402 Agent Suite Pro)* — **59 paid x402 APIs** (67 total endpoints) for guard,
> attestation, caching, compliance, settlement, **Wallet Sessions**, and **Agent Trust Protocol v4**. Live at **https://x402trustlayer.xyz**

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
| **03. Performance** | Low-latency in-memory TTL cache for on-chain identity & reputation reads (sub-15 ms cached lookups; configurable TTL) | `/api/agent/verify` (uses memory registry TTL cache) |
| **04. Compliance** | Ledgers, evidence bundles, dispute resolution, refund auditing | `/api/compliance/ledger` · `/api/dispute/resolve` · `/api/refund-arbiter/evaluate` |
| **05. Settlement Ops** | Rail optimization, metered sessions, escrows, receipt auditing | `/api/rail-optimizer/route` · `/api/escrow/metered/*` · `/api/receipt-auditor/verify` |

---

## What's New (v5.5.0)

- **x402 V2 Header Compatibility** — Full [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md) chain ID support (`eip155:8453`, `eip155:137`, `solana:5eykt4...`). The `accepts` array now carries structured multi-stablecoin objects per the x402 V2 spec — compatible with Stripe x402 (Feb 2026), AWS Bedrock AgentCore Payments, and Travala's MCP integration.
- **Wallet Sessions** — Pay **$0.10 USDC** once → receive an HMAC-signed session token → attach `x-session-token` header on subsequent calls to skip per-call settlement. Sessions expire after 24 h (configurable), support `max_calls` caps, and persist in SQLite (`wallet_sessions` table). Four new endpoints: `POST /api/session/create`, `GET /api/session/verify`, `DELETE /api/session/revoke`, `GET /api/session/info`.
- **ERC-8004 Mainnet Live Registry** — Agent identity and reputation registries on Base mainnet (`0x8004A169…` and `0x8004BAa1…`). Joins the [16,500+ verified agents](https://eips.ethereum.org/EIPS/eip-8004) already on-chain since the ERC-8004 ratification (Jan 29, 2026). Responses cached with 120 s TTL for sub-15 ms lookup.
- **A2A v1.2 Signed Agent Cards** — `GET /.well-known/agent.json` now returns an A2A protocol v1.2 agent card signed with `x-agent-card-signature` (HMAC-SHA256). Advertises wallet sessions, ERC-8004 registry, multi-stablecoin `accepts`, and all 59 paid capabilities. Compatible with Azure AI Foundry, Amazon Bedrock, and Google Cloud A2A native integrations.
- **Multi-Stablecoin Fallback** — Full EURC (MiCA/EU compliance), PYUSD (Stripe regulated), and USDT (tertiary) support on Base and Polygon, alongside primary USDC. The `availableStablecoins(chain)` helper and `/api/session/create` accept any of the four coins.
- **x402 Discovery Endpoint** — `GET /.well-known/x402.json` returns a fully-structured x402 V2 discovery manifest: CAIP-2 chain IDs, multi-stablecoin accepts array, wallet session terms, ERC-8004 registry links, and endpoint catalog.

---

## What's New (v5.4.0)

- **Trust Score Webhooks** — `POST /api/webhooks/trust` registers a callback URL; `GET /api/webhooks/list` lists all hooks; `DELETE /api/webhooks/trust/:id` removes one. When any agent's ERC-8004 trust score changes, all matching webhooks receive a signed JSON payload with `walletAddress`, `tier`, `trustScore`, and `previousTier`. Stored in SQLite (`trust_webhooks` table). Configurable via `WEBHOOK_SECRET` env var for HMAC-SHA256 signing.
- **Multi-chain Trust Aggregation** — `POST /api/agent/multichain-trust` accepts a `walletAddress` and optional `chains` array (`base`, `ethereum`, `polygon`, `arbitrum`, `optimism`). Queries ERC-8004 trust scores across all requested chains in parallel and returns an aggregated result with per-chain breakdown, highest tier, weighted composite score, and chain-specific metadata.
- **Agent Reputation History** — `GET /api/agent/:walletAddress/history` returns a paginated ledger of all trust score snapshots for a given wallet, keyed by timestamp. Supports `?limit=` and `?offset=` query params. Each entry includes `tier`, `trustScore`, `chainId`, and `resolutionSource`.
- **Admin Dashboard** — `GET /api/dashboard/summary` returns a JSON snapshot of system health: total agents verified, spend today (USDC), blocked wallets count, active webhooks, and top-5 wallets by spend. Static HTML admin panel served at `GET /admin` with live-refreshing stats cards.
- **Wallet Blocklist** — `POST /api/admin/blocklist` adds a wallet address to the blocklist (body: `{ address, reason?, blockedBy? }`); `DELETE /api/admin/blocklist/:address` removes it; `GET /api/admin/blocklist` lists all entries with pagination. The `walletBlocklistMiddleware()` Express middleware auto-rejects any request carrying a blocked `walletAddress` (header, body, or query) with HTTP 403. Persisted in SQLite (`wallet_blocklist` table).
- **Expanded Test Suite (104 tests)** — Unit tests for all five new subsystems added: `pre-x402-guard`, `spend-governor`, `identity-gate`, `risk-gate`, `payload-sandbox`, `wallet-blocklist`, `webhooks`, `trust-score`, `ssrf`, `replay-guard`, `semantic-judge`, and `alchemy-policy`. All pass with zero unhandled rejections.

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
- **ERC-8004 Read Caching** — Built-in in-memory store in `src/lib/erc8004/registry.ts` with address-normalized keys and configurable TTL. Cached reads return in sub-15 ms versus a fresh on-chain RPC round-trip; source of truth remains the on-chain registry (cache is a read accelerator, not a trust anchor).
- **Strict Replay Binding & presets** — Promotes `Replay-Guard` middleware config in `public/skill.md` so template builders can pull integration directly.
- **Advanced Security & Insurance** —
  - `POST /api/guard/payload-sandbox`: Recursively audits request JSON schemas/payloads against common adversarial patterns — prompt-injection / jailbreak strings, system-override commands, SSRF targets, and path traversals — using heuristic detectors. (Pattern-based screening, not a formal LLM-safety guarantee.)
  - `POST /api/trust-network/insurance/attest`: Issues an HMAC-signed attestation voucher recording a merchant's declared liability-bond threshold, so downstream gateways can require proof of coverage before accepting payment. (Attestation is a signed claim, not an underwritten insurance policy.)
- **SEO/GEO Vector Optimizations** — `public/llms.txt` is directly optimized for target keywords `"x402 standard payment check"` and `"Coinbase CDP wallet guardrail"`.

---

## Programmatic Necessity: Why Agents Must Call Us

This suite is the missing *judgement and security plane* for autonomous agent commerce:

1. **Replay-Guard Integration**: Any agent framework using standard presets automatically wraps transactions in our middleware to prevent double-spending or duplicate charge attacks.
2. **Coinbase CDP Wallet Guardrails**: The API intercepts outgoing payments to enforce limits and compliance rules before the private key signs the transaction.
3. **Prompt-Injection Payload Sandbox**: Heuristic screening that flags indirect prompt-injection payloads, system-override strings, and command-injection patterns before your agent acts on untrusted input. (Defense-in-depth screening, not a guarantee against all injection attacks.)
4. **Liability Attestation Voucher**: A signed HMAC voucher recording a merchant's declared bond/coverage threshold, which routing gateways can require as a precondition before accepting payment. (A cryptographic claim, not an underwritten insurance product.)

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
- `POST /api/session/create` ($0.10) — Pay once, receive an HMAC-signed session token valid for 24 h (or `max_calls`). Attach as `x-session-token` header to skip per-call settlement on subsequent requests.
- `GET /api/session/verify` ($0.01) — Validates a session token and returns remaining TTL and call count.
- `DELETE /api/session/revoke` (Free) — Immediately revokes a session token.
- `GET /api/session/info` (Free) — Debug: returns raw session record for a token.
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
- `POST /api/protocol/zk/prove` ($0.15) — Commitment-based authorization/compliance proof (hash-commitment + selective disclosure). Note: this is a commitment scheme, **not** a true SNARK; in production it requires `ALLOW_ZK_SIMULATE=1` or returns HTTP 503. A real SNARK backend is on the roadmap.
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

Covers `spend-governor`, `identity-gate`, `risk-gate`, `pre-x402-guard`, `wallet-blocklist`, and more — 104 tests total, all passing with full mock isolation.
> **Note:** Tests require Node ≥20 with ESM support.

### Local Server Probing
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
