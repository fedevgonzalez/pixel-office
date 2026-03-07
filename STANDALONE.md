# Pixel Agents — Standalone Web Mode

Run the pixel art office visualization in your browser, independent of VS Code.

## Requirements

- Node.js 18+
- The extension must be built first (`npm run build` from the project root)
- Claude Code CLI sessions running on the same machine

## Quick Start

```bash
# From the project root
npm run build          # Build extension + webview
node standalone-server.js
```

Open `http://localhost:3300` in your browser.

## How It Works

The standalone server:

1. **Scans** `~/.claude/projects/` for all JSONL transcript files modified recently
2. **Replays** each file to determine if the session is still active (has pending tools or an open turn)
3. **Creates agents** only for active sessions — finished sessions are discarded
4. **Watches** for new JSONL data in real-time (hybrid `fs.watch` + polling)
5. **Rescans** every 5 seconds to pick up newly started Claude Code sessions
6. **Serves** the webview UI and communicates via WebSocket (replacing VS Code's `postMessage`)

## Features

- Auto-detects all active Claude Code agents across all projects
- Shows real-time tool activity (Reading, Editing, Running, etc.)
- Sub-agent detection (Task tools spawn sub-agent characters)
- Permission and waiting status bubbles
- Close agents from the web UI (removes from visualization only — does not kill the CLI process)
- Layout editor works the same as in VS Code

## Differences from VS Code Extension

| Feature | VS Code Extension | Standalone Web |
|---|---|---|
| Agent creation | "+ Agent" button launches terminal | Auto-detect only (no terminal creation) |
| Terminal focus | Click agent to focus terminal | Not available |
| Layout persistence | `~/.pixel-agents/layout.json` | Same file (shared) |
| Agent detection | Terminal lifecycle + JSONL watching | JSONL scanning only |
| Multi-project | Current workspace only | All projects under `~/.claude/projects/` |

## Configuration

Edit constants at the top of `standalone-server.js`:

```js
const PORT = 3300;                          // HTTP/WebSocket port
const SCAN_INTERVAL_MS = 5000;              // How often to scan for new sessions
const AUTO_DETECT_MAX_AGE_MS = 30 * 60 * 1000; // Max JSONL age to consider (30 min)
```

## Troubleshooting

**No agents appear**: Make sure Claude Code sessions are running and their JSONL files exist under `~/.claude/projects/`. Check the server console for scan output.

**Port already in use**: Another instance is running. Kill it or change `PORT` in the script.

**"Loading..." stays forever**: The WebSocket connection failed. Check that the server is running and no firewall is blocking localhost:3300.
