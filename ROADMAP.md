# Pixel Office — Product Roadmap

## Vision

Real-time visual dashboard for Claude Code agents. Standalone web server with kiosk mode for wall-mounted displays, monitoring all agents across projects. Evolving into a full "virtual office" experience with personality, ambiance, and community.

---

## Tier 0 — Identity & Hard Fork

### Branding
- [x] New product name: **Pixel Office**
- [ ] New logo and icon
- [ ] Color palette and visual identity
- [x] Landing page / README with product positioning
- [x] Independent repository for divergent development
- [x] Credit original: "Based on Pixel Agents by Pablo De Lucca (MIT)"

---

## Tier 1 — Core Value (Next Up)

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
- [x] Centralized panel: homeserver sees its own agents + dev PC agents
- [x] Label agents by machine of origin
- [x] WebSocket reporter architecture (pixel-office-reporter.js)
- [x] Auto-deploy via git pre-push hook
- [x] Claude SDK virtual agents (finance-agent, news-agent, chat-agent via pixel-reporter.ts)
- [x] Remote reporter replay mode (isReplaying + session-replay-done)
- [x] Permission mode detection (bypassPermissions for SDK agents)
- [ ] Scan remote `~/.claude/projects/` via SSH tunnel or sync (alternative to reporter)

---

## Tier 2 — Product Differentiation

### Interactive Control Panel
- Approve permissions directly from the web UI
- Send prompts to agents from the browser
- Remote kill agent
- Transform from passive monitor to control center

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

## Tier 3 — Experience & Ambiance

### Office Pets / Mascots ✅ Done
- [x] Cats and dogs with personality-based behavior (lazy, playful, chill, energetic)
- [x] Pet Creator modal: species, colors, coat patterns, personality, animated preview
- [x] React to agent activity (perk up when tools run, sleep when office idle >120s)
- [x] Click interaction (heart/happy bubbles), dogs follow active agents
- [x] pets feature
- [ ] Bird, fish, hamster species (future)
- [ ] Pixel art editor for custom pet sprites (future)
- [ ] Photo → pixel art conversion (future)

### Door Spawn Animation ✅ Done
- [x] Door furniture item (16x32, wall-placeable, backgroundTiles: 2)
- [x] Walk-in: character appears at door → ENTERING state → walks to seat
- [x] Walk-out: character → LEAVING state → walks to nearest door → matrix despawn
- [x] Fallback: matrix effect when no door exists
- [ ] Door open/close animation timing (future enhancement)

### Break Room ✅ Done
- [x] Coffee machine (isInteractionPoint) and break couch (isBreakRoom) furniture
- [x] Idle agents: 25% chance to visit break room, rest 5-15s
- [x] `getBreakRoomTiles()` finds walkable tiles adjacent to break room items
- [ ] Grab coffee / sipping animations (future enhancement)
- [ ] Water cooler / vending machine (future)

### Day / Night Cycle
- Ambient lighting changes based on real clock or configurable schedule
- Daytime: bright palette, sun through windows
- Night: darker palette, desk lamps glow, monitor light on faces
- Sunset/sunrise transitions with gradual color shift

### Weather & Seasons
- Rain on windows, snow outside, leaves falling
- Seasonal decorations (holiday themes)
- Ambient sound option (rain, keyboard clicks, office hum)

### Visual Customization
- Themes beyond pixel art: cyberpunk, minimal, terminal-style, cozy cafe
- Custom sprites (upload your own avatar per agent)
- Animated office backgrounds
- Per-agent name tags / custom labels

---

## Tier 4 — Community & SaaS

### Layout Gallery ✅ Phase A Done
- [x] `pixel-office-layouts` GitHub repo with seeded layouts
- [x] In-app "Community" button with browse/preview/import UI
- [x] One-click import from community gallery
- [x] Share flow: ShareModal → pre-filled GitHub Issue → CI bot processes → PR with preview
- [x] Screenshot mode (`?screenshot`) for CI preview generation
- [x] GitHub token auth for private gallery repo (`.env` GITHUB_TOKEN)
- [ ] In-app upload with auto-generated preview (Phase B)
- [ ] Ratings / download count (Phase B)
- [ ] "Featured layouts" curated selection

### Teams / Multi-User
- Each dev's agents visible on a shared dashboard
- "Who's using Claude right now and on what"
- Basic auth for the web server
- Role-based access (viewer / editor / admin)

### Public API
- Documented REST API for external integrations
- Grafana datasource, Home Assistant sensor
- GitHub Action that reports agent activity on PRs

### Replay Mode
- Load old JSONL files and replay sessions as if live
- Useful for demos, debugging, onboarding
- Shareable replay links

---

## Current State (Done)

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
- [x] Homeserver kiosk auto-display (systemd + X11 + Chrome)
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
