# User-initiated, post-exit portable Windows installer. Runs outside the Electron app.
# The only removable files are installer-owned .frame-update-stage/.failed-update,
# the downloaded payload, and the one previous-version rollback executable.
param(
 [Parameter(Mandatory=$true)][string]$Target,
 [Parameter(Mandatory=$true)][string]$Payload,
 [Parameter(Mandatory=$true)][string]$Sha256,
 [Parameter(Mandatory=$true)][string]$ExpectedVersion,
 [Parameter(Mandatory=$true)][string]$OldSha256,
 [Parameter(Mandatory=$true)][string]$HealthFile,
 [Parameter(Mandatory=$true)][string]$HealthToken,
 [Parameter(Mandatory=$true)][int]$ParentPid,
 [Parameter(Mandatory=$true)][string]$LogFile
)
$ErrorActionPreference = 'Stop'
function Log([string]$message) {
  Add-Content -LiteralPath $LogFile -Value ((Get-Date).ToString('o') + ' ' + $message)
}
function HashOK([string]$p, [string]$expected) {
  if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { return $false }
  return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash -ieq $expected
}
function Wait-ExecutableUnlocked([string]$p, [int]$seconds) {
  for ($i=0; $i -lt $seconds; $i++) {
    try {
      $file = [System.IO.File]::Open($p, 'Open', 'ReadWrite', 'None')
      $file.Dispose()
      return
    } catch [System.IO.IOException] {
      Start-Sleep -Seconds 1
    }
  }
  throw 'Previous portable executable is still locked'
}
$stage = $Target + '.frame-update-stage'
$backup = $Target + '.previous'
$failed = $Target + '.failed-update'
$swapped = $false
$child = $null
try {
  Log 'Starting Frame Builder portable install helper'
  foreach ($p in @($Target, $Payload, $HealthFile, $LogFile)) {
    if (-not [System.IO.Path]::IsPathFullyQualified($p)) { throw 'Installer paths must be absolute' }
  }
  if ($ExpectedVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid intended version' }
  if ($Sha256 -notmatch '^[a-fA-F0-9]{64}$' -or $OldSha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid digest' }
  if (-not (Test-Path -LiteralPath $Target -PathType Leaf)) { throw 'Existing executable is missing' }
  if (-not (HashOK $Payload $Sha256)) { throw 'Downloaded update digest mismatch' }
  $info = (Get-Item -LiteralPath $Payload).VersionInfo
  if ($info.ProductName -notlike '*Frame Builder*') { throw ('Wrong executable product: ' + $info.ProductName) }
  if ($info.ProductVersion -notmatch ('^' + [regex]::Escape($ExpectedVersion) + '(?:$|\.)')) {
    throw ('Wrong executable version: ' + $info.ProductVersion)
  }
  for ($i=0; $i -lt 120; $i++) {
    if (-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Seconds 1
  }
  if (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) { throw 'Previous app has not closed' }
  Wait-ExecutableUnlocked $Target 60
  if (-not (HashOK $Target $OldSha256)) { throw 'Installed executable changed since confirmation' }
  # Stage next to the destination for same-volume rename, including cross-drive downloads.
  Copy-Item -LiteralPath $Payload -Destination $stage -Force
  if (-not (HashOK $stage $Sha256)) { throw 'Target-volume staged digest mismatch' }
  Remove-Item -LiteralPath $HealthFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $failed -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
  Move-Item -LiteralPath $Target -Destination $backup
  $swapped = $true
  Move-Item -LiteralPath $stage -Destination $Target
  # Electron-builder portable launcher can exit after starting the extracted app.
  # A valid versioned, nonce-bound visible-window receipt is the success condition.
  $env:FRAME_BUILDER_HEALTH_FILE = $HealthFile
  $env:FRAME_BUILDER_HEALTH_TOKEN = $HealthToken
  $child = Start-Process -FilePath $Target -ArgumentList @(
    '--frame-update-health-file', ('"' + $HealthFile + '"'),
    '--frame-update-health-token', $HealthToken
  ) -PassThru
  Log ('Launched update entry point PID ' + $child.Id)
  $healthy = $false
  for ($i=0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path -LiteralPath $HealthFile -PathType Leaf) {
      try {
        $receipt = Get-Content -LiteralPath $HealthFile -Raw | ConvertFrom-Json
        if ($receipt.token -ceq $HealthToken -and $receipt.version -eq $ExpectedVersion -and
            $receipt.windowVisible -eq $true) {
          $healthy = $true
          break
        }
      } catch {
        # Partial receipt can be retried until the allotted timeout expires.
      }
    }
  }
  if (-not $healthy) { throw 'New app did not confirm a visible healthy window' }
  Log 'Visible, version-matched new window confirmed; rollback backup retained'
  Remove-Item -LiteralPath $Payload -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $HealthFile -Force -ErrorAction SilentlyContinue
  exit 0
} catch {
  Log ('Install failed: ' + $_)
  if ($swapped) {
    if ($null -ne $child) {
      try { if (-not $child.HasExited) { $child.CloseMainWindow() | Out-Null; Start-Sleep -Seconds 2 } } catch {}
      try { if (-not $child.HasExited) { Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue } } catch {}
    }
    try {
      if (Test-Path -LiteralPath $Target -PathType Leaf) {
        Move-Item -LiteralPath $Target -Destination $failed -Force
      }
      if (-not (Test-Path -LiteralPath $backup -PathType Leaf)) { throw 'Rollback executable missing' }
      Move-Item -LiteralPath $backup -Destination $Target -Force
      Log 'Previous executable restored'
      Start-Process -FilePath $Target | Out-Null
      Log 'Previous version restarted'
    } catch {
      # Keep rollback and failed candidate if a lock prevents restoration.
      Log ('Manual rollback may be necessary: ' + $_)
      throw
    }
  }
  Remove-Item -LiteralPath $stage -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $HealthFile -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $Target -PathType Leaf) {
    Remove-Item -LiteralPath $failed -Force -ErrorAction SilentlyContinue
  }
  exit 1
}
