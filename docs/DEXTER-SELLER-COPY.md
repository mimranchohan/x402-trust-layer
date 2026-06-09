## Dexter seller profile copy

### Short bio (paste in seller intro)

x402 Trust Layer — **38 paid routes** for AI agent payment safety on Base + Solana (Dexter facilitator).  
Preflight guard, **Trust v2 pipeline**, semantic delivery escrow, mandate diff, certified seller network, KYM, AP2 mandates, compliance, disputes.

### Full description

x402 Trust Layer provides **38 paid APIs** for enterprise agent payment safety and orchestration on Solana + Base (Dexter facilitator).

**Four layers:**
1. **Guard** — spend caps, identity, risk scan, KYM merchant trust, pre-x402 proxy, **pipeline/trust-v2**
2. **Attestation** — issue/verify/registry + AP2 mandate compile/verify/**diff**
3. **Compliance** — receipt audit, refund arbiter, evidence export, disputes, quality + **semantic escrow**
4. **Settlement Ops** — pipeline execute, payment compile, rail optimizer, MPP sessions, agent escrow, **certified sellers + buyer gate**

**Trust v2 flagship (new):**
- `POST /api/pipeline/trust-v2` ($0.35) — mandate diff + KYM + guard + buyer gate in one call
- `POST /api/quality-escrow/semantic-settle` ($0.12) — intent + schema delivery guarantee
- `POST /api/mandate/diff` ($0.04) — block out-of-scope MCP tool routing before pay
- `POST /api/merchant-trust/certify` ($0.15) — seller badge + buyer policy + virtual bond

**Why buyers use it:**
- One-shot pre-pay with `pipeline/trust-v2` before any OpenDexter `x402_fetch`
- Semantic refunds when paid APIs return wrong/empty/scam data
- Signed mandates compared to actual tool traces (prompt-injection defense)
- CFO/SOC2-grade audit trails and dispute dossiers

Production: `https://x402trustlayer.xyz`  
OpenAPI: `https://x402trustlayer.xyz/openapi.json`  
x402gle: `https://x402gle.com/servers/x402trustlayer.xyz`  
MCP: `npx @mimranakb/trust-layer-mcp@2.0.0`

### Proof links (x402gle — custom domain)

- Quality Monitor Probe — 96  
  https://x402gle.com/resources/7436be4f-529c-4f80-8616-2a06ae61ef06
- Agent Escrow — 92  
  https://x402gle.com/resources/6a9f4a3f-d94f-4156-93d5-c9d43495a53c
- Compliance Ledger — 88  
  https://x402gle.com/resources/1480ddd5-0d62-4f06-8739-030efe8f3b0a
- Pipeline Execute — 86  
  https://x402gle.com/resources/a59d06e0-ea89-4643-ae2f-b1122734bafa

Run v2 auditions: `npm run audition:x402gle:v2` → `x402gle-v2-audition-result.json`

### One-line CTA

**Start here:** `POST /api/pipeline/trust-v2` ($0.35) before external pays — or `POST /api/x402/proxy` ($0.08) for lightweight guard only.
