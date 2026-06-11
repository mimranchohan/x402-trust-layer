# Launch Posts — ready to copy-paste

Honest, no fake traction. Swap [your @handle] where needed. Post the X thread first, then the LinkedIn post same day.

---

## X / Twitter thread

**1/ (hook)**
```
Agents did 165M+ payments on x402 this year.

Almost none were checked before the money moved.

So I built the x402 Trust Layer — a guard your agent calls *before* it pays.

Live + open. 🧵
```

**2/ (problem)**
```
An autonomous agent will happily pay:
• a scam URL
• an SSRF / metadata target
• 10x over its budget

Once USDC settles on-chain, it's gone. Nothing sits between the agent's reasoning and its wallet.
```

**3/ (solution)**
```
x402 Trust Layer = 68 pay-per-call APIs an agent calls around every payment:

🛡️ preflight guard (policy + identity + URL risk)
🔍 KYM merchant trust score
📝 mandate compile + diff
💸 semantic escrow (auto-refund on bad responses)
🧾 on-chain receipt audit

No API keys. USDC only.
```

**4/ (proof — reproducible)**
```
Don't take my word. Run the guard yourself:

npx tsx scripts/demo-scam-blocked.ts

It blocks 5/6 bad payments (scam TLD, SSRF, over-budget) before settlement — for a $0.05 guard call.

No signup, no logos, just the logic.
```

**5/ (drop-in)**
```
1 line to protect any agent (LangChain, CrewAI, AgentKit):

npm i x402-agent-suite-preflight

Or add the MCP server to Claude / Cursor:

npx -y @mimranakb/trust-layer-mcp
→ 13 trust tools appear instantly.
```

**6/ (CTA)**
```
Browse all 68 endpoints + live status:
→ x402trustlayer.xyz/dashboard

Built on @base @solana via Dexter / Coinbase CDP. Aligned with ERC-8004 + A2A.

If you're building agents that spend money, let's talk. 👇
```

---

## LinkedIn post

```
The agent economy crossed 165M+ x402 payments this year. Here's the uncomfortable part: almost none of those payments were checked before the money moved.

Autonomous agents now pay merchants directly. But an agent will happily pay a scam URL, an SSRF target, or blow its entire budget — because nothing sits between its reasoning and its wallet. And on-chain settlement is irreversible.

So I built the x402 Trust Layer — a trust, security & settlement control plane for agent payments.

68 pay-per-call APIs an agent calls before, during, and after it spends:
• Preflight guard — spend policy + identity + URL/SSRF risk
• Know-Your-Merchant trust & wash-trade scoring
• AP2-style mandate compile + diff vs actual tool trace
• Semantic delivery escrow with auto-refund on bad responses
• On-chain settlement receipt verification

No API keys. The agent pays per call in USDC on Base / Solana / Polygon.

Reproducible proof (no signup): a demo that blocks 5 of 6 bad payments before settlement, for a $0.05 guard call.

Drop it into any agent framework:
  npm i x402-agent-suite-preflight
Or add the MCP server to Claude / Cursor:
  npx -y @mimranakb/trust-layer-mcp

Live API + dashboard: https://x402trustlayer.xyz/dashboard

If you're building agents that handle real money — or running an agent marketplace that wants a "trust-checked" badge — I'd love to talk.

#AIagents #x402 #agenticcommerce #stablecoins #web3
```

---

## Short DM / reply version (for outreach)

```
Hey [name] — saw you're building [agent/product] on x402. I made a 1-line preflight guard that blocks scam URLs, SSRF, and over-budget payments before settlement (+ on-chain receipts for audit).

Reproducible demo blocks 5/6 bad payments, no signup. Want me to run it against your real endpoint list? Free pilot.

x402trustlayer.xyz/dashboard
```

---

## Posting tips
- Post the X thread in the morning (US/EU overlap). Pin tweet 1.
- Reply to your own thread with the dashboard GIF once you record one.
- Tag relevant accounts only where genuine (x402 / Dexter / Base builders) — don't spam.
- Cross-post tweet 1 as a Farcaster cast too (x402 crowd is active there).
