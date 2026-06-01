# x402gle audition (agent.md workflow)

Origin: `https://x402trustlayer.xyz`

## Run

```powershell
cd C:\Users\mimra\x402-agent-suite
npm run audition:x402gle          # full origin (may cooldown)
npm run audition:x402gle:v2       # 3 Trust v2 routes only (~$0.51 USDC if all pay)
```

Saves `x402gle-audition-result.json` or `x402gle-v2-audition-result.json`.

## Cooldown

After host claim / ingest, full server audition is limited (~24h). If you see:

```json
{ "error": "cooldown_active", "message": "Try again in ~NNN minutes" }
```

Use until retry:

- https://x402gle.com/servers/x402trustlayer.xyz → **Test now** per route
- Dexter **Verify Now** per resource
- `npm run demo` for settlement signal

## Pass criteria

Each route: `status: "pass"`, `score >= 75`, `fixInstructions: null`.

## Discovery (Step 1 — already done)

- `GET /openapi.json` — OpenAPI 3.1 + `x-payment-info` + `info.x-guidance`
- `GET /.well-known/x402` — 22 paid resource URLs
- Runtime 402 + Bazaar schema on probes

## After pass

- https://x402gle.com/servers/x402trustlayer.xyz/SKILL.md
- https://x402gle.com/servers/x402trustlayer.xyz/skills.json
