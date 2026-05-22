# x402-agent-suite-preflight

Thin client for [x402 Agent Suite Pro](https://x402-agent-suite-production.up.railway.app).

## 3-line rule

```text
1. proxyPreflight() or guardPreflight()
2. x402_check → x402_fetch (external API)
3. POST /api/receipt-auditor/verify on the suite
```

We do not claim 100% accuracy — the suite returns `confidence` and `checks_passed` on preflight responses.

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
```

## API

- `proxyPreflight()` — `POST /api/x402/proxy` ($0.08) — **default**
- `guardPreflight()` — `POST /api/guard/pre-x402` ($0.05)
- `DEFAULT_SUITE_BASE` — production Railway URL

Advanced routes (19): see suite `GET /openapi.json`.
