# Social Posts — Alchemy x402 Launch

Replace `TX_HASH` with latest Basescan link:

**Enterprise (recommended):** https://basescan.org/tx/0xbdc571b1f5b00cc858d90c5cb7bcdb925b076fe5a4af9229d9b1ad8226df2cd1

**Standard:** https://basescan.org/tx/0x12b165c22b797ae893ab2222a1f253def2da95842d3b3f25b080941f0a6e7da2

---

## LinkedIn (long)

We shipped the missing layer for AI agents paying Alchemy via x402.

Alchemy's Agentic Gateway (`x402.alchemy.com`) lets agents buy blockchain data with USDC — no API keys. But who decides *whether* the agent should pay? Who produces the audit trail for finance?

**x402 Trust Layer** now wraps every Alchemy agent payment:

1. **Guard** ($0.05) — spend policy + allowed hosts before pay  
2. **Alchemy x402** (~$1) — USDC credit on Base  
3. **Receipt verify** ($0.05) — on-chain proof  

Live demo, real money, real tx:  
https://basescan.org/tx/TX_HASH

npm MCP: `@mimranakb/trust-layer-mcp@1.1.0`  
Tool: `trust_alchemy_preflight`

Building agent fleets? DM for enterprise mandate + compliance ledger demo.

#x402 #AIagents #Alchemy #USDC #Base

---

## X / Twitter (thread)

**1/** Agents can now pay @Alchemy for blockchain data via x402 — no API keys, USDC on Base.

But who guards the payment?

**2/** We built x402 Trust Layer:
→ Guard before pay ($0.05)
→ Receipt audit after ($0.05)
→ MCP: `@mimranakb/trust-layer-mcp`

**3/** Live demo = real USDC, real Basescan tx:  
https://basescan.org/tx/TX_HASH

`npm run demo:alchemy` in our repo.

**4/** Enterprise: signed mandates + CFO ledger for agent fleets.

https://x402trustlayer.xyz

---

## Short LinkedIn

Shipped: **Alchemy x402 Agent Guard** — preflight + receipt audit for `x402.alchemy.com`.

MCP `@mimranakb/trust-layer-mcp@1.1.0` | Live on-chain proof | $0.10 safety tax per agent call

Demo: https://x402trustlayer.xyz

---

## Discord / community

**Alchemy x402 + Trust Layer stack is live**

```
npx @mimranakb/trust-layer-mcp@1.1.0
npx skills add alchemyplatform/skills --yes
```

Flow: `trust_alchemy_preflight` → Alchemy pay → `trust_receipt_verify`

Repo demo: `npm run demo:alchemy` (~$1.10 USDC)
