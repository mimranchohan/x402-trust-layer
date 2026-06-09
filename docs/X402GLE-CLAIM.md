# x402gle / Dexter host claim (domain verify)

Claim UI: https://x402gle.com/manage/claim or Dexter seller **Claim** flow.

## Your host

```
https://x402trustlayer.xyz
```

## Which verify method to use on Railway

| Method | Railway `*.up.railway.app` |
|--------|----------------------------|
| **DNS TXT** | Does not work — you do not control `railway.app` DNS |
| **Cloudflare auto** | Only if you use a **custom domain** on Cloudflare |
| **Well-known file** | Recommended |
| **HTTP header** | Works after deploy (middleware sets header) |

## Steps (Well-known — recommended)

1. Copy **Value** from claim UI (e.g. `W1TecNeKofr3Aij3lm0zVEfWnTjmOXocGjV4u6v0cS4`).
2. Railway → Variables → add:
   ```
   X402GLE_CHALLENGE_TOKEN=<paste Value exactly>
   ```
3. Deploy (push `main` or Redeploy).
4. Test:
   ```powershell
   curl.exe https://x402trustlayer.xyz/.well-known/x402-host-challenge
   ```
   Output must be **only** the token string.
5. In claim UI → select **Well-known file** → **Verify** (before timer expires).

If the UI shows a different path, use that path — we also serve:

- `/.well-known/x402-host-challenge`
- `/.well-known/x402gle-challenge`
- `/.well-known/x402-host-challenge.txt`
- `/.well-known/x402gle-challenge.json` (`{"challenge":"..."}`)

## Steps (HTTP header)

1. Set `X402GLE_CHALLENGE_TOKEN` on Railway (same as above).
2. Deploy.
3. Test:
   ```powershell
   curl.exe -I https://x402trustlayer.xyz/ | findstr X-X402GLE-VERIFY
   ```
4. Claim UI → **HTTP header** → **Verify**.

Header name must be exactly `X-X402GLE-VERIFY` (x402gle UI).

## After verify

- Host status: **Verified**
- Run audition: `npx @dexterai/opendexter audition https://x402trustlayer.xyz --json`
- Public page: `https://x402gle.com/servers/x402trustlayer.xyz`
