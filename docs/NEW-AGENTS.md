# New agents: Buy Advisor (A) + Audition Coach (B)

## A — `POST /api/market/buy-advisor` ($0.08)

**Jupiter-style quote for the x402 economy** — before paying any marketplace API.

```json
{
  "intent": "ETH spot price oracle for my trading bot",
  "agentId": "my-agent",
  "walletAddress": "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
  "policy": { "dailyCapUsdc": 10, "perCallCapUsdc": 0.5 },
  "preferNetwork": "eip155:8453",
  "expectedCalls": 20,
  "maxPriceUsdc": 0.15
}
```

Returns ranked `quotes`, `recommendation` (pay_external | use_suite_proxy | …), optional `policy` preflight, `chainAdvisor`, `mppAdvice`.

## B — `POST /api/seller/audition-coach` ($0.06)

**Pre-audition for sellers** — unpaid probes + OpenAPI / `.well-known/x402` checks + `fixInstructions` per route.

```json
{
  "origin": "https://x402trustlayer.xyz",
  "maxRoutes": 22
}
```

Then run real ingest:

```bash
npx -y @dexterai/opendexter@latest audition "https://your-origin" --json
```

## Deploy

```powershell
cd C:\Users\mimra\x402-agent-suite
npm run typecheck
git add -A && git commit -m "feat: market buy advisor and seller audition coach agents"
git push
```

Railway auto-deploy → x402gle **Test now** on new routes → `npm run audition:x402gle` when cooldown allows.
