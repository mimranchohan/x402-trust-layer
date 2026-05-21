# x402-agent-suite-preflight

Thin client for [x402 Agent Suite Pro](https://x402-agent-suite-production.up.railway.app) — call **proxy** or **guard** before every downstream `x402_fetch`.

## Install

```bash
npm install x402-agent-suite-preflight @dexterai/x402
```

## Usage

```typescript
import { proxyPreflight } from "x402-agent-suite-preflight";

const result = await proxyPreflight({
  wallet: { solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY! },
  agentId: "my-agent-1",
  walletAddress: "YourWalletAddress",
  targetUrl: "https://api.example.com/paid-endpoint",
  estimatedCostUsdc: 0.05,
  policy: { dailyCapUsdc: 10, perCallCapUsdc: 1 },
});

if (!result.allowed) throw new Error(result.summary);
console.log(result.securityGrade, result.attestationId);
```

## API

- `proxyPreflight()` — `POST /api/x402/proxy` ($0.08)
- `guardPreflight()` — `POST /api/guard/pre-x402` ($0.05)
- `DEFAULT_SUITE_BASE` — production Railway URL
