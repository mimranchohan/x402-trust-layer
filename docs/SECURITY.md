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

Full truth sheet: **[LIMITATIONS.md](./LIMITATIONS.md)** (persistence, accuracy, centralization, HMAC, wash-trade).

1. **Persistence** — core state in **SQLite** on one volume; not Postgres yet. Residual JSON files must not be multi-writer. Multi-instance deploy → plan Postgres.
2. **Accuracy** — trust scores are heuristics; every paid response includes `confidence` + `accuracy_note` (no 100% guarantee).
3. **Availability** — centralized HTTPS service; no on-chain fallback if `x402trustlayer.xyz` is down (cache / self-host / local caps).
4. **MPP / escrow** — session IDs not fully bound to payer wallet in all paths; use for orchestration, not legal custody without review.
5. **Spend governor** — `agentId` is client-supplied; bind to wallet in your fleet orchestrator.
6. **Identity gate** — heuristic only; not on-chain KYC.
7. **Wash-trade** — `merchant-trust/score` uses supplied/ingested telemetry, not on-chain wash forensics.
8. **Edge rate limits** — add Cloudflare/Railway WAF for high-traffic abuse.

## HMAC secret rotation (`ATTESTATION_HMAC_SECRET`)

There is **no** automatic dual-key rotation in app code today. Manual rotation:

1. `openssl rand -hex 32` → new secret.
2. Update Railway/env → redeploy (rolling restart).
3. Expect all existing attestations to **fail** `POST /api/attestation/verify` until re-issued.
4. Re-run `POST /api/attestation/issue` for active agents.
5. Review access logs; consider temporary `RATE_LIMIT_PER_MIN` reduction during incident.

Optional future: `ATTESTATION_HMAC_SECRET_PREVIOUS` grace window (not implemented).

## Incident response

1. Rotate `ATTESTATION_HMAC_SECRET` (invalidates old attestations) — steps above.
2. Rotate receive wallets if payer keys leaked.
3. Revoke `X402GLE_CHALLENGE_TOKEN` after domain claim.
4. Review Railway logs for `[x402] settled` anomalies.

## Reporting

Open a private security issue on the repository or contact the maintainer listed in `package.json`.
