# AgentCash discovery (agentcash.dev)

This suite follows the [AgentCash merchants guide](https://agentcash.dev/merchants.md) **Branch E** (x402 live → discovery hardening).

## What is implemented

| Requirement | Location |
|-------------|----------|
| OpenAPI 3.1 with `x-payment-info` | `GET /openapi.json` |
| Fixed USD pricing per route | `x-payment-info.price` |
| `protocols: [{ x402: {} }]` | All paid routes |
| MPP hint on session routes | `/api/mpp/session`, `/api/mpp/session-plan` also declare `{ mpp: ... }` |
| Request body schemas | From `VERIFY_EXAMPLES` |
| `info.x-guidance` | Agent usage instructions in OpenAPI |
| `x-discovery.ownershipProofs` | `PAY_TO_EVM` + `PAY_TO_ADDRESS` |
| Well-known fan-out | `GET /.well-known/x402` |
| Runtime 402 + Bazaar | Dexter middleware + `createPaidMiddleware()` |

Settlement remains **Dexter** (`FACILITATOR_URL`). CDP keys are optional if you later switch facilitators for Coinbase Bazaar auto-index.

## Validate locally

```powershell
npm run openapi:generate
# check probes one paid route (root URL returns L3_NOT_FOUND — expected)
npm run discovery:check -- https://x402trustlayer.xyz/api/x402/proxy
npm run discovery:discover -- https://x402trustlayer.xyz
```

Runtime 402 must match `@agentcash/discovery` extractor shape (see `bazaar-extension.ts`):

- `extensions.bazaar.schema.properties.input.properties.body` — POST JSON schema
- `extensions.bazaar.schema.properties.input.properties.queryParams` — GET query schema
- `extensions.bazaar.schema.properties.output.properties.example` — response example object

Local shape test: `npm run verify:bazaar`

## Register

1. **x402scan:** https://www.x402scan.com/resources/register  
   - **Add Server:** `https://x402trustlayer.xyz`  
   - OpenAPI declares **`GET /.well-known/x402`** and **`GET /health`** as **free** (`security: []`) — x402scan must not require 402 on them.  
   - Paid routes are only under `/api/*` (24).  
   - Or **Register URL Only** per paid path: `GET /api/agentic/validate-urls`

## x402scan: `/.well-known/x402` returned HTTP 200

That URL is a **free resource catalog**, not a payable endpoint. After deploy, `/openapi.json` marks it with `"security": []`. Re-run **Add Server**.

If one path still fails, use **Register This URL Only** for paid APIs (e.g. `/api/x402/proxy`), not for `/.well-known/x402`.

## x402scan: `/health` registration failure

`/health` is also **free** in OpenAPI (`security: []`). Do not register it as a paid x402 route.

2. **AgentCash:** agents discover via OpenAPI + runtime 402 after registration.

3. **mppscan** (optional MPP): https://www.mppscan.com/register — only if you add full `@agentcash/router` MPP settlement later.

## After deploy

1. `git push` → Railway redeploy  
2. `curl https://YOUR_APP/openapi.json` — confirm `x-payment-info` on paid paths  
3. `curl https://YOUR_APP/.well-known/x402` — list of 22 resource URLs  
4. Run `discovery:check` on production URL  
5. Register on x402scan  
6. Keep `npm run demo` settlements for indexer activity

## Optional upgrades (not required now)

- **CDP facilitator** + `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` for Coinbase-native Bazaar indexing  
- **`@agentcash/router`** if you want dual x402+MPP on one Next.js proxy  
- **Tempo RPC** + `MPP_*` env vars for full MPP settlement (see merchants.md)
