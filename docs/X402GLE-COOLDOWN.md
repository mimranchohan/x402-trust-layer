# x402gle “Test now” = same as CLI `cooldown_active`

## What you are seeing

**Test now** on [x402gle.com/servers/x402trustlayer.xyz](https://x402gle.com/servers/x402trustlayer.xyz) calls the **same Dexter/x402gle audition API** as:

```bash
npx @dexterai/opendexter audition "https://x402trustlayer.xyz/..." --json
```

So if the CLI returns:

```json
{ "error": "cooldown_active", "message": "Try again in ~NNN minutes" }
```

the website **Test now** will show the **same block** — this is **not** a bug in your Express app, OpenAPI, or Railway deploy.

x402gle spends **real USDC** per scored route and rate-limits **per origin** (~24h after a full ingest/audition).

## What still works (no paid audition)

| Action | Works during cooldown? |
|--------|-------------------------|
| `GET /openapi.json` (58 paid paths) | Yes |
| Unpaid POST `{}` → 402 | Yes (`npm run probe:x402gle:missing`) |
| 25 routes already on [skills.json](https://x402gle.com/servers/x402trustlayer.xyz/skills.json) with `pass` | Yes |
| Host page + manifest (`status: failed` until all routes pass) | Yes |

## What does not work until cooldown ends

- **Test now** per route
- `npm run audition:x402gle` / `audition:x402gle:endpoints`
- New paid scores for the **33 unscored** routes

## If the UI shows something other than cooldown

| Message | Fix |
|---------|-----|
| `cooldown_active` / “try again in N minutes” | Wait or contact Dexter (below) |
| `Payment settlement failed` | Fund **Base USDC** on the wallet x402gle/OpenDexter uses; retry one cheap route (`/api/spend-governor/check` $0.03) |
| Score &lt; 75 / `fixInstructions` | Fix handler + OpenAPI → deploy → retry after cooldown |

## Speed up listing (optional)

1. Email **branch@dexter.cash** (from [agent.md](https://x402gle.com/agent.md)) — ask for **cooldown reset** or **background scoring** for `x402trustlayer.xyz`.
2. After cooldown: run `npm run audition:x402gle:endpoints` with a funded `EVM_PRIVATE_KEY` (Dexter payer, not your seller `PAY_TO_*` wallets).
3. On Dexter seller dashboard: **Verify Now** on individual resources (same API; same cooldown if origin-limited).

## Your server is ready

Production (`417814d+`): 58 OpenAPI paths, verifier examples, 33/33 unpaid probes OK. The blocker is **x402gle policy**, not missing discovery.
