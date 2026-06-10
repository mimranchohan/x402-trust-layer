# Case Study — Stopping bad agent payments before money moves

**x402 Trust Layer** · Guard · Attest · Comply · Audit · [x402trustlayer.xyz](https://x402trustlayer.xyz)

---

## The problem

Autonomous AI agents now pay merchants directly over [x402](https://www.x402.org) — 165M+ transactions and ~$50M volume on Base alone by mid-2026. But an agent will happily pay a scam URL, an SSRF target, or blow its budget, because nothing sits between its reasoning and its wallet. Once USDC settles on-chain, it's gone.

## The solution

The Trust Layer is a preflight guard an agent calls for **$0.05** before each payment. It checks spend policy, identity, URL risk, and SSRF/exfil targets, and returns an allow/deny with a security grade — *before* the private key signs.

---

## Reproducible proof (run it yourself)

No customer logos, no cherry-picked numbers — run the guard against a set of realistic scenarios on your own machine:

```bash
npx tsx scripts/demo-scam-blocked.ts
```

Sample output:

```text
  [ALLOW ] Legit merchant, in policy            grade=A  est=$0.05
  [BLOCK ] SSRF attack (cloud metadata)         grade=F  → private/metadata host
  [BLOCK ] Internal/private host exfil          grade=F  → reserved host
  [BLOCK ] Disposable high-risk TLD scam        grade=D  → non-HTTPS + .tk TLD
  [BLOCK ] Over per-call budget                 → per-call cap exceeded ($3 > $1)
  [BLOCK ] Would blow daily cap                 → daily cap exceeded ($10.30 > $10)

  Result: 5/6 payments blocked before settlement. USDC saved this run: $4.10
```

**The economics:** each blocked scam is a real loss avoided for a $0.05 guard call. A fleet doing 10,000 payments/day at a 2% bad-payment rate stops ~200 bad payments/day — guarded for ~$500/day, protecting far more in avoided losses, chargebacks, and credential theft.

---

## ROI snapshot (model your own)

| Input | Example |
|-------|---------|
| Payments / day | 10,000 |
| Bad-payment rate (scam / SSRF / over-budget) | 2% |
| Avg loss per bad payment | $1.50 |
| Guard cost / call | $0.05 |
| **Bad payments stopped / day** | **200** |
| **Loss avoided / day** | **$300** |
| **Guard spend / day** | **$500** |
| **Net (at higher loss/value flows $5+)** | strongly positive on $1+ transactions (95% of 2026 volume) |

> Guard cost is fixed and tiny; the value scales with transaction size. On the high-value ($1+) flows that now make up 95% of x402 volume, one stopped loss pays for thousands of guard calls.

---

## Customer case-study template (fill in after a pilot)

> **[Customer name]** runs **[N]** autonomous agents that pay for **[data / APIs / travel / compute]** over x402.
>
> **Before:** [what went wrong — a scam payment, a runaway agent, no audit trail].
>
> **With the Trust Layer:** wrapped every payment in `guardPreflight()` / `trust_before_x402_fetch`. Over **[period]**, **[X]** payments were blocked preflight, **[Y]** flagged for review, and every settlement got an on-chain receipt + attestation for compliance.
>
> **Result:** **$[Z]** in avoided losses, full audit trail for finance, zero scam settlements.
>
> *"[Quote]"* — [Name, Title]

---

## How to start a pilot (30 min)

1. `npm install x402-agent-suite-preflight @dexterai/x402`
2. Wrap each agent payment in `guardPreflight({...})` — deny if `!allowed`.
3. After settlement, call `/api/receipt-auditor/verify` for the on-chain proof.
4. Review blocked payments in the dashboard: `https://x402trustlayer.xyz/dashboard`.

**Contact:** mimran@x402trustlayer.xyz · [GitHub](https://github.com/mimranchohan/x402-trust-layer)
