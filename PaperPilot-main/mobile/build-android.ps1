#Requires -Version 5.1
<#
.SYNOPSIS
  PaperPilot - standalone Android build (APK / AAB) for the Expo app in this folder.

.DESCRIPTION
  Windows PowerShell port of the macOS/Linux build-android.sh workflow.
  Safe to re-run after any change: reinstalls npm deps only when package files change,
  regenerates the native android/ project only when app config / deps / icons change,
  and always re-bundles the JS so code and .env changes are never stale.

.EXAMPLE
  .\build-android.ps1
  .\build-android.ps1 -Fast
  .\build-android.ps1 -Doctor
  .\build-android.ps1 -Aab -Clean -Yes
  .\build-android.ps1 -Install
#>

[CmdletBinding()]
param(
  [switch]$Aab,
  [switch]$Fast,
  [string]$Arch = "",
  [switch]$Clean,
  [switch]$Install,
  [switch]$Doctor,
  [switch]$SkipChecks,
  [Alias("y")]
  [switch]$Yes,
  [switch]$AllowLocalApi,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# ---------------------------------------------------------------------------
# Paths / defaults
# ---------------------------------------------------------------------------
$MobileRoot = $PSScriptRoot
$Root = Split-Path -Parent $MobileRoot
$AndroidDir = Join-Path $MobileRoot "android"
$OutDir = Join-Path $Root "builds\android"
$ProdApiUrl = "https://paperpilotph.vercel.app/api"
$DefaultCmake = "3.22.1"
$KeepBuilds = if ($env:KEEP_BUILDS) { [int]$env:KEEP_BUILDS } else { 5 }
$MinFreeGb = 10

$Format = if ($Aab) { "aab" } else { "apk" }
if ($Fast -and -not $Arch) { $Arch = "arm64-v8a" }

$script:CurrentStep = "startup"
$script:Warnings = New-Object System.Collections.Generic.List[string]
$script:PkgBackup = $null
$script:Esc = [char]27

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------
function Show-Usage {
  @"
Usage: .\build-android.ps1 [options]

Build:
  -Aab                Build a Play Store bundle (.aab) instead of an .apk
  -Fast               Only build arm64-v8a (same as -Arch arm64-v8a)
  -Arch LIST          Comma-separated ABIs, e.g. arm64-v8a,armeabi-v7a
                      (default: all ABIs from android/gradle.properties)
  -Clean              Force a fresh expo prebuild --clean + full native rebuild
  -Install            adb-install the APK on the connected device/emulator afterwards

Checks / setup:
  -Doctor             Only check tools, SDK, env, deps. Do not build.
  -SkipChecks         Skip expo-doctor (and TypeScript if present)
  -Yes / -y           Non-interactive: accept SDK licenses / install packages
  -AllowLocalApi      Allow PAPERPILOT_API_URL / apiUrl to be localhost / http://

Release signing (optional, otherwise the standard debug keystore is used):
  `$env:ANDROID_KEYSTORE_FILE = 'C:\path\to\release.jks'
  `$env:ANDROID_KEYSTORE_PASSWORD = '...'
  `$env:ANDROID_KEY_ALIAS = '...'
  `$env:ANDROID_KEY_PASSWORD = '...'

Env vars:
  KEEP_BUILDS=5       How many old builds to keep in builds\android\
"@
}

if ($Help) {
  Show-Usage
  exit 0
}

# ---------------------------------------------------------------------------
# TUI helpers (Windows PowerShell 5.1 + PowerShell 7)
# ---------------------------------------------------------------------------
function Supports-Color {
  try {
    return ($Host.UI.SupportsVirtualTerminal -or $env:WT_SESSION -or $env:TERM -or $env:ConEmuANSI)
  } catch {
    return $false
  }
}

function Ansi([string]$Code) {
  if (Supports-Color) { return "$script:Esc[$Code" } else { return "" }
}

function Write-Banner {
  $c = Ansi "38;2;37;99;235m"
  $r = Ansi "0m"
  $dim = Ansi "2m"
  $mode = if ($Doctor) { "doctor" } else { $Format }
  Write-Host ""
  Write-Host "${c}  +----------------------------------------------+${r}"
  Write-Host "${c}  |                                              |${r}"
  Write-Host "${c}  |       PaperPilot  -  Android build           |${r}"
  Write-Host "${c}  |                                              |${r}"
  Write-Host "${c}  +----------------------------------------------+${r}"
  Write-Host "${dim}  Windows local Gradle  ($mode)${r}"
  Write-Host ""
}

function Step([string]$Title) {
  $script:CurrentStep = $Title
  $c = Ansi "1;36m"
  $r = Ansi "0m"
  Write-Host ""
  Write-Host "${c}==> $Title${r}"
}

function Ok([string]$Msg) {
  Write-Host ("  " + (Ansi "32m") + "[OK]" + (Ansi "0m") + " $Msg")
}

function Info([string]$Msg) {
  Write-Host ("  " + (Ansi "2m") + "$Msg" + (Ansi "0m"))
}

function Warn([string]$Msg) {
  Write-Host ("  " + (Ansi "33m") + "[!]" + (Ansi "0m") + " $Msg")
  [void]$script:Warnings.Add($Msg)
}

function Die {
  param(
    [Parameter(Mandatory = $true)][string]$Message,
    [string[]]$Hints = @()
  )
  Write-Host ""
  Write-Host ((Ansi "1;31m") + "[X] $Message" + (Ansi "0m"))
  foreach ($h in $Hints) {
    Write-Host "    $h"
  }
  exit 1
}

function Confirm-Ask([string]$Prompt) {
  if ($Yes) { return $true }
  if (-not [Console]::IsInputRedirected) {
    $answer = Read-Host "  $Prompt [y/N]"
    return ($answer -match '^[Yy]')
  }
  return $false
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Command,
    [string]$FailMessage = "Command failed"
  )
  & $Command
  if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw "$FailMessage (exit $LASTEXITCODE)"
  }
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Get-JavaMajor([string]$JdkHome) {
  $javaExe = Join-Path $JdkHome "bin\java.exe"
  if (-not (Test-Path $javaExe)) { return $null }
  # java -version writes to stderr; with $ErrorActionPreference=Stop that throws.
  $prevEa = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $out = (& $javaExe -version 2>&1 | ForEach-Object { "$_" }) -join "`n"
  } finally {
    $ErrorActionPreference = $prevEa
  }
  if ($out -match 'version\s+"([^"]+)"') {
    $ver = $Matches[1]
    if ($ver -match '^1\.(\d+)') { return [int]$Matches[1] }
    if ($ver -match '^(\d+)') { return [int]$Matches[1] }
  }
  return $null
}

