# Contributing

## Prerequisites

- Node.js 20+
- USDC on Base or Solana for integration tests (use a **payer** wallet, not `PAY_TO_*`)

## Local workflow

```bash
npm install
cp .env.example .env   # fill PAY_TO_* + ATTESTATION_DEV_SECRET locally
npm run dev            # :3402
npm run typecheck
npm run demo           # separate payer keys required
```

## Code standards

- TypeScript strict; Zod at route boundaries.
- One agent per file under `src/agents/`.
- Outbound HTTP must pass `assertSafeOutboundUrl` from `lib/ssrf.ts`.
- No secrets in source, docs examples, or commits.
- Paid route changes require updates to: `routes.ts`, `verify-examples.ts`, `openapi-agentcash.ts`, `suite-catalog.ts`.

## Pull requests

1. Focused diff — one feature or fix per PR.
2. Update `docs/SECURITY.md` if threat model changes.
3. Run `npm run typecheck` and `npm run probe:production` against staging when touching x402.

## Commit messages

Use imperative mood: `fix(ssrf): block redirect chains in probe`, `feat(attestation): HMAC secret from env`.
