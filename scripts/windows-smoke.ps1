# Native Windows CI smoke check of a packaged portable Frame Builder EXE.
# Verifies a visible, version-correct Electron window, not update installation.
param([Parameter(Mandatory=$true)][string]$Exe,
      [Parameter(Mandatory=$true)][string]$ExpectedVersion)
$ErrorActionPreference='Stop'
if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) { throw 'Windows portable executable missing' }
$testRoot=Join-Path $env:RUNNER_TEMP ('FrameBuilder-Smoke-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
# Electron uses Windows' Roaming AppData known folder, not necessarily the
# APPDATA environment variable. The health receipt must live under that same
# actual per-user folder or the app correctly rejects the request.
$roaming=[Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
if(-not $roaming){throw 'Unable to resolve Windows Roaming AppData path'}
$updateDir=Join-Path $roaming 'Canvas Frame Builder/updates'
New-Item -ItemType Directory -Path $updateDir -Force | Out-Null
$nonce=([guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')).Substring(0,48)
$health=Join-Path $updateDir ('health-'+[guid]::NewGuid().ToString('N').Substring(0,24)+'.txt')
$env:FRAME_BUILDER_HEALTH_FILE = $health
$env:FRAME_BUILDER_HEALTH_TOKEN = $nonce
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
  if(-not $accepted) {
    Write-Host ('Health file exists: '+(Test-Path -LiteralPath $health -PathType Leaf))
    if(Test-Path -LiteralPath $health -PathType Leaf) {
      $receiptText=Get-Content -LiteralPath $health -Raw
      Write-Host ('Health receipt bytes: '+$receiptText.Length)
    }
    $running=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'Frame Builder*' -or $_.Name -like 'Frame_Builder*' })
    foreach($p in $running) {
      $argsText=([string]$p.CommandLine).Replace($nonce,'[health-token-redacted]')
      Write-Host ('Startup process: '+$p.ProcessId+' '+$p.Name+' '+$argsText)
    }
    throw 'Packaged Electron window did not create a verified visible-window receipt'
  }
  Write-Host ('Native Windows visible-window check PASS: '+$ExpectedVersion)
} finally {
  try { if(-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } } catch {}
  Remove-Item -LiteralPath $health -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $testRoot -Force -Recurse -ErrorAction SilentlyContinue
}
