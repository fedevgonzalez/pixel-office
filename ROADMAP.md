# Pixel Office — Roadmap

## Vision

Real-time visual dashboard for Claude Code agents. Standalone web server with kiosk mode for wall-mounted displays, monitoring all agents across projects. The goal: make it feel like a living virtual office, not just a status panel.

---

## Branding & Identity

- [x] New product name: **Pixel Office**
- [ ] New logo and icon
- [x] Color palette and visual identity
- [x] README with clear description
- [x] Independent repository for divergent development
- [x] Credit original: "Based on Pixel Agents by Pablo De Lucca (MIT)"

---

## Next Up

### Timeline / Activity Log
- Scrollable panel with history of what each agent did
- Files touched, commands run, turn duration
- Click to expand tool details
- Today tools disappear when done — retain that data

### Aggregate Metrics
- Active vs idle time per agent, per day
- Tool count, average turn duration
- Approval wait times (how long the human took to respond)
- Daily standup report: what each agent did in the last 24h

### Push Notifications
- Webhook / Telegram / Discord on approval needed
- Alert when agent finishes a long turn
- Alert when agent goes idle after X minutes of activity
- Bridges the gap: kiosk shows status, phone gets the alert

### Multi-Machine Support
- [x] Centralized panel: central server sees its own agents + dev PC agents
- [x] Label agents by machine of origin
- [x] WebSocket reporter architecture (pixel-office-reporter.js)
- [x] Auto-deploy via git pre-push hook
- [x] Claude SDK virtual agents (finance-agent, news-agent, chat-agent via pixel-reporter.ts)
- [x] Remote reporter replay mode (isReplaying + session-replay-done)
- [x] Permission mode detection (bypassPermissions for SDK agents)
- [ ] Scan remote `~/.claude/projects/` via SSH tunnel or sync (alternative to reporter)

---

## Fun Features

### Interactive Control Panel
- Approve permissions directly from the web UI
- Send prompts to agents from the browser
- Remote kill agent
- Transform from passive monitor to control center
- **Note:** These features would require an authentication layer. The server currently has no auth — see [SECURITY.md](SECURITY.md).

### Multiple Views
- Pixel Office (current view)
- Kanban: agent cards in columns by state (idle / working / waiting)
- Timeline: Gantt-like activity per agent over time
- Tab bar to switch between views

### Smart Alerts
- Detect loops (same tool N times in a row)
- Detect stuck agents (active but no real progress)
- Detect repeated bash errors
- Auto-summary: "Agent kuore has been editing the same file for 20 min"

---

## Ambiance & Polish

### Office Pets / Mascots (done)
- [x] Cats and dogs with personality-based behavior (lazy, playful, chill, energetic)
- [x] Pet Creator modal: species, colors, coat patterns, personality, animated preview
- [x] React to agent activity (perk up when tools run, sleep when office idle >120s)
- [x] Click interaction (heart/happy bubbles), dogs follow active agents
- [x] Unlimited pets (no restrictions)
- [x] 32×32 sprite migration with legacy 16×16 auto-upscale
- [x] Breed variant picker (PNG sprite sheets loaded from server)
- [x] Pet templates (save name+species+variant+colors+personality as reusable combo)
- [x] Backstory + voice-style fields for narration integrations
- [x] Zone-based recoloring of variant sprites (top-N palette extracted server-side, per-zone color pickers in UI)
- [ ] Bird, fish, hamster species
- [ ] In-app pixel art editor for custom pet sprites (draw/modify sprites, auto walk cycle from single pose)
- [ ] Photo → pixel art (template color match, or Claude Vision for higher quality)

### Door Spawn Animation (done)
- [x] Door furniture item (16x32, wall-placeable, backgroundTiles: 2)
- [x] Walk-in: character appears at door → ENTERING state → walks to seat
- [x] Walk-out: character → LEAVING state → walks to nearest door → matrix despawn
- [x] Fallback: matrix effect when no door exists
- [ ] Door open/close animation timing

### Break Room (done)
- [x] Coffee machine (isInteractionPoint) and break couch (isBreakRoom) furniture
- [x] Idle agents: 25% chance to visit break room, rest 5-15s
- [x] `getBreakRoomTiles()` finds walkable tiles adjacent to break room items
- [ ] Grab coffee / sipping animations
- [ ] Water cooler / vending machine

### Day/Night Cycle (done)
- [x] 5 time periods (night, sunrise, day, sunset, evening) with seasonal offset
- [x] Canvas tint overlay + radial light glows (warm amber lamps, cool blue PCs)
- [x] Time modes: Real Clock, Always Day/Night/Sunset/Sunrise
- [x] Hemisphere auto-detected from browser timezone, overridable in Settings
- [x] Settings persisted in localStorage, state updates every 30s
- [ ] Window furniture shows sky color change
- [ ] Character shadows change with sun position

### Weather & Seasons
- Rain on windows, snow outside, leaves falling
- Seasonal decorations (holiday themes)
- Ambient sound option (rain, keyboard clicks, office hum)

### Visual Customization
- Themes beyond pixel art: cyberpunk, minimal, terminal-style, cozy cafe
- Custom character sprites (upload your own avatar per agent)
- Per-agent name tags / custom labels

