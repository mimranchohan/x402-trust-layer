# Security Features (v3)

## Built-in controls

### URL security (`lib/security.ts`)

Every risk and proxy call assesses:

- HTTPS required (penalty for HTTP)
- Blocked patterns: localhost, private IPs, metadata endpoints
- High-risk TLD detection
- Security grades **A–F** returned in API responses

### Pre-x402 guard

Combines in one payment:

- Spend governor (daily + per-call caps, host allow/block lists)
- Identity gate (wallet tier + risk score)
- Risk gate (x402 probe + price cap + security grade)

### Attestation registry

- Signed attestations bound to `payTo` wallet
- TTL (default 15 minutes)
- Verify before partner agents accept downstream work
- Optional header: `X-Suite-Attestation: att_...`

### Evidence locker

Tamper-evident export bundles for compliance audits.

## Recommended policy (example)

```json
{
  "dailyCapUsdc": 25,
  "perCallCapUsdc": 0.5,
  "allowedHosts": ["api.myceliasignal.com", "x402-agent-suite-production.up.railway.app"],
  "blockedHosts": ["localhost", "127.0.0.1"],
  "allowedNetworks": ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", "eip155:8453"]
}
```

## Operational security

- **Never** put `SOLANA_PRIVATE_KEY` on Railway — server only receives USDC
- Use **HTTPS** `PUBLIC_BASE_URL` in production
- Rotate wallet keys if exposed in chat or logs
- Rate-limit abusive agents via `agentId` in spend ledger

## Improving scores on Dexter

1. Return structured JSON (not 400 on empty body — suite injects examples)
2. Keep responses under 30KB
3. Run paid verification after deploy
4. Maintain uptime on Railway
