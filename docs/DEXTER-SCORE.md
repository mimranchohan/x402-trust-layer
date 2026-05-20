# Improving Dexter Verification Scores

If your marketplace grade is **~25**, the AI verifier likely received **HTTP 400** (invalid JSON body) instead of a useful **paid 200** response.

## How Dexter scores (0–100)

| Score | Grade | Marketplace |
|-------|-------|-------------|
| 75+ | Auto-approved | Strong visibility |
| 70+ | C+ | Full refund protection |
| 50–69 | D | Weak ranking |
| &lt;50 | F | Poor / flagged |

The verifier sends a **real paid request**. It expects:

1. Specific JSON that answers the request  
2. Not empty or generic errors  
3. Response under ~30KB  
4. Reliable uptime  

## Why POST APIs score low

All suite agents use **POST + JSON**. If the verifier sends an **empty body**, you get:

```json
{ "error": { ... validation ... } }
```

That scores as **low quality** (~25).

## Fix (v2.0.1+)

This repo injects **canonical example bodies** when the request body is empty, and adds **descriptions** on each x402 route for discovery.

After deploy:

1. Wait 24h for automatic re-verification, or  
2. Open each resource on your [seller dashboard](https://dexter.cash/sellers) and click **Verify Now** (1h cooldown)

## Manual checks

```bash
# Unpaid → must be 402
curl -i -X POST https://x402-agent-suite-production.up.railway.app/api/spend-governor/check

# Paid call via npm run demo → 200 with allowed:true
```

## Seller profile vs resource score

- **Resource score** = per API endpoint  
- **Seller profile** = aggregate of your resources  

Raise resource scores first; the profile average follows.
