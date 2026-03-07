# Pixel Office — Standalone Web Mode

Run the pixel art office visualization in your browser, independent of VS Code.

## Requirements

- Node.js 18+
- The extension must be built first (`npm run build` from the project root)
- Claude Code CLI sessions running on the same machine (or connected via reporter)

## Quick Start (Single PC)

```bash
npm run build          # Build extension + webview
node standalone-server.js
```

Open `http://localhost:3300` in your browser.

## Multi-PC Setup (Central Server + Reporters)

For displaying agents from multiple PCs on a single screen (e.g., wall display):

### Central Server (homeserver or any always-on machine)

```bash
# Copy standalone-server.js, package.json, and dist/ to the server
npm install ws pngjs
node standalone-server.js
```

The server listens on `0.0.0.0:3300` and accepts both browser clients and reporter connections.

### Reporter (each PC with Claude Code)

```bash
npm install ws
node pixel-office-reporter.js ws://<server-ip>:3300/ws/report
```

The reporter:
1. Queries the local standalone server (`localhost:3300`) to know which sessions are active
2. Reads the JSONL files locally (native file watching — fast and reliable)
3. Sends updates via WebSocket to the central server
4. Auto-reconnects if the connection drops

**Note:** The reporter requires the local standalone server to be running (it uses its `/api/status` to determine active sessions).

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PIXEL_OFFICE_SERVER` | `ws://192.168.68.100:3300/ws/report` | Central server WebSocket URL |
| `PIXEL_OFFICE_MACHINE_ID` | `hostname` | Machine identifier (shown in logs) |
| `PIXEL_OFFICE_LOCAL` | `http://localhost:3300` | Local standalone server URL |

### Auto-Launch (Windows)

`auto-launch.ps1` watches for `claude.exe` and automatically starts/stops both the local server and the reporter:

```powershell
# Add to Task Scheduler or shell:startup
powershell -WindowStyle Hidden -File auto-launch.ps1
```

### Kiosk Mode

Append `?kiosk` to the URL for wall display mode:
- Hides all controls (editor, toolbar, zoom)
- Always shows agent labels (no hover needed)
- Auto-zooms to frame active agents
- Throttled rendering (15fps) for lower resource usage

## How It Works

The standalone server:

1. **Scans** `~/.claude/projects/` for all JSONL transcript files modified recently
2. **Replays** each file to determine if the session is still active
3. **Creates agents** only for active sessions — finished sessions are discarded
4. **Watches** for new JSONL data in real-time (hybrid `fs.watch` + polling)
5. **Rescans** every 5 seconds to pick up newly started sessions
6. **Accepts remote reporters** via `/ws/report` WebSocket endpoint
7. **Serves** the webview UI and communicates via WebSocket

## Features

- Auto-detects all active Claude Code agents across all projects
- Shows real-time tool activity (Reading, Editing, Running, etc.)
- Sub-agent detection (Task tools spawn sub-agent characters)
- Permission and waiting status bubbles
- Multi-PC support via WebSocket reporters
- Layout editor works the same as in VS Code
- Cross-tab layout sync via WebSocket

## Configuration

Edit constants at the top of `standalone-server.js`:

```js
const PORT = 3300;                          // HTTP/WebSocket port
const SCAN_INTERVAL_MS = 5000;              // How often to scan for new sessions
const AUTO_DETECT_MAX_AGE_MS = 30 * 60 * 1000; // Max JSONL age to consider (30 min)
```

## Troubleshooting

**No agents appear**: Make sure Claude Code sessions are running and their JSONL files exist under `~/.claude/projects/`. Check the server console for scan output.

**Reporter doesn't find sessions**: The reporter queries the local standalone server. Make sure it's running on `localhost:3300`.

**Port already in use**: Another instance is running. Kill it or change `PORT` in the script.

**"Loading..." stays forever**: The WebSocket connection failed. Check that the server is running and no firewall is blocking the port.
