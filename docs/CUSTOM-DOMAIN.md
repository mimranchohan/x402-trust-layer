# Custom domain setup — x402trustlayer.xyz (Porkbun → Railway)

Your registered domain: **https://x402trustlayer.xyz** (Porkbun)

Brand: **TrustLayer X402** — the trust layer for agent payments.

---

## Step 1 — Railway: add custom domain

1. Open [Railway](https://railway.app) → your **x402-agent-suite** service.
2. **Settings → Networking → Custom Domain → + Custom Domain**.
3. Enter: `x402trustlayer.xyz`
4. Railway shows a **CNAME target**, e.g. `x402-agent-suite-production.up.railway.app` — copy it.

Optional later: `api.x402trustlayer.xyz`, `docs.x402trustlayer.xyz`, `status.x402trustlayer.xyz` (same CNAME target).

---

## Step 2 — Porkbun: DNS records

1. Log in to [Porkbun](https://porkbun.com) → **Domain Management** → **x402trustlayer.xyz** → **DNS**.
2. Add these records:

| Type | Host | Answer / Value | TTL |
|------|------|----------------|-----|
| **ALIAS** or **CNAME** | `@` (root/apex) | `x402-agent-suite-production.up.railway.app` | 600 |
| **CNAME** | `www` | `x402-agent-suite-production.up.railway.app` | 600 |

> **Porkbun apex:** If `@` ALIAS is not offered, use Porkbun’s **URL Forward** for the naked domain → `https://www.x402trustlayer.xyz`, and point `www` CNAME to Railway. Or enable Porkbun **ALIAS** at root (supported on `.xyz`).

3. Remove conflicting A records on `@` if Railway asks you to.
4. Wait **5–30 minutes** for DNS propagation (sometimes up to 2 hours).

---

## Step 3 — Railway: set public URL

In **Railway → Variables**, add or update:

```
PUBLIC_BASE_URL=https://x402trustlayer.xyz
```

Keep everything else unchanged:

- `PAY_TO_ADDRESS` / `PAY_TO_EVM`
- `NETWORKS=solana,base` (or your current value)
- `ATTESTATION_HMAC_SECRET`

Redeploy (or save variables — Railway redeploys automatically).

---

## Step 4 — Verify it works

```bash
# Landing page (browser)
curl -H "Accept: text/html" https://x402trustlayer.xyz | head -20

# API health
curl https://x402trustlayer.xyz/health

# x402 discovery
curl https://x402trustlayer.xyz/.well-known/x402 | head
curl https://x402trustlayer.xyz/openapi.json | head
```

Browsers → TrustLayer landing page. Agents / verifiers → JSON (same path, content negotiation).

---

## Step 5 — Re-register on x402scan / x402gle

After the domain is live, register the **new origin** so directories show your brand URL:

```bash
node scripts/register-x402scan.mjs https://x402trustlayer.xyz
```

Discovery check:

```bash
npm run discovery:check -- https://x402trustlayer.xyz/api/x402/proxy
```

The old Railway URL can stay as a fallback; agents should prefer the custom domain in docs and OpenAPI.

---

## Step 6 — SSL

Railway provisions **Let’s Encrypt TLS** automatically once DNS resolves. No extra cert step on Porkbun if DNS points directly to Railway.

If you later put **Cloudflare** in front (optional): set SSL mode to **Full (strict)**.

---

## Porkbun notes (.xyz)

- `.xyz` is usually **$1–3 first year**, renewal often **~$10–12/year** on Porkbun — check your exact renewal in the Porkbun dashboard before auto-renew.
- **WHOIS privacy** is free on Porkbun — leave it on.
- **Auto-renew** — enable so the domain doesn’t lapse.

---

## Quick checklist

- [ ] Domain bought on Porkbun (`x402trustlayer.xyz`)
- [ ] Custom domain added in Railway
- [ ] DNS ALIAS/CNAME → Railway target
- [ ] `PUBLIC_BASE_URL=https://x402trustlayer.xyz`
- [ ] `curl https://x402trustlayer.xyz/health` returns `ok: true`
- [ ] x402scan re-register from new origin
- [ ] README / GitHub homepage already points to x402trustlayer.xyz
