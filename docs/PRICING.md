# Pricing Strategy

*x402 Trust Layer — how to price, and how to evolve from per-call to recurring revenue.*

Live surface: **https://x402trustlayer.xyz/pricing**

## Principle

Per-call USDC is the **land** (zero-friction adoption); sessions and subscriptions are the **expand** (margin + predictability). Don't try to monetize the first call — monetize the habit.

## Three layers

### 1. Pay-per-call — LIVE
$0.01–$0.45 per endpoint, settled in USDC over x402. No keys, no signup. This is the on-ramp; keep it frictionless. It is *not* where the business becomes durable.

### 2. Wallet Sessions ("day passes") — LIVE
$0.10 once → `x-session-token` valid 24h, skip per-call settlement. Market this hard to fleets doing high-frequency guard checks — it smooths cost and creates a returning relationship. Add bundles: 7-day, 30-day, max-call tiers.

### 3. Subscriptions — EARLY ACCESS (billing not yet self-serve)
- **Pro** ($49/mo): dashboard, webhooks, history.
- **Team** ($499/mo): compliance ledger, evidence export, blocklist, priority failover.
- **Enterprise** (custom): SLA, white-label/on-prem, DPA, volume %-fee.

> To go self-serve, wire a billing provider (Stripe Billing or x402-native recurring sessions). Until then, bill Team/Enterprise per written agreement — the `/pricing` page already routes these to email. Don't fake a checkout that doesn't work.

## The pricing insight that matters for 2026

In 2026, sub-$1 x402 transactions collapsed to ~4% of volume; **$1+ transactions are ~95%**. A flat $0.05 guard is trivial against a $5 payment. So:

- Keep micro-prices for adoption, **but add a value-based fee on high-value flows**: e.g. high-value guard = `max($0.10, 0.5–1% of transaction value)`. This captures real value where the money actually is, instead of competing in the collapsing micro-band.

## Where the durable revenue is

1. **B2B distribution / rev-share** — a facilitator or wallet defaults your guard for its sellers; you take a small trust-fee per checked payment. One deal > thousands of individual agents.
2. **Enterprise contracts** — compliance ledger + audit trail + SLA is what finance teams pay real money for.
3. **Subscriptions** — predictable MRR once self-serve billing is wired.

Break-even comes from 2–3 Team/Enterprise contracts or one rev-share deal — not from micro-calls.

## Next actions

- [ ] Add session bundles (7/30-day) to `/api/session/create`.
- [ ] Add a value-based fee tier for `$1+` guarded payments.
- [ ] Decide billing provider for self-serve Pro/Team (Stripe Billing vs x402 recurring).
- [ ] Pursue one facilitator rev-share conversation (see DISTRIBUTION-PLAYBOOK.md).
