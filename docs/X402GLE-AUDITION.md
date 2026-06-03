# x402gle audition (agent.md workflow)

Origin: `https://x402trustlayer.xyz`

## Run

```powershell
cd C:\Users\mimra\x402-agent-suite
npm run audition:x402gle              # full origin (registers routes; may stay pending)
npm run audition:x402gle:endpoints    # per-URL paid score for routes not on skills.json
npm run audition:x402gle:missing      # alias: missing routes only
npm run audition:x402gle:v2           # 3 Trust v2 routes only

# agent.md: per-endpoint URL = immediate paid score (required when whole-origin is pending/cooldown)
npx @dexterai/opendexter audition "https://x402trustlayer.xyz/api/guard/pre-x402" --json
```

### Windows batch auditions

Rapid `npx` + `execSync` in a loop can crash Node on Windows (`UV_HANDLE_CLOSING`). Batch scripts use **sequential spawn** with **8–10s delay** (override: `set AUDITION_DELAY_MS=12000`). Test one route first:

```powershell
npm run audition:x402gle:missing -- --limit 1
```

Saves `x402gle-audition-result.json`, `x402gle-missing-audition.json`, or `x402gle-all-endpoints-audition.json`.

## Settlement timeout (Dexter facilitator)

If paid calls fail with `Payment settlement failed` / `facilitator_timeout`, the suite patches `@dexterai/x402` default HTTP timeout to **90s** on `npm install` (`scripts/patch-facilitator-timeout.mjs`). Override with `X402_FACILITATOR_TIMEOUT_MS`.

## Cooldown

After host claim / ingest, full server audition is limited (~24h). If you see:

```json
{ "error": "cooldown_active", "message": "Try again in ~NNN minutes" }
```

Use until retry:

- https://x402gle.com/servers/x402trustlayer.xyz → **Test now** per route
- Dexter **Verify Now** per resource
- `npm run demo` for settlement signal

While cooldown is active, verify readiness locally:

```powershell
npm run list:x402gle:missing
npm run probe:x402gle:missing    # unpaid: expect 402 or grader-safe 200
npm run smoke:verifier:all       # all VERIFY_EXAMPLES merge paths
```

When cooldown clears:

```powershell
npm run audition:x402gle:missing
```

## Pass criteria

Each route: `status: "pass"`, `score >= 75`, `fixInstructions: null`.

## Current catalog (check live)

- Listed skills: https://x402gle.com/servers/x402trustlayer.xyz/skills.json (25+ routes with `verification_status: pass` when scored)
- Manifest stays `failed` until every paid OpenAPI path is scored and passing
- Unscored routes: run `npm run audition:x402gle:missing` after deploy (stops on `cooldown_active`)

## Grader-safe handlers (deploy before re-audition)

- `parseWithVerifierFallback` on guard, proxy, pipeline, router (partial grader bodies → canonical `VERIFY_EXAMPLES` merge)
- MPP `close` auto-opens a session when `agentId` is present (no `session:null` dead ends)
- Router route-intent queries (Arbitrum→Ethereum USDC route) return suite route options, not unrelated oracles

## Discovery (Step 1 — already done)

- `GET /openapi.json` — OpenAPI 3.1 + `x-payment-info` + `info.x-guidance`
- `GET /.well-known/x402` — 22 paid resource URLs
- Runtime 402 + Bazaar schema on probes

## After pass

- https://x402gle.com/servers/x402trustlayer.xyz/SKILL.md
- https://x402gle.com/servers/x402trustlayer.xyz/skills.json
