# Native Windows CI smoke check of a packaged portable Frame Builder EXE.
# Verifies a visible, version-correct Electron window, not update installation.
param([Parameter(Mandatory=$true)][string]$Exe,
      [Parameter(Mandatory=$true)][string]$ExpectedVersion)
$ErrorActionPreference='Stop'
if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) { throw 'Windows portable executable missing' }
$testRoot=Join-Path $env:RUNNER_TEMP ('FrameBuilder-Smoke-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
# The window app deliberately uses the existing Canvas Frame Builder data path.
$env:APPDATA=Join-Path $testRoot 'AppData'
$updateDir=Join-Path $env:APPDATA 'Canvas Frame Builder/updates'
New-Item -ItemType Directory -Path $updateDir -Force | Out-Null
$nonce=([guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')).Substring(0,48)
$health=Join-Path $updateDir ('health-'+[guid]::NewGuid().ToString('N').Substring(0,24)+'.txt')
$process=Start-Process -FilePath $Exe -PassThru -ArgumentList @(
  '--frame-update-health-file',('"'+$health+'"'),'--frame-update-health-token',$nonce)
try {
  $accepted=$false
  for($i=0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 1
    if(-not (Test-Path -LiteralPath $health -PathType Leaf)) { continue }
    $receipt=Get-Content -LiteralPath $health -Raw | ConvertFrom-Json
    if($receipt.token -ceq $nonce -and $receipt.version -eq $ExpectedVersion -and
       $receipt.windowVisible -eq $true) {
      $accepted=$true
      break
    }
  }
  if(-not $accepted) { throw 'Packaged Electron window did not create a verified visible-window receipt' }
  Write-Host ('Native Windows visible-window check PASS: '+$ExpectedVersion)
} finally {
  try { if(-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } } catch {}
  Remove-Item -LiteralPath $testRoot -Force -Recurse -ErrorAction SilentlyContinue
}