# Windows PowerShell strips quotes inside `node -e "..."` args. Always use a temp .js file.
# Write the file under WorkingDirectory (or mobile/) so require() can resolve node_modules.
function Invoke-NodeJs {
  param(
    [Parameter(Mandatory = $true)][string]$Code,
    [string]$WorkingDirectory = ""
  )
  $dir = $WorkingDirectory
  if (-not $dir) { $dir = $MobileRoot }
  if (-not $dir) { $dir = [System.IO.Path]::GetTempPath() }
  $tmpJs = Join-Path $dir (".build-android-tmp-{0}.js" -f [guid]::NewGuid().ToString("N"))
  Set-Content -Path $tmpJs -Value $Code -Encoding UTF8
  $prev = $null
  try {
    $prev = Get-Location
    Set-Location $dir
    $prevEa = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      $out = & node $tmpJs 2>&1 | ForEach-Object { "$_" }
      $code = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $prevEa
    }
    $text = ($out | Out-String).Trim()
    if ($null -ne $code -and $code -ne 0) {
      throw "node failed (exit $code): $text"
    }
    return $text
  } finally {
    if ($null -ne $prev) { Set-Location $prev }
    Remove-Item -Force $tmpJs -ErrorAction SilentlyContinue
  }
}

function Get-InputHash {
  param([string[]]$Paths)
  $tmpJs = [System.IO.Path]::GetTempFileName() + ".js"
  $pathsJson = ($Paths | ConvertTo-Json -Compress)
  if ($Paths.Count -eq 1) { $pathsJson = "[$pathsJson]" }
  @"
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const targets = JSON.parse(process.env.HASH_PATHS || "[]");
const h = crypto.createHash("sha256");
const walk = (p) => {
  if (!fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(p).sort()) if (f !== ".DS_Store") walk(path.join(p, f));
  } else {
    h.update(p.replace(/\\/g, "/"));
    h.update(fs.readFileSync(p));
  }
};
targets.forEach(walk);
process.stdout.write(h.digest("hex"));
"@ | Set-Content -Path $tmpJs -Encoding UTF8
  $prev = Get-Location
  $prevHashPaths = $env:HASH_PATHS
  try {
    Set-Location $MobileRoot
    $env:HASH_PATHS = $pathsJson
    $hash = & node $tmpJs
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
      throw "hash_inputs failed"
    }
    return ([string]$hash).Trim()
  } finally {
    Set-Location $prev
    if ($null -eq $prevHashPaths) { Remove-Item Env:HASH_PATHS -ErrorAction SilentlyContinue }
    else { $env:HASH_PATHS = $prevHashPaths }
    Remove-Item -Force $tmpJs -ErrorAction SilentlyContinue
  }
}

