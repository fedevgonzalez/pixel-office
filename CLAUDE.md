# Pixel Office

VS Code extension + standalone server: pixel art office where AI agents (Claude Code terminals) are animated characters.

## Build

```sh
npm install && cd webview-ui && npm install && cd .. && npm run build
```

Standalone: `node standalone-server.js` → http://localhost:3300

## TypeScript Rules

- No `enum` — use `as const` objects
- `import type` for type-only imports
- `noUnusedLocals` / `noUnusedParameters`

## Constants

All magic numbers centralized — never inline:
- Extension: `src/constants.ts`
- Webview: `webview-ui/src/constants.ts`
- CSS: `webview-ui/src/index.css` `:root` block

## Key Files

- `src/PixelAgentsViewProvider.ts` — Extension backend, message dispatch
- `webview-ui/src/App.tsx` — Webview root
- `webview-ui/src/office/engine/officeState.ts` — Game world state
- `webview-ui/src/office/engine/renderer.ts` — Canvas rendering
- `webview-ui/src/office/components/OfficeCanvas.tsx` — Canvas + mouse input
- `standalone-server.js` — Standalone HTTP + WebSocket server
- Layout: `~/.pixel-office/layout.json`

## Docs

- `docs/architecture.md` — Full technical reference
- `docs/product-plan.md` — Product roadmap
- `docs/planning.md` — Project docs
