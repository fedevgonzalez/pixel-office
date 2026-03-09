# Kill any lingering auto-launch processes
Get-Process -Name 'powershell' -ErrorAction SilentlyContinue | Where-Object {
    try { (Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.Id)).CommandLine -like '*auto-launch*' } catch { $false }
} | Stop-Process -Force -ErrorAction SilentlyContinue

# Kill any lingering reporter processes
Get-Process -Name 'node' -ErrorAction SilentlyContinue | Where-Object {
    try { (Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.Id)).CommandLine -like '*pixel-office-reporter*' } catch { $false }
} | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 2

# Re-launch auto-launch
Start-Process -WindowStyle Hidden -FilePath 'powershell.exe' -ArgumentList '-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File','G:\GitHub\pixel-office\auto-launch.ps1'

Write-Host "Auto-launch restarted."
