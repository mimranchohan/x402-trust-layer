# Railway environment — Trust Layer v2

Set these in the Railway service for **https://x402trustlayer.xyz**:

| Variable | Required | Purpose |
|----------|----------|---------|
| `ATTESTATION_HMAC_SECRET` | **Yes** (prod) | Mandate + attestation signing (≥32 chars) |
| `PAY_TO_EVM` / `PAY_TO_ADDRESS` | **Yes** | Settlement wallets |
| `FACILITATOR_URL` | **Yes** | Default `https://x402.dexter.cash` |
| `NETWORKS` | Recommended | `base,solana` or `solana,base` |
| `OPENAI_API_KEY` | Optional | LLM semantic judge on `/api/quality-escrow/semantic-settle` |
| `OPENAI_MODEL` | Optional | Default `gpt-4o-mini` |
| `OPENAI_TIMEOUT_MS` | Optional | Default `25000` |
| `X402WATCH_API_BASE` | Optional | KYM auto-ingest (default x402watch API) |
| `TELEMETRY_FETCH_MS` | Optional | Ecosystem telemetry poll interval |

Without `OPENAI_API_KEY`, semantic escrow uses the **heuristic judge** only (still production-safe).

After changing env: redeploy from Railway dashboard or push a no-op commit.
