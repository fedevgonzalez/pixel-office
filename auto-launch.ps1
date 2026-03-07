# Auto-launch Pixel Office reporter when Claude Code is running.
# Connects to the central Pixel Office server on the homeserver.
# Run this at Windows startup (Task Scheduler or shortcut in shell:startup).
# Usage: powershell -WindowStyle Hidden -File auto-launch.ps1

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$reporterScript = Join-Path $scriptDir "pixel-office-reporter.js"
$serverScript = Join-Path $scriptDir "standalone-server.js"
$checkInterval = 5  # seconds
$mutexName = "Global\PixelOfficeAutoLaunch"

# Central server URL (homeserver)
$serverUrl = if ($env:PIXEL_OFFICE_SERVER) { $env:PIXEL_OFFICE_SERVER } else { "ws://192.168.68.100:3300/ws/report" }

# Prevent duplicate instances
$mutex = New-Object System.Threading.Mutex($false, $mutexName)
if (-not $mutex.WaitOne(0)) {
    Write-Host "Another auto-launch instance is already running. Exiting."
    exit 0
}

$reporterProcess = $null
$serverProcess = $null
$wasRunning = $false

Write-Host "Pixel Office auto-launcher started. Watching for Claude Code..."
Write-Host "Reporter target: $serverUrl"

try {
    while ($true) {
        # Check if any claude process is running (claude.exe CLI)
        $claudeRunning = Get-Process -Name "claude" -ErrorAction SilentlyContinue

        if ($claudeRunning -and -not $wasRunning) {
            # Claude Code just started - launch reporter + local server
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Claude Code detected, starting Pixel Office..."
            $reporterProcess = Start-Process -FilePath "node" -ArgumentList "$reporterScript", $serverUrl -WorkingDirectory $scriptDir -PassThru -WindowStyle Hidden
            $serverProcess = Start-Process -FilePath "node" -ArgumentList $serverScript -WorkingDirectory $scriptDir -PassThru -WindowStyle Hidden
            $wasRunning = $true
        }
        elseif ($claudeRunning -and $wasRunning) {
            # Respawn reporter if it died
            if ($reporterProcess -and $reporterProcess.HasExited) {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Reporter exited, respawning..."
                Start-Sleep -Seconds 1
                $reporterProcess = Start-Process -FilePath "node" -ArgumentList "$reporterScript", $serverUrl -WorkingDirectory $scriptDir -PassThru -WindowStyle Hidden
            }
            # Respawn local server if it died
            if ($serverProcess -and $serverProcess.HasExited) {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Local server exited, respawning..."
                Start-Sleep -Seconds 1
                $serverProcess = Start-Process -FilePath "node" -ArgumentList $serverScript -WorkingDirectory $scriptDir -PassThru -WindowStyle Hidden
            }
        }
        elseif (-not $claudeRunning -and $wasRunning) {
            # Claude Code stopped - kill after a grace period
            Start-Sleep -Seconds 10
            $claudeRunning = Get-Process -Name "claude" -ErrorAction SilentlyContinue
            if (-not $claudeRunning) {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Claude Code stopped, shutting down..."
                if ($reporterProcess -and -not $reporterProcess.HasExited) {
                    Stop-Process -Id $reporterProcess.Id -Force -ErrorAction SilentlyContinue
                }
                if ($serverProcess -and -not $serverProcess.HasExited) {
                    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
                }
                # Kill orphaned node processes
                Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
                    try { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -like "*pixel-office*" } catch { $false }
                } | Stop-Process -Force -ErrorAction SilentlyContinue
                $reporterProcess = $null
                $serverProcess = $null
                $wasRunning = $false
            }
        }

        Start-Sleep -Seconds $checkInterval
    }
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
