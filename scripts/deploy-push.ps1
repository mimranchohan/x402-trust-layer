# One-shot: build, commit, push (x402gle paid GET fix)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "==> npm run build"
npm run build

Write-Host "==> git status"
git status

$files = @(
  "src/routes.ts",
  "src/lib/agentic-probes.ts",
  "src/lib/apply-verifier-body.ts",
  "src/lib/x402-paid.ts",
  "src/index.ts"
)
git add @files
$extra = git status --porcelain | ForEach-Object { $_.Substring(3) }
if ($extra) {
  Write-Host "==> Also staging other changes:"
  git add -A
}

git commit -m "fix: paid GET probes via shared POST handlers and TS query types"
git push

Write-Host "==> Health check (wait ~30s if deploy just started)"
Start-Sleep -Seconds 5
try {
  Invoke-RestMethod -Uri "https://x402trustlayer.xyz/health" | ConvertTo-Json
} catch {
  Write-Host "Health check failed (deploy may still be building): $_"
}

Write-Host "Done."
