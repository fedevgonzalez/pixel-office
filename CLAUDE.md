# Pixel Office

Standalone web server: pixel art office where AI agents (Claude Code terminals) are animated characters.

## Build

```sh
pnpm install && cd webview-ui && pnpm install && cd .. && pnpm build
```

Run: `node standalone-server.js` → http://localhost:3300

## TypeScript Rules

- No `enum` — use `as const` objects
- `import type` for type-only imports
- `noUnusedLocals` / `noUnusedParameters`

## Constants

All magic numbers centralized — never inline:
- Webview: `webview-ui/src/constants.ts`
- CSS: `webview-ui/src/index.css` `:root` block

## Key Files

- `standalone-server.js` — HTTP + WebSocket server
- `webview-ui/src/App.tsx` — Webview root
- `webview-ui/src/office/engine/officeState.ts` — Game world state
- `webview-ui/src/office/engine/renderer.ts` — Canvas rendering
- `webview-ui/src/office/components/OfficeCanvas.tsx` — Canvas + mouse input
- `webview-ui/src/wsClient.ts` — WebSocket client (standalone mode)
- Layout: `~/.pixel-office/layout.json`

## URL Modes

- `?kiosk` — Kiosk mode: hides UI, auto-frames camera on agents, disables mouse interaction (hover/click), canvas shows agent names only (sidebar shows activity), pet names always visible
- `?screenshot` — Screenshot mode: hides all UI, auto-fit zoom, solid dark bg, for CI preview generation

## Community Gallery

- Layouts repo: `fedevgonzalez/pixel-office-layouts` (GitHub)
- Share flow: ShareModal → pre-filled GitHub Issue → Actions bot → PR with preview screenshot
- Gallery fetches `gallery.json` from layouts repo (regenerated on merge via `generate-gallery.yml`)
- Screenshot mode used by CI to generate clean preview.png for each layout

## Docs

- `docs/architecture.md` — Full technical reference
- `docs/standalone.md` — Standalone server setup & API
- `docs/asset-sources.md` — Open source sprite libraries
- `ROADMAP.md` — Feature roadmap & ideas
