# First-time GitHub push helper
param(
  [Parameter(Mandatory = $true)]
  [string]$GitHubRepoUrl
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (-not (Test-Path .git)) {
  git init
  git branch -M main
}

git add -A
git status
git commit -m "x402 agent suite — deploy ready" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "Nothing new to commit or commit failed." }

if (git remote get-url origin 2>$null) {
  git remote set-url origin $GitHubRepoUrl
} else {
  git remote add origin $GitHubRepoUrl
}

git push -u origin main
Write-Host "Pushed. Now connect this repo on Railway.app" -ForegroundColor Green
