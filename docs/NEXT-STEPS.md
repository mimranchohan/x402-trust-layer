# Next steps (x402 Agent Suite Pro)

Production: `https://x402-agent-suite-production.up.railway.app`

## Status (auto-checked)

| Check | Expected |
|-------|----------|
| `/health` `gitCommit` | Matches latest push (`fd3bc11` area) |
| `agenticReady` / `agentCashDiscovery.ready` | `true` |
| POST routes return **402** with Base + Solana USDC | Yes |
| `X-X402GLE-VERIFY` | Set when `X402GLE_CHALLENGE_TOKEN` is on Railway |

## Commands

```powershell
cd C:\Users\mimra\x402-agent-suite

# Quick production probe (writes scripts/probe-production-result.json)
npm run probe:production

# AgentCash schema on one route
npm run discovery:check -- https://x402-agent-suite-production.up.railway.app/api/x402/proxy

# Full x402gle/Dexter audition (fails with cooldown_active ~24h after ingest)
npm run audition:x402gle

# All 22 paid routes (needs payer keys in .env)
npm run demo
```

One-shot:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-next-steps.ps1
```

## While audition cooldown is active

1. Open [x402gle host](https://x402gle.com/servers/x402-agent-suite-production.up.railway.app)
2. **Test now** on failing routes (start with **pre-x402**, **proxy**, **attestation/verify**)
3. Fix per `fixInstructions` → redeploy if code change → **Test now** again
4. When stable → **Synthesize all**

## Fund local OpenDexter wallet (optional)

```powershell
npx -y @dexterai/opendexter@latest wallet
```

Deposit USDC on **Base** or **Solana** to the printed address, then:

```powershell
npx -y @dexterai/opendexter@latest fetch "https://x402-agent-suite-production.up.railway.app/api/x402/proxy" --method POST
```

## Listings

- x402scan: https://www.x402scan.com/resources/register
- AgentCash: `npm run discovery:discover -- https://x402-agent-suite-production.up.railway.app`
- Dexter seller: https://dexter.cash/sellers/9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt

## Pass target

x402gle: **22/22** routes `pass`, score **≥ 75** each.
