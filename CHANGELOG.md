# Changelog

> **Note:** Pixel Office is built upon [Pixel Agents](https://github.com/pablodelucca/pixel-agents) by [Pablo De Lucca](https://github.com/pablodelucca). The original project provided the pixel art rendering engine, character animations, and virtual office concept that serve as the foundation for everything below.

## [0.2.0] — 2026-03-09

### Added
- Office pets (cats and dogs) with customizable colors, patterns, and personalities
- Pet boundary clamping to prevent pets from escaping rooms
- Community layout gallery (browse, preview, import shared layouts)
- Gallery proxy with GitHub token auth for private repos
- Share flow via GitHub Issues for community layout submissions
- Screenshot mode (`?screenshot`) for CI preview generation
- Door system: agents enter/exit through placed doors
- Break room: idle agents visit coffee machine and couch
- Sound notifications when agents finish and need attention
- SDK agent support (report custom agents via WebSocket)
- Multi-PC setup with WebSocket reporters
- `/api/client-health` endpoint for kiosk health checks

### Changed
- Rebranded from pixel-agents fork to pixel-office
- Standalone server no longer requires VS Code

## [0.1.0] — Initial fork

### Origin
- Forked from [Pixel Agents](https://github.com/pablodelucca/pixel-agents) by Pablo De Lucca
- Original features: VS Code extension, agent visualization, pixel art characters, layout editor, canvas rendering
