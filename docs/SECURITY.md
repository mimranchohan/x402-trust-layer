# Security

Threat model: **paid public HTTP API** — every `/api/*` route requires x402 settlement via Dexter facilitator. Free routes: `/health`, discovery (`/.well-known/*`, `/openapi.json`).

## Controls (implemented)

| Area | Mechanism |
|------|-----------|
| Payment | `@dexterai/x402` middleware on all agent routes + Agentic GET/HEAD probes |
| SSRF | `lib/ssrf.ts` — block private/reserved/metadata hosts before outbound `fetch`; probes use `redirect: manual` |
| Host policy | `lib/host-policy.ts` — exact/subdomain allow/block (no substring bypass) |
| Attestations | HMAC-SHA256 with `ATTESTATION_HMAC_SECRET` (server-only, 32+ chars in production) |
| Rate limit | Unpaid probes → 402 (no 429 for x402scan); paid retries capped (`RATE_LIMIT_PER_MIN`) |
| Resource URL | `resolvePaidResourceUrl` — canonical public host; ignores forged `Host` off localhost |
| Errors | Production 500 responses omit stack/message details |
| x402gle claim | Challenge only on `/.well-known/*` paths — not global response headers |
| Verifier bodies | Partial POST cannot override `targetUrl` / `policy` / `origin` |
| Receipt auditor | Solana receipts **fail closed** until on-chain RPC verification exists |

## Required production env (Railway)

```env
PAY_TO_ADDRESS=...
PAY_TO_EVM=...
PUBLIC_BASE_URL=https://your-app.up.railway.app
NETWORKS=base,solana
FACILITATOR_URL=https://x402.dexter.cash
ATTESTATION_HMAC_SECRET=<openssl rand -hex 32>
```

**Never** set on server: `SOLANA_PRIVATE_KEY`, `EVM_PRIVATE_KEY` (receive-only server).

Optional:

```env
ALLOW_VERIFIER_PROBE_IDS=1   # Dexter/x402gle empty-body attestation probe only
RATE_LIMIT_PER_MIN=120
X402GLE_CHALLENGE_TOKEN=...  # domain claim; rotate after verify
```

## Known limitations (document for integrators)

1. **MPP sessions / agent escrow** — in-memory ledger; session IDs are not bound to payer wallet yet. Use for planning, not custody.
2. **Spend governor** — `agentId` is client-supplied; bind to wallet in your fleet orchestrator.
3. **Attestation registry GET** — paid but returns metadata; cap `limit` ≤ 100.
4. **Identity gate** — heuristic only; not on-chain KYC.
5. **Edge rate limits** — add Cloudflare/Railway WAF for high-traffic abuse.

## Incident response

1. Rotate `ATTESTATION_HMAC_SECRET` (invalidates old attestations).
2. Rotate receive wallets if payer keys leaked.
3. Revoke `X402GLE_CHALLENGE_TOKEN` after domain claim.
4. Review Railway logs for `[x402] settled` anomalies.

## Reporting

Open a private security issue on the repository or contact the maintainer listed in `package.json`.
