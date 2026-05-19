# Railway deploy helper (run from project root)
# Requires: npm i -g @railway/cli  &&  railway login

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "=== x402-agent-suite Railway deploy ===" -ForegroundColor Cyan

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
  Write-Host "Installing Railway CLI..."
  npm install -g @railway/cli
}

if (-not (Test-Path .env)) {
  Write-Host "WARNING: .env missing. Set variables in Railway dashboard after deploy." -ForegroundColor Yellow
}

$payTo = (Get-Content .env -ErrorAction SilentlyContinue | Where-Object { $_ -match '^PAY_TO_ADDRESS=' }) -replace '^PAY_TO_ADDRESS=', ''
if (-not $payTo) {
  $payTo = Read-Host "Enter PAY_TO_ADDRESS (Solana wallet)"
}

Write-Host "Linking project (first time only)..."
railway link 2>$null

Write-Host "Setting variables..."
railway variables set "PAY_TO_ADDRESS=$payTo" "NETWORK=solana" "FACILITATOR_URL=https://x402.dexter.cash"

Write-Host "Deploying..."
railway up --detach

Write-Host "Generating public URL..."
railway domain

Write-Host ""
Write-Host "Done. Test: curl https://YOUR-DOMAIN/health" -ForegroundColor Green
Write-Host "Then: npm run demo  (set PUBLIC_BASE_URL in .env to Railway URL)" -ForegroundColor Green
