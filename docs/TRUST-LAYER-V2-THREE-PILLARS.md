# Trust Layer v2 — Complete Stack

**Live:** https://x402trustlayer.xyz · **38 paid** POST routes (+ free lookups)

## End-to-end flow

```text
1. POST /api/mandate/compile
2. POST /api/mandate/diff              ($0.04)
3. POST /api/pipeline/trust-v2          ($0.35) — OR steps 3–5 separately
   OR: POST /api/x402/proxy ($0.08) + POST /api/trust-network/buyer-gate ($0.03)
4. x402_fetch (external paid API)
5. POST /api/quality-escrow/semantic-settle ($0.12) — auto bond slash if certified
6. POST /api/receipt-auditor/verify     ($0.05)
```

## Endpoints

| Endpoint | Price | Feature |
|----------|-------|---------|
| `POST /api/quality-escrow/semantic-settle` | $0.12 | Schema + LLM/heuristic intent judge |
| `POST /api/mandate/diff` | $0.04 | Mandate vs tool trace |
| `POST /api/merchant-trust/certify` | $0.15 | Seller badge + bond |
| `POST /api/trust-network/buyer-gate` | $0.03 | Buyer attestation + tier |
| `POST /api/pipeline/trust-v2` | $0.35 | All-in-one pre-pay |
| `POST /api/trust-network/bond/slash` | $0.03 | Manual bond slash |
| `GET /api/merchant-trust/certified/:host` | Free | Badge lookup |
| `GET /api/trust-network/catalog` | Free | Certified sellers |

## Env vars (optional)

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | LLM semantic judge (else heuristic) |
| `OPENAI_MODEL` | Default `gpt-4o-mini` |
| `X402WATCH_API_BASE` | KYM auto-ingest (default x402watch API) |
| `EVM_PRIVATE_KEY` / `SOLANA_PRIVATE_KEY` | MCP paid calls |

## MCP (OpenDexter / Cursor)

Package: `packages/trust-layer-mcp` v2.0

| Tool | When |
|------|------|
| `trust_before_x402_fetch` | **Default** — full trust-v2 pipeline |
| `trust_mandate_diff` | Mandate check only |
| `trust_buyer_gate` | Certified seller only |
| `trust_semantic_settle` | After downstream response |
| `trust_merchant_score` | KYM + x402watch ingest |

## Deploy & index

```bash
npm run build
# Railway: push main

npm run probe:production
npm run x402scan:register -- https://x402trustlayer.xyz
```

## Still manual / future

- **On-chain bond escrow** — virtual ledger today; migrate to smart contract when volume warrants
- **Railway deploy** — push from your machine; not automated in repo CI
