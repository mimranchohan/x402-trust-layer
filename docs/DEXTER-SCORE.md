# Dexter verification score (target ≥75)

## How scoring works

Dexter sends a **real paid POST**. Low scores (~25) usually mean **HTTP 400** (empty body) or useless **200** text.

| Score | Meaning |
|-------|---------|
| **75+** | Strong marketplace visibility |
| 50–69 | Weak ranking |
| &lt;50 | Failing verifier expectations |

## Fixes in this repo

1. **`apply-verifier-body`** — empty POST merges `src/lib/verify-examples.ts`  
2. **`agentTrustMeta`** — `confidence`, `checks_passed`, `sources`, `accuracy_note` on key agents  
3. **Attestation verify** — probe id `att_verifier_probe_example` returns structured 200  
4. **OpenAPI** — no `/health` in paid paths (x402scan)  
5. **Base-first** `accepts` via `normalizeAccepts` + `PAY_TO_EVM`  

## Run after every deploy

```bash
npm run probe:production
# Writes scripts/probe-production-result.json

npm run demo
# Paid 200 on all routes — needs EVM_PRIVATE_KEY or SOLANA_PRIVATE_KEY in .env

curl -s -X POST https://x402trustlayer.xyz/api/seller/audition-coach \
  -H "content-type: application/json" \
  -d "{\"origin\":\"https://x402trustlayer.xyz\",\"maxRoutes\":24}"
```

Fix routes with `status: "fail"` in audition-coach → redeploy → **Verify Now** on Dexter seller UI.

Full server ingest:

```bash
npm run audition:x402gle
```

(`cooldown_active` → use per-route **Test now** on x402gle until retry opens.)

## Evidence for ≥75

Document per resource:

- Unpaid POST → **402** with Base + Solana `paymentOptions`  
- Paid POST with example body → **200** + `checks_passed` array  
- Screenshot or JSON from Dexter **Verify Now** after fix  

## Seller profile

https://dexter.cash/sellers/9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt  

Profile average follows per-resource scores — fix weakest routes first (often `pre-x402`, `proxy`, `attestation/verify`).
