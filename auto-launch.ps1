# Pixel Office Auto-Launch
# Watches for Claude Code and reports sessions to the central server.
# First run: installs dependencies and creates a Startup shortcut.
# Usage: powershell -ExecutionPolicy Bypass -File auto-launch.ps1

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$reporterScript = Join-Path $scriptDir "pixel-office-reporter.js"
$checkInterval = 5  # seconds
$mutexName = "Global\PixelOfficeAutoLaunch"
$serverUrl = if ($env:PIXEL_OFFICE_SERVER) { $env:PIXEL_OFFICE_SERVER } else { "ws://pixel.lab:3300/ws/report" }

# --- First-run setup ---
$startupDir = [System.IO.Path]::Combine($env:APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
$shortcutPath = Join-Path $startupDir 'PixelOffice.lnk'

if (-not (Test-Path $shortcutPath)) {
    Write-Host "First run - setting up Pixel Office..."

    # Install ws globally (needed for Node < 22)
    $nodeVersion = (node --version 2>$null) -replace 'v','' -split '\.' | Select-Object -First 1
    if ([int]$nodeVersion -lt 22) {
        Write-Host "Installing ws package globally..."
        npm install -g ws 2>$null
    }

    # Create Startup shortcut
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = 'powershell.exe'
    $shortcut.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptDir\auto-launch.ps1`""
    $shortcut.WorkingDirectory = $scriptDir
    $shortcut.WindowStyle = 7
    $shortcut.Save()

    Write-Host "Startup shortcut created. Reporter will auto-start on boot."
    Write-Host ""
}

# --- Prevent duplicate instances ---
$mutex = New-Object System.Threading.Mutex($false, $mutexName)
if (-not $mutex.WaitOne(0)) {
    Write-Host "Already running. Exiting."
    exit 0
}

$reporterProcess = $null
$wasRunning = $false

Write-Host "Pixel Office auto-launcher started. Watching for Claude Code..."
Write-Host "Server: $serverUrl"

try {
    while ($true) {
        $claudeRunning = Get-Process -Name "claude" -ErrorAction SilentlyContinue

        if ($claudeRunning -and -not $wasRunning) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Claude Code detected, starting reporter..."
            $reporterProcess = Start-Process -FilePath "node" -ArgumentList "$reporterScript", $serverUrl -WorkingDirectory $scriptDir -PassThru -WindowStyle Hidden
            $wasRunning = $true
        }
        elseif ($claudeRunning -and $wasRunning) {
            if ($reporterProcess -and $reporterProcess.HasExited) {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Reporter exited, respawning..."
                Start-Sleep -Seconds 1
                $reporterProcess = Start-Process -FilePath "node" -ArgumentList "$reporterScript", $serverUrl -WorkingDirectory $scriptDir -PassThru -WindowStyle Hidden
            }
        }
        elseif (-not $claudeRunning -and $wasRunning) {
            Start-Sleep -Seconds 10
            $claudeRunning = Get-Process -Name "claude" -ErrorAction SilentlyContinue
            if (-not $claudeRunning) {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Claude Code stopped, shutting down reporter..."
                if ($reporterProcess -and -not $reporterProcess.HasExited) {
                    Stop-Process -Id $reporterProcess.Id -Force -ErrorAction SilentlyContinue
                }
                $nodeProcs = Get-Process -Name 'node' -ErrorAction SilentlyContinue
                foreach ($proc in $nodeProcs) {
                    try {
                        $cmdLine = (Get-CimInstance Win32_Process -Filter ('ProcessId=' + $proc.Id)).CommandLine
                        if ($cmdLine -like '*pixel-office-reporter*') {
                            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                        }
                    } catch {}
                }
                $reporterProcess = $null
                $wasRunning = $false
            }
        }

        Start-Sleep -Seconds $checkInterval
    }
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
