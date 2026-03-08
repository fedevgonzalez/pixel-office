#!/bin/bash
# pixel-office-display.sh
# Monitors Pixel Office server on Windows PC and switches the wall display.
# When active agents are detected, starts X + Chrome in kiosk mode.
# When agents disappear, stops X and returns to the Linux console.
#
# Self-healing: covers every failure mode so manual intervention is never needed.
#
# Requirements: xorg, xinit, google-chrome-stable, unclutter, curl, xdotool
# sudo apt install xorg xinit unclutter curl xdotool

# --- Configuration ---
PIXEL_OFFICE_HOST="${PIXEL_OFFICE_HOST:-localhost}"
PIXEL_OFFICE_URL="http://${PIXEL_OFFICE_HOST}:3300?kiosk&homeserver=true"
STATUS_URL="http://${PIXEL_OFFICE_HOST}:3300/api/status"
HEALTH_URL="http://${PIXEL_OFFICE_HOST}:3300/api/client-health"
CHECK_INTERVAL=10          # seconds between main loop iterations
CHROME_STARTUP_GRACE=30    # seconds to wait for Chrome to connect WS after launch
GRACE_BEFORE_STOP=60       # seconds to wait before stopping kiosk when agents disappear

# --- State ---
XINIT_PID=""
IS_SHOWING=false
LAST_SERVER_PID=""
CHROME_STARTED_AT=0        # epoch when Chrome was last launched

log() {
    echo "[$(date '+%H:%M:%S')] $1"
}

start_kiosk() {
    if [ "$IS_SHOWING" = true ]; then return; fi
    log "Starting X + Chrome kiosk..."

    # Clean stale processes before starting (in case of previous dirty shutdown)
    pkill -f "chrome.*kiosk" 2>/dev/null
    pkill -f "google-chrome" 2>/dev/null
    pkill -f "unclutter" 2>/dev/null
    pkill Xorg 2>/dev/null
    sleep 1

    # Write xinitrc script
    XINITRC="/tmp/pixel-office-xinitrc"
    rm -f "$XINITRC"
    cat > "$XINITRC" <<'XEOF'
#!/bin/bash
unclutter -idle 1 -root &
xset s off
xset -dpms
xset s noblank
XEOF
    # dbus-run-session provides a session bus so Chrome D-Bus calls don't block.
    # GPU acceleration enabled — more stable than software rendering on AMD.
    printf 'dbus-run-session -- google-chrome-stable --kiosk --noerrdialogs --disable-translate --disable-infobars --disable-session-crashed-bubble --disable-features=TranslateUI --no-first-run --start-fullscreen --start-maximized --window-size=1920,1200 --window-position=0,0 --autoplay-policy=no-user-gesture-required --no-sandbox --disable-dev-shm-usage --disable-extensions --disable-background-networking --disable-sync --disable-default-apps --disable-component-update --js-flags="--max-old-space-size=384" "%s"\n' "$PIXEL_OFFICE_URL" >> "$XINITRC"
    chmod +x "$XINITRC"

    # Start X on vt1
    xinit "$XINITRC" -- :0 vt1 2>/tmp/pixel-office-xinit.log &
    XINIT_PID=$!
    IS_SHOWING=true
    CHROME_STARTED_AT=$(date +%s)
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
    CHROME_STARTED_AT=0
    log "X stopped, back to console"
}

# Full restart: stop + wait + start
restart_kiosk() {
    local reason="$1"
    log "Restarting kiosk: $reason"
    stop_kiosk
    sleep 3
    start_kiosk
}

check_server() {
    local response
    response=$(curl -s --connect-timeout 3 --max-time 5 "$STATUS_URL" 2>/dev/null)
    if [ $? -ne 0 ]; then return 1; fi

    # Count CLI agents (non-SDK). SDK agents are persistent background services
    # and shouldn't control the display. Any CLI agent = someone is working.
    local cli_agents
    cli_agents=$(echo "$response" | grep -o '"sdk":false' | wc -l)
    if [ "$cli_agents" -eq 0 ]; then return 1; fi

    return 0
}

