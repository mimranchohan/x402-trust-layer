## Summary

<!-- What does this PR change and why? -->

## Test plan

- [ ] `npm run ci` (typecheck + bazaar)
- [ ] `npm run probe:production` (if production deployed)
- [ ] `npm run dev` — `/health` → 24 endpoints
- [ ] Security: no secrets in diff; SSRF-safe outbound URLs if touching probes

## Security (if applicable)

- [ ] Threat model update in `docs/SECURITY.md`
- [ ] No private keys or `.env` committed
