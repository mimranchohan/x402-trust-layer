# Production hardening (8 phases)

Phases 1–3 and most of 4–8 are implemented in this repo. Run after changes:

```bash
npm run ci
```

## Phase map

| Phase | Status | Notes |
|-------|--------|-------|
| 1 Security | Done | HMAC webhooks, timing-safe replay, Redis SSRF, mandates SQLite, LLM sanitize, helmet |
| 2 Data | Done | `protocol_kv`, idempotency SQLite, webhooks SQLite, credit bureau writes |
| 3 Protocol/SSRF | Done | DNS rebinding, probe micro-units, ZK transparency, payTo guard, rate limits |
| 4 A2A/MCP | Done | `/.well-known/agent.json`, mandate VC, `ai-plugin.json`, MCP version in docs script |
| 5 Architecture | Partial | Unified `escrows` table + sync; routes in `src/routes/register-all.ts` + `schemas.ts` + `shared.ts`; thin `src/routes.ts` re-export |
| 6 Observability | Partial | Vitest unit tests, structured `logger`, optional OTEL (`OTEL_ENABLED=1` + packages), ESLint config |
| 7 Production | Done | Hardened Dockerfile, graceful shutdown, DB health, `/api/v1/*` rewrite, RFC 9457 errors |
| 8 Discovery | Done | `/.well-known/x402/v2`, `robots.txt`, v2 fields on `/.well-known/x402` |

## Optional env

- `CORS_ORIGINS` — comma-separated allowed origins
- `OTEL_ENABLED=1` — install OpenTelemetry SDK packages to enable tracing
- `LOG_LEVEL=debug` — verbose JSON logs

## Route modularization (5.2 follow-up)

Split `src/routes.ts` into `src/routes/guard.ts`, `trust.ts`, etc. using `createPost()` from `src/routes/shared.ts`.
