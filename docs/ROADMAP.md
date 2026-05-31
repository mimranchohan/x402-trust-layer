# Product roadmap

## P0 — Trust (week 1)

- [x] Security hardening v3.1 (SSRF, HMAC attestations, rate limits)
- [x] `skill.md` + full `llms.txt` + `llms-full.txt` (31 routes)
- [x] Agentic Wallet integration doc + testnet guide
- [x] `x402-agent-suite-preflight@1.1.0` ready to publish
- [ ] Railway: `ATTESTATION_HMAC_SECRET` + redeploy with `NETWORKS=base,solana,polygon`
- [ ] Dexter Verify Now on proxy, guard, pipeline, buy-advisor
- [ ] x402scan: 24 paid URLs registered
- [ ] 3+ external paid calls (non-receive wallet)

## P1 — Developer adoption (weeks 2–3)

- [x] Publish `packages/x402-preflight` to npm (v1.1.0 — run `npm publish` from packages/x402-preflight)
- [x] `@x402trustlayer/mcp` MCP server (5 core tools)
- [x] `skill.md` + `llms.txt` + `llms-full.txt` at site root
- [x] Agentic Wallet integration doc (`docs/AGENTIC-WALLET.md`)
- [x] Testnet guide (`docs/TESTNET.md`)
- [x] Idempotency-Key on paid POSTs
- [x] Polygon network acceptance (NETWORKS=base,solana,polygon)
- [x] Per-route docs on landing (detail panel + ?agent= deep links)
- [x] Webhook beta (`POST /api/webhooks/register`)
- [ ] Postman collection from `openapi.json`
- [ ] Uptime monitor on `/health`
- [ ] Case study: one fleet integration end-to-end

## P2 — Scale (month 2)

- [ ] Postgres for attestations + spend ledger
- [ ] MPP sessions bound to x402 payer address
- [ ] Solana receipt RPC verification (Helius)
- [ ] Cloudflare / WAF in front of Railway

## P3 — Growth (month 3+)

- [ ] Dexter scores ≥75 on primary entrypoints
- [ ] Agentic Market featured listing
- [ ] x402gle pass rate >80% on audited routes
- [ ] Usage dashboard (settlements per route)
