# x402 Trust Layer — Official Product Plan (2026)

**Version:** 1.0  
**Date:** 2026-06-01  
**Site:** https://x402trustlayer.xyz  
**Model:** Option B unified platform · x402 micropayments only · no SaaS (phase 1)

---

## 1. Mission

**One sentence:** The control plane for AI agents that pay via x402 — verify who the agent is (ERC-8004), decide whether to spend, prove every payment, and export audit trails for finance.

**Not:** A payment rail (Alchemy, Dexter, Coinbase).  
**Not:** A subscription dashboard company.  
**Is:** HTTP + MCP infrastructure agents call before and after every paid API.

---

## 2. Market reality (why this plan fits now)

| Signal | Data (mid-2026) | Implication |
|--------|-----------------|-------------|
| x402 cumulative txs | ~100–167M | Protocol adoption is real |
| Real commerce volume | ~$14–28K/day | Revenue is early — don’t over-build SaaS |
| Gamified / test traffic | ~50% | Optimize for **real integrators**, not tx count |
| ERC-8004 agents registered | ~40K–50K+ cross-chain | Identity layer is live — attach now |
| Alchemy Agentic Gateway | x402 + SIWE live | Complement, don’t compete |
| Competitors | ACHIVX, MolTrust, Trust402, AgentTrust | Win on **guard + identity + ledger** bundle |

**Fit:** Market needs **trust middleware**, not another facilitator. Buyers want guard + proof; sellers will want agent scores next. This plan serves **buyers first** (where you already have live demos), adds **ERC-8004 identity** (Option B), keeps **micropay-only** until enterprise pulls SaaS.

---

## 3. Official ERC-8004 contract addresses

Source: [erc-8004/erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts)

### Production (use these)

| Chain | CAIP-2 | IdentityRegistry | ReputationRegistry |
|-------|--------|------------------|-------------------|
| **Base Mainnet** (primary x402) | `eip155:8453` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| **Ethereum Mainnet** | `eip155:1` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| **Polygon Mainnet** | `eip155:137` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |

### Testnet only (never use as mainnet)

| Chain | IdentityRegistry | ReputationRegistry |
|-------|------------------|-------------------|
| Base Sepolia | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| Ethereum Sepolia | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

**Default chain for TrustScore reads:** Base Mainnet (`eip155:8453`).

**Agent identity tuple:** `{namespace}:{chainId}:{registryAddress}` + `agentId` (ERC-721 tokenId).

---

## 4. Product architecture (Option B)

