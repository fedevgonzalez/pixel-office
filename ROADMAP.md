# Pixel Office — Product Roadmap

## Vision

Real-time visual dashboard for Claude Code agents. Runs standalone (no VS Code required), supports kiosk mode for wall-mounted displays, and monitors all agents across projects. Evolving into a full "virtual office" experience with personality, ambiance, and community.

---

## Tier 0 — Identity & Hard Fork

### Branding
- [x] New product name: **Pixel Office**
- [ ] New logo and icon
- [ ] Color palette and visual identity
- [x] Landing page / README with product positioning
- [x] Clean repo (no fork relationship on GitHub)
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

### Office Pets / Mascots
- Non-agent decorative characters that roam the office
- Cats, dogs, birds — selectable from a catalog
- React to agent activity (perk up when tools run, sleep when idle)
- Purely cosmetic, adds personality

### Door Spawn Animation
- New agents "enter through a door" instead of matrix effect
- Door furniture item placed in layout
- Walk-in animation: door opens, character walks to their seat
- Despawn: character walks to door, exits, door closes

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

### Layout Marketplace
- Share office layouts with the community
- Gallery of user-created offices (browse, preview, import)
- "Featured layouts" curated selection
- Rating / download count

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

- [x] Standalone web server (HTTP + WebSocket, no VS Code needed)
- [x] Auto-discovery of agents across all projects
- [x] Kiosk mode with auto-framing camera system
- [x] Status sidebar panel for wall-mounted displays
- [x] Layout persistence and cross-tab sync
- [x] MCP tool permission exemption
- [x] Multi-project directory scanning
- [x] Detached agent support (no live terminal required)
- [x] Accessibility: focus-visible, prefers-reduced-motion
- [x] Auto-launch script (Windows PowerShell)
- [x] No-cache headers for HTML (prevents stale bundle after rebuild)
- [x] Furniture asset loading in standalone server
