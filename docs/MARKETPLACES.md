# Listing on Dexter, x402scan, and Agentic

**Production:** https://x402trustlayer.xyz  
**Paid routes:** 24 (never register `/health` on x402scan)

There is no single API to list everywhere. Use this checklist per channel.

---

## Master checklist

### Dexter (primary)

- [ ] `FACILITATOR_URL=https://x402.dexter.cash` on Railway  
- [ ] `NETWORKS=base,solana`, `PAY_TO_EVM` + `PAY_TO_ADDRESS` set  
- [ ] `npm run probe:production` — 24 resources in `/.well-known/x402`  
- [ ] `npm run demo` — real USDC settlements (run **×3** per route over a week for volume)  
- [ ] Seller profile: https://dexter.cash/sellers/9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt  
- [ ] **Verify Now** on each resource (target score **≥75**)  
- [ ] `POST /api/seller/audition-coach` — fix all `fail` routes before re-verify  

### x402scan

- [ ] Open https://www.x402scan.com/resources/register  
- [ ] Add **server URL** = production base (no trailing slash)  
- [ ] Confirm only **paid** URLs from `GET /.well-known/x402` (24) — **not** `/health`  
- [ ] `npm run discovery:check -- https://x402trustlayer.xyz/api/x402/proxy`  

### Agentic Market

- [ ] After pull: `npm run openapi:generate` and commit `openapi.json` if changed  
- [ ] Guide: [AGENTIC-MARKET.md](./AGENTIC-MARKET.md)  
- [ ] Validate Endpoint for primary URLs (proxy, guard, pipeline)  
- [ ] HTTPS resource URLs; Base USDC first in `accepts`  

### Code sync (P3)

- [ ] `routes.ts` ↔ `openapi.json` ↔ `/.well-known/x402` ↔ `/x402/api/services.json` — same 24 paths  
- [ ] `ownershipProofs` in OpenAPI `x-discovery` (Solana + EVM wallets)  
- [ ] Empty POST → `verify-examples` merge → **200** (not 400)  

---

## Growth (honest)

We do **not** claim all agents must use this suite. Growth comes from:

- Default preflight in README / `x402-preflight` npm docs  
- Real settlement volume (`demo` ×3 per route)  
- Dexter scores **≥75** on all 24 resources  
- Buy advisor + audition coach for marketplace sellers  

---

## Per new endpoint

| Step | Action |
|------|--------|
| 1 | Add route + `VERIFY_EXAMPLES` + OpenAPI meta |
| 2 | Deploy Railway |
| 3 | `probe:production` + audition-coach |
| 4 | Paid call ×3 |
| 5 | Dexter Verify Now |
| 6 | Update INTEGRATE / AUDIT-TABLE |

---

## Commands

```bash
npm run probe:production
npm run discovery:check -- https://x402trustlayer.xyz/api/x402/proxy
npm run discovery:discover -- https://x402trustlayer.xyz
npm run demo
npm run audition:x402gle
```
