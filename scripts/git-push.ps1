# First-time GitHub push helper
param(
  [Parameter(Mandatory = $true)]
  [string]$GitHubRepoUrl = "https://github.com/mimranchohan/x402-agent-suite.git"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "=== Push to GitHub ===" -ForegroundColor Cyan
Write-Host "Remote: $GitHubRepoUrl"
Write-Host ""
Write-Host "Create an EMPTY repo on GitHub first if you see 'Repository not found'."
Write-Host "  https://github.com/new  ->  name: x402-agent-suite  ->  no README"
Write-Host ""

if (-not (Test-Path .git)) {
  git init
  git branch -M main
}

git add -A
git status
git commit -m "x402 agent suite — production ready" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "Nothing new to commit or commit failed." }

if (git remote get-url origin 2>$null) {
  git remote set-url origin $GitHubRepoUrl
} else {
  git remote add origin $GitHubRepoUrl
}

git push -u origin main
Write-Host "Pushed. Connect this repo on railway.app -> Deploy from GitHub." -ForegroundColor Green
