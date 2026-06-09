# Railway stuck on v2.0.0

If `/health` shows `"version":"2.0.0"` and `"endpointCount":15` but GitHub `main` has v2.1.0, traffic is hitting an **old Active deployment**.

## Fix checklist

1. **One service owns the domain**  
   Project → each service → **Settings → Networking**.  
   Only the service linked to `x402-agent-suite-production.up.railway.app` matters.

2. **Variables on that service** (required):

   - `PAY_TO_ADDRESS` = your Solana wallet  
   - `NETWORK` = `solana`

3. **Deployments → Active row**  
   - Commit message should include: `pre-x402 guard`  
   - SHA should start with `84fb6a1` (or newer)  
   - If Active is older (`b3aaef8` / `c470e72`), new deploys are **failing** — open failed deploy → **Build/Deploy logs**

4. **Redeploy** after variables are saved.

5. **Success**

   ```bash
   curl https://x402trustlayer.xyz/health
   ```

   Expect: `"version":"2.1.0"`, `"endpointCount":17`, optional `"gitCommit":"84fb6a1"`

## Nuclear option

1. Copy variables (`PAY_TO_ADDRESS`, `NETWORK`)  
2. Delete the crashing service OR create **New Service** from same GitHub repo  
3. Set variables **before** first deploy finishes  
4. Attach domain to the new service  
