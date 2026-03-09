# Pixel Office — Standalone Server

Run the pixel art office visualization in your browser.

## Requirements

- Node.js 18+ (Node 22+ recommended for native WebSocket)
- The webview must be built first (`npm run build` from the project root)
- Claude Code CLI sessions running on the same machine (or connected via reporter)

## Quick Start (Single PC)

```bash
npm install && cd webview-ui && npm install && cd ..
npm run build
node standalone-server.js
```

Open `http://localhost:3300` in your browser. Agents appear automatically as you start Claude Code sessions.

For wall displays, use `http://localhost:3300/?kiosk` (auto-framing camera, no UI controls).

---

## Multi-PC Setup

Aggregate agents from multiple machines onto a single display.

```
 ┌──────────┐     WebSocket      ┌──────────────┐     Browser      ┌─────────┐
 │  Dev PC   │ ──────────────▶  │  Central      │ ◀──────────────  │ Display │
 │ reporter  │   /ws/report      │  Server       │   http://:3300   │ (kiosk) │
 └──────────┘                    └──────────────┘                   └─────────┘
 ┌──────────┐     WebSocket      │
 │  Dev PC 2 │ ──────────────▶  │
 │ reporter  │                   │
 └──────────┘                    │
 ┌──────────┐     WebSocket      │
 │ SDK Agent │ ──────────────▶  │
 │ reporter  │                   │
 └──────────┘
```

### Central Server

```bash
# Copy these files to your server:
#   standalone-server.js, dist/ folder
npm install ws pngjs
node standalone-server.js
```

The server listens on `0.0.0.0:3300` and accepts both browser clients and reporter connections.

### Reporter (Claude Code CLI)

Each machine running Claude Code needs a reporter — a lightweight process that watches local JSONL files and streams updates to the central server.

```bash
# Node 22+ (native WebSocket, zero dependencies)
node pixel-office-reporter.js ws://<server-ip>:3300/ws/report

# Node 18-21 (needs ws package)
npm install -g ws
node pixel-office-reporter.js ws://<server-ip>:3300/ws/report
```

The reporter:
1. Scans `~/.claude/projects/` for active JSONL session files
2. Replays recent history so the server knows current state
3. Streams new JSONL lines in real-time via WebSocket
4. Auto-reconnects if the connection drops

Only 1 file needed — no other dependencies.

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `PIXEL_OFFICE_SERVER` | `ws://localhost:3300/ws/report` | Central server WebSocket URL |
| `PIXEL_OFFICE_MACHINE_ID` | system hostname | Label for this machine (shown in server logs) |

### Auto-Launch (Windows)

`auto-launch.ps1` watches for `claude.exe` and automatically starts/stops both the local server and the reporter:

```powershell
# Add to Task Scheduler or shell:startup
powershell -WindowStyle Hidden -File auto-launch.ps1
```

---

## SDK Reporter (Custom Agents)

Report any agent — not just Claude Code CLI — to Pixel Office. Works with the Claude Agent SDK, custom scripts, cron jobs, or any process.

### Install

Copy `reporter-sdk.js` to your project. No npm package needed.

```bash
cp reporter-sdk.js /path/to/your/project/
```

### Basic Usage (Manual Tool Reporting)

```js
const { createPixelReporter } = require('./reporter-sdk');

const reporter = createPixelReporter({
  serverUrl: 'ws://<server-ip>:3300/ws/report',
  agentName: 'my-agent',       // Name shown in the office
  persistent: true,             // Stay visible when idle (default: true)
});

reporter.connect();

// When your agent starts a task:
reporter.taskStart('Processing invoices');

// Report individual tool usage:
reporter.toolStart('Read', { file_path: 'invoices.csv' });
// ... do work ...
reporter.toolEnd('Read');

reporter.toolStart('Bash', { command: 'python analyze.py' });
// ... do work ...
reporter.toolEnd('Bash');

// When the task is done:
reporter.taskEnd();

// Cleanup:
reporter.disconnect();
```

### Claude Agent SDK Integration

If you're using the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk), stream messages directly:

```js
const { createPixelReporter } = require('./reporter-sdk');
const { query } = require('@anthropic-ai/claude-code');

const reporter = createPixelReporter({
  serverUrl: 'ws://<server-ip>:3300/ws/report',
  agentName: 'finance-agent',
});
reporter.connect();

// Stream SDK messages — reporter translates them automatically
reporter.taskStart('Daily financial report');
for await (const msg of query({ prompt: 'Analyze Q1 results...' })) {
  reporter.reportSDKMessage(msg);
}
// taskEnd() is called automatically on SDK 'result' message
```

The `reportSDKMessage()` method translates SDK streaming events into the JSONL format that Pixel Office understands:

| SDK Message Type | Pixel Office Effect |
|---|---|
| `assistant` with `tool_use` | Character starts typing/reading animation |
| `user` with `tool_result` | Tool completion, animation updates |
| `result` | Turn ends, character goes idle |

### Reporter Options

```js
createPixelReporter({
  serverUrl: 'ws://localhost:3300/ws/report',  // Server WebSocket URL
  agentName: 'my-agent',                       // Display name in office
  machineId: 'my-server',                      // Machine label (default: hostname)
  persistent: true,                             // Keep agent visible when idle
  reconnect: true,                              // Auto-reconnect on disconnect
  reconnectDelay: 5000,                         // Reconnect delay in ms
  silent: false,                                // Suppress console logs
});
```

### Reporter API

| Method | Description |
|---|---|
| `connect()` | Connect to the Pixel Office server |
| `disconnect()` | Disconnect and remove agent from office |
| `taskStart(name)` | Start a task (agent becomes active) |
| `taskEnd()` | End the current task (agent goes idle) |
| `toolStart(name, input)` | Report a tool starting (returns toolId) |
| `toolEnd(name)` | Report a tool completing |
| `reportSDKMessage(msg)` | Forward a Claude SDK streaming message |
| `connected` | (getter) Whether WebSocket is connected |
| `sessionId` | (getter) Current session ID |

