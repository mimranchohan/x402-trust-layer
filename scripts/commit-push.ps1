# Stage, commit, and push new agents (run from repo root)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "=== Before ===" -ForegroundColor Cyan
git status -sb
git diff --stat

git add src/agents/market-buy-advisor.ts src/agents/audition-coach.ts
git add src/lib/probe.ts src/routes.ts src/config.ts src/lib/suite-catalog.ts
git add src/lib/openapi-meta.ts src/lib/openapi-agentcash.ts src/lib/verify-examples.ts
git add src/lib/bazaar-extension.ts src/agents/api-router.ts src/index.ts
git add docs/NEW-AGENTS.md docs/NEXT-STEPS.md
git add scripts/probe-production.mjs scripts/run-next-steps.ps1 scripts/commit-push.ps1 package.json

$porcelain = git status --porcelain 2>$null
if ($porcelain) {
  $untracked = $porcelain | Where-Object { $_ -like '??*' }
  if ($untracked) {
    Write-Host "Untracked files remain (review if needed):" -ForegroundColor Yellow
    $untracked | ForEach-Object { Write-Host $_ }
  }
}

git commit -m "feat: add market buy advisor and seller audition coach agents" -m "Add x402 buy intelligence (rank marketplace APIs before payment) and seller audition coach (OpenAPI and 402 probe fixes). Suite now has 24 paid endpoints."
if ($LASTEXITCODE -ne 0) {
  Write-Host "Nothing to commit or commit failed (exit $LASTEXITCODE)" -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "=== After ===" -ForegroundColor Cyan
git status -sb
git rev-parse HEAD
git log -1 --oneline

Write-Host ""
Write-Host "=== Push ===" -ForegroundColor Cyan
git push
exit $LASTEXITCODE
