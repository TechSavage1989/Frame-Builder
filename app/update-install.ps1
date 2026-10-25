# User-initiated portable Windows update transaction. Compatible with Windows PowerShell 5.1.
param([Parameter(Mandatory=$true)][string]$JobFile)
$ErrorActionPreference='Stop'
# A caller launched from PowerShell 7 can pass a module path that hides
# Windows PowerShell's own modules. Prefer the native built-ins in this helper.
$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')+[IO.Path]::PathSeparator+$env:PSModulePath
$job=$null; $swapped=$false; $child=$null; $owned=@{}; $parentExited=$false
function Write-Json([string]$file, $value) {
  $temp=$file+'.tmp'
  [IO.File]::WriteAllText($temp, ($value | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $temp -Destination $file -Force
}
function Log([string]$text) {
  if($null -ne $job) { Add-Content -LiteralPath (Join-Path $job.storage 'install.log') -Value ((Get-Date).ToString('o')+' '+$text) }
}
function HashOK([string]$file,[string]$hash) {
  if(-not (Test-Path -LiteralPath $file -PathType Leaf)){return $false}
  $stream=[IO.File]::OpenRead($file)
  $digest=[Security.Cryptography.SHA256]::Create()
  try {
    $actual=[BitConverter]::ToString($digest.ComputeHash($stream)).Replace('-','')
    return $actual -ieq $hash
  } finally {$digest.Dispose();$stream.Dispose()}
}
function Assert-Absolute([string]$file) {
  if($file -notmatch '^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+\\)' -or [IO.Path]::GetFullPath($file) -ine $file) { throw 'Installer paths must be canonical absolute Windows paths' }
}
function Assert-PE([string]$file) {
  $stream=[IO.File]::OpenRead($file)
  try {
    $r=New-Object IO.BinaryReader($stream)
    if($r.ReadUInt16() -ne 0x5A4D){throw 'Update is not a PE executable'}
    $stream.Position=60; $offset=$r.ReadUInt32()
    if($offset -lt 64 -or $offset+24 -gt $stream.Length){throw 'Invalid PE offset'}
    $stream.Position=$offset
    if($r.ReadUInt32() -ne 0x4550){throw 'Invalid PE signature'}
    if($r.ReadUInt16() -notin @(0x8664,0x14c)){throw 'Invalid PE architecture'}
    $stream.Position=$offset+22
    if(($r.ReadUInt16() -band 0x2000) -ne 0){throw 'DLL payload rejected'}
  } finally {$stream.Dispose()}
}
function Wait-Unlocked([string]$file) {
  for($i=0;$i -lt 60;$i++){
    try {$s=[IO.File]::Open($file,'Open','ReadWrite','None');$s.Dispose();return}
    catch [IO.IOException] {Start-Sleep -Seconds 1}
  }
  throw 'The previous portable executable is still locked'
}
function Track-Children {
  if($null -eq $child){return}
  $all=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  for($depth=0;$depth -lt 5;$depth++){
    foreach($p in $all){
      if($p.ProcessId -eq $child.Id -or $owned.ContainsKey([int]$p.ParentProcessId)){
        if(-not $owned.ContainsKey([int]$p.ProcessId)){$owned[[int]$p.ProcessId]=$p.CreationDate}
      }
    }
  }
}
function Stop-NewProcesses {
  Track-Children
  foreach($idValue in @($owned.Keys)){
    $p=Get-CimInstance Win32_Process -Filter "ProcessId=$idValue" -ErrorAction SilentlyContinue
    if($p -and $p.CreationDate -eq $owned[$idValue]){
      Stop-Process -Id $idValue -Force -ErrorAction SilentlyContinue
    }
  }
}
function Result([string]$state,[string]$message) {
  Write-Json (Join-Path $job.storage ('result-'+$job.id+'.json')) @{
    id=$job.id; state=$state; message=$message; helperPid=$PID; version=$job.version
  }
}
try {
  Assert-Absolute $JobFile
  $job=Get-Content -LiteralPath $JobFile -Encoding UTF8 -Raw | ConvertFrom-Json
  if($job.appId -cne 'com.techsavage3d.canvasframe' -or $job.id -notmatch '^[a-f0-9]{24}$'){throw 'Wrong update job identity'}
  foreach($p in @($job.target,$job.payload,$job.stage,$job.storage)){Assert-Absolute $p}
  if((Split-Path -Leaf $JobFile) -cne ('install-'+$job.id+'.json') -or
     (Split-Path -Parent $JobFile) -ine $job.storage){throw 'Wrong installer job path'}
  if($job.payload -ine (Join-Path $job.storage ('update-'+$job.sha256+'.exe'))){throw 'Wrong payload path'}
  if($job.stage -ine (Join-Path (Split-Path -Parent $job.target) ('.frame-builder-update-'+$job.id))){throw 'Wrong stage path'}
  if([IO.Path]::GetExtension($job.target) -ine '.exe'){throw 'Target must be an executable'}
  if($job.version -notmatch '^\d+\.\d+\.\d+$' -or $job.sha256 -notmatch '^[a-f0-9]{64}$' -or $job.oldSha256 -notmatch '^[a-f0-9]{64}$'){throw 'Invalid version or digest'}
  if(-not (HashOK $job.payload $job.sha256)){throw 'Downloaded update digest mismatch'}
  Assert-PE $job.payload
  $v=(Get-Item -LiteralPath $job.payload).VersionInfo
  if($v.ProductName -cne 'Frame Builder' -or $v.ProductVersion -notmatch ('^'+[regex]::Escape($job.version)+'(?:\.0)?$')){throw 'Wrong update product or version'}
  if(-not (HashOK $job.target $job.oldSha256)){throw 'Installed executable changed since confirmation'}
  if(Test-Path -LiteralPath $job.stage){throw 'Update staging folder already exists'}
  New-Item -ItemType Directory -Path $job.stage | Out-Null
  $next=Join-Path $job.stage 'next.exe'; $previous=Join-Path $job.stage 'previous.exe'
  Copy-Item -LiteralPath $job.payload -Destination $next
  if(-not (HashOK $next $job.sha256)){throw 'Target-volume staged digest mismatch'}
  $health=Join-Path $job.storage ('health-'+$job.id+'.txt')
  if(Test-Path -LiteralPath $health){throw 'Health receipt already exists'}
  Log 'Payload identity, digest and target-volume staging verified'
  Write-Json (Join-Path $job.storage ('ready-'+$job.id+'.json')) @{id=$job.id;helperPid=$PID}
  for($i=0;$i -lt 120;$i++){
    if(Test-Path -LiteralPath (Join-Path $job.storage ('abort-'+$job.id))){throw 'Update preparation cancelled'}
    if(-not (Get-Process -Id $job.parentPid -ErrorAction SilentlyContinue)){$parentExited=$true;break}
    Start-Sleep -Seconds 1
  }
  if(-not $parentExited){throw 'Previous app has not closed'}
  Wait-Unlocked $job.target
  if(-not (HashOK $job.target $job.oldSha256)){throw 'Installed executable changed before replacement'}
  try {
    [IO.File]::Replace($next,$job.target,$previous,$true)
    $swapped=$true
  } catch [PlatformNotSupportedException] {
    Move-Item -LiteralPath $job.target -Destination $previous
    $swapped=$true
    Move-Item -LiteralPath $next -Destination $job.target
  } catch [NotSupportedException] {
    Move-Item -LiteralPath $job.target -Destination $previous
    $swapped=$true
    Move-Item -LiteralPath $next -Destination $job.target
  }
  $env:FRAME_BUILDER_HEALTH_FILE=$health
  $env:FRAME_BUILDER_HEALTH_TOKEN=$job.healthToken
  $child=Start-Process -FilePath $job.target -PassThru
  $healthy=$false
  for($i=0;$i -lt 120;$i++){
    Track-Children
    Start-Sleep -Seconds 1
    if(-not (Test-Path -LiteralPath $health -PathType Leaf)){continue}
    $newExited=$false
    try {
      $receipt=Get-Content -LiteralPath $health -Encoding UTF8 -Raw | ConvertFrom-Json
      if($receipt.token -ceq $job.healthToken -and $receipt.version -ceq $job.version -and
         $receipt.windowVisible -eq $true -and $receipt.rendererReady -eq $true){
        $live=Get-Process -Id $receipt.pid -ErrorAction SilentlyContinue
        if($live -and $live.MainWindowHandle -ne 0){
          Start-Sleep -Seconds 3
          $live=Get-Process -Id $receipt.pid -ErrorAction SilentlyContinue
          if($live -and $live.MainWindowHandle -ne 0){$healthy=$true;break}
          if(-not $live){$newExited=$true}
        }
        if(-not $live){$newExited=$true}
      }
    } catch { }
    if($newExited){throw 'New application exited before health confirmation'}
  }
  if(-not $healthy){throw 'New app did not confirm a responsive visible window'}
  Result 'success' 'The new version opened successfully.'
  Log 'Responsive visible window confirmed; cleanup deferred until helper exit'
  exit 0
} catch {
  $failure=[string]$_
  if($null -eq $job){Write-Error $failure;exit 1}
  Log ('Install failed: '+$failure)
  Remove-Item Env:FRAME_BUILDER_HEALTH_FILE -ErrorAction SilentlyContinue
  Remove-Item Env:FRAME_BUILDER_HEALTH_TOKEN -ErrorAction SilentlyContinue
  if($swapped){
    Stop-NewProcesses
    try {
      if(Test-Path -LiteralPath $job.target){Wait-Unlocked $job.target}
      if(-not (HashOK $previous $job.oldSha256)){throw 'Rollback backup unavailable'}
      if(Test-Path -LiteralPath $job.target){Remove-Item -LiteralPath $job.target -Force}
      Move-Item -LiteralPath $previous -Destination $job.target
      Start-Process -FilePath $job.target | Out-Null
      Result 'rolled-back' ('Update failed; the previous version was restored. '+$failure)
      Log 'Previous executable restored and restarted'
    } catch {
      Result 'recovery-required' ('Manual recovery required: '+[string]$_)
      Log ('Automatic rollback failed: '+[string]$_)
    }
  } else {
    Result 'failed' $failure
    if($parentExited -and (HashOK $job.target $job.oldSha256)){
      Start-Process -FilePath $job.target | Out-Null
    }
  }
  exit 1
}