function Get-FreeDiskGb([string]$Path) {
  try {
    $drive = (Get-Item $Path).PSDrive.Name
    if (-not $drive) {
      $drive = ([System.IO.Path]::GetPathRoot($Path)).TrimEnd('\').TrimEnd(':')
    }
    $vol = Get-PSDrive -Name $drive -ErrorAction Stop
    return [math]::Floor($vol.Free / 1GB)
  } catch {
    return -1
  }
}

function Restore-PackageJson {
  if ($script:PkgBackup -and (Test-Path $script:PkgBackup)) {
    Copy-Item -Force $script:PkgBackup (Join-Path $MobileRoot "package.json")
    Remove-Item -Force $script:PkgBackup -ErrorAction SilentlyContinue
    $script:PkgBackup = $null
  }
}

# ---------------------------------------------------------------------------
# Start
# ---------------------------------------------------------------------------
try {
  Write-Banner

  if (-not (Test-Path (Join-Path $MobileRoot "package.json"))) {
    Die "Could not find package.json next to this script." @("Expected: $(Join-Path $MobileRoot 'package.json')")
  }

  # -- 1. base tools --------------------------------------------------------
  Step "Base tools"

  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCmd) {
    Die "Node.js is not installed." @("Install Node 20 LTS (>= 20.19.4) or 22 LTS from https://nodejs.org")
  }
  $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npmCmd) {
    Die "npm is not on PATH." @("Reinstall Node.js from https://nodejs.org")
  }

  $nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
  if ($nodeMajor -lt 20) {
    Die "Node $(node -v) is too old." @("Install Node 20 LTS (>= 20.19.4) or 22 LTS from https://nodejs.org")
  }
  Ok "node $(node -v), npm $(npm -v)"

  $freeGb = Get-FreeDiskGb $MobileRoot
  if ($freeGb -ge 0) {
    if ($freeGb -lt 4) {
      Die "Only ${freeGb} GB free disk space." @("A first Android build needs ~8-10 GB (SDK/NDK, Gradle caches, build output).")
    } elseif ($freeGb -lt $MinFreeGb) {
      Warn "Only ${freeGb} GB free. A first build can use ~8-10 GB; later builds need much less."
    } else {
      Ok "${freeGb} GB free disk space"
    }
  }

  try {
    $longPaths = (Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -ErrorAction SilentlyContinue).LongPathsEnabled
  } catch {
    $longPaths = 0
  }
  # Ninja/CMake hit MAX_PATH on deep trees. Prefer a short junction (C:\pp) over subst
  # (subst mixes P:\ and C:\ roots and breaks RN codegen).
  $shortRoot = "C:\pp"
  $shortMobile = Join-Path $shortRoot "mobile"
  if (-not $env:PAPERPILOT_BUILD_SHORT -and $Root.Length -gt 40 -and $MobileRoot -notlike "C:\pp\*") {
    $needLink = $true
    if (Test-Path $shortRoot) {
      $item = Get-Item $shortRoot -Force
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        $needLink = $false
      } else {
        Die "C:\pp already exists and is not a junction." @("Delete/rename C:\pp, then re-run.")
      }
    }
    if ($needLink) {
      Info "Project path is long ($($Root.Length) chars) - creating junction $shortRoot -> $Root"
      $cmd = "mklink /J `"$shortRoot`" `"$Root`""
      $linkOut = cmd.exe /c $cmd 2>&1 | Out-String
      if (-not (Test-Path $shortMobile)) {
        Die "Failed to create short-path junction at $shortRoot" @($linkOut.Trim())
      }
    }
    $env:PAPERPILOT_BUILD_SHORT = "1"
    $relaunch = Join-Path $shortMobile "build-android.ps1"
    $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $relaunch)
    foreach ($key in $PSBoundParameters.Keys) {
      $val = $PSBoundParameters[$key]
      if ($val -is [switch]) {
        if ($val) { $argList += "-$key" }
      } elseif ($null -ne $val -and "$val" -ne "") {
        $argList += "-$key"
        $argList += "$val"
      }
    }
    Info "Re-launching build from $shortMobile ..."
    $p = Start-Process -FilePath "powershell.exe" -ArgumentList $argList -NoNewWindow -Wait -PassThru
    exit $p.ExitCode
  } elseif ($env:PAPERPILOT_BUILD_SHORT -or ($PSScriptRoot -like "C:\pp\*") -or ((Get-Location).Path -like "C:\pp\*")) {
    # Force junction paths even if PowerShell resolves C:\pp back to the long real path.
    $MobileRoot = $shortMobile
    $Root = $shortRoot
    $AndroidDir = Join-Path $MobileRoot "android"
    $OutDir = Join-Path $Root "builds\android"
    Set-Location $MobileRoot
    Ok "Building via short path $MobileRoot"
  }

  # -- 2. npm dependencies --------------------------------------------------
  Step "npm dependencies (mobile/)"

  $depsHash = Get-InputHash @("package.json", "package-lock.json")
  $depsStamp = Join-Path $MobileRoot "node_modules\.build-android-deps"
  $needInstall = $true
  if ((Test-Path (Join-Path $MobileRoot "node_modules")) -and (Test-Path $depsStamp)) {
    $prevHash = (Get-Content -Raw $depsStamp).Trim()
    if ($prevHash -eq $depsHash) { $needInstall = $false }
  }

  Push-Location $MobileRoot
  try {
    if ($needInstall) {
      $lock = Join-Path $MobileRoot "package-lock.json"
      if (Test-Path $lock) {
        Info "package files changed or node_modules missing - running npm ci"
        npm ci --no-audit --no-fund
        if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
          Warn "npm ci failed (lockfile out of sync?) - falling back to npm install"
          npm install --no-audit --no-fund
          if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
            Die "npm install failed in mobile/."
          }
        }
      } else {
        npm install --no-audit --no-fund
        if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
          Die "npm install failed in mobile/."
        }
      }
      $depsHash = Get-InputHash @("package.json", "package-lock.json")
      $stampDir = Split-Path $depsStamp -Parent
      if (-not (Test-Path $stampDir)) { New-Item -ItemType Directory -Path $stampDir | Out-Null }
      Set-Content -Path $depsStamp -Value $depsHash -NoNewline
      Ok "dependencies installed"
    } else {
      Ok "node_modules up to date"
    }

    if (-not (Test-Path (Join-Path $MobileRoot "node_modules\expo\package.json"))) {
      Die "expo is missing from mobile/node_modules." @("Run: cd mobile; npm install")
    }

    try {
      $engineCheck = Invoke-NodeJs -WorkingDirectory $MobileRoot -Code @'
const range = require("react-native/package.json").engines && require("react-native/package.json").engines.node;
let ok = true;
try { ok = !range || require("semver").satisfies(process.versions.node, range); } catch (e) {}
process.stdout.write(ok ? "ok" : (range || "unknown"));
'@
    } catch {
      Die "Could not check React Native Node engine requirement." @($_.Exception.Message)
    }
    if ($engineCheck -ne "ok") {
      Die "Node $(node -v) does not satisfy React Native's requirement: $engineCheck" @("Install Node 20 LTS or 22 LTS from https://nodejs.org")
    }

    try {
      $rnVersionsRaw = Invoke-NodeJs -WorkingDirectory $MobileRoot -Code @'
const fs = require("fs"), path = require("path");
const rnDir = path.dirname(require.resolve("react-native/package.json"));
const toml = fs.readFileSync(path.join(rnDir, "gradle", "libs.versions.toml"), "utf8");
const get = (k) => (toml.match(new RegExp("^" + k + "\\s*=\\s*\"([^\"]+)\"", "m")) || [])[1] || "";
console.log([get("compileSdk"), get("buildTools"), get("ndkVersion")].join("|"));
'@
    } catch {
      Die "Could not read react-native/gradle/libs.versions.toml." @($_.Exception.Message)
    }
    $parts = ([string]$rnVersionsRaw).Trim().Split("|")
    if ($parts.Count -lt 3 -or -not $parts[0] -or -not $parts[1] -or -not $parts[2]) {
      Die "Could not read Android SDK versions from react-native/gradle/libs.versions.toml."
    }
    $CompileSdk = $parts[0]
    $BuildTools = $parts[1]
    $NdkVersion = $parts[2]

    $rnVer = Invoke-NodeJs -WorkingDirectory $MobileRoot -Code "process.stdout.write(require('react-native/package.json').version)"
    $expoVer = Invoke-NodeJs -WorkingDirectory $MobileRoot -Code "process.stdout.write(require('expo/package.json').version)"
    Ok "react-native $rnVer, expo $expoVer"
  } finally {
    Pop-Location
  }

  # -- 3. app config + env --------------------------------------------------
  Step "App config and environment variables"

  $env:NODE_ENV = "production"
  if (-not $env:PAPERPILOT_API_URL) {
    $env:PAPERPILOT_API_URL = $ProdApiUrl
    Info "PAPERPILOT_API_URL defaulted to $ProdApiUrl for this release build"
  }

  $envFile = Join-Path $MobileRoot ".env"
  if (-not (Test-Path $envFile)) {
    @(
      "# Local mobile env - DO NOT COMMIT"
      "PAPERPILOT_API_URL=$ProdApiUrl"
    ) | Set-Content -Path $envFile -Encoding UTF8
    Warn "Created mobile/.env with PAPERPILOT_API_URL=$ProdApiUrl"
  }

  Push-Location $MobileRoot
  try {
    $configJson = npx --yes expo config --type public --json 2>$null
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
      Die "`expo config` failed - app.json / app.config is invalid." @("Run: cd mobile; npx expo config")
    }
  } finally {
    Pop-Location
  }

  $env:CONFIG_JSON = [string]$configJson
  $AppVersion = Invoke-NodeJs -Code "const c=JSON.parse(process.env.CONFIG_JSON); process.stdout.write(String(c.version||'0.0.0'))"
  $AppPackage = Invoke-NodeJs -Code "const c=JSON.parse(process.env.CONFIG_JSON); process.stdout.write(String(c.android&&c.android.package||''))"
  $AppName = Invoke-NodeJs -Code "const c=JSON.parse(process.env.CONFIG_JSON); process.stdout.write(String(c.name||'app').replace(/[^A-Za-z0-9._-]/g,''))"
  if (-not $AppPackage) {
    Die "app.json is missing expo.android.package (e.g. com.paperpilot.app)."
  }
  Ok "$AppName v$AppVersion ($AppPackage)"

  $allowLocalFlag = if ($AllowLocalApi) { "1" } else { "0" }
  $env:ALLOW_LOCAL_API = $allowLocalFlag
  $envCheckJs = [System.IO.Path]::GetTempFileName() + ".js"
  @'