---

## Community

### Community Gallery — Multi-Kind (Phase A done)
- [x] `pixel-office-community` GitHub repo (renamed from `pixel-office-layouts`) with seeded layouts
- [x] In-app "Community" button with browse/preview/import UI
- [x] One-click import for layouts
- [x] **"Use this Pet"** import for community pets (downloads sprite to `~/.pixel-office/community-assets/pets/`, server reloads variants automatically)
- [x] Multi-kind tabs: Layouts · Pets · Characters · Props · Backgrounds
- [x] Share flow per kind: ShareModal/ShareAssetModal → pre-filled GitHub Issue → CI bot → PR
- [x] `process-sprite-submission.yml` validates sprite dims + auto-generates thumbnail
- [x] `scripts/generate-manifests.js` emits per-kind JSON manifests on PR merge
- [x] CONTRIBUTING.md rewritten multi-kind
- [x] Screenshot mode (`?screenshot`) for CI preview generation
- [x] GitHub token auth for private gallery repo (`.env` GITHUB_TOKEN)
- [ ] In-app upload with auto-generated preview (Phase B)
- [x] Star ratings via GitHub Reactions (Phase B → done)
- [ ] "Featured" curated selection per kind
- [ ] "Use this" import for characters / props / backgrounds (parity with pets)

### Replay Mode
- Load old JSONL files and replay sessions as if live
- Useful for demos, debugging, onboarding
- Shareable replay links

---

## Art Direction

- **Resolution**: 16×16 tiles, 16×32 (legacy) / 24×32 (current) characters
- **Palette**: Limited palette per theme (16-32 colors)
- **Style**: Top-down with slight perspective (Stardew Valley / office RPG feel)
- **Animation**: 2-3 frame animations, smooth but pixel-crisp
- **Consistency**: All new sprites must match the existing tileset aesthetic
- **Pets**: 32×32 sprites (legacy 16×16 sheets auto-upscale 2× at load)
- **Sprite sheets** — pets: 5 cols × 3 rows (160×96), chars: 7 cols × 3 rows (168×96 new / 112×96 legacy)

See `docs/asset-sources.md` for open source sprite libraries.

---

## Done

- [x] Standalone web server (HTTP + WebSocket)
- [x] Auto-discovery of agents across all projects
- [x] Kiosk mode with auto-framing camera system
- [x] Status sidebar panel for wall-mounted displays
- [x] Layout persistence and cross-tab sync
- [x] MCP tool permission exemption
- [x] Multi-project directory scanning
- [x] Detached agent support (no live terminal required)
- [x] Accessibility: focus-visible, prefers-reduced-motion, ARIA
- [x] Auto-launch script (Windows PowerShell)
- [x] No-cache headers for HTML (prevents stale bundle after rebuild)
- [x] Furniture asset loading in standalone server
- [x] Memory-cached file serving (prevents event loop blocking)
- [x] False /exit detection fix (context compaction summaries, live stream)
- [x] MCP tool name display (strip `mcp__server__` prefix)
- [x] 8-hour session age filter (idle sessions stay visible all day)
- [x] Server kiosk auto-display (systemd + X11 + Chrome)
- [x] Passwordless sudo for service restarts
- [x] Smart pre-push hook (only restarts server when code changes)
- [x] Community gallery (browse + import layouts from GitHub repo)
- [x] Office pets (cats, dogs with personality, colors, patterns, reactions)
- [x] Pet Creator modal (species, per-part colors, coat patterns, personality)
- [x] Door system (enter/exit through doors, ENTERING/LEAVING FSM states)
- [x] Break room (coffee machine, couch, 25% idle visit chance)
- [x] SDK vs CLI agent distinction
- [x] Chrome D-state watchdog for kiosk reliability
- [x] `/api/client-health` endpoint (WebSocket ping/pong for kiosk health monitoring)
- [x] GitHub token auth for private gallery repo (`.env` loader, GitHub API with Bearer)
- [x] Pet boundary clamping (prevent pets/characters from escaping room bounds)
- [x] Share layout flow (ShareModal → GitHub Issue → CI bot → PR with preview screenshot)
- [x] Screenshot mode (`?screenshot`) for CI preview generation
- [x] Day/night cycle (5 periods, seasonal offsets, light glows, hemisphere auto-detect)
- [x] Warm branding palette (amber/gold accent, cozy dark purple bg)
- [x] Modal UI unification (Settings, Pets, Community, Share)
- [x] Star ratings / voting via GitHub App OAuth + Reactions API
- [x] Pet 32×32 migration + breed variant picker
- [x] Pet templates (save/load named combos)
- [x] Pet zone recoloring (palette extracted server-side, per-zone swatch pickers)
- [x] Multi-kind community gallery (pets, characters, props, backgrounds)
- [x] "Use this Pet" community import flow
- [x] AI sprite integration pipeline (`scripts/integrate-sprite-sheet.mjs` via `proper-pixel-art`)
- [x] World background system with Suburban theme
- [x] Daily summary banner overlay
- [x] Kiosk stats overlay (coding · waiting · idle counts)
