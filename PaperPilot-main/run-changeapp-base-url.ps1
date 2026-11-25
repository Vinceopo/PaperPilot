#Requires -Version 5.1
<#
.SYNOPSIS
  Replace PaperPilot's hard-coded production app base URL across the repo.

.DESCRIPTION
  Only rewrites the hard-coded HTTPS app host (default: https://paperpilotph.vercel.app).
  Does NOT touch localhost / 127.0.0.1 / paperpilot.local / Firebase / CDN URLs.

  Mapped hard-coded sites (path suffixes like /api stay intact):
    api/app/config.py          CORS + app_public_url default
    api/app/main.py            PayMongo success/cancel fallback
    api/.env.example           CORS_ORIGINS + APP_PUBLIC_URL
    api/.env                   (if present)
    web/.env.local             CORS_ORIGINS (if present)
    mobile/app.json            apiUrl + googleAuthBridgeUrl
    mobile/eas.json            PAPERPILOT_API_URL (preview/production)
    mobile/build-android.ps1   $ProdApiUrl + validation messages
    mobile/.env                PAPERPILOT_API_URL (if present)
    SETUP.md                   S3 CORS AllowedOrigins example

.EXAMPLE
  .\run-changeapp-base-url.ps1
  .\run-changeapp-base-url.ps1 -NewUrl https://my-app.vercel.app
  .\run-changeapp-base-url.ps1 -OldUrl https://paperpilotph.vercel.app -NewUrl https://example.com
#>

[CmdletBinding()]
param(
  [string]$OldUrl = "https://paperpilotph.vercel.app",
  [string]$NewUrl = "",
  [switch]$WhatIf,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Normalize-HttpsBaseUrl {
  param([Parameter(Mandatory)][string]$Raw)

  $u = $Raw.Trim().TrimEnd("/")
  if ([string]::IsNullOrWhiteSpace($u)) {
    throw "URL is empty."
  }
  if ($u -notmatch '^https://') {
    throw "URL must start with https:// (got: $Raw)"
  }
  if ($u -match '^https://(localhost|127\.0\.0\.1)(:|/|$)') {
    throw "Localhost / 127.0.0.1 is not allowed. This script only changes hard-coded production base URLs."
  }
  try {
    $uri = [Uri]$u
  } catch {
    throw "Invalid URL: $Raw"
  }
  if ($uri.Scheme -ne "https") {
    throw "URL must use https."
  }
  if ([string]::IsNullOrWhiteSpace($uri.Host)) {
    throw "URL must include a host."
  }
  # Origin only (no path/query). Callers append /api etc. via existing file text.
  if ($uri.AbsolutePath -and $uri.AbsolutePath -ne "/") {
    throw "Pass the app origin only (no path). Example: https://paperpilotph.vercel.app — not .../api"
  }
  return ("https://{0}" -f $uri.Authority.ToLowerInvariant())
}

# Runtime / config targets only (skip historical builds/android release-notes).
$Targets = @(
  @{ Path = "api\app\config.py";          Note = "CORS + app_public_url default" }
  @{ Path = "api\app\main.py";            Note = "PayMongo redirect fallback" }
  @{ Path = "api\.env.example";           Note = "CORS_ORIGINS + APP_PUBLIC_URL" }
  @{ Path = "api\.env";                   Note = "CORS_ORIGINS + APP_PUBLIC_URL"; Optional = $true }
  @{ Path = "web\.env.local";             Note = "CORS_ORIGINS"; Optional = $true }
  @{ Path = "mobile\app.json";            Note = "apiUrl + googleAuthBridgeUrl" }
  @{ Path = "mobile\eas.json";            Note = "PAPERPILOT_API_URL env" }
  @{ Path = "mobile\build-android.ps1";   Note = "`$ProdApiUrl + validation msgs" }
  @{ Path = "mobile\.env";                Note = "PAPERPILOT_API_URL"; Optional = $true }
  @{ Path = "SETUP.md";                   Note = "S3 CORS AllowedOrigins example" }
)

Write-Host ""
Write-Host "PaperPilot — change hard-coded app base URL" -ForegroundColor Cyan
Write-Host ("Root: {0}" -f $Root)
Write-Host ""
Write-Host "Mapped hard-coded files (localhost left alone):" -ForegroundColor DarkGray
foreach ($t in $Targets) {
  $flag = if ($t.Optional) { " (optional)" } else { "" }
  Write-Host ("  - {0,-28} {1}{2}" -f $t.Path, $t.Note, $flag)
}
Write-Host ""

try {
  $OldUrl = Normalize-HttpsBaseUrl $OldUrl
} catch {
  Write-Host ("Invalid -OldUrl: {0}" -f $_.Exception.Message) -ForegroundColor Red
  exit 1
}

if ([string]::IsNullOrWhiteSpace($NewUrl)) {
  Write-Host "Enter the new app base URL (must be https, origin only)." -ForegroundColor Yellow
  Write-Host "Example: https://my-deployment.vercel.app"
  $NewUrl = Read-Host "New URL"
}

try {
  $NewUrl = Normalize-HttpsBaseUrl $NewUrl
} catch {
  Write-Host ("Invalid New URL: {0}" -f $_.Exception.Message) -ForegroundColor Red
  exit 1
}

if ($OldUrl -eq $NewUrl) {
  Write-Host "Old and new URLs are the same — nothing to do." -ForegroundColor Yellow
  exit 0
}

Write-Host ""
Write-Host ("Replace: {0}" -f $OldUrl) -ForegroundColor DarkGray
Write-Host ("With:    {0}" -f $NewUrl) -ForegroundColor Green
Write-Host ""

# Escape for literal replace (no regex on content).
$oldLiteral = $OldUrl

$plan = @()
foreach ($t in $Targets) {
  $full = Join-Path $Root $t.Path
  if (-not (Test-Path -LiteralPath $full)) {
    if ($t.Optional) {
      Write-Host ("Skip (missing): {0}" -f $t.Path) -ForegroundColor DarkGray
      continue
    }
    Write-Host ("Missing (required): {0}" -f $t.Path) -ForegroundColor Red
    exit 1
  }

  $text = [System.IO.File]::ReadAllText($full)
  $count = ([regex]::Matches($text, [regex]::Escape($oldLiteral))).Count
  if ($count -eq 0) {
    Write-Host ("No match: {0}" -f $t.Path) -ForegroundColor DarkYellow
    continue
  }
  $plan += [pscustomobject]@{
    Path    = $t.Path
    Full    = $full
    Count   = $count
    Text    = $text
  }
}

if ($plan.Count -eq 0) {
  Write-Host ("No occurrences of '{0}' found in mapped files." -f $OldUrl) -ForegroundColor Yellow
  Write-Host "If you already changed the base once, pass -OldUrl https://previous-host.example"
  exit 0
}

Write-Host "Will update:" -ForegroundColor Cyan
foreach ($p in $plan) {
  Write-Host ("  {0}  ({1} occurrence(s))" -f $p.Path, $p.Count)
}
Write-Host ""

if (-not $Force -and -not $WhatIf) {
  $confirm = Read-Host "Proceed? [y/N]"
  if ($confirm -notmatch '^(y|yes)$') {
    Write-Host "Cancelled."
    exit 0
  }
}

$changedFiles = 0
$totalHits = 0
foreach ($p in $plan) {
  $newText = $p.Text.Replace($oldLiteral, $NewUrl)
  if ($WhatIf) {
    Write-Host ("WhatIf: would write {0}" -f $p.Path) -ForegroundColor Magenta
  } else {
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($p.Full, $newText, $utf8NoBom)
    Write-Host ("Updated {0}" -f $p.Path) -ForegroundColor Green
  }
  $changedFiles++
  $totalHits += $p.Count
}

Write-Host ""
if ($WhatIf) {
  Write-Host ("WhatIf summary: {0} file(s), {1} replacement(s)." -f $changedFiles, $totalHits) -ForegroundColor Magenta
} else {
  Write-Host ("Done. {0} file(s), {1} replacement(s)." -f $changedFiles, $totalHits) -ForegroundColor Green
  Write-Host "Note: web production still uses same-origin /api (no hard-coded host)." -ForegroundColor DarkGray
  Write-Host "Redeploy API/web and rebuild mobile (EAS) so clients pick up the new base." -ForegroundColor DarkGray
}
