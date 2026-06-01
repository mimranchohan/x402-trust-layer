# Run production probes + optional x402gle audition (writes JSON in repo root)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "=== Git ===" -ForegroundColor Cyan
git status -sb
git log -1 --oneline

Write-Host "`n=== Golden tests ===" -ForegroundColor Cyan
npm run test:golden

Write-Host "`n=== Production probe ===" -ForegroundColor Cyan
node scripts/probe-production.mjs

Write-Host "`n=== Discovery check (proxy) ===" -ForegroundColor Cyan
npm run discovery:check -- "https://x402trustlayer.xyz/api/x402/proxy"

Write-Host "`n=== x402gle audition (may cooldown) ===" -ForegroundColor Cyan
npm run audition:x402gle

Write-Host "`n=== x402gle v2 routes (3 flagship) ===" -ForegroundColor Cyan
npm run audition:x402gle:v2

Write-Host "`nDone. See probe-production-result.json, x402gle-audition-result.json, x402gle-v2-audition-result.json" -ForegroundColor Green
