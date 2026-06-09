# Marketplace Submission Files

This directory contains agent/service listing files for AI agent marketplaces.

## Files

| File | Marketplace | Status |
|------|------------|--------|
| `cdp-bazaar.json` | [Coinbase Developer Platform Bazaar](https://www.coinbase.com/developer-platform) | Ready to submit |
| `agentic-market.json` | [agentic.market](https://agentic.market) | Ready to submit |

## Discovery Endpoints (live on x402trustlayer.xyz)

```
GET /.well-known/agent.json   → A2A v1.2 signed agent card
GET /.well-known/x402.json    → x402 V2 protocol discovery
GET /.well-known/ap2.json     → Google AP2 payment discovery
GET /api/catalog              → Full endpoint catalog (JSON)
GET /health                   → Service health check
```

## Submission Instructions

### CDP Bazaar
1. Go to https://www.coinbase.com/developer-platform/marketplace
2. Sign in with Coinbase account
3. Click "Submit Agent" → fill form using `cdp-bazaar.json` as reference
4. Discovery URL: `https://x402trustlayer.xyz/.well-known/x402.json`

### agentic.market
1. Go to https://agentic.market/submit
2. Use `agentic-market.json` fields to fill the listing form
3. Agent card URL: `https://x402trustlayer.xyz/.well-known/agent.json`
4. Protocol: select x402, A2A, AP2

## Version
v5.5.0 — June 2026
