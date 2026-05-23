# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [3.1.0] - 2026-05-19

### Security

- SSRF hardening: deny private/metadata/reserved hosts before outbound `fetch`; probes no longer follow redirects.
- Attestations signed with server-only `ATTESTATION_HMAC_SECRET` (HMAC-SHA256); removed public-`payTo` signing.
- Verifier probe IDs gated behind `ALLOW_VERIFIER_PROBE_IDS=1` (exact `att_verifier_probe_example` only).
- Host allow/block lists use exact/subdomain matching (no substring bypass).
- x402gle challenge token removed from global response headers.
- Paid resource URLs canonicalized in production (forged `Host` ignored off localhost).
- Rate limiting on `/api/*` (default 120 req/min/IP).
- Production 500 responses no longer leak exception messages.
- Solana receipt auditor fails closed until on-chain verification exists.
- Verifier example bodies cannot override `targetUrl`, `policy`, or `origin`.

### Fixed

- Demo client: Solana RPC override, payer/receive wallet guard, Base payment preference.
- x402 resource URL mismatch for local demo vs `PUBLIC_BASE_URL`.
- OpenAPI lists 24 paid paths only (free `/health`, `/.well-known/x402` omitted from `paths`).

### Added

- `docs/ARCHITECTURE.md`, `CONTRIBUTING.md`, expanded `docs/SECURITY.md`.
- GitHub Actions CI: typecheck, bazaar verify, production 402 probe.
- `docs/DEPLOY-CHECKLIST.md`, `docs/ROADMAP.md`.
- MIT `LICENSE`, package metadata (author, repository).

## [3.0.0] - 2026-05

- 24 paid x402 routes: buy-advisor, audition-coach, proxy, guard, pipeline, MPP v2, attestations.
- Multi-chain Base + Solana via Dexter facilitator.
- Agentic Market / OpenAPI / Bazaar discovery.

[3.1.0]: https://github.com/mimranchohan/x402-agent-suite/compare/v3.0.0...v3.1.0