# Check if xinit/Chrome/X processes are actually alive.
# Fixes: IS_SHOWING=true but processes died silently.
check_processes_alive() {
    if [ "$IS_SHOWING" = false ]; then return 0; fi

    # Skip during startup — processes need a few seconds to spawn
    local now
    now=$(date +%s)
    local age=$((now - CHROME_STARTED_AT))
    if [ "$age" -lt 10 ]; then return 0; fi

    # Check if xinit PID is still running
    if [ -n "$XINIT_PID" ] && ! kill -0 "$XINIT_PID" 2>/dev/null; then
        log "xinit process $XINIT_PID died unexpectedly"
        # Reset state — processes are gone
        XINIT_PID=""
        IS_SHOWING=false
        CHROME_STARTED_AT=0
        return 1
    fi

    # Check if any Chrome process exists
    if ! pgrep -f "google-chrome" >/dev/null 2>&1; then
        log "Chrome process disappeared"
        stop_kiosk
        return 1
    fi

    # Check if X is running
    if ! pgrep Xorg >/dev/null 2>&1; then
        log "Xorg process disappeared"
        stop_kiosk
        return 1
    fi

    return 0
}

# Detect if the pixel-office-server process restarted (PID changed).
# On restart: Chrome's WS is dead. Full restart is more reliable than F5.
check_server_restart() {
    if [ "$IS_SHOWING" = false ]; then return; fi
    local current_pid
    current_pid=$(pgrep -f "node.*standalone-server" 2>/dev/null | head -1)
    if [ -z "$current_pid" ]; then return; fi

    if [ -n "$LAST_SERVER_PID" ] && [ "$current_pid" != "$LAST_SERVER_PID" ]; then
        restart_kiosk "Server restarted (PID $LAST_SERVER_PID -> $current_pid)"
    fi
    LAST_SERVER_PID="$current_pid"
}

# Comprehensive Chrome health check — covers all freeze/disconnect scenarios.
check_chrome_health() {
    if [ "$IS_SHOWING" = false ]; then return; fi

    # Skip health checks during startup grace period — Chrome needs time to load
    local now
    now=$(date +%s)
    local age=$((now - CHROME_STARTED_AT))
    if [ "$age" -lt "$CHROME_STARTUP_GRACE" ]; then
        return
    fi

    local needs_restart=false
    local reason=""

    # 1. WebSocket ping/pong — most reliable freeze detection.
    #    Server pings browser clients every 15s; /api/client-health reports
    #    whether any client responded in the last 30s. A frozen Chrome can't pong.
    local health_response
    health_response=$(curl -s --connect-timeout 2 --max-time 3 "$HEALTH_URL" 2>/dev/null)
    if [ -n "$health_response" ]; then
        local client_ok
        client_ok=$(echo "$health_response" | grep -c '"ok":true')
        if [ "$client_ok" -eq 0 ]; then
            reason="Chrome unresponsive (no WebSocket pong in 30s)"
            needs_restart=true
        fi
    else
        # Can't reach health endpoint — server might be down, don't restart Chrome for this
        :
    fi

    # 2. cgroup memory — restart before hitting MemoryMax (4GB)
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

    if [ "$needs_restart" = true ]; then
        restart_kiosk "$reason"
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
        # Server has active CLI agents

        if [ "$IS_SHOWING" = false ]; then
            log "Active agents detected!"
            start_kiosk
        fi

        # Check if processes died silently — if so, relaunch
        if ! check_processes_alive; then
            log "Processes died, relaunching..."
            start_kiosk
        fi

        # Detect server restart (deploy) — full Chrome restart
        check_server_restart

        # Health checks (WS pong, memory) — skip during startup grace
        check_chrome_health
    else
        # No active CLI agents (or server unreachable)

        if [ "$IS_SHOWING" = true ]; then
            # Still check if Chrome is alive while we wait
            check_processes_alive || true

            # Grace period: re-check before stopping
            sleep "$GRACE_BEFORE_STOP"
            if ! check_server; then
                log "Server/agents gone after grace period, switching back..."
                stop_kiosk
            fi
        fi
    fi

    sleep "$CHECK_INTERVAL"
done
