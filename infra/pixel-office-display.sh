#!/bin/bash
# pixel-office-display.sh
# Monitors Pixel Office server on Windows PC and switches the wall display.
# When active agents are detected, starts X + Chrome in kiosk mode.
# When agents disappear, stops X and returns to the Linux console.
#
# Requirements: xorg, xinit, google-chrome-stable, unclutter, curl
# sudo apt install xorg xinit unclutter curl
# google-chrome-stable installed via .deb (NOT snap)

# --- Configuration ---
PIXEL_OFFICE_HOST="${PIXEL_OFFICE_HOST:-localhost}"
PIXEL_OFFICE_URL="http://${PIXEL_OFFICE_HOST}:3300?kiosk"
STATUS_URL="http://${PIXEL_OFFICE_HOST}:3300/api/status"
CHECK_INTERVAL=10  # seconds

# --- State ---
XINIT_PID=""
IS_SHOWING=false
LAST_SERVER_PID=""

log() {
    echo "[$(date '+%H:%M:%S')] $1"
}

start_kiosk() {
    if [ "$IS_SHOWING" = true ]; then return; fi
    log "Starting X + Chrome kiosk..."

    # Write xinitrc script
    XINITRC="/tmp/pixel-office-xinitrc"
    rm -f "$XINITRC"
    printf '#!/bin/bash\n' > "$XINITRC"
    printf 'unclutter -idle 1 -root &\n' >> "$XINITRC"
    printf 'xset s off\nxset -dpms\nxset s noblank\n' >> "$XINITRC"
    # dbus-run-session provides a session bus so Chrome D-Bus calls don't block.
    # No --disable-gpu: hardware acceleration via AMD GPU is more stable than software rendering.
    # No --disable-software-rasterizer: keep as fallback if GPU init fails.
    printf 'dbus-run-session -- google-chrome-stable --kiosk --noerrdialogs --disable-translate --disable-infobars --disable-session-crashed-bubble --disable-features=TranslateUI --no-first-run --start-fullscreen --start-maximized --window-size=1920,1200 --window-position=0,0 --autoplay-policy=no-user-gesture-required --no-sandbox --disable-dev-shm-usage --disable-extensions --disable-background-networking --disable-sync --disable-default-apps --disable-component-update --js-flags="--max-old-space-size=384" "%s"\n' "$PIXEL_OFFICE_URL" >> "$XINITRC"
    chmod +x "$XINITRC"

    # Start X on vt1
    xinit "$XINITRC" -- :0 vt1 2>/tmp/pixel-office-xinit.log &
    XINIT_PID=$!
    IS_SHOWING=true
    log "X + Chrome started (PID: $XINIT_PID)"
}

stop_kiosk() {
    if [ "$IS_SHOWING" = false ]; then return; fi
    log "Stopping X + Chrome kiosk..."

    # Kill the xinit process tree
    if [ -n "$XINIT_PID" ]; then
        kill "$XINIT_PID" 2>/dev/null
        wait "$XINIT_PID" 2>/dev/null
    fi
    # Cleanup any orphans
    pkill -f "chrome.*kiosk" 2>/dev/null
    pkill -f "google-chrome" 2>/dev/null
    pkill -f "unclutter" 2>/dev/null
    pkill Xorg 2>/dev/null

    XINIT_PID=""
    IS_SHOWING=false
    log "X stopped, back to console"
}

check_server() {
    local response
    response=$(curl -s --connect-timeout 3 --max-time 5 "$STATUS_URL" 2>/dev/null)
    if [ $? -ne 0 ]; then return 1; fi

    # Count CLI agents (non-SDK). SDK agents are persistent background services
    # and shouldn't control the display. Any CLI agent = someone is working.
    # SDK agents have "sdk":true in the response.
    local cli_agents
    cli_agents=$(echo "$response" | grep -o '"sdk":false' | wc -l)
    if [ "$cli_agents" -eq 0 ]; then return 1; fi

    return 0
}

