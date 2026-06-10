# Trust & Security Posture

*x402 Trust Layer · [x402trustlayer.xyz](https://x402trustlayer.xyz) · last updated June 2026*

We ask agents to trust us with payment decisions, so we hold ourselves to the same bar. This page states plainly what we do, what we don't, and how to report a problem.

---

## What we do (security controls in code)

| Control | Implementation |
|---------|----------------|
| **SSRF protection** | All outbound probe URLs pass `assertSafeOutboundUrl()` — blocks private, loopback, link-local, CGNAT, IPv6 ULA, cloud-metadata (169.254.169.254), and octal/hex host tricks, after DNS resolution. (`src/lib/ssrf.ts`) |
| **Constant-time secret compare** | Admin/webhook secrets and HMAC signatures use `constantTimeEqual()` (SHA-256 digest + `timingSafeEqual`) — no length leak, no early-exit timing. (`src/protocol/crypto.ts`) |
| **HMAC-signed attestations** | Attestations, agent cards, and session tokens are signed with HMAC-SHA256 using a 32+ char secret required in production. |
| **Atomic escrow state** | Escrow `pending → released` is a single conditional SQLite `UPDATE ... WHERE status='pending'` — concurrent releases cannot double-release. (`src/lib/db-persistence.ts`) |
| **Key hygiene** | Private keys are read once at boot and deleted from `process.env` to prevent accidental logging. (`src/config.ts`) |
| **Rate limiting** | Per-wallet / per-agentId limits (not just IP), plus unpaid-probe limits, on all guard and pipeline routes. |
| **Transport hardening** | Helmet CSP (`script-src 'self'`, no inline JS), `x-powered-by` disabled, CORS closed by default, 512 KB body cap. |
| **Replay protection** | Nonce replay binding with Redis/Upstash backend in multi-instance deployments. |
| **Production secret enforcement** | Server refuses to boot in production without `ATTESTATION_HMAC_SECRET`, `PAY_TO`, `WEBHOOK_ADMIN_SECRET`. |

Live status: **https://x402trustlayer.xyz/status**

---

## What we do NOT do (honest boundaries)

- **We are not a custodian.** "Escrow" here is a server-side ledger/state machine, not on-chain custody of your funds. You always pay your own merchant with your own wallet; we never hold your USDC.
- **We are not insurance.** "Liability attestation" is a signed cryptographic claim about a merchant's declared bond — not an underwritten policy. No payout is guaranteed.
- **We don't guarantee 100% accuracy.** Guard/KYM responses are advisory signals (`securityGrade`, `confidence`, `summary`). You keep the final pay/deny decision.
- **`zk/prove` is a commitment scheme, not a SNARK.** It uses hash-commitment + selective disclosure; a real SNARK backend is on the roadmap. In production it is disabled unless explicitly enabled.
- **Settlement depends on upstream facilitators** (Dexter / Coinbase CDP). Their incidents can affect paid calls even when our service is healthy — surfaced on the status page.

---

## Responsible disclosure

Found a vulnerability? Please email **security@x402trustlayer.xyz** (or mimran@x402trustlayer.xyz) with details and reproduction steps. Do not open a public issue for security bugs. We aim to acknowledge within 72 hours. We will credit reporters who follow coordinated disclosure.

---

## Trust roadmap (to earn enterprise trust)

These are the steps that turn "trust me" into "verifiably trustworthy." Status is honest:

- [ ] **Legal entity** — register a company (LLC/Ltd) so contracts, DPAs, and liability have a counterparty. *(pending)*
- [ ] **Terms of Service + Privacy Policy + DPA** — publish at `/legal`. *(pending)*
- [ ] **Independent security review** — a lightweight third-party review of the guard, SSRF, crypto, and escrow paths. *(pending)*
- [ ] **Public status page + uptime history** — `/status` is live; add historical uptime. *(in progress)*
- [ ] **SOC 2 readiness** — controls inventory and evidence collection once revenue justifies it. *(future)*
- [ ] **Bug bounty** — formal program once the disclosure process is exercised. *(future)*

We publish this checklist openly because pretending these are done would be the opposite of a trust layer.

---

*Questions: mimran@x402trustlayer.xyz · [GitHub](https://github.com/mimranchohan/x402-trust-layer)*
