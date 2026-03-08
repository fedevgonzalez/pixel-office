# Changelog

## Unreleased (feat/pets-community-planning)

### Features

- **Pet system**: cats and dogs roam the office with personality-based behavior (lazy, playful, chill, energetic)
- **Pet Creator**: modal with species selector, per-part color customization (body, eyes, nose), coat patterns (solid, striped, spotted, bicolor, tuxedo), personality picker, and animated preview
- **Door system**: agents enter/exit through door furniture with ENTERING/LEAVING FSM states; fallback to matrix effect when no door exists
- **Break room**: coffee machine and break couch furniture; idle agents have 25% chance to visit break room and rest 5-15s
- **Community gallery**: browse and import layouts from the pixel-office-layouts GitHub repo
- **UI polish**: ARIA accessibility improvements, CSS variable consistency, scrollbar styling, prefers-reduced-motion support

### Bug Fixes

- Fix persistent D-state check avoiding false Chrome restarts
- Add local gallery repo fallback for development

## v0.2.0

### Features

- **SDK agent distinction**: `isSDK` flag differentiates SDK virtual agents from CLI agents
- **Gallery proxy**: extension `fetchFromGitHub()`, standalone `/api/gallery` endpoint

### Bug Fixes

- Fix infinite recursion in `isPermissionExempt` (stack overflow)
- Fix Chrome memory throttling causing frozen kiosk display
- Robust Chrome health check (D-state grep was inverted)
- Increase kiosk memory limits and re-enable GPU acceleration

## v0.1.0

Initial release as Pixel Office (hard fork from Pixel Agents).

### Features

- Standalone web server (HTTP + WebSocket, no VS Code required)
- Kiosk mode with auto-framing camera system
- Status sidebar panel for wall-mounted displays
- Auto-discovery of agents across all projects
- Multi-project directory scanning
- Layout persistence and cross-tab sync
- MCP tool permission exemption
- Detached agent support (no live terminal required)
- Furniture asset loading in standalone server
- No-cache headers for HTML (prevents stale bundle after rebuild)
- Accessibility: focus-visible, prefers-reduced-motion
- Auto-launch script (Windows PowerShell)
- Multi-PC via WebSocket reporters
- SDK reporter module for custom agents
- Strip MCP prefix from tool display names
- 8-hour session age filter
- Smart display: only activate when agents are actively working
- Auto-restart Chrome kiosk on renderer freezes
- Auto-reload page after 30s WebSocket disconnect

### Bug Fixes

- Fix false `/exit` detection from context compaction summaries
- Fix false "Needs approval" for bypass permission sessions
- Fix false `/exit` in live stream + remote agent replay mode
