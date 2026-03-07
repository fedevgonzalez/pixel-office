# Auto-launch Pixel Agents standalone server when Claude Code is running.
# Run this at Windows startup (Task Scheduler or shortcut in shell:startup).
# Usage: powershell -WindowStyle Hidden -File auto-launch.ps1

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverScript = Join-Path $scriptDir "standalone-server.js"
$checkInterval = 5  # seconds

$serverProcess = $null
$wasRunning = $false

Write-Host "Pixel Agents auto-launcher started. Watching for Claude Code..."

while ($true) {
    # Check if any claude process is running (claude.exe CLI)
    $claudeRunning = Get-Process -Name "claude" -ErrorAction SilentlyContinue

    if ($claudeRunning -and -not $wasRunning) {
        # Claude Code just started - launch the server
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Claude Code detected, starting Pixel Agents server..."
        $serverProcess = Start-Process -FilePath "node" -ArgumentList $serverScript -WorkingDirectory $scriptDir -PassThru -WindowStyle Hidden
        $wasRunning = $true
    }
    elseif ($claudeRunning -and $wasRunning -and $serverProcess -and $serverProcess.HasExited) {
        # Server died but Claude is still running - respawn it
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Server exited (code $($serverProcess.ExitCode)), respawning..."
        Start-Sleep -Seconds 1
        $serverProcess = Start-Process -FilePath "node" -ArgumentList $serverScript -WorkingDirectory $scriptDir -PassThru -WindowStyle Hidden
    }
    elseif (-not $claudeRunning -and $wasRunning) {
        # Claude Code stopped - kill the server after a grace period
        Start-Sleep -Seconds 10
        # Re-check in case it was a brief restart
        $claudeRunning = Get-Process -Name "claude" -ErrorAction SilentlyContinue
        if (-not $claudeRunning) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Claude Code stopped, shutting down Pixel Agents server..."
            if ($serverProcess -and -not $serverProcess.HasExited) {
                Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
            }
            # Also kill any orphaned node processes running the server
            Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
                try { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -like "*standalone-server*" } catch { $false }
            } | Stop-Process -Force -ErrorAction SilentlyContinue
            $serverProcess = $null
            $wasRunning = $false
        }
    }

    Start-Sleep -Seconds $checkInterval
}