const fs = require("fs");
const files = [".env", ".env.production", ".env.local", ".env.production.local"];
const env = {};
const loaded = [];
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  loaded.push(f);
  for (let line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "").trim();
    env[m[1]] = v;
  }
}
for (const [k, v] of Object.entries(process.env)) {
  if (k.startsWith("EXPO_PUBLIC_") || k === "PAPERPILOT_API_URL") env[k] = v;
}

const extra = JSON.parse(process.env.CONFIG_JSON).extra || {};
const out = [];
out.push("INFO env files: " + (loaded.join(", ") || "(none)"));

const api = (env.PAPERPILOT_API_URL || env.EXPO_PUBLIC_API_URL || env.EXPO_PUBLIC_APP_URL || extra.apiUrl || "").trim();
const allowLocal = process.env.ALLOW_LOCAL_API === "1";
if (!api) {
  out.push("ERR PAPERPILOT_API_URL / apiUrl is not set - set it in mobile/.env or the environment (https://paperpilotph.vercel.app/api).");
} else {
  let url;
  try { url = new URL(api); } catch (e) {}
  if (!url) out.push("ERR API URL is not valid: " + api);
  else {
    const host = url.hostname;
    const loopback = /^(localhost|127\.|0\.0\.0\.0|10\.0\.2\.2$)/.test(host);
    const lan = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    if (loopback && !allowLocal) out.push("ERR API URL points at " + host + " - a phone can't reach that. Use https://paperpilotph.vercel.app/api (or pass -AllowLocalApi).");
    else if (url.protocol === "http:" && !allowLocal) out.push("ERR API URL uses http:// - release APKs block cleartext HTTP. Use https:// (or pass -AllowLocalApi).");
    else if (lan) out.push("WARN API URL is a LAN address (" + host + "); the APK only works on that Wi-Fi.");
    else out.push("OK API base baked into the APK: " + api);
  }
}

const fb = extra.firebase || {};
const hasFirebase = !!(fb.apiKey && fb.projectId && fb.appId);
out.push(hasFirebase ? "OK Firebase config present in app.json extra" : "WARN Firebase config missing in app.json extra");

