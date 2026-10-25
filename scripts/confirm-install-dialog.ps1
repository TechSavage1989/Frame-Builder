param([Parameter(Mandatory=$true)][int]$ProcessIdValue)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class FrameNativeConfirm {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc f, IntPtr p);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder s,int n);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
  static uint Pid(IntPtr h){uint p;GetWindowThreadProcessId(h,out p);return p;}
  static string Text(IntPtr h){var s=new StringBuilder(2048);GetWindowText(h,s,2048);return s.ToString();}
  static string Class(IntPtr h){var s=new StringBuilder(256);GetClassName(h,s,256);return s.ToString();}
  static bool Ours(IntPtr h,int pid){return IsWindowVisible(h)&&(Pid(h)==pid||Pid(GetWindow(h,4))==pid);}
  public static bool Click(int pid){
    bool clicked=false;
    EnumWindows((h,p)=>{
      if(Ours(h,pid)) EnumChildWindows(h,(b,q)=>{
        string name=Text(b).Replace("&","").Trim();
        if(Class(b)=="Button"&&IsWindowEnabled(b)&&name.IndexOf("Install",StringComparison.OrdinalIgnoreCase)>=0&&name.IndexOf("restart",StringComparison.OrdinalIgnoreCase)>=0){
          clicked=PostMessage(b,0x00F5,IntPtr.Zero,IntPtr.Zero);return false;
        }
        return true;
      },IntPtr.Zero);
      return !clicked;
    },IntPtr.Zero);
    return clicked;
  }
  public static IntPtr[] Modals(int pid){
    var result=new List<IntPtr>();
    EnumWindows((h,p)=>{if(Ours(h,pid)&&(GetWindow(h,4)!=IntPtr.Zero||Class(h)=="#32770"))result.Add(h);return true;},IntPtr.Zero);
    return result.ToArray();
  }
  public static string Snapshot(int pid){
    var result=new StringBuilder();
    EnumWindows((h,p)=>{
      if(Ours(h,pid)){
        result.AppendLine("WINDOW "+h+" owner="+GetWindow(h,4)+" class="+Class(h)+" text="+Text(h));
        EnumChildWindows(h,(b,q)=>{if(Class(b)=="Button"||Text(b).Length>0)result.AppendLine(" CHILD "+b+" class="+Class(b)+" text="+Text(b));return true;},IntPtr.Zero);
      }return true;
    },IntPtr.Zero);return result.ToString();
  }
}
'@
for($attempt=0;$attempt -lt 80;$attempt++){
  if([FrameNativeConfirm]::Click($ProcessIdValue)){Write-Host 'Native confirmation queued through its own button';exit 0}
  if($attempt -eq 0){Write-Host ([FrameNativeConfirm]::Snapshot($ProcessIdValue))}
  # Avoid traversing Chromium's complete accessibility tree.
  $modals=[FrameNativeConfirm]::Modals($ProcessIdValue)
  if($modals.Count){
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    $condition=[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)
    foreach($h in $modals){
      try {
        $w=[System.Windows.Automation.AutomationElement]::FromHandle($h)
        foreach($b in $w.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition)){
          $name=([string]$b.Current.Name).Replace('&','').Trim()
          if($b.Current.IsEnabled -and $name -like '*Install*restart*'){
            $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
            Write-Host 'Native modal confirmation invoked'
            exit 0
          }
        }
      } catch { }
    }
  }
  Start-Sleep -Milliseconds 200
}
Write-Host ([FrameNativeConfirm]::Snapshot($ProcessIdValue))
throw 'Native confirmation was not found in app-owned windows'
