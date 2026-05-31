# X (Twitter) — 25-post launch thread + standalone tweets

**Brand:** x402 Agent Suite Pro  
**URL:** https://x402trustlayer.xyz  
**Hashtags (rotate):** `#x402` `#AIAgents` `#USDC` `#micropayments` `#agentic` `#buildinpublic`  
**Media:** Use **v2 posters** (cyan top header bar + agent name): `marketing-*-v2.png` in Cursor `assets/`. Logo: `x402-agent-suite-logo.png`

---

## THREAD (post 1 as hook, 2–25 as replies)

### 1/25 — Hook
AI agents are learning to pay for APIs with HTTP 402 + USDC.

The hard part isn't sending money—it's knowing whether you *should* pay.

We built **x402 Agent Suite Pro**: pay-per-call trust + preflight infrastructure on Solana & Base.

🧵 5 APIs you should know ↓

[Image: marketing-x402-flow.png or trust-pack-v2]

---

### 2/25 — Problem
Today's flow for most agents:

1. Hit unknown x402 endpoint
2. Pay
3. Hope the JSON isn't empty

No standard preflight. No fleet trust registry. No refund signal.

That's what we're fixing—without becoming a wallet or a marketplace.

---

### 3/25 — Product
**x402 Agent Suite Pro** = 24 paid infrastructure APIs.

**Go-to-market focus:** 5 endpoints with the strongest verifier scores + 2 hero prefight routes.

Production: https://x402trustlayer.xyz

OpenAPI: /openapi.json

---

### 4/25 — How x402 works here
Every paid route:

→ Unpaid call returns **402** + payment requirements  
→ Client settles USDC via **Dexter facilitator**  
→ Retry → **200** + structured JSON + receipt

Multi-chain: **Solana + Base USDC**.

---

### 5/25 — Hero #1: x402 Proxy ($0.08)
`POST /api/x402/proxy`

**One payment** replaces three separate calls:
• Spend policy check  
• Wallet identity tier  
• URL risk probe  
• Optional HMAC attestation issue  

Default preflight before *any* downstream x402 pay.

[Image: marketing-x402-proxy-v2.png]

---

