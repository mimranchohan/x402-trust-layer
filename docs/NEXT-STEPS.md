# Next steps (operator runbook)

## Done in repo

- [x] Production hardening Phases 1–8
- [x] Docker non-root + `/app/data` permissions
- [x] Routes organized under `src/routes/` (`register-all.ts`, `catalog`, `schemas`, `shared`)
- [x] CI: `npm run ci` (typecheck, bazaar, vitest, golden, nonce, verifier smokes)

## You should do now

1. **Railway volume** — mount **`/app/data`** only (not `/app`); `DATA_DIR=/app/data` or omit (see `docs/RAILWAY-DEPLOY.md`)
2. **Confirm env** — `ATTESTATION_HMAC_SECRET`, `PAY_TO_EVM`, `PUBLIC_BASE_URL`
3. **x402gle** — wait for cooldown, then `npm run audition:x402gle:endpoints`
4. **Register discovery** — x402scan / AgentCash with `/.well-known/x402/v2` URLs

## Optional code follow-ups

- Split `register-all.ts` into `guard.ts`, `trust.ts`, `market.ts`, … (scaffolding in `src/routes/shared.ts`)
- Install OTEL: `@opentelemetry/sdk-node` + `OTEL_ENABLED=1`
- Dependency upgrades for `uuid` / `glob` deprecation warnings
