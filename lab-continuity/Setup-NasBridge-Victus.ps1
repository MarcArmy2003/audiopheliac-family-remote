<#
.SYNOPSIS
  One-shot setup on VAL-VICTUS: persistent file bridge to NAS87828E over
  SMB, with Tailscale as the transport when off the home LAN.

.DESCRIPTION
  Design (2026-08-15): SMB is the file protocol (NAS already serves it,
  fastest simple option for large transfers). Tailscale is the bridge:
  MagicDNS makes \\nas87828e resolve identically on the home LAN and
  remotely, and when both devices are on the same LAN Tailscale routes
  peer-to-peer at near wire speed. No sync engine, nothing bidirectional
  (Qsync is retired for cause; see qsync-retirement-recon_2026-08-12.md).

  Steps:
    1. Install Tailscale (winget) if absent.
    2. tailscale up (opens browser for auth on first run) with
       unattended mode so the tunnel survives reboot and logon-less starts.
    3. Store NAS SMB credentials in Windows Credential Manager (cmdkey)
       for BOTH names: NAS87828E (LAN/NetBIOS) and nas87828e (MagicDNS),
       plus the tailnet IP fallback 100.78.140.32.
    4. Verify SMB reachability and report.

  Idempotent: re-running repairs rather than duplicates.

.NOTES
  Environment: Windows PowerShell 5.1 or PowerShell 7, VAL-VICTUS.
  Privilege:   Run as Administrator (winget install + service).
  Working dir: any.
#>
[CmdletBinding()]
param(
  [string]$NasLanHost  = 'NAS87828E',
  [string]$NasMagicDns = 'nas87828e',
  [string]$NasMagicFqdn = 'nas87828e.tail56985c.ts.net',
  [string]$NasTailnetIp = '100.78.140.32',
  [string]$SmbUser = ''   # prompted if empty
)

$ErrorActionPreference = 'Stop'
function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }

# --- 1. Tailscale install -------------------------------------------------
Step 'Tailscale install check'
$ts = Get-Command tailscale -ErrorAction SilentlyContinue
if (-not $ts) {
  $tsExe = "$env:ProgramFiles\Tailscale\tailscale.exe"
  if (Test-Path $tsExe) { $ts = $tsExe }
}
if (-not $ts) {
  Write-Host 'Installing Tailscale via winget...'
  winget install --id Tailscale.Tailscale -e --accept-source-agreements --accept-package-agreements
  $ts = "$env:ProgramFiles\Tailscale\tailscale.exe"
  if (-not (Test-Path $ts)) { throw 'Tailscale install did not land at the expected path.' }
} else {
  if ($ts -isnot [string]) { $ts = $ts.Source }
  Write-Host "Tailscale present: $ts"
}

# --- 2. Join tailnet, persistent across reboots ---------------------------
Step 'Tailscale up (browser opens for auth on first run)'
# unattended: tunnel runs as a service even before user logon
& $ts up --unattended
& $ts status

# --- 3. SMB credentials for every name the NAS answers to -----------------
Step 'Store NAS SMB credentials (Credential Manager)'
if (-not $SmbUser) { $SmbUser = Read-Host 'NAS username for SMB (e.g. gillo)' }
$sec = Read-Host "Password for $SmbUser on the NAS" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
foreach ($target in $NasLanHost, $NasMagicDns, $NasMagicFqdn, $NasTailnetIp) {
  cmdkey /delete:$target 2>$null | Out-Null
  cmdkey /add:$target /user:$SmbUser /pass:$plain | Out-Null
  Write-Host "Credential stored for $target"
}
$plain = $null

# --- 4. Verify ------------------------------------------------------------
Step 'Verify SMB reachability'
$results = @()
foreach ($target in $NasLanHost, $NasMagicDns, $NasMagicFqdn, $NasTailnetIp) {
  $ok = Test-Path "\\$target\Public" -ErrorAction SilentlyContinue
  if (-not $ok) {
    # Public may not exist as a share; try a TCP 445 probe as fallback signal
    $tcp = (New-Object Net.Sockets.TcpClient)
    $ok = $tcp.ConnectAsync($target, 445).Wait(4000) -and $tcp.Connected
    $tcp.Close()
    if ($ok) { $ok = 'port-445-open (share name untested)' }
  }
  $results += [pscustomobject]@{ Target = "\\$target"; Reachable = $ok }
}
$results | Format-Table -AutoSize

Write-Host @'

DONE. Usage from this machine, anywhere:
  \\nas87828e\<share>                       <- home LAN and remote (MagicDNS)
  \\nas87828e.tail56985c.ts.net\<share>     <- fully-qualified, most robust
  \\NAS87828E\<share>                       <- LAN name, home only
  \\100.78.140.32\<share>                   <- tailnet IP fallback

Large transfers: robocopy source \\nas87828e\<share>\dest /E /R:2 /W:5
On the home LAN Tailscale routes peer-to-peer, so speed is wire speed.
'@