### 6/25 — Proxy inputs (integrators)
Send JSON:
• `agentId`, `walletAddress`  
• `targetUrl` (the x402 API you're about to pay)  
• `estimatedCostUsdc` + `policy` (daily/per-call caps)  

Get back: allow/deny, security grade, risk score, attestation optional.

---

### 7/25 — Hero #2: Pipeline Execute ($0.25)
`POST /api/pipeline/execute`

For agent **fleets** running multi-step jobs:

Guard → optional NL payment plan → facilitator failover ranking → marketplace API pick.

One receipt. One orchestration call.

[Image: marketing-pipeline-execute-v2.png]

---

### 8/25 — When to use Pipeline vs Proxy
**Proxy ($0.08):** every downstream x402 hop  
**Pipeline ($0.25):** task has a budget + marketplace query + you want a full execution graph in one response  

Rule of thumb: Proxy daily, Pipeline when the agent plans spend.

---

### 9/25 — Trust Pack intro
Three APIs scored **78–86** on x402gle verifiers:

Verify · Registry · Refund Arbiter

Together = **Trust Pack** — under ~$0.12 for the trust trio (+ issue via Proxy if needed).

[Image: marketing-trust-pack-v2.png]

---

### 10/25 — Attestation Verify ($0.02) — Score 82
`POST /api/attestation/verify`

Input: `attestationId`  
Output: signature valid?, expiry, grade metadata

Use **before** your agent pays a partner endpoint that requires preflight proof.

[Image: marketing-attestation-verify-v2.png]

---

### 11/25 — What attestation is
An attestation is an **HMAC-signed preflight record**:

agent + target URL + risk/grade snapshot + expiry.

Partners can reject paid calls without a valid attestation from our registry.

Not custody. Not KYC. **Cryptographic spend intent.**

---

### 12/25 — Attestation Registry ($0.02 GET) — Score 78
`GET /api/attestation/registry`

Query params: `minGrade`, `agentId`, `limit`

Real GET JSON for fleets and verifier crawlers—not a stub.

Fleet dashboards: "which agents are cleared for which targets?"

[Image: marketing-attestation-registry-v2.png]

---

### 13/25 — Refund Arbiter ($0.08) — Score 86
`POST /api/refund-arbiter/evaluate`

Highest verifier score in our suite.

Feed verification signals:
• `verificationScore`  
• `responseEmpty` / `responseGeneric`  
• expected vs actual USDC  

Get structured **refund eligibility** rationale—not on-chain execution (policy layer).

[Image: marketing-refund-arbiter-v2.png]

---

### 14/25 — Trust Pack flow
Recommended sequence:

1. `POST /api/x402/proxy` (or issue attestation)  
2. Pay downstream x402 API  
3. `POST /api/receipt-auditor/verify` (optional, $0.05)  
4. `POST /api/refund-arbiter/evaluate` if response bad  
5. `GET /api/attestation/registry` for fleet audit  

---

### 15/25 — Data honesty
We **don't** archive your downstream API bodies.

We store: attestations (last 500), spend estimates by agentId/day, session/escrow metadata.

Payments settle on-chain to published receive addresses via Dexter.

Privacy-forward infrastructure—not a data broker.

---

### 16/25 — For sellers
Selling an x402 API?

Buyers can:
• Proxy-probe your endpoint before pay  
• Verify your issued attestations  
• Hit Refund Arbiter if your JSON is empty  

**Better buyers trust you → more paid 402 conversions.**

List us on Dexter + x402scan alongside your resource.

---

### 17/25 — For agent builders
Drop-in pattern:

```text
before x402_fetch(target):
  proxy = POST /api/x402/proxy { targetUrl, policy, wallet }
  if !proxy.allowed: abort
  if proxy.attestationId: verify optional
```

`npm run demo` in our repo shows payer ≠ receive wallet.

---

### 18/25 — Discovery
Machine-readable catalog:

• `GET /.well-known/x402`  
• `GET /openapi.json` (paid ops for scanners)  
• `GET /x402/api/discover`  

Registered for Agentic Market + x402scan resource ingest.

---

### 19/25 — Pricing table (focus 5)
| API | Method | USDC |
|-----|--------|------|
| x402 Proxy | POST | $0.08 |
| Pipeline Execute | POST | $0.25 |
| Attestation Verify | POST | $0.02 |
| Attestation Registry | GET | $0.02 |
| Refund Arbiter | POST | $0.08 |

Full suite: 24 routes on /health

---

### 20/25 — Chains & facilitator
• Solana USDC + Base USDC  
• Facilitator: x402.dexter.cash  
• SSRF-safe outbound probes  
• Rate limits: unpaid → 402, paid capped  

Built for **agentic.market** + **x402gle** verifier patterns (including paid GET = full JSON).

---

### 21/25 — Logo / brand
[Image: x402-agent-suite-logo.png]

**x402 Agent Suite Pro**  
Infrastructure, not hype tokens.  
MIT licensed · Railway production · v3.1.0

---

### 22/25 — Social proof
x402gle auditor signals (trust lane):

• Refund Arbiter **86** — POST + body → real arbitration JSON  
• Attestation Verify **82**  
• Attestation Registry **78** — GET registry payload  

Re-test heroes after our paid-GET fix—proxy/pipeline scores should climb.

---

### 23/25 — Who we're not
❌ Not a wallet (you hold keys)  
❌ Not a marketplace (we route *to* marketplaces)  
❌ Not escrow custody (planning records only)  

✅ Control plane for **safe x402 spend**

---

### 24/25 — Try it
Unpaid probe (402):

`curl https://x402trustlayer.xyz/api/x402/proxy`

Discovery:

`curl https://x402trustlayer.xyz/x402/api/discover`

GitHub: github.com/mimranchohan/x402-agent-suite

---

### 25/25 — CTA
If you're building agents that pay for APIs:

1. Bookmark the 5 endpoints  
2. Run Trust Pack on your worst downstream provider  
3. Tell us which route saved you a bad settlement  

RT + follow for integration recipes.

DM for fleet pricing / Postgres registry hosting.

---

## 10 STANDALONE TWEETS (non-thread)

**S1**  
402 is the new API key—but USDC per call. Preflight > pay > prove > refund signal. Five endpoints. One suite. https://x402trustlayer.xyz #x402

**S2**  
Paid $0.08 before you paid $0.50 to the wrong oracle. `POST /api/x402/proxy` — guard + risk + optional attestation. #AIAgents

**S3**  
x402gle scored our Refund Arbiter **86**. Empty JSON after payment? There's now an API for that signal. `POST /api/refund-arbiter/evaluate`

**S4**  
Fleet trust isn't a spreadsheet. `GET /api/attestation/registry` — query by agentId & grade. $0.02. Real GET payload.

**S5**  
One orchestration receipt for multi-hop agents: `POST /api/pipeline/execute` $0.25 — guard, plan, failover, marketplace pick.

**S6**  
We don't store your downstream responses. Attestations + spend ledger only. Payments on-chain. Infrastructure with boundaries.

**S7**  
Sellers: buyers can proxy-probe you before pay. Higher trust → higher 402 conversion. List alongside your x402 resource.

**S8**  
Solana + Base USDC. Dexter facilitator. 24 paid routes live. Marketing focus: 5. Full OpenAPI for scanners.

**S9**  
Unpaid `curl` our proxy → 402 with payment requirements. That's by design. x402scan-friendly. Agentic-ready.

**S10**  
MIT · v3.1.0 · Production on Railway. `npm run demo` with a **separate payer wallet**. Never pay yourself.

---

## 30-SECOND VIDEO STORYBOARD (record in CapCut / OBS)

| Sec | Visual | Voiceover |
|-----|--------|-----------|
| 0–3 | Logo + "AI agents pay for APIs" | "Agents now pay per API call with x402." |
| 3–8 | Flow graphic | "402 first. USDC via Dexter. Then JSON." |
| 8–14 | Proxy card | "Proxy: eight cents. One call. Guard + risk + attestation." |
| 14–20 | Trust Pack cards | "Verify. Registry. Refund arbiter. Eighty-six score." |
| 20–26 | Terminal curl 402 | "Unpaid probe returns 402—that's the standard." |
| 26–30 | URL + GitHub | "x402 Agent Suite Pro. Link in bio." |

---

## POSTING SCHEDULE (suggested)

| Day | Content |
|-----|---------|
| Mon | Thread 1–25 over 2 hours |
| Tue | S1 + Proxy image |
| Wed | S3 + Refund image |
| Thu | S5 + Pipeline image |
| Fri | Video storyboard reel |
| Sat | S4 Registry + Trust Pack image |
| Sun | Article link (MARKETING-ARTICLE.md → blog or GitHub) |
