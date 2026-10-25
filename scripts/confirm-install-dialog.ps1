param([Parameter(Mandatory=$true)][int]$ProcessIdValue)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FrameInstallWindows {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
}
'@
$buttonCondition=[System.Windows.Automation.PropertyCondition]::new(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Button)
$diagnostics=@()
for($attempt=0;$attempt -lt 100;$attempt++){
  $handles=New-Object 'System.Collections.Generic.List[System.IntPtr]'
  $callback=[FrameInstallWindows+EnumProc]{
    param([IntPtr]$handle,[IntPtr]$unused)
    [uint32]$windowPid=0
    [void][FrameInstallWindows]::GetWindowThreadProcessId($handle,[ref]$windowPid)
    $owner=[FrameInstallWindows]::GetWindow($handle,4)
    [uint32]$ownerPid=0
    if($owner -ne [IntPtr]::Zero){[void][FrameInstallWindows]::GetWindowThreadProcessId($owner,[ref]$ownerPid)}
    if(($windowPid -eq $ProcessIdValue -or $ownerPid -eq $ProcessIdValue) -and [FrameInstallWindows]::IsWindowVisible($handle)){
      $handles.Add($handle)
    }
    return $true
  }
  [void][FrameInstallWindows]::EnumWindows($callback,[IntPtr]::Zero)
  $diagnostics=@()
  foreach($handle in $handles){
    try {
      $window=[System.Windows.Automation.AutomationElement]::FromHandle($handle)
      $owner=[FrameInstallWindows]::GetWindow($handle,4)
      $modal=$window.GetCurrentPropertyValue([System.Windows.Automation.WindowPattern]::IsModalProperty)
      $buttons=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,$buttonCondition)
      $names=@()
      foreach($button in $buttons){
        $name=([string]$button.Current.Name).Replace('&','').Trim()
        $names+=$name
        # Restrict invocation to the owned/modal native window, excluding the
        # web page's identically named Install button behind the modal.
        $nativeWindow=$owner -ne [IntPtr]::Zero -or $modal -eq $true -or $window.Current.ClassName -eq '#32770'
        if($nativeWindow -and $button.Current.IsEnabled -and $name -like '*Install*restart*'){
          $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
          Write-Host 'Native install confirmation invoked'
          exit 0
        }
      }
      $diagnostics+=@{window=$window.Current.Name;class=$window.Current.ClassName;owner=[string]$owner;modal=$modal;buttons=$names}
    } catch { }
  }
  Start-Sleep -Milliseconds 200
}
Write-Host ($diagnostics|ConvertTo-Json -Depth 5)
throw 'Native installation confirmation was not found in the app-owned modal'
