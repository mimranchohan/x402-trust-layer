# List on Agentic Market (agentic.market)

[Agentic Market](https://agentic.market/) is Coinbase’s public directory of **x402-paid HTTP services**. Agents discover, pay, and call APIs without API keys.

Your suite runs on **x402trustlayer.xyz** with **31 paid endpoints** (3 primary buyer entry points + 2 seller killers + 26 advanced incl. 7 Tier-1 enterprise agents). Listing is **not automatic from Dexter alone** — Agentic indexes the **x402 Bazaar / CDP discovery** pipeline and validated x402 endpoints.

---

## How Agentic Market lists services

| Path | What happens |
|------|----------------|
| **A. CDP Facilitator + Bazaar extension** | Settlements through `https://api.cdp.coinbase.com/platform/v2/x402` with `declareDiscoveryExtension()` on each route → indexed in CDP discovery → surfaces on Agentic Market (often within ~10 minutes after settlement). |
| **B. Discovery manifest URLs** | Crawlers read your public manifest (we expose these on your suite). |
| **C. Validate Endpoint (UI)** | You paste each resource URL on [agentic.market](https://agentic.market/) → tool checks HTTP 402 + metadata. |
| **D. GitHub ecosystem request** | Open an issue on [x402-foundation/x402](https://github.com/x402-foundation/x402) with manifest URLs (manual reindex). |

**Today your live facilitator is Dexter** (`https://x402.dexter.cash`) — that indexes **Dexter + OpenDexter**, not Agentic automatically. For Agentic you need **A and/or C** (and our manifests for **B**).

---

## URLs already on your deployment (after you push latest code)

Replace `BASE` with **https://x402trustlayer.xyz** (set `PUBLIC_BASE_URL` on Railway to this domain):

| URL | Purpose |
|-----|---------|
| `BASE/.well-known/x402.json` | Well-known x402 config |
| `BASE/x402/api/services.json` | Bazaar-style manifest (`extensions.bazaar.discoverable`) |
| `BASE/x402/api/discover` | Discovery catalog (all 31 resources) — **note `/api/` in path** |
| `BASE/openapi.json` | OpenAPI 3.1 (v3, all paths) |

Example:

```
https://x402trustlayer.xyz/x402/api/services.json
https://x402trustlayer.xyz/llms.txt
```

---

## Step-by-step: list all 31 paid routes on Agentic Market

### Step 0 — Railway variables (required for Agentic simulate)

Agentic’s simulator expects **HTTPS resource URLs** and **Base USDC** (`eip155:8453`) as the first payment option.

In **Railway → Variables** set:

```env
PUBLIC_BASE_URL=https://x402trustlayer.xyz
NETWORKS=base,solana
PAY_TO_ADDRESS=9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt
PAY_TO_EVM=0xYourBaseWalletAddress
FACILITATOR_URL=https://x402.dexter.cash
```

Redeploy, then check:

```powershell
curl.exe https://x402trustlayer.xyz/health
```

Expect: `"agenticReady": true` and `"chains":["base","solana"]`.

Test 402 (first `accepts` entry should be Base):

```powershell
curl.exe -i -X GET https://x402trustlayer.xyz/api/x402/proxy
```

Decode `Payment-Required` header — `resource.url` must start with `https://` and `accepts[0].network` should be `eip155:8453`.

### Step 1 — Deploy discovery routes

Push latest `main` to Railway. Confirm:

```powershell
curl.exe https://x402trustlayer.xyz/x402/api/discover

Wrong (404 until alias deploy): `/discover` or `/x402/discover` — use `/x402/api/discover`.
```

You should see `"endpointCount": 24` and a `resources` array.

### Step 2 — Validate each endpoint (fastest for Dexter-only sellers)

**Important:** Agentic’s validator sends an unauthenticated **GET** request. Our suite registers a **GET probe** on every POST path so you get **HTTP 402** (not 404). After you deploy the latest code, validate URLs like:

```
https://x402trustlayer.xyz/api/x402/proxy
```

(not `/discover` — that is a catalog, not a paid API).

1. Open https://agentic.market/
2. Go to **Seller Tools** → **Validate Endpoint** (or “Get started” → seller flow)
3. For **each** paid URL, submit the full resource URL, for example:

```
https://x402trustlayer.xyz/api/x402/proxy
https://x402trustlayer.xyz/api/guard/pre-x402
https://x402trustlayer.xyz/api/mpp/session
... (all 22 from /x402/api/discover)
```

4. Each URL must return **HTTP 402** on unpaid **GET** with:
   - `PAYMENT-REQUIRED` response header (x402 v2)
   - `extensions.bazaar` in the encoded payload (latest suite injects this)
5. If you see **404**, redeploy latest `main` — GET probes were added for Agentic.
6. **Bazaar indexing on Agentic** may still require settlements via **CDP facilitator**; Dexter + GET 402 is enough for **Validate Endpoint** to pass transport checks.

**Tip:** Run one paid `npm run demo` call per endpoint so Agentic sees real settlement activity.

### Step 3 — Optional: CDP facilitator for auto-Bazaar index (recommended for full Agentic sync)

To get **all endpoints indexed without validating 22 URLs manually**:

1. Add a **Base** (or Solana) route variant using CDP facilitator URL in env (separate deploy or dual-middleware — advanced).
2. Register CDP API keys per [Coinbase x402 seller quickstart](https://docs.cdp.coinbase.com/x402/quickstart).
3. Attach `declareDiscoveryExtension()` per route (requires `@coinbase/x402` or CDP SDK — different from Dexter middleware).
4. Complete **≥1 successful settlement per route** through CDP.

Many Agentic listings show `eip155:8453` (Base USDC). Your Solana wallet can stay on Dexter; add `PAY_TO_EVM` for Base listings.

### Step 4 — GitHub ecosystem listing (backup)

Open a issue like [x402-foundation/x402#2132](https://github.com/x402-foundation/x402/issues/2132) with:

- Service name: **x402 Agent Suite Pro**
- Manifest: `https://x402trustlayer.xyz/x402/api/services.json`
- Discovery: `https://x402trustlayer.xyz/x402/api/discover`
- Well-known: `https://x402trustlayer.xyz/.well-known/x402.json`
- Seller wallet: `9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt`
- Facilitator: Dexter (primary) + optional CDP for Agentic

Ask: “Please reindex Bazaar / Agentic Market for these resources.”

---

## One service vs 22 listings

Agentic UI shows **Services** and **Endpoints**:

- **One service** = “x402 Agent Suite Pro” (your brand)
- **22 endpoints** = each `/api/...` path as a separate payable resource

Your `services.json` lists **24 routes** under one `baseUrl` — that matches how agents route to individual paths. Do **not** register `/health` as a paid resource on x402scan.

---

## Checklist

| # | Task |
|---|------|
| 1 | Deploy latest code (discovery URLs live) |
| 2 | `curl BASE/x402/api/discover` → 22 resources |
| 3 | Validate top 5 URLs on agentic.market (proxy, guard, mpp, attestation, pipeline) |
| 4 | Paid demo per path (indexing signal) |
| 5 | (Optional) CDP facilitator + Base payTo for auto-index |
| 6 | (Optional) GitHub x402-foundation listing issue |

---

## Honest expectations

- **Dexter marketplace** ← `npm run demo` + seller profile (you already did this).
- **Agentic Market** ← CDP Bazaar indexing **or** manual Validate Endpoint **or** maintainer reindex issue.
- Listing on Agentic does **not** force all agents to call you — same as Dexter: adoption = integration + savings (proxy/MPP).

---

## Links

- Agentic Market: https://agentic.market/
- CDP Bazaar docs: https://docs.cdp.coinbase.com/x402/bazaar
- Your Dexter seller: https://dexter.cash/sellers/9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt
- Integration: [INTEGRATE.md](./INTEGRATE.md)
