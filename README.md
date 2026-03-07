# Pixel Office

Real-time visual dashboard for Claude Code agents. A pixel art virtual office where your AI agents come to life as animated characters.

![Pixel Office screenshot](webview-ui/public/Screenshot.jpg)

## Features

- **Standalone web server** — runs without VS Code, just `node standalone-server.js`
- **Kiosk mode** — wall-mounted display friendly with auto-framing camera and status sidebar
- **Auto-discovery** — detects all active Claude Code agents across projects
- **Live activity tracking** — characters animate based on what the agent is doing
- **Office layout editor** — design your office with floors, walls, and furniture
- **Speech bubbles** — visual indicators for waiting/permission states
- **Sub-agent visualization** — Task tool sub-agents spawn as separate characters
- **Persistent layouts** — saved to `~/.pixel-agents/layout.json`, syncs across tabs
- **VS Code extension** — also works as a VS Code webview panel

## Quick Start (Standalone)

```bash
npm install
cd webview-ui && npm install && cd ..
npm run build
node standalone-server.js
```

Open http://localhost:3300 (editor) or http://localhost:3300/?kiosk (display mode).

## Quick Start (VS Code)

```bash
npm run build
```

Press **F5** to launch the Extension Development Host.

## Tech Stack

- **Server**: Node.js, WebSocket (ws)
- **Extension**: TypeScript, VS Code Webview API, esbuild
- **Webview**: React 19, TypeScript, Vite, Canvas 2D

## Office Assets

The office tileset is **[Office Interior Tileset (16x16)](https://donarg.itch.io/officetileset)** by **Donarg** ($2 USD on itch.io). Characters are based on **[Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack)** by **JIK-A-4**.

The tileset is not included in this repo. To import it:

```bash
npm run import-tileset
```

The app works without it — you get characters and basic layout, but not the full furniture catalog.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full product roadmap.

## License

[MIT License](LICENSE) — Based on [Pixel Agents](https://github.com/pablodelucca/pixel-agents) by Pablo De Lucca.
