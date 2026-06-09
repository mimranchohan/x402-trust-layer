# Live Demo Results — Alchemy × Trust Layer

**Date:** 2026-05-31

## Standard demo (`npm run demo:alchemy`)

| Step | Result | Cost |
|------|--------|------|
| Guard | allowed: true | $0.05 |
| Alchemy pay | success: true | $1.00 |
| Receipt | valid: true | $0.05 |
| **Total** | | **$1.10** |

**Basescan:** https://basescan.org/tx/0x12b165c22b797ae893ab2222a1f253def2da95842d3b3f25b080941f0a6e7da2

---

## Enterprise demo (`npm run demo:alchemy:enterprise`)

| Step | Result | Cost |
|------|--------|------|
| Mandate compile | mdt_8351e6769958031c | $0.08 |
| Mandate verify | withinScope: true | $0.02 |
| Guard | allowed: true | $0.05 |
| Alchemy pay | success: true | $1.00 |
| Receipt | valid: true | $0.05 |
| Compliance ledger | ledgerHash issued | $0.12 |
| **Total** | | **$1.32** |

**Basescan:** https://basescan.org/tx/0xbdc571b1f5b00cc858d90c5cb7bcdb925b076fe5a4af9229d9b1ad8226df2cd1

**Ledger hash:** `0d0b4d1f534856e7ffea5ef18a6c6bfee045191149c7920abefbeec99432d4dc`

---

## npm published

- `@mimranakb/trust-layer-mcp@1.1.0` — includes `trust_alchemy_preflight`

## Copy-paste for social

LinkedIn / X proof link (enterprise):  
https://basescan.org/tx/0xbdc571b1f5b00cc858d90c5cb7bcdb925b076fe5a4af9229d9b1ad8226df2cd1
