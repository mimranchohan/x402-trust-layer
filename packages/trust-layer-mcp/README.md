# @mimranakb/trust-layer-mcp

MCP server that gives any AI agent the [x402 Trust Layer](https://x402trustlayer.xyz) — **13 trust tools** an agent calls *before, during, and after* it spends money over [x402](https://www.x402.org). Pay-per-call in USDC on Base / Solana / Polygon. **No API keys** — the agent pays with its own wallet via the Dexter / CDP facilitator.

> Works with Claude Desktop, Claude Code, Cursor, and any MCP-compatible client.

## Why

Autonomous agents pay unknown merchants. Before the private key signs, you want to know: is this merchant trustworthy? is the payment inside policy? was the response I paid for actually worth it? This server wires those checks into your agent as native MCP tools.

## Tools

| Tool | Endpoint | Price |
|------|----------|-------|
| `trust_before_x402_fetch` | `/api/pipeline/trust-v2` — full pre-pay flow (mandate diff + KYM + guard + buyer gate) | $0.35 |
| `trust_preflight_proxy` | `/api/x402/proxy` — all-in-one preflight + optional attestation | $0.08 |
| `trust_agent_verify` | `/api/agent/verify` — ERC-8004 TrustScore on Base mainnet | $0.04 |
| `trust_merchant_score` | `/api/merchant-trust/score` — KYM (wash-trade / verification signals) | $0.06 |
| `trust_mandate_diff` | `/api/mandate/diff` — signed mandate vs actual tool trace | $0.04 |
| `trust_buyer_gate` | `/api/trust-network/buyer-gate` — certified-seller buyer gate | $0.03 |
| `trust_semantic_settle` | `/api/quality-escrow/semantic-settle` — release or auto-refund | $0.12 |
| `trust_receipt_verify` | `/api/receipt-auditor/verify` — verify settlement tx on-chain | $0.05 |
| `trust_protocol_full_pipeline` | `/api/protocol/pipeline/full-trust` — Agent Trust Protocol v4 | $0.45 |
| `trust_protocol_trust_score_v2` | `/api/protocol/trust-score/v2` — multi-factor TrustScore v2 | $0.08 |
| `trust_protocol_fraud_scan` | `/api/protocol/fraud/scan` — Sybil / wash-trade / circular-payment scan | $0.10 |
| `trust_protocol_execution_receipt` | `/api/protocol/execution/issue` — Proof-of-Execution receipt | $0.05 |
| `trust_protocol_credit_score` | `/api/protocol/credit/score` — AI Agent Credit Bureau score (300–900) | $0.06 |

Full catalog and live dashboard: **https://x402trustlayer.xyz/dashboard**

## Install & configure

The agent pays per call, so it needs a funded wallet key in the server's env.

```bash
export EVM_PRIVATE_KEY=0x...        # OR
export SOLANA_PRIVATE_KEY=...
# optional:
export TRUST_LAYER_BASE=https://x402trustlayer.xyz
export X402_PREFERRED_NETWORK=eip155:8453
```

### Claude Desktop / Claude Code / Cursor

Add to your MCP config (`claude_desktop_config.json`, `.cursor/mcp.json`, etc.):

```json
{
  "mcpServers": {
    "trust-layer": {
      "command": "npx",
      "args": ["-y", "@mimranakb/trust-layer-mcp"],
      "env": {
        "EVM_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

Restart the client and the 13 `trust_*` tools appear.

## Recommended agent flow

```text
1. trust_before_x402_fetch   → one call: mandate diff + KYM + guard + buyer gate
2. (your agent) x402_fetch    → pay the external merchant in USDC
3. trust_semantic_settle      → did the response match intent? release or auto-refund
4. trust_receipt_verify       → confirm the settlement tx on-chain
```

For high-value or regulated flows, use `trust_protocol_full_pipeline` (Agent Trust Protocol v4: passport, fraud, oracle, credit, compliance, guard, replay-bind in one call).

## Security & custody

- Keys live only in the server process env and are used solely to sign x402 payments your agent initiates.
- Use a **dedicated agent wallet** with a limited balance — never your main treasury key.
- All Trust Layer responses are advisory signals; you keep control of the final payment decision.

## Local dev

```bash
cd packages/trust-layer-mcp
npm install
npm run build
node dist/index.js   # speaks MCP over stdio
```

## Links

- Live API & dashboard: https://x402trustlayer.xyz/dashboard
- OpenAPI: https://x402trustlayer.xyz/openapi.json
- Source: https://github.com/mimranchohan/x402-trust-layer

MIT © Mimran Chohan
