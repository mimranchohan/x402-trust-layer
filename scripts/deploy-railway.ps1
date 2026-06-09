# Railway deploy helper — run from project root
# Requires: npm i -g @railway/cli  &&  railway login

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "=== x402-agent-suite Railway deploy (v3.1) ===" -ForegroundColor Cyan

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
  Write-Host "Installing Railway CLI..."
  npm install -g @railway/cli
}

function Read-EnvVar($name) {
  $line = Get-Content .env -ErrorAction SilentlyContinue | Where-Object { $_ -match "^${name}=" }
  if ($line) { return ($line -replace "^${name}=", "").Trim() }
  return ""
}

$payTo = Read-EnvVar "PAY_TO_ADDRESS"
$payToEvm = Read-EnvVar "PAY_TO_EVM"
$attSecret = Read-EnvVar "ATTESTATION_HMAC_SECRET"

if (-not $payTo) { $payTo = Read-Host "PAY_TO_ADDRESS (Solana receive)" }
if (-not $payToEvm) { $payToEvm = Read-Host "PAY_TO_EVM (Base receive)" }
if (-not $attSecret) {
  Write-Host "Generate: openssl rand -hex 32" -ForegroundColor Yellow
  $attSecret = Read-Host "ATTESTATION_HMAC_SECRET"
}

Write-Host "Linking project (first time only)..."
railway link 2>$null

Write-Host "Setting variables..."
railway variables set `
  "PAY_TO_ADDRESS=$payTo" `
  "PAY_TO_EVM=$payToEvm" `
  "NETWORKS=base,solana" `
  "FACILITATOR_URL=https://x402.dexter.cash" `
  "ATTESTATION_HMAC_SECRET=$attSecret" `
  "ALLOW_VERIFIER_PROBE_IDS=1" `
  "RATE_LIMIT_PER_MIN=120"

Write-Host "Deploying..."
railway up --detach

Write-Host "Generating public URL..."
railway domain

Write-Host ""
Write-Host "Done. See docs/DEPLOY-CHECKLIST.md" -ForegroundColor Green
Write-Host "  npm run probe:production" -ForegroundColor Green
