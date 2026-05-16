# Pixel Office — Standalone Server

Run the pixel art office visualization in your browser.

## Requirements

- Node.js 18+ (Node 22+ recommended for native WebSocket)
- The webview must be built first (`pnpm build` from the project root)
- Claude Code CLI sessions and/or Cursor agent sessions running on the same machine (or connected via reporter)

## Quick Start (Single PC)

```bash
git clone https://github.com/fedevgonzalez/pixel-office.git
cd pixel-office
pnpm install && cd webview-ui && pnpm install && cd ..
pnpm build
node standalone-server.js
```

Open `http://localhost:3300` in your browser. Agents appear automatically as you start Claude Code or Cursor agent sessions.

For wall displays, use `http://localhost:3300/?kiosk` (auto-framing camera, no UI controls).

## Environment Variables

All optional. Can be set as system env vars or in a `.env` file in the project root.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3300` | HTTP + WebSocket server port |
| `GITHUB_TOKEN` | _(empty)_ | GitHub personal access token — required only if your community gallery repo is private |
| `NO_SCAN` | `0` | Set to `1` to disable auto-scanning of `~/.claude/projects/` and `~/.cursor/projects/`. Useful when the server only receives agents via remote WebSocket reporters |
| `GITHUB_APP_CLIENT_ID` | _(empty)_ | GitHub App client ID for community gallery voting (optional) |
| `GITHUB_APP_CLIENT_SECRET` | _(empty)_ | GitHub App client secret for community gallery voting (optional) |

Example `.env` file:
```
PORT=3300
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_APP_CLIENT_ID=Iv1.xxxxxxxxxx
GITHUB_APP_CLIENT_SECRET=xxxxxxxxxxxxxxxx
```

## Data Directory

Layout data is stored at `~/.pixel-office/layout.json`, created automatically on first run. This directory also stores pet data and agent seat assignments. The path is defined in `standalone-server.js`.

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
pnpm add ws pngjs
node standalone-server.js
```

The server listens on `0.0.0.0:3300` and accepts both browser clients and reporter connections.

### Reporter (Claude Code CLI + Cursor)

Each machine running Claude Code or Cursor needs a reporter — a lightweight process that watches local session files and streams updates to the central server. The reporter auto-detects both Claude Code JSONL sessions (`~/.claude/projects/`) and Cursor agent transcripts (`~/.cursor/projects/*/agent-transcripts/`).

```bash
# Node 22+ (native WebSocket, zero dependencies)
node pixel-office-reporter.js ws://<server-ip>:3300/ws/report

# Node 18-21 (needs ws package)
pnpm add -g ws
node pixel-office-reporter.js ws://<server-ip>:3300/ws/report
```

The reporter:
1. Scans `~/.claude/projects/` for active Claude Code JSONL session files
2. Scans `~/.cursor/projects/*/agent-transcripts/` for active Cursor transcript files
3. Replays recent history so the server knows current state
4. Streams updates in real-time via WebSocket (Cursor transcripts are normalized to the Claude protocol)
4. Auto-reconnects if the connection drops

Only 1 file needed — no other dependencies.

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `PIXEL_OFFICE_SERVER` | `ws://localhost:3300/ws/report` | Central server WebSocket URL |
| `PIXEL_OFFICE_MACHINE_ID` | system hostname | Label for this machine (shown in server logs) |

### Auto-Launch (macOS — launchd)

The recommended way to run the reporter on Mac is as a LaunchAgent: starts at login, auto-restarts on crash.

**1. Find your node path:**
```bash
which node
# e.g. /Users/you/.nvm/versions/node/v22.17.0/bin/node
```

> **nvm users**: launchd doesn't source your shell profile, so the path must be absolute — not `~/.nvm/...` but the full `/Users/you/...` expansion.

**2. Install the plist:**
```bash
cp infra/com.pixel-office.reporter.plist ~/Library/LaunchAgents/
```

Edit `~/Library/LaunchAgents/com.pixel-office.reporter.plist` and replace:
- `/path/to/node` → full path from `which node`
- `/path/to/pixel-office` → full path to this repo
- `YOUR_SERVER` → server hostname or IP (e.g. `pixel.lab`)

