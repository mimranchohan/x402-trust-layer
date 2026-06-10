# x402-agent-suite-preflight

Drop-in **preflight guard** for AI agents. One function call to the [x402 Trust Layer](https://x402trustlayer.xyz) — spend-policy + identity + URL risk + security grade (+ optional signed attestation) — *before* your agent pays any external x402 endpoint. Works with any framework (LangChain, CrewAI, Coinbase AgentKit, custom).

**No API keys.** The agent pays per call in USDC with its own wallet via the Dexter / CDP facilitator.

## The 3-line rule

```text
1. proxyPreflight() or guardPreflight()   ← this package
2. x402_check → x402_fetch (external API)
3. POST /api/receipt-auditor/verify       ← confirm settlement
```

These are advisory signals — responses include `securityGrade` and a `summary`. You keep control of the final pay/deny decision.

## Install

```bash
npm install x402-agent-suite-preflight @dexterai/x402
```

## Usage

```typescript
import { proxyPreflight } from "x402-agent-suite-preflight";

const result = await proxyPreflight({
  wallet: { solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY! }, // or { evmPrivateKey }
  agentId: "my-agent-1",
  walletAddress: "YourWalletAddress",
  targetUrl: "https://api.example.com/paid-endpoint",
  estimatedCostUsdc: 0.05,
  policy: { dailyCapUsdc: 10, perCallCapUsdc: 1, allowedHosts: ["api.example.com"] },
});

if (!result.allowed) throw new Error(`Blocked: ${result.summary}`);
// result.securityGrade === "A".."F", result.attestationId for the receipt trail
```

## Wrap every payment (drop-in pattern)

Gate any agent's outbound payment behind one guard call so a scam/over-budget URL never gets paid:

```typescript
import { guardPreflight } from "x402-agent-suite-preflight";

async function safePay(url: string, estCostUsdc: number) {
  const check = await guardPreflight({
    wallet: { evmPrivateKey: process.env.EVM_PRIVATE_KEY! },
    agentId: "fleet-agent",
    walletAddress: process.env.AGENT_WALLET!,
    targetUrl: url,
    estimatedCostUsdc: estCostUsdc,
    policy: { dailyCapUsdc: 25, perCallCapUsdc: 2 },
  });
  if (!check.allowed) throw new Error(`Guard blocked ${url}: ${check.summary}`);
  return yourX402Fetch(url); // only runs once guard approves
}
```

## API

- `proxyPreflight()` — `POST /api/x402/proxy` ($0.08) — **default**: guard + probe + optional attestation.
- `guardPreflight()` — `POST /api/guard/pre-x402` ($0.05) — lightweight allow/deny (spend + identity + risk).
- `TrustedSolanaAgent` — convenience class wrapping a Solana agent wallet with built-in preflight (see `trusted-agent.ts`).

## Links

- Live API & dashboard: https://x402trustlayer.xyz/dashboard
- OpenAPI: https://x402trustlayer.xyz/openapi.json
- Source: https://github.com/mimranchohan/x402-trust-layer

MIT © Mimran Chohan