out.push("OK Document uploads use API-issued S3 presigned URLs (no Cloudinary/AWS keys in the app).");

if (!(env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || extra.googleWebClientId || extra.googleAndroidClientId))
  out.push("WARN Google client id not set - Google sign-in may be unavailable (email login works).");

if (!extra.googleAuthBridgeUrl) out.push("WARN googleAuthBridgeUrl missing - Google auth bridge may fail.");

console.log(out.join("\n"));
'@ | Set-Content -Path $envCheckJs -Encoding UTF8

  Push-Location $MobileRoot
  try {
    $prevEa = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      $envReportLines = @(& node $envCheckJs 2>&1 | ForEach-Object { "$_" })
    } finally {
      $ErrorActionPreference = $prevEa
    }
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
      Die "Could not read mobile env files."
    }
  } finally {
    Pop-Location
    Remove-Item -Force $envCheckJs -ErrorAction SilentlyContinue
  }

  $envErrors = 0
  foreach ($line in $envReportLines) {
    if (-not $line) { continue }
    if ($line.StartsWith("OK ")) { Ok $line.Substring(3) }
    elseif ($line.StartsWith("INFO ")) { Info $line.Substring(5) }
    elseif ($line.StartsWith("WARN ")) { Warn $line.Substring(5) }
    elseif ($line.StartsWith("ERR ")) {
      Write-Host ("  " + (Ansi "31m") + "[X] " + $line.Substring(4) + (Ansi "0m"))
      $envErrors++
    }
  }
  if ($envErrors -gt 0) {
    Die "Fix the environment problems above, then re-run."
  }

  # -- 4. JDK ---------------------------------------------------------------
  Step "Java (JDK 17 or 21)"

  function Get-JdkCandidates {
    $list = New-Object System.Collections.Generic.List[string]
    if ($env:JAVA_HOME) { [void]$list.Add($env:JAVA_HOME) }

    $java = Get-Command java -ErrorAction SilentlyContinue
    if ($java) {
      $prevEa = $ErrorActionPreference
      $ErrorActionPreference = "Continue"
      try {
        $props = (& java -XshowSettings:properties -version 2>&1 | ForEach-Object { "$_" }) -join "`n"
        if ($props -match 'java\.home\s*=\s*(.+)') {
          [void]$list.Add($Matches[1].Trim())
        }
      } catch {}
      finally { $ErrorActionPreference = $prevEa }
    }

    $pf = ${env:ProgramFiles}
    $pf86 = ${env:ProgramFiles(x86)}
    $local = $env:LOCALAPPDATA
    $globs = @(
      (Join-Path $pf "Eclipse Adoptium\jdk-*"),
      (Join-Path $pf "Microsoft\jdk-*"),
      (Join-Path $pf "Java\jdk*"),
      (Join-Path $pf "Zulu\zulu*"),
      (Join-Path $pf "Android\Android Studio\jbr"),
      (Join-Path $pf "Android Studio\jbr")
    )
    if ($pf86) {
      $globs += (Join-Path $pf86 "Android\Android Studio\jbr")
    }
    if ($local) {
      $globs += (Join-Path $local "Programs\Android Studio\jbr")
    }

    foreach ($g in $globs) {
      Get-Item $g -ErrorAction SilentlyContinue | ForEach-Object { [void]$list.Add($_.FullName) }
    }
    return $list
  }

  function Find-Jdk {
    foreach ($want in @(17, 21)) {
      foreach ($jdkPath in (Get-JdkCandidates)) {
        if (-not $jdkPath -or -not (Test-Path $jdkPath)) { continue }
        $major = Get-JavaMajor $jdkPath
        if ($major -eq $want) { return $jdkPath }
      }
    }
    return $null
  }

  $JdkHome = Find-Jdk
  if (-not $JdkHome) {
    $current = ""
    if ($env:JAVA_HOME) {
      $maj = Get-JavaMajor $env:JAVA_HOME
      $current = "JAVA_HOME points at Java $maj; Gradle for React Native needs 17 or 21."
    }
    Die "No JDK 17/21 found. $current" @(
      "winget install EclipseAdoptium.Temurin.17.JDK",
      "or install Android Studio (its bundled JBR is detected automatically)"
    )
  }
  $env:JAVA_HOME = $JdkHome
  $env:Path = "$(Join-Path $JdkHome 'bin');$env:Path"
  Ok "JDK $(Get-JavaMajor $JdkHome) at $JdkHome"

  # -- 5. Android SDK -------------------------------------------------------
  Step "Android SDK"

  function Find-Sdk {
    $cands = New-Object System.Collections.Generic.List[string]
    if ($env:ANDROID_HOME) { [void]$cands.Add($env:ANDROID_HOME) }
    if ($env:ANDROID_SDK_ROOT) { [void]$cands.Add($env:ANDROID_SDK_ROOT) }
    if ($env:LOCALAPPDATA) {
      [void]$cands.Add((Join-Path $env:LOCALAPPDATA "Android\Sdk"))
    }
    foreach ($d in $cands) {
      if (-not $d -or -not (Test-Path $d)) { continue }
      if ((Test-Path (Join-Path $d "platform-tools")) -or
          (Test-Path (Join-Path $d "cmdline-tools")) -or
          (Test-Path (Join-Path $d "platforms"))) {
        return $d
      }
    }
    return $null
  }

  function Find-SdkManager([string]$SdkRoot) {
    $latest = Join-Path $SdkRoot "cmdline-tools\latest\bin\sdkmanager.bat"
    if (Test-Path $latest) { return $latest }
    $bins = Get-ChildItem (Join-Path $SdkRoot "cmdline-tools") -Directory -ErrorAction SilentlyContinue |
      ForEach-Object { Join-Path $_.FullName "bin\sdkmanager.bat" } |
      Where-Object { Test-Path $_ }
    if ($bins) { return ($bins | Select-Object -First 1) }
    $legacy = Join-Path $SdkRoot "tools\bin\sdkmanager.bat"
    if (Test-Path $legacy) { return $legacy }
    $onPath = Get-Command sdkmanager.bat -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    return $null
  }

  function Get-SdkPkgDir([string]$SdkRoot, [string]$Pkg) {
    return (Join-Path $SdkRoot ($Pkg -replace ";", [IO.Path]::DirectorySeparatorChar))
  }

  function Install-AndroidCmdlineTools([string]$SdkRoot) {
    $url = "https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip"
    $latestDir = Join-Path $SdkRoot "cmdline-tools\latest"
    $sdkmanager = Join-Path $latestDir "bin\sdkmanager.bat"
    if (Test-Path $sdkmanager) { return $sdkmanager }

    Info "Downloading Android command-line tools..."
    New-Item -ItemType Directory -Force -Path $SdkRoot | Out-Null
    $zip = Join-Path $env:TEMP "android-cmdline-tools.zip"
    $extract = Join-Path $env:TEMP ("android-cmdline-tools-extract-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $extract | Out-Null
    try {
      Invoke-WebRequest -Uri $url -OutFile $zip
      Expand-Archive -Path $zip -DestinationPath $extract -Force
      $inner = Get-ChildItem $extract -Directory | Select-Object -First 1
      if (-not $inner) { Die "Android cmdline-tools zip layout unexpected." }
      New-Item -ItemType Directory -Force -Path (Split-Path $latestDir -Parent) | Out-Null
      if (Test-Path $latestDir) { Remove-Item -Recurse -Force $latestDir }
      Move-Item $inner.FullName $latestDir
    } finally {
      Remove-Item -Force $zip -ErrorAction SilentlyContinue
      Remove-Item -Recurse -Force $extract -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path $sdkmanager)) {
      Die "sdkmanager still missing after cmdline-tools install."
    }
    return $sdkmanager
  }

  $Sdk = Find-Sdk
  if (-not $Sdk) {
    $Sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    Info "Android SDK not found - bootstrapping at $Sdk"
    $null = Install-AndroidCmdlineTools $Sdk
  }

  $SdkManager = Find-SdkManager $Sdk
  if (-not $SdkManager) {
    Info "sdkmanager missing - installing Android command-line tools"
    $SdkManager = Install-AndroidCmdlineTools $Sdk
  }

  $RequiredPkgs = @(
    "platform-tools",
    "platforms;android-$CompileSdk",
    "build-tools;$BuildTools",
    "ndk;$NdkVersion",
    "cmake;$DefaultCmake"
  )

  $MissingPkgs = @()
  foreach ($pkg in $RequiredPkgs) {
    if (-not (Test-Path (Get-SdkPkgDir $Sdk $pkg))) {
      $MissingPkgs += $pkg
    }
  }
  $HasLicense = Test-Path (Join-Path $Sdk "licenses\android-sdk-license")

  if ($MissingPkgs.Count -gt 0 -or -not $HasLicense) {
    if ($MissingPkgs.Count -gt 0) { Info ("missing SDK packages: " + ($MissingPkgs -join " ")) }
    if (-not $HasLicense) { Info "Android SDK licenses not accepted yet" }
    if ($Doctor -and -not $Yes) {
      Warn ("Run without -Doctor (add -Yes to skip prompts) to install: " + ($(if ($MissingPkgs) { $MissingPkgs -join " " } else { "licenses" })))
    } elseif ($Yes -or (Confirm-Ask "Accept Android SDK licenses and install the missing packages (~3-4 GB)?")) {
      Info "Installing SDK packages (first time can take several minutes)..."
      $yesPipe = "y`n" * 200
      $prevEa = $ErrorActionPreference
      $ErrorActionPreference = "Continue"
      try {
        $yesPipe | & $SdkManager --sdk_root=$Sdk --licenses 2>&1 | Out-Null
        if ($MissingPkgs.Count -gt 0) {
          & $SdkManager --sdk_root=$Sdk --install @MissingPkgs
          if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
            Die ("sdkmanager failed to install: " + ($MissingPkgs -join " "))
          }
        }
      } finally {
        $ErrorActionPreference = $prevEa
      }
      foreach ($pkg in $RequiredPkgs) {
        if (-not (Test-Path (Get-SdkPkgDir $Sdk $pkg))) {
          Die "SDK package still missing after install: $pkg"
        }
      }
      if (-not (Test-Path (Join-Path $Sdk "licenses\android-sdk-license"))) {
        Die "Android SDK licenses are still not accepted." @("Run: `"$SdkManager`" --licenses")
      }
    } else {
      Die "Required Android SDK packages are missing." @(
        ("Re-run with -Yes, or install via Android Studio SDK Manager: " + ($(if ($MissingPkgs) { $MissingPkgs -join " " } else { "licenses" })))
      )
    }
  }

  [Environment]::SetEnvironmentVariable("ANDROID_HOME", $Sdk, "User")
  [Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $Sdk, "User")

  $env:ANDROID_HOME = $Sdk
  $env:ANDROID_SDK_ROOT = $Sdk
  $env:Path = "$(Join-Path $Sdk 'platform-tools');$env:Path"
  Ok "SDK at $Sdk"
  Ok "android-$CompileSdk, build-tools $BuildTools, NDK $NdkVersion, CMake $DefaultCmake"

  # -- 6. project checks ----------------------------------------------------
  if (-not $SkipChecks) {
    Step "Project checks (expo-doctor)"
    Push-Location $MobileRoot
    try {
      $tsconfig = Join-Path $MobileRoot "tsconfig.json"
      if (Test-Path $tsconfig) {
        npx --yes tsc --noEmit
        if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
          Die "TypeScript errors in mobile/ (fix them, or re-run with -SkipChecks)."
        }
        Ok "TypeScript"
      }

      $prevEa = $ErrorActionPreference
      $ErrorActionPreference = "Continue"
      try {
        npx --yes expo-doctor@latest
        $doctorExit = $LASTEXITCODE
      } finally {
        $ErrorActionPreference = $prevEa
      }
      if ($null -ne $doctorExit -and $doctorExit -ne 0) {
        if ($Yes) {
          Warn "expo-doctor reported problems - continuing because -Yes was set"
        } else {
          $cont = Read-Host "  expo-doctor reported problems. Continue build anyway? [y/N]"
          if ($cont -notmatch '^[Yy]') {
            Die "expo-doctor reported problems." @(
              "Version mismatches:  cd mobile; npx expo install --fix",
              "Missing peer deps:   cd mobile; npx expo install <package>",
              "Or re-run with -SkipChecks / -Yes"
            )
          }
          Warn "Continuing despite expo-doctor issues"
        }
      } else {
        Ok "expo-doctor"
      }
    } finally {
      Pop-Location
    }
  }

  if ($Doctor) {
    Step "Doctor summary"
    if ($script:Warnings.Count -gt 0) {
      Write-Host ("  " + (Ansi "33m") + "$($script:Warnings.Count) warning(s) above." + (Ansi "0m"))
    }
    Ok "Ready to build. Run .\build-android.ps1"
    exit 0
  }

  # -- 7. native project (expo prebuild) ------------------------------------
  Step "Native project (expo prebuild)"

  $prebuildHash = Get-InputHash @(
    "package.json",
    "package-lock.json",
    "app.json",
    "app.config.js",
    "app.config.ts",
    "eas.json",
    "plugins",
    "assets"
  )
  $prebuildStamp = Join-Path $AndroidDir ".build-android-prebuild"
  $gradlewBat = Join-Path $AndroidDir "gradlew.bat"
  $needPrebuild = $Clean -or (-not (Test-Path $gradlewBat))
  if (-not $needPrebuild -and (Test-Path $prebuildStamp)) {
    $prev = (Get-Content -Raw $prebuildStamp).Trim()
    if ($prev -ne $prebuildHash) { $needPrebuild = $true }
  } elseif (-not (Test-Path $prebuildStamp)) {
    $needPrebuild = $true
  }

  if ($needPrebuild) {
    if ($Clean) { Info "-Clean requested" }
    elseif (-not (Test-Path $gradlewBat)) { Info "no android/ project yet" }
    else { Info "app config, dependencies or assets changed since last build" }

    # Gradle daemons can lock files under android/ and break expo prebuild --clean.
    if (Test-Path $gradlewBat) {
      Info "Stopping Gradle daemons before prebuild..."
      Push-Location $AndroidDir
      try {
        $prevEa = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try { & .\gradlew.bat --stop 2>&1 | Out-Null } catch {}
        $ErrorActionPreference = $prevEa
      } finally {
        Pop-Location
      }
    }

    $script:PkgBackup = [System.IO.Path]::GetTempFileName()
    Copy-Item -Force (Join-Path $MobileRoot "package.json") $script:PkgBackup

    Push-Location $MobileRoot
    try {
      $env:CI = "1"
      npx --yes expo prebuild --platform android --clean --no-install
      if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        Die "expo prebuild failed." @("Check the plugin list in mobile/app.json and that every plugin package is installed.")
      }
    } finally {
      Pop-Location
      Restore-PackageJson
    }

    if (-not (Test-Path $AndroidDir)) {
      New-Item -ItemType Directory -Path $AndroidDir | Out-Null
    }
    Set-Content -Path $prebuildStamp -Value $prebuildHash -NoNewline
    Ok "android/ regenerated"
  } else {
    Ok "android/ is up to date with app config"
  }

  # local.properties wants forward slashes; Gradle accepts either.
  $localProps = "sdk.dir=" + ($Sdk -replace '\\', '/')
  Set-Content -Path (Join-Path $AndroidDir "local.properties") -Value $localProps -Encoding ASCII

  # expo prebuild resets this; keep enough Metaspace for KSP (expo-updates).
  $gradlePropsPath = Join-Path $AndroidDir "gradle.properties"
  if (Test-Path $gradlePropsPath) {
    $gp = Get-Content -Raw $gradlePropsPath
    $desiredJvm = "org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8"
    if ($gp -match '(?m)^org\.gradle\.jvmargs=.*$') {
      $gp = [regex]::Replace($gp, '(?m)^org\.gradle\.jvmargs=.*$', $desiredJvm)
    } else {
      $gp = $desiredJvm + "`r`n" + $gp
    }
    Set-Content -Path $gradlePropsPath -Value $gp -Encoding UTF8
  }

  # Force a fresh JS bundle every build so code and env edits are never cached.
  @(
    "app\build\generated\assets\react\release",
    "app\build\generated\res\react\release",
    "app\build\generated\sourcemaps\react\release",
    "app\build\intermediates\sourcemaps\react\release"
  ) | ForEach-Object {
    $p = Join-Path $AndroidDir $_
    if (Test-Path $p) { Remove-Item -Recurse -Force $p }
  }

  # -- 8. gradle ------------------------------------------------------------
  $gradleTask = if ($Format -eq "aab") { "bundleRelease" } else { "assembleRelease" }
  $archLabel = if ($Arch) { " ($Arch)" } else { "" }
  Step "Gradle $gradleTask$archLabel"

  $gradleArgs = @($gradleTask)
  if ($Arch) { $gradleArgs += "-PreactNativeArchitectures=$Arch" }

  $signedWith = "debug keystore (fine for sideloading; use a real keystore for the Play Store)"
  if ($env:ANDROID_KEYSTORE_FILE) {
    foreach ($v in @("ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD")) {
      if (-not [Environment]::GetEnvironmentVariable($v)) {
        Die "ANDROID_KEYSTORE_FILE is set but $v is empty."
      }
    }
    if (-not (Test-Path $env:ANDROID_KEYSTORE_FILE)) {
      Die "Keystore not found: $($env:ANDROID_KEYSTORE_FILE)"
    }
    $ks = (Resolve-Path $env:ANDROID_KEYSTORE_FILE).Path
    $gradleArgs += "-Pandroid.injected.signing.store.file=$ks"
    $gradleArgs += "-Pandroid.injected.signing.store.password=$($env:ANDROID_KEYSTORE_PASSWORD)"
    $gradleArgs += "-Pandroid.injected.signing.key.alias=$($env:ANDROID_KEY_ALIAS)"
    $gradleArgs += "-Pandroid.injected.signing.key.password=$($env:ANDROID_KEY_PASSWORD)"
    $signedWith = "release keystore $(Split-Path $ks -Leaf)"
  }

  Info "first build downloads Gradle + native deps and can take 10-20 min; later builds are much faster"
  $start = Get-Date
  Push-Location $AndroidDir
  try {
    & .\gradlew.bat @gradleArgs
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
      Die "Gradle build failed (see the first error above)." @(
        "Out of memory?   raise org.gradle.jvmargs in mobile/android/gradle.properties (re-applied on -Clean)",
        "Weird cache error? re-run with -Clean",
        "Native/CMake error on Windows? see the long-path warning at the top"
      )
    }
  } finally {
    Pop-Location
  }
  $elapsed = [int]((Get-Date) - $start).TotalSeconds

  # -- 9. output ------------------------------------------------------------
  Step "Output"

  if ($Format -eq "aab") {
    $artifact = Join-Path $AndroidDir "app\build\outputs\bundle\release\app-release.aab"
  } else {
    $artifact = Join-Path $AndroidDir "app\build\outputs\apk\release\app-release.apk"
  }
  if (-not (Test-Path $artifact)) {
    Die "Gradle finished but the artifact is missing: $artifact"
  }

  if ($Format -eq "apk") {
    $apksigner = Join-Path $Sdk "build-tools\$BuildTools\apksigner.bat"
    if (Test-Path $apksigner) {
      & $apksigner verify $artifact 2>$null | Out-Null
      if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        Die "apksigner could not verify the APK signature."
      }
      Ok "signature verified ($signedWith)"
    }
  }

  if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
  }
  $stampTime = Get-Date -Format "yyyyMMdd-HHmm"
  $suffix = ""
  if ($Arch) { $suffix = "-" + ($Arch -replace ",", "_") }
  $destName = "$AppName-v$AppVersion-$stampTime$suffix.$Format"
  $dest = Join-Path $OutDir $destName
  Copy-Item -Force $artifact $dest

  Get-ChildItem $OutDir -Filter "*.$Format" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip $KeepBuilds |
    ForEach-Object { Remove-Item -Force $_.FullName }

  $sizeMb = "{0:N1} MB" -f ((Get-Item $dest).Length / 1MB)
  $mins = [math]::Floor($elapsed / 60)
  $secs = $elapsed % 60
  Ok $dest
  Ok "$sizeMb, built in ${mins}m ${secs}s"

  if ($Install) {
    if ($Format -eq "aab") {
      Warn "-Install only works with APKs; skipping."
    } else {
      Step "Install on device"
      $adb = Join-Path $Sdk "platform-tools\adb.exe"
      if (-not (Test-Path $adb)) { Die "adb not found at $adb" }
      $devices = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\tdevice$' }
      if (-not $devices) {
        Die "No device connected." @("Plug in a phone with USB debugging on (or start an emulator), then: adb install -r `"$dest`"")
      }
      & $adb install -r $dest
      if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        Die "adb install failed." @(
          "If it says INSTALL_FAILED_UPDATE_INCOMPATIBLE, uninstall the old app first:",
          "  adb uninstall $AppPackage"
        )
      }
      Ok "installed $AppPackage"
    }
  }

  if ($script:Warnings.Count -gt 0) {
    Write-Host ""
    Write-Host ((Ansi "33m") + "$($script:Warnings.Count) warning(s):" + (Ansi "0m"))
    foreach ($w in $script:Warnings) {
      Write-Host "  - $w"
    }
  }
  Write-Host ""
  Write-Host ((Ansi "1;32m") + "Done." + (Ansi "0m"))
  Write-Host ""
}
catch {
  Write-Host ""
  Write-Host ((Ansi "1;31m") + "[X] $($_.Exception.Message)" + (Ansi "0m"))
  if ($script:CurrentStep -and $script:CurrentStep -ne "startup") {
    Write-Host ((Ansi "31m") + "Build stopped during: $($script:CurrentStep)" + (Ansi "0m"))
  }
  exit 1
}
finally {
  Restore-PackageJson
}