# Detect if the pixel-office-server process restarted (PID changed)
# If so, Chrome's WebSocket is dead — force a page reload via the API
check_server_restart() {
    if [ "$IS_SHOWING" = false ]; then return; fi
    local current_pid
    current_pid=$(pgrep -f "node.*standalone-server" 2>/dev/null | head -1)
    if [ -z "$current_pid" ]; then return; fi

    if [ -n "$LAST_SERVER_PID" ] && [ "$current_pid" != "$LAST_SERVER_PID" ]; then
        log "Server restarted (PID $LAST_SERVER_PID -> $current_pid), refreshing Chrome..."
        sleep 3  # wait for server to be fully ready
        # Send F5 to Chrome via xdotool (WebSocket is dead, can't use /api/reload)
        DISPLAY=:0 xdotool key F5 2>/dev/null || {
            # Fallback: kill Chrome, start_kiosk will relaunch it
            pkill -f "chrome.*kiosk" 2>/dev/null
            IS_SHOWING=false
        }
    fi
    LAST_SERVER_PID="$current_pid"
}

# Detect Chrome renderer in "D" (uninterruptible sleep) state — frozen/hung
# Also checks cgroup memory and server responsiveness
# This happens after hours of running; the only recovery is to kill and relaunch
check_chrome_health() {
    if [ "$IS_SHOWING" = false ]; then return; fi

    local needs_restart=false
    local reason=""

    # 1. Check if any Chrome process is in D (uninterruptible sleep) state
    #    ps output: "PID STAT COMM" -> "1808528 D<l chrome" -> D comes before chrome
    local chrome_d_state
    chrome_d_state=$(ps -eo pid,stat,comm | grep chrome | grep -E "^[[:space:]]*[0-9]+ D" | head -1)
    if [ -n "$chrome_d_state" ]; then
        reason="Chrome frozen (D state): $chrome_d_state"
        needs_restart=true
    fi

    # 2. Check cgroup memory usage — restart before hitting MemoryMax (4GB)
    #    Threshold at 3.5GB gives Chrome room to breathe (~1.8-2GB typical usage)
    if [ "$needs_restart" = false ]; then
        local cgroup_path="/sys/fs/cgroup/system.slice/pixel-office-display.service"
        if [ -f "$cgroup_path/memory.current" ]; then
            local mem_bytes
            mem_bytes=$(cat "$cgroup_path/memory.current" 2>/dev/null)
            local threshold=$((3500 * 1024 * 1024))  # 3.5GB
            if [ -n "$mem_bytes" ] && [ "$mem_bytes" -gt "$threshold" ] 2>/dev/null; then
                local mem_mb=$((mem_bytes / 1024 / 1024))
                reason="Memory too high: ${mem_mb}MB (threshold: 3500MB)"
                needs_restart=true
            fi
        fi
    fi

    # 3. HTTP health check — if the server itself is unresponsive
    if [ "$needs_restart" = false ]; then
        local http_ok
        http_ok=$(curl -s --connect-timeout 2 --max-time 5 -o /dev/null -w "%{http_code}" "http://localhost:3300/api/status" 2>/dev/null)
        if [ "$http_ok" != "200" ]; then
            reason="Server not responding (HTTP: $http_ok)"
            needs_restart=true
        fi
    fi

    if [ "$needs_restart" = true ]; then
        log "Health check failed: $reason"
        log "Restarting kiosk to recover..."
        stop_kiosk
        sleep 3
        start_kiosk
    fi
}

cleanup() {
    log "Shutting down..."
    stop_kiosk
    exit 0
}

trap cleanup SIGINT SIGTERM

# --- Main loop ---
log "Pixel Office display monitor started"
log "Watching: $STATUS_URL"

while true; do
    if check_server; then
        if [ "$IS_SHOWING" = false ]; then
            log "Active agents detected!"
        fi
        start_kiosk
        check_server_restart
        check_chrome_health
    else
        if [ "$IS_SHOWING" = true ]; then
            # Grace period: check again before stopping
            sleep 60
            if ! check_server; then
                log "Server/agents gone, switching back..."
                stop_kiosk
            fi
        fi
    fi

    sleep "$CHECK_INTERVAL"
done
