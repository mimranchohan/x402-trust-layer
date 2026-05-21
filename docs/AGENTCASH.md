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
npm run discovery:check -- https://x402-agent-suite-production.up.railway.app/api/x402/proxy
npm run discovery:discover -- https://x402-agent-suite-production.up.railway.app
```

Runtime 402 must match `@agentcash/discovery` extractor shape (see `bazaar-extension.ts`):

- `extensions.bazaar.schema.properties.input.properties.body` — POST JSON schema
- `extensions.bazaar.schema.properties.input.properties.queryParams` — GET query schema
- `extensions.bazaar.schema.properties.output.properties.example` — response example object

Local shape test: `npm run verify:bazaar`

## Register

1. **x402scan:** https://www.x402scan.com/resources/register  
   - **Add Server:** `https://x402-agent-suite-production.up.railway.app`  
   - Or **Register URL Only** per paid path from `/api/agentic/validate-urls`

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