```
┌─────────────────────────────────────────────────────────────┐
│                  x402 Trust Layer (one brand)                │
├─────────────────────────────────────────────────────────────┤
│  LAYER 1 — IDENTITY (NEW)                                    │
│    POST /api/agent/verify      ERC-8004 TrustScore           │
│    GET  /api/agent/lookup/:wallet   (free, rate-limited)     │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2 — SPEND CONTROL (LIVE)                              │
│    POST /api/guard/pre-x402    + minAgentTier optional       │
│    POST /api/x402/proxy                                        │
│    POST /api/pipeline/execute                                │
├─────────────────────────────────────────────────────────────┤
│  LAYER 3 — MARKET TRUST (LIVE)                               │
│    POST /api/merchant-trust/score   (KYM — score sellers)    │
├─────────────────────────────────────────────────────────────┤
│  LAYER 4 — ENTERPRISE (LIVE)                                 │
│    POST /api/mandate/compile|verify                           │
│    POST /api/compliance/ledger                               │
│    POST /api/receipt-auditor/verify                          │
├─────────────────────────────────────────────────────────────┤
│  DISTRIBUTION                                                │
│    @mimranakb/trust-layer-mcp   + skill.md / llms.txt        │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. TrustScore specification

### Dimensions (0–100)

| Dimension | Max pts | Source |
|-----------|---------|--------|
| On-chain ERC-8004 registration | 30 | IdentityRegistry `ownerOf` / agentId for wallet |
| Reputation registry feedback | 0–25 | ReputationRegistry aggregated score |
| Agent wallet cryptographically verified | 15 | `setAgentWallet` / EIP-712 binding on-chain |
| Agent card valid & complete | 15 | `agentURI` JSON: name, services, x402Support, active |
| Domain verification | 10 | `/.well-known/agent-registration.json` |
| x402 Trust Layer payment history | 5 | Optional phase 2 — ledger lookups |

### Tiers

| Tier | Score | Typical use |
|------|-------|-------------|
| PLATINUM | 85–100 | Premium APIs, high caps |
| GOLD | 70–84 | Standard production agents |
| SILVER | 50–69 | Limited access |
| BRONZE | 30–49 | Registered, minimal profile |
| UNVERIFIED | 0–29 | No ERC-8004 registration |
| UNKNOWN | N/A | No wallet / invalid address |

### Anti-gaming rules

- Agent owner cannot self-submit reputation feedback (ERC-8004 rule).
- LRU cache: identity 5 min, full TrustScore 2 min.
- Sybil: same agentURI hash on many wallets → flag, don’t auto-PLATINUM.
- Never scan all tokenIds — resolve wallet → agentId via registry index or Alchemy NFT API.

---

## 6. Canonical agent flows (best for AI agents)

### Flow A — Standard buyer (every agent)

```text
1. POST /api/guard/pre-x402          ($0.05)
2. x402_check → x402_fetch           (external)
3. POST /api/receipt-auditor/verify  ($0.05)
Total Trust Layer tax: ~$0.10
```

### Flow B — Registered agent (recommended)

```text
1. POST /api/agent/verify            ($0.04)  — optional cache 2 min
2. POST /api/guard/pre-x402          ($0.05)  — minAgentTier: "SILVER"
3. x402_fetch external API
4. POST /api/receipt-auditor/verify  ($0.05)
Total: ~$0.14
```

### Flow C — Enterprise fleet + Alchemy

```text
1. POST /api/mandate/compile         ($0.08)
2. POST /api/mandate/verify          ($0.02)
3. POST /api/agent/verify            ($0.04)
4. POST /api/guard/pre-x402          ($0.05)  — allowedHosts: x402.alchemy.com
5. Alchemy x402 pay                  (~$1.00)
6. POST /api/receipt-auditor/verify  ($0.05)
7. POST /api/compliance/ledger       ($0.12)
Total Trust Layer: ~$0.40 + Alchemy
```

### Flow D — Safe marketplace purchase

```text
1. POST /api/merchant-trust/score    ($0.06)  — KYM on seller host
2. POST /api/guard/pre-x402          ($0.05)
3. x402_fetch
4. POST /api/receipt-auditor/verify  ($0.05)
```

---

## 7. Agent catalog — what to push, hide, build

### PUSH (8 surfaces — 90% revenue + adoption)

| # | Endpoint / tool | Price | Role |
|---|-----------------|-------|------|
| 1 | `POST /api/guard/pre-x402` | $0.05 | Volume engine |
| 2 | `POST /api/receipt-auditor/verify` | $0.05 | Proof engine |
| 3 | `POST /api/agent/verify` | $0.04 | **NEW — ERC-8004** |
| 4 | `POST /api/x402/proxy` | $0.08 | Dev bundle |
| 5 | `POST /api/mandate/*` + ledger | $0.22 | Enterprise |
| 6 | `POST /api/merchant-trust/score` | $0.06 | Buyer safety |
| 7 | `trust_alchemy_preflight` MCP | — | Alchemy distribution |
| 8 | `trust_agent_verify` MCP | — | **NEW** |

### BUILD (phase 2 — after agent/verify ships)

| Item | Description |
|------|-------------|
| Guard `minAgentTier` | Block pay if TrustScore tier too low |
| Ledger TrustScore snapshot | `{ wallet, score, tier, agentId, chain }` |
| Method Policy (Alchemy) | JSON-RPC allowlist — separate roadmap |

### HIDE (keep in OpenAPI, don’t market)

research/brief, router/route, settlement-graph, payment-intent alone, rail-optimizer, dispute-resolve (until Visa live), mpp/session until scores fixed.

### DEPRECATE internally (don’t delete)

`identity-gate` heuristics → delegate to `/api/agent/verify` when wallet is EVM on Base/Ethereum.

---

## 8. Pricing (micropay only — no SaaS)

| Endpoint | USDC | Notes |
|----------|------|-------|
| `POST /api/agent/verify` | $0.04 | New |
| `POST /api/guard/pre-x402` | $0.05 | Unchanged |
| `POST /api/receipt-auditor/verify` | $0.05 | Unchanged |
| `POST /api/x402/proxy` | $0.08 | Unchanged |
| `POST /api/merchant-trust/score` | $0.06 | Unchanged |
| `POST /api/mandate/compile` | $0.08 | Unchanged |
| `POST /api/mandate/verify` | $0.02 | Unchanged |
| `POST /api/compliance/ledger` | $0.12 | Unchanged |
| `POST /api/pipeline/execute` | $0.25 | Unchanged |
| `GET /api/agent/lookup/:wallet` | Free | Rate limit 30/hr/IP |

**Enterprise pilots:** Manual USDC prepay or invoice — not recurring SaaS product.

---

## 9. MCP tools (agent-native distribution)

| Tool | Maps to | When |
|------|---------|------|
| `trust_agent_verify` | `/api/agent/verify` | Before joining fleet or high-value task |
| `trust_guard_preflight` | `/api/guard/pre-x402` | Before any external pay |
| `trust_alchemy_preflight` | guard + Alchemy preset | Before x402.alchemy.com |
| `trust_receipt_verify` | `/api/receipt-auditor/verify` | After pay |
| `trust_merchant_score` | `/api/merchant-trust/score` | Before unknown host |
| `trust_mandate_verify` | `/api/mandate/verify` | Enterprise |

Package: `@mimranakb/trust-layer-mcp` — target v1.2.0 with `trust_agent_verify`.

---

## 10. Competitive position

| vs | We win because |
|----|----------------|
| ACHIVX | We **block spend** (guard) + verify identity; they score after provider reports |
| MolTrust middleware | We have **31-route suite + ledger + mandate + Alchemy live demo** |
| ERC-8004 alone | We add **HTTP x402 + MCP + payment audit** |
| Raw x402 | No policy, no identity, no CFO proof |

**One line:** *ACHIVX scores agents for merchants. We guard agents and verify them — with on-chain identity and compliance ledger.*

---

## 11. Phased roadmap

### Phase 0 — Now (weeks 1–4) · LIVE stack monetize

- [ ] x402scan: guard + receipt registered
- [ ] Dexter seller verify ≥75 on guard, receipt, proxy
- [ ] OpenDexter paid volume (10+ calls/week)
- [ ] MCP 1.1.0 adoption docs
- [ ] x402gle fix: proxy (61), mandate verify (52)

**Target:** $500–1.5k API revenue cumulative

### Phase 1 — Identity layer (weeks 5–10)

- [ ] `POST /api/agent/verify` — Base mainnet ERC-8004 reads
- [ ] `GET /api/agent/lookup/:wallet` — free tier
- [ ] MCP `trust_agent_verify`
- [ ] Update skill.md + llms.txt (TrustScore section)
- [ ] Internal: identity-gate calls verify for EVM wallets

**Target:** 32 paid routes, first agent/verify calls

### Phase 2 — Unified guard (weeks 11–14)

- [ ] Guard accepts `minAgentTier`, `minTrustScore`
- [ ] Compliance ledger stores TrustScore snapshot
- [ ] Demo: `npm run demo:agent-trust` (verify → guard → mock pay → ledger)
- [ ] x402scan register agent/verify

**Target:** Enterprise case study with TrustScore in ledger export

### Phase 3 — Market + Alchemy (weeks 15–20)

- [ ] Flow C documented as official enterprise playbook
- [ ] merchant-trust + agent/verify = “both sides of trust” landing
- [ ] Optional: Method Policy spec (no code until phase 4)
- [ ] Agentic Market validate top 5 URLs

**Target:** $3k–6k MRR equivalent (API micropay)

### Phase 4 — 2026 H2 (only if phase 1–3 traction)

- [ ] Alchemy JSON-RPC Method Policy
- [ ] Simulation-First settlement spec
- [ ] Postgres for ledger + TrustScore history
- [ ] npm thin merchant helper (still micropay backend — not SaaS)

---

## 12. Success metrics

| Metric | Phase 0 | Phase 1 | Phase 3 |
|--------|---------|---------|---------|
| Guard calls / month | 1k | 10k | 50k |
| Receipt calls / month | 800 | 9k | 45k |
| Agent verify calls / month | — | 500 | 5k |
| Enterprise ledger exports / month | 5 | 20 | 100 |
| Dexter routes ≥75 score | 3 | 8 | 15 |
| Paying integrators (unique wallets) | 5 | 20 | 80 |

---

## 13. What we explicitly do NOT build (2026)

- SaaS dashboards ($299/mo tiers)
- Separate AgentVerify brand / api subdomain
- EU AI Act “ComplianceVault” claims without legal review
- Wrong ERC-8004 testnet addresses in production
- 31-agent marketing — public face stays **8 surfaces**
- Visa/dispute-first GTM before USDC x402 volume proves out

---

## 14. Official messaging

**Hero:** Agent trust intelligence as a service.

**Sub:** Verify ERC-8004 agent identity. Guard every x402 payment. Audit with on-chain proof. USDC per call — no subscription.

**Developer:** `npx @mimranakb/trust-layer-mcp@1.2.0`

**Enterprise:** Mandate + compliance ledger + live Alchemy demo on Base.

---

## 15. Environment (implementation reference)

```bash
# ERC-8004 (phase 1)
ERC8004_CHAIN=base                    # base | ethereum | polygon
ERC8004_IDENTITY_REGISTRY=0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
ERC8004_REPUTATION_REGISTRY=0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/...
TRUSTSCORE_CACHE_TTL_SEC=120

# Existing (unchanged)
NETWORKS=base,solana,polygon
FACILITATOR_URL=https://x402.dexter.cash
ATTESTATION_HMAC_SECRET=...
PUBLIC_BASE_URL=https://x402trustlayer.xyz
```

---

## 16. Document control

| Field | Value |
|-------|-------|
| Owner | x402 Trust Layer / mimranchohan |
| Next review | After Phase 1 ship |
| Supersedes | AgentVerify standalone prompt (deprecated) |