**3. Load it:**
```bash
launchctl load ~/Library/LaunchAgents/com.pixel-office.reporter.plist
```

**Common commands:**

| Action | Command |
|--------|---------|
| Load / start | `launchctl load ~/Library/LaunchAgents/com.pixel-office.reporter.plist` |
| Unload / stop | `launchctl unload ~/Library/LaunchAgents/com.pixel-office.reporter.plist` |
| Restart (e.g. after `git pull`) | `launchctl unload ... && launchctl load ...` |
| View logs | `tail -f /tmp/pixel-office-reporter.log` |
| Check running | `launchctl list \| grep pixel-office` |

> After any `git pull` that updates `pixel-office-reporter.js`, do unload + load to pick up the new code.

---

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

## OpenClaw Integration

[OpenClaw](https://docs.openclaw.ai) is a self-hosted AI agent gateway that connects to Telegram, Slack, and other channels. It runs 24/7 on a VPS and uses its own JSONL session format — different from Claude Code CLI.

### The Problem

OpenClaw's JSONL uses `type: "message"` with `message.role` and `toolCall`/`toolResult` block types, while Pixel Office expects Claude Code's format (`type: "assistant"/"user"` with `tool_use`/`tool_result` blocks). A translation layer is needed.

### Architecture

```
┌─────────────┐  Cloudflare Tunnel   ┌──────────────┐     Kiosk      ┌─────────┐
│  OpenClaw   │  (or direct WS)      │  Pixel Office│ ◀────────────  │ Display │
│  VPS        │ ──────────────────▶  │  Server      │                │         │
│  reporter   │    /ws/report         │  (homeserver)│                └─────────┘
└─────────────┘                      └──────────────┘
     │
     │ reads JSONL from
     ▼
 ~/.openclaw/agents/main/sessions/*.jsonl
```

### Setup

**1. Copy the reporter to OpenClaw's VPS:**

The reporter script needs to be placed inside the OpenClaw container at a path like `/data/.openclaw/workspace/scripts/pixel-reporter.js`. It requires the `ws` npm package.

```bash
# Inside the OpenClaw container:
cd /data/.openclaw/workspace/scripts
pnpm add ws
```

**2. Create the reporter script:**

The reporter watches OpenClaw's session JSONL files, translates them to Pixel Office format, and sends them via WebSocket. Key translation:

| OpenClaw Format | Pixel Office Format |
|---|---|
| `type: "message"`, `role: "assistant"` | `type: "assistant"` |
| `type: "message"`, `role: "user"` | `type: "user"` |
| `block.type: "toolCall"` | `block.type: "tool_use"` |
| `block.type: "toolResult"` | `block.type: "tool_result"` |
| `block.toolCallId` | `block.tool_use_id` |
| `type: "custom"`, `subtype: "turn_end"` | `type: "system"`, `subtype: "turn_duration"` |

```js
// pixel-reporter.js — OpenClaw → Pixel Office bridge
// See full implementation at: infra/openclaw-reporter.js

const fs = require("fs");
const path = require("path");
const WS = require("ws");

const SERVER_URL = process.env.PIXEL_OFFICE_SERVER || "ws://pixel.lab:3300/ws/report";
const SESSIONS_DIR = "/data/.openclaw/agents/main/sessions";

// Translation function
function translateLine(record) {
  if (record.type === "message" && record.message) {
    const role = record.message.role;
    const content = record.message.content;
    if (!Array.isArray(content)) return null;

    const translated = content.map(block => {
      if (block.type === "toolCall") {
        return { type: "tool_use", id: block.id, name: block.name, input: block.input || {} };
      } else if (block.type === "toolResult") {
        return { type: "tool_result", tool_use_id: block.toolCallId || block.id, content: "done" };
      }
      return block;
    });

    if (role === "assistant") return JSON.stringify({ type: "assistant", message: { content: translated } });
    if (role === "user") return JSON.stringify({ type: "user", message: { content: translated } });
  } else if (record.type === "custom" && record.subtype === "turn_end") {
    return JSON.stringify({ type: "system", subtype: "turn_duration" });
  }
  return null;
}

// The reporter scans for the newest JSONL file every 2s,
// reads new lines, translates them, and sends via WebSocket.
```

**3. Run the reporter:**

```bash
# Run as a background daemon inside the OpenClaw container:
docker exec -d openclaw-container node /data/.openclaw/workspace/scripts/pixel-reporter.js

# Or set PIXEL_OFFICE_SERVER env var in the container's .env
```

**4. Network: Reaching the Pixel Office server**

If your Pixel Office server is on a home network behind NAT/ISP restrictions, use a [Cloudflare Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/):

```bash
# On the homeserver, create a tunnel to the Pixel Office port:
docker run -d --name pixel-tunnel --network host cloudflare/cloudflared:latest tunnel --url http://localhost:3300

# The tunnel logs will show a URL like:
# https://random-words.trycloudflare.com

# Use that URL in the reporter:
PIXEL_OFFICE_SERVER=wss://random-words.trycloudflare.com/ws/report
```

> **Note:** Quick tunnel URLs change on restart. For a permanent URL, use a named Cloudflare tunnel with a custom domain.

### Security

When exposing the Pixel Office server externally, restrict access to only the reporter endpoint:

```nginx
# nginx config — block everything except /ws/report with a secret token
location / {
    return 403;
}

location = /ws/report {
    if ($arg_token != "YOUR_SECRET_TOKEN") {
        return 403;
    }
    proxy_pass http://localhost:3300;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;
}
```

The `/ws/report` endpoint only accepts `session-start`, `session-line`, `session-end`, and `session-replay-done` messages. It cannot read layouts, modify settings, close other agents, or access any API endpoints.

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
| `/api/agents/:id` | DELETE | Remove an agent by id (broadcasts `agentClosed` to all clients) |
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

## Community Gallery & Voting

The community gallery lets users browse, import, and star layouts shared by other users. Gallery data is fetched from the `pixel-office-layouts` GitHub repo (`gallery.json`).

Voting is optional — the gallery works without it (star buttons are hidden). To enable voting, set `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET` in your `.env` file. These correspond to a GitHub App (`pixel-office-voting`) with Issues Read & Write permission.

### How Voting Works

Each community layout has a corresponding GitHub Issue in the `pixel-office-layouts` repo. Stars use the GitHub Reactions API (`+1` reaction on the issue). Users authenticate via GitHub App OAuth (popup login flow). Vote counts in `gallery.json` are updated every 6 hours by a GitHub Actions workflow (`update-votes.yml`).

### Auth Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/auth/login` | GET | Initiates GitHub App OAuth flow (opens popup) |
| `/auth/callback` | GET | OAuth callback — exchanges code for user token, sets session cookie |
| `/auth/user` | GET | Returns current authenticated user info (or 401) |
| `/auth/logout` | POST | Clears session cookie and removes server-side session |

Sessions use an in-memory store with `httpOnly` cookies (`po_session`).

### Voting API

| Endpoint | Method | Description |
|---|---|---|
| `/api/votes/mine` | GET | Returns list of layout IDs the current user has starred |
| `/api/vote` | POST | Star a layout (adds `+1` reaction to its GitHub Issue) |
| `/api/vote` | DELETE | Unstar a layout (removes `+1` reaction from its GitHub Issue) |

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

**No agents appear**: Make sure Claude Code or Cursor sessions are running. Check `~/.claude/projects/` for JSONL files or `~/.cursor/projects/*/agent-transcripts/` for Cursor transcript files. The server console logs every scan — look for "New session" or error messages.

**Reporter can't connect**: Verify the server IP and port are reachable. Check firewall rules. The reporter logs connection attempts to the console.

**Agents appear but disappear quickly**: The session's JSONL file may be older than 8 hours. Start a new Claude Code session or adjust `AUTO_DETECT_MAX_AGE_MS`.

**Port already in use**: Another instance is running. Kill it or change `PORT` in the script.

**"Loading..." stays forever**: The WebSocket connection failed. Check that the server is running and the browser can reach it.

**Kiosk display is blank**: Check `systemctl status pixel-office-display` and the server logs. The display script requires active agents (not just idle ones) to turn on.
