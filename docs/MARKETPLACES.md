# Listing Beyond Dexter

Dexter auto-lists resources after **paid settlements** through `https://x402.dexter.cash`.  
Other marketplaces require **separate steps** — there is no single API to list everywhere at once.

## 1. Dexter (primary)

1. Deploy with `FACILITATOR_URL=https://x402.dexter.cash`
2. Run `npm run demo` against production (real USDC)
3. Wait 15–30 minutes
4. Public profile: `https://dexter.cash/sellers/<PAY_TO_ADDRESS>`
5. **Verify Now** on each resource

## 2. OpenDexter / x402_search

Agents discover you via semantic search after Dexter indexes your URLs.

**Optimize titles in middleware descriptions** (already set in code).

## 3. Agentic Market (https://agentic.market/)

Coinbase-operated agent directory. **Full guide:** [AGENTIC-MARKET.md](./AGENTIC-MARKET.md)

Quick steps:

1. Deploy latest code — exposes:
   - `/.well-known/x402.json`
   - `/x402/api/services.json` (22 routes, `bazaar.discoverable: true`)
   - `/x402/api/discover`
2. **Validate Endpoint** on agentic.market for each resource URL (or use CDP facilitator for auto-index).
3. Optional: GitHub issue on [x402-foundation/x402](https://github.com/x402-foundation/x402) with manifest URLs.

**Note:** Dexter settlements index **Dexter**, not Agentic automatically. Use Agentic steps above in addition to Dexter demo.

## 4. Coinbase x402 Bazaar / CDP discovery

- Publish your `openapi.json` publicly
- CDP facilitator: `https://api.cdp.coinbase.com/platform/v2/x402` + `declareDiscoveryExtension()` per route
- Manifest: https://x402-agent-suite-production.up.railway.app/x402/api/services.json

## 5. PayAI / x402.echo network

Many agents use `x402.payai.network` patterns. To appear nearby:

- Ensure endpoints return standard **402** with USDC accepts
- Document integration in GitHub README
- Post your seller profile + OpenAPI link in community channels

## 6. Self-hosted discovery (recommended)

Ship an npm helper:

```bash
npm install @dexterai/x402
```

Point default preflight to:

`https://x402-agent-suite-production.up.railway.app/api/x402/proxy`

## 7. GitHub + README badges

Add to README:

```markdown
[![x402](https://img.shields.io/badge/x402-Agent%20Suite-v3-blue)](https://x402-agent-suite-production.up.railway.app)
```

## Checklist per new endpoint

| Step | Action |
|------|--------|
| 1 | Deploy to Railway |
| 2 | Paid call ×3 via demo |
| 3 | Dexter seller profile shows resource |
| 4 | Verify Now |
| 5 | Add to INTEGRATE.md / WHY-SERVICES.md |

## Honest note on “forced adoption”

No marketplace can force all agents to call your APIs. Growth comes from:

- **Default SDK preflight** (proxy/guard)
- **MPP savings** (real money)
- **Attestation trust** between partner agents
- **Dexter verification score 75+**
