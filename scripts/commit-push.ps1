$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "=== Before ===" -ForegroundColor Cyan
git status -sb
git diff --stat

git add -A
git status -sb

git commit -m "fix: marketplace scores, onboarding, and trust envelopes" -m "Add agent trust fields on proxy, guard, buy-advisor, and attestation verify. Improve probe-production audit for 24 routes, demo coverage, and docs for 3 entry points plus Dexter/x402scan/Agentic checklists."

if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit failed or nothing to commit: $LASTEXITCODE" -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "=== After ===" -ForegroundColor Cyan
git rev-parse HEAD
git log -1 --oneline

Write-Host ""
Write-Host "=== Push ===" -ForegroundColor Cyan
git push
exit $LASTEXITCODE
