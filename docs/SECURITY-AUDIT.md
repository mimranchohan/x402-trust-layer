# Security Audit — Alchemy Live Demo Release

**Date:** 2026-06-01  
**Scope:** Trust Layer API, webhook beta, Alchemy demo path, npm dependencies

## Summary

| Severity | Found | Fixed in this release |
|----------|-------|----------------------|
| High | 2 | 2 |
| Medium | 3 | 1 |
| Low | 2 | 0 (documented) |

---

## Fixed (High)

### 1. Webhook SSRF via registration + dispatch

**Issue:** `POST /api/webhooks/register` accepted any URL including `http://127.0.0.1`, `http://169.254.169.254`, etc. `dispatchWebhooks` would POST to those URLs on guard events — classic SSRF.

**Fix:** `assertValidWebhookUrl()` in `src/lib/webhooks.ts` — reuses SSRF denylist + requires HTTPS.

### 2. Unauthenticated webhook test dispatch in production

**Issue:** `POST /api/webhooks/test-dispatch` triggered outbound HTTP to all registered webhooks with no auth — abuse vector for SSRF amplification.

**Fix:** In production/Railway, requires `WEBHOOK_TEST_SECRET` env and matching `X-Webhook-Test-Secret` header.

---

## Fixed (Medium)

### 3. Risk gate false-positive on Alchemy gateway

**Issue:** Bare probes to `x402.alchemy.com` return 401/500 (SIWE required), which could inflate risk scores or block legitimate agent flows.

**Fix:** `src/lib/agentic-gateways.ts` whitelists known SIWE-first gateways; `risk-gate.ts` skips false “unprotected endpoint” penalties.

---

## Open / Accepted (documented)

### 4. Webhook registration has no fleet auth (Medium)

Anyone can register webhooks for any `fleetId`. Mitigation: beta feature; URLs now SSRF-filtered. **Recommendation:** add HMAC or API key before GA.

### 5. Webhook list is public (Low)

`GET /api/webhooks/list` returns subscription metadata without auth. **Recommendation:** require `fleetId` + shared secret.

### 6. npm transitive vulnerabilities (Medium)

`npm audit` reports 9 issues in `@solana/web3.js` / `bigint-buffer` via `@dexterai/x402`. Root `package.json` overrides `bigint-buffer` → `bigint-buffer-safe`; upstream Dexter/Solana fix pending.

### 8. Node fetch + x402 header casing (Medium — mitigated)

`fetch()` forbids `Payment-Signature` (mixed case). Use **`PAYMENT-SIGNATURE`**. Demo uses `node:https` in `src/lib/alchemy-x402-fetch.ts`.

`data/spend.json` on disk — not tamper-proof across restarts in multi-instance deploy. **Recommendation:** Postgres (already on roadmap P2).

---

## Demo script security

- `EVM_PRIVATE_KEY` read from env only — never logged or committed
- `assertDemoPayerNotReceiveWallet()` blocks self-payment to seller receive wallet
- Alchemy calls use official `@alchemy/x402` — no custom payment signing
- Trust Layer calls use `@dexterai/x402/client` wrapFetch

---

## Pre-deploy checklist

- [ ] `ATTESTATION_HMAC_SECRET` set (32+ chars) on Railway
- [ ] `WEBHOOK_TEST_SECRET` set if using test-dispatch in prod
- [ ] `PAY_TO_EVM` ≠ demo payer wallet
- [ ] Rate limits: `RATE_LIMIT_PER_MIN`, `RATE_LIMIT_UNPAID_PER_MIN`
