# x402 Trust Layer × Alchemy — One Pager

**One line:** Guard + audit every agent payment to Alchemy's x402 gateway — no API keys, USDC on Base.

---

## Problem

AI agents pay USDC via HTTP 402 (`x402.alchemy.com`) with no:
- Spend policy (daily caps, allowed hosts)
- Human-signed payment intent (AP2/mandate)
- On-chain receipt audit for CFO/compliance

## Solution

**x402 Trust Layer** wraps Alchemy agent payments:

| Step | API | Cost |
|------|-----|------|
| Preflight | POST /api/guard/pre-x402 | $0.05 |
| Alchemy data | x402.alchemy.com | ~$1/credit |
| Receipt proof | POST /api/receipt-auditor/verify | $0.05 |
| Enterprise ledger | POST /api/compliance/ledger | $0.12 |

## Live proof

```bash
npm run demo:alchemy          # ~$1.10 — guard + pay + receipt
npm run demo:alchemy:enterprise  # ~$1.32 — + mandate + ledger
```

Every run produces a **Basescan tx link** + `valid: true` receipt.

## For developers

```bash
npx @mimranakb/trust-layer-mcp@1.1.0
```

Tool: **`trust_alchemy_preflight`** — call before any `x402.alchemy.com` request.

## For enterprise

- AP2-style mandates (`/api/mandate/compile`)
- SOC2/CFO ledger with tamper hash (`/api/compliance/ledger`)
- Fleet webhooks (`/api/webhooks/register`)

**Pricing:** from $499/mo fleet + per-call API fees.

## Links

- https://x402trustlayer.xyz
- https://www.npmjs.com/package/@mimranakb/trust-layer-mcp
- https://www.alchemy.com/docs/alchemy-for-agents.md

**Contact:** GitHub issues @ mimranchohan/x402-agent-suite
