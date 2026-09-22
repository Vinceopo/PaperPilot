# Run as Administrator (right-click → Run with PowerShell / Run as administrator)
# Opens Windows Firewall so phones/other PCs on Wi-Fi can reach PaperPilot.

$ErrorActionPreference = "Stop"

foreach ($r in @(
  @{ Name = "PaperPilot Vite 5173"; Port = 5173 },
  @{ Name = "PaperPilot API 8000"; Port = 8000 }
)) {
  Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule -ErrorAction SilentlyContinue
  New-NetFirewallRule `
    -DisplayName $r.Name `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $r.Port `
    -Profile Any | Out-Null
  Write-Host "Allowed TCP $($r.Port) ($($r.Name))"
}

$python = "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe"
if (Test-Path $python) {
  Get-NetFirewallRule -DisplayName "PaperPilot Python Allow" -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule -ErrorAction SilentlyContinue
  New-NetFirewallRule `
    -DisplayName "PaperPilot Python Allow" `
    -Direction Inbound `
    -Action Allow `
    -Program $python `
    -Profile Any | Out-Null
  Write-Host "Allowed $python"
}

Get-NetFirewallRule -DisplayName "Node.js JavaScript Runtime" -ErrorAction SilentlyContinue | ForEach-Object {
  Set-NetFirewallRule -Name $_.Name -Profile Any -Action Allow -Enabled True
  Write-Host "Node.js inbound → Any profile"
}

try {
  Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
  Write-Host "Wi-Fi network category → Private"
} catch {
  Write-Host "Could not set Private (ok if already Private): $($_.Exception.Message)"
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -First 1 -ExpandProperty IPAddress)

Write-Host ""
Write-Host "Done. On this PC or another device on the same Wi-Fi open:"
Write-Host "  http://${ip}:5173"
Write-Host ""