---

## Kiosk Mode

Append `?kiosk` to the URL for wall display mode:
- Hides all controls (editor, toolbar, zoom)
- **Canvas**: Shows agent names only (no activity text); exception: "Needs approval" is shown
- **Sidebar**: Shows all agents with activity details; idle agents at reduced opacity
- **Pets**: Name labels always visible, centered, warm styling (no status dot)
- **Mouse disabled**: No hover, click, or cursor changes — display-only mode
- Auto-zooms to frame active agents
- Throttled rendering for lower resource usage (overlay at 5fps, canvas at 15fps)
- Status dots: amber (active), red-orange (needs permission)

### Linux Kiosk (systemd + X11)

For a dedicated display (e.g., wall-mounted monitor on a Linux machine):

1. Install dependencies:
```bash
sudo apt install xorg xinit unclutter curl xdotool
# Install Chrome via .deb (NOT snap)
```

2. Copy the service files from `infra/`:
```bash
sudo cp infra/pixel-office-server.service /etc/systemd/system/
sudo cp infra/pixel-office-display.service /etc/systemd/system/
cp infra/pixel-office-display.sh ~/scripts/
chmod +x ~/scripts/pixel-office-display.sh
```

3. Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable pixel-office-server pixel-office-display
sudo systemctl start pixel-office-server pixel-office-display
```

The display script:
- Polls `/api/status` every 10s
- Starts X + Chrome in kiosk mode when agents are detected
- Stops X when all agents disappear (60s grace period)
- Auto-restarts Chrome if it freezes (D-state watchdog)
- Detects server restarts and refreshes the page

**Environment variables** (set in the systemd service or export before running):

| Variable | Default | Description |
|---|---|---|
| `PIXEL_OFFICE_HOST` | `localhost` | Server hostname |

---

## HTTP API

| Endpoint | Method | Description |
|---|---|---|
| `/api/status` | GET | Returns JSON with all agents and their state |
| `/api/reload` | GET | Forces all connected browsers to reload |
| `/api/restart` | GET | Gracefully restarts the server process |

### `/api/status` Response

```json
{
  "agents": [
    { "id": 1, "folderName": "my-project", "isWaiting": true, "activeTools": 0 },
    { "id": 2, "folderName": "finance-agent", "isWaiting": false, "activeTools": 2 }
  ],
  "count": 2
}
```

---

## WebSocket Protocol

### Browser Client (`ws://<host>:3300`)

Browsers connect to the root WebSocket. The server sends messages describing agent state:

| Server → Client | Description |
|---|---|
| `existingAgents` | Full agent list on connect |
| `agentCreated` | New agent appeared |
| `agentClosed` | Agent session ended |
| `agentStatus` | Agent became active/waiting |
| `agentToolStart` | Agent started using a tool |
| `agentToolDone` | Tool completed |
| `agentToolsClear` | All tools cleared (turn end) |
| `subagentToolStart/Done/Clear` | Sub-agent tool activity |

### Reporter Client (`ws://<host>:3300/ws/report?machineId=xxx`)

Reporters connect to `/ws/report` and send session data:

| Reporter → Server | Description |
|---|---|
| `session-start` | New session detected: `{ sessionId, folderName }` |
| `session-line` | JSONL transcript line: `{ sessionId, line }` |
| `session-end` | Session ended: `{ sessionId }` |
| `session-replay-done` | Initial replay complete: `{ sessionId }` |

The `line` field contains a JSON string matching Claude Code's JSONL format:
- `{ "type": "assistant", "message": { "content": [...] } }` — tool_use blocks
- `{ "type": "user", "message": { "content": [...] } }` — tool_result blocks
- `{ "type": "system", "subtype": "turn_duration" }` — turn ended

---

## Configuration

Edit constants at the top of `standalone-server.js`:

```js
const PORT = 3300;                                // HTTP/WebSocket port
const SCAN_INTERVAL_MS = 5000;                    // How often to scan for new sessions
const AUTO_DETECT_MAX_AGE_MS = 8 * 60 * 60 * 1000; // Max JSONL age (8 hours)
```

## How It Works

The standalone server:

1. **Scans** `~/.claude/projects/` for JSONL transcript files modified within `AUTO_DETECT_MAX_AGE_MS`
2. **Replays** each file to determine if the session is still active (not `/exit`-ed)
3. **Creates agents** only for active sessions — finished sessions are discarded
4. **Watches** for new JSONL data in real-time (hybrid `fs.watch` + polling)
5. **Rescans** every 5 seconds to pick up newly started sessions
6. **Accepts remote reporters** via `/ws/report` WebSocket endpoint
7. **Serves** the webview UI with all assets cached in memory

## Troubleshooting

**No agents appear**: Make sure Claude Code sessions are running. Check `~/.claude/projects/` for JSONL files. The server console logs every scan — look for "New session" or error messages.

**Reporter can't connect**: Verify the server IP and port are reachable. Check firewall rules. The reporter logs connection attempts to the console.

**Agents appear but disappear quickly**: The session's JSONL file may be older than 8 hours. Start a new Claude Code session or adjust `AUTO_DETECT_MAX_AGE_MS`.

**Port already in use**: Another instance is running. Kill it or change `PORT` in the script.

**"Loading..." stays forever**: The WebSocket connection failed. Check that the server is running and the browser can reach it.

**Kiosk display is blank**: Check `systemctl status pixel-office-display` and the server logs. The display script requires active agents (not just idle ones) to turn on.
