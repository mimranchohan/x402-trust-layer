# Distribution Playbook — get the Trust Layer in front of agents

The product is live and the packages are publish-ready. Now the job is **discovery**: every place an agent or developer looks for x402 trust tooling should find you. Work this list top-to-bottom; each item is copy-paste ready.

---

## Priority 0 — Confirm the rails (today)

- [ ] `x402trustlayer.xyz/dashboard` and `/status` load ✅ (done)
- [ ] `npm view @mimranakb/trust-layer-mcp version` returns `5.5.0`
- [ ] `npm view x402-agent-suite-preflight version` returns `1.4.0`
- [ ] Test the MCP locally: add to Claude Desktop config, confirm 13 `trust_*` tools appear

---

## Priority 1 — Get listed where agents discover tools

### 1a. awesome-x402 (highest signal, free)
Open a PR to **github.com/Merit-Systems/awesome-x402** adding this line under the relevant section (Tools / Infrastructure):

```markdown
- [x402 Trust Layer](https://x402trustlayer.xyz) — Trust, security & settlement control plane for agent payments. 68 pay-per-call APIs (guard, KYM, mandates, semantic escrow, ERC-8004 trust score, Agent Trust Protocol v4). MCP server: `@mimranakb/trust-layer-mcp`.
```

### 1b. x402scan
Register at **x402scan.com/resources/register** (the repo already has `npm run x402scan:register`). Ensure the listing points at `/.well-known/x402.json` so all 68 routes index.

### 1c. Dexter marketplace
Already a Dexter seller. Polish the seller page: banner, social links, and a one-line pitch — "The trust layer every agent calls before it pays." Link the dashboard.

### 1d. MCP registries
Submit `@mimranakb/trust-layer-mcp` to:
- The official MCP servers list (modelcontextprotocol/servers `community` section)
- mcp.so / pulsemcp / glama.ai directories (search "submit MCP server")

### 1e. Coinbase x402 ecosystem page
Apply to be listed on **x402.org/ecosystem** (Coinbase/Cloudflare maintain it) — category: trust/risk infrastructure.

---

## Priority 2 — Outreach (warm, specific, short)

### Template A — Facilitator partnership (Dexter / x402scan)
> Subject: Certified trust layer for your sellers?
>
> Hi [name] — I run x402 Trust Layer (x402trustlayer.xyz), a guard/KYM/escrow layer agents call before they pay. 68 live x402 endpoints, settling through [Dexter/CDP].
>
> Idea: a "trust-checked" badge on marketplace resources that have passed our guard, plus an optional buyer-gate so agents don't waste funds on broken/scam endpoints. Happy to wire a demo against your catalog. 15 min this week?

### Template B — First pilot customer (agent builder / travel / procurement)
> Subject: Stop your agent paying scam URLs ($0.05/call)
>
> Hi [name] — saw [their agent/product] pays merchants over x402. One line — `guardPreflight()` — blocks SSRF targets, over-budget calls, and scam TLDs before settlement, and gives you an on-chain receipt + audit trail.
>
> Reproducible proof (no signup): `npx tsx` our demo blocks 5/6 bad payments. Want me to run it against your real endpoint list? Free pilot.

### Template C — X/LinkedIn launch post
> The agent economy did 165M+ x402 payments this year. Almost none of them were checked before the money moved.
>
> x402 Trust Layer: 68 pay-per-call APIs your agent calls before it pays — guard, KYM, mandates, escrow, on-chain receipts. No keys, USDC only.
>
> MCP: npx -y @mimranakb/trust-layer-mcp
> Live: x402trustlayer.xyz/dashboard

---

## Priority 3 — Content that ranks & convinces

- [ ] Publish the reproducible demo as a short blog/README GIF ("watch the guard block 5/6 payments").
- [ ] One technical post: "Why your payment agent needs a preflight guard" → link dashboard + MCP.
- [ ] Add the dashboard + status links to the GitHub repo's About/website field.

---

## Priority 4 — Then revenue (item #3 from the roadmap)

Once there's usage, layer pricing on top of per-call:
- Wallet-session bundles (already built) → market them as "day passes".
- Subscription tiers (Pro/Team/Enterprise) for dashboard, webhooks, compliance export.
- High-value %-fee on $1+ transactions (95% of 2026 volume).

---

## Weekly cadence (keep it alive)

| Day | Action |
|-----|--------|
| Mon | 5 outreach DMs (Template B), check `/status` |
| Wed | 1 ecosystem/registry submission, reply to issues |
| Fri | 1 content post, review blocked-payment stats on dashboard |

Contact: mimran@x402trustlayer.xyz · [GitHub](https://github.com/mimranchohan/x402-trust-layer)
