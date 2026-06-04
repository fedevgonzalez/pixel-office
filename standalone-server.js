// Standalone web server for Pixel Agents — no VS Code required.
// Usage: node standalone-server.js [workspace-path]
// Then open http://localhost:3300

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');
const { PNG } = require('pngjs');

// Load .env file if present (for GITHUB_TOKEN etc.)
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3300;
const SCAN_INTERVAL_MS = 5000;
const AUTO_DETECT_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours
const TOOL_DONE_DELAY_MS = 300;
const TEXT_IDLE_DELAY_MS = 5000;
const PERMISSION_TIMER_DELAY_MS = 7000;
const PERMISSION_SLOW_TIMER_DELAY_MS = 60_000; // longer grace period for tools that legitimately run long
const IDLE_REST_MS = 2 * 60 * 1000;   // 2 min idle → resting (walk to break room)
const IDLE_LEAVE_MS = 30 * 60 * 1000; // 30 min idle → leave office
const IDLE_CHECK_INTERVAL_MS = 30000;  // check every 30s
const BASH_CMD_MAX = 30;
const TASK_DESC_MAX = 40;
const PNG_ALPHA_THRESHOLD = 128;
// Community repo. The old pixel-office-layouts URL still works thanks to
// GitHub's automatic redirect, but we point at the canonical name so any
// future API quirks (rate-limit headers, etag) match the active repo.
const GALLERY_REPO_RAW_BASE = 'https://raw.githubusercontent.com/fedevgonzalez/pixel-office-community/main/';
const GALLERY_REPO_API_BASE = 'https://api.github.com/repos/fedevgonzalez/pixel-office-community/contents/';
const GALLERY_REPO_OWNER = 'fedevgonzalez';
const GALLERY_REPO_NAME = 'pixel-office-community';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_APP_CLIENT_ID = process.env.GITHUB_APP_CLIENT_ID || '';
const GITHUB_APP_CLIENT_SECRET = process.env.GITHUB_APP_CLIENT_SECRET || '';
const GALLERY_CACHE_TTL_MS = 5 * 60 * 1000;
let galleryCache = null; // { data, fetchedAt }

// ── OAuth session store (in-memory) ──────────────────────────
const crypto = require('crypto');
const oauthSessions = new Map(); // sessionId → { token, login, avatarUrl }

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=').trim();
  }
  return cookies;
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies['po_session'];
  return sid ? oauthSessions.get(sid) || null : null;
}

function githubApiRequest(method, apiPath, token, body) {
  const url = new URL(`https://api.github.com${apiPath}`);
  const postData = body ? JSON.stringify(body) : null;
  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method,
    headers: {
      'User-Agent': 'pixel-office-server',
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      ...(postData ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } : {}),
    },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try { resolve({ status: res.statusCode, data: JSON.parse(raw || '{}') }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function isLoopbackRequest(req) {
  const addr = (req.socket && req.socket.remoteAddress) || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

// Usage writes are allowed from loopback unconditionally (typical local-daemon
// case). Non-loopback callers must present PIXEL_OFFICE_USAGE_TOKEN; if the env
// var isn't set, remote writes are rejected.
function authorizeUsageWrite(req) {
  if (isLoopbackRequest(req)) return true;
  const expected = process.env.PIXEL_OFFICE_USAGE_TOKEN;
  if (!expected) return false;
  const got = req.headers['x-pixel-office-usage-token'];
  return typeof got === 'string' && got === expected;
}

// One inline metric of a usage source (e.g. a "5h"/"7d" quota window). Needs a
// label + primary; percent/color/secondary optional.
function sanitizeUsageMetric(m) {
  if (!m || typeof m !== 'object') return null;
  const label = typeof m.label === 'string' ? m.label.slice(0, 24) : null;
  const primary = typeof m.primary === 'string' ? m.primary.slice(0, 24) : null;
  if (!label || !primary) return null;
  const out = { label, primary };
  if (typeof m.percent === 'number' && Number.isFinite(m.percent)) out.percent = Math.max(0, Math.min(1, m.percent));
  if (typeof m.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(m.color)) out.color = m.color;
  if (typeof m.secondary === 'string') out.secondary = m.secondary.slice(0, 48);
  return out;
}

function sanitizeUsageSource(s) {
  if (!s || typeof s !== 'object') return null;
  const id = typeof s.id === 'string' ? s.id.slice(0, 64) : null;
  const label = typeof s.label === 'string' ? s.label.slice(0, 64) : null;
  if (!id || !label) return null;
  const out = { id, label };
  if (Array.isArray(s.metrics)) {
    const metrics = s.metrics.map(sanitizeUsageMetric).filter(Boolean).slice(0, 6);
    if (metrics.length) out.metrics = metrics;
  }
  const primary = typeof s.primary === 'string' ? s.primary.slice(0, 64) : null;
  if (primary) out.primary = primary;
  // A source must carry at least one renderable value.
  if (!out.metrics && !out.primary) return null;
  if (typeof s.secondary === 'string') out.secondary = s.secondary.slice(0, 96);
  if (typeof s.percent === 'number' && Number.isFinite(s.percent)) {
    out.percent = Math.max(0, Math.min(1, s.percent));
  }
  if (typeof s.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(s.color)) out.color = s.color;
  // Optional display order — lower sorts first; missing = 0 (top group).
  // Producers push a source DOWN with a positive order (or up with negative).
  if (typeof s.order === 'number' && Number.isFinite(s.order)) out.order = s.order;
  return out;
}

// Per-agent context-window occupancy, sanitized from a reporter message.
// `pct` is the fraction [0,1]; tokens/limit are optional for a "X / Y" label.
// Returns null when there's no usable percentage.
function sanitizeAgentContext(msg) {
  if (!msg || typeof msg.pct !== 'number' || !Number.isFinite(msg.pct)) return null;
  const out = { pct: Math.max(0, Math.min(1, msg.pct)) };
  if (typeof msg.tokens === 'number' && Number.isFinite(msg.tokens)) out.tokens = Math.max(0, Math.round(msg.tokens));
  if (typeof msg.limit === 'number' && Number.isFinite(msg.limit)) out.limit = Math.max(0, Math.round(msg.limit));
  return out;
}

function usageKey(owner, id) {
  return JSON.stringify([owner, id]);
}

// Replace all of `owner`'s usage sources with the sanitized incoming set.
// Returns the number of sources accepted.
function setUsageForOwner(owner, rawSources) {
  const now = Date.now();
  for (const [k, v] of usageByKey) {
    if (v.owner === owner) usageByKey.delete(k);
  }
  let n = 0;
  for (const raw of Array.isArray(rawSources) ? rawSources : []) {
    const s = sanitizeUsageSource(raw);
    if (!s) continue;
    s.owner = owner;
    s.updatedAt = now;
    usageByKey.set(usageKey(owner, s.id), s);
    if (++n >= USAGE_MAX_SOURCES) break;
  }
  usageUpdatedAt = now;
  return n;
}

function clearUsageForOwner(owner) {
  let removed = 0;
  for (const [k, v] of usageByKey) {
    if (v.owner === owner) { usageByKey.delete(k); removed++; }
  }
  if (removed) usageUpdatedAt = Date.now();
  return removed;
}

// Live (non-stale) sources, shaped for the client. Source ids are namespaced
// with the owner only when more than one owner is present, so a single-machine
// setup keeps clean ids ("claude-context") while multi-machine stays unique.
function getActiveUsageSources() {
  const now = Date.now();
  const live = [];
  for (const v of usageByKey.values()) {
    if (now - v.updatedAt >= USAGE_STALE_MS) continue;
    live.push(v);
  }
  // Deterministic order — reporters re-insert their sources on every update
  // (Map insertion order would reshuffle the panel constantly). Sort by the
  // producer-defined `order` (missing = 0), then label, then id.
  live.sort((a, b) =>
    ((a.order ?? 0) - (b.order ?? 0)) ||
    a.label.localeCompare(b.label) ||
    a.id.localeCompare(b.id),
  );
  const multiOwner = new Set(live.map((s) => s.owner)).size > 1;
  return live.map((s) => {
    const out = { id: multiOwner ? `${s.owner}:${s.id}` : s.id, label: s.label, updatedAt: s.updatedAt };
    if (s.metrics !== undefined) out.metrics = s.metrics;
    if (s.primary !== undefined) out.primary = s.primary;
    if (s.secondary !== undefined) out.secondary = s.secondary;
    if (s.percent !== undefined) out.percent = s.percent;
    if (s.color !== undefined) out.color = s.color;
    return out;
  });
}

// Local community-repo path for development (fallback used when GitHub is
// unreachable or the repo is private). Checks the new pixel-office-community
// path first, then falls back to the historical pixel-office-layouts path
// for unmigrated dev clones.
const GALLERY_LOCAL_DIR = (() => {
  const candidates = [
    path.join(__dirname, '..', 'pixel-office-community'),
    path.join(__dirname, '..', 'pixel-office-layouts'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
})();

function fetchFromGitHub(urlPath) {
  // When a token is available, use the GitHub API (works for private repos)
  if (GITHUB_TOKEN) {
    const apiUrl = new URL(GALLERY_REPO_API_BASE + urlPath);
    const options = {
      hostname: apiUrl.hostname,
      path: apiUrl.pathname + '?ref=main',
      headers: {
        'User-Agent': 'pixel-office-server',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.raw+json',
      },
    };
    return new Promise((resolve, reject) => {
      https.get(options, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          const localPath = path.join(GALLERY_LOCAL_DIR, urlPath);
          if (fs.existsSync(localPath)) {
            console.log(`[gallery] GitHub API ${res.statusCode}, serving from local: ${localPath}`);
            resolve(fs.readFileSync(localPath));
          } else {
            reject(new Error(`GitHub API ${res.statusCode}`));
          }
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  // No token: use raw.githubusercontent.com (public repos only)
  const url = GALLERY_REPO_RAW_BASE + urlPath;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (!loc) { reject(new Error('Redirect without location')); return; }
        https.get(loc, (r2) => {
          const chunks = [];
          r2.on('data', (c) => chunks.push(c));
          r2.on('end', () => resolve(Buffer.concat(chunks)));
          r2.on('error', reject);
        }).on('error', reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        const localPath = path.join(GALLERY_LOCAL_DIR, urlPath);
        if (fs.existsSync(localPath)) {
          console.log(`[gallery] GitHub 404, serving from local: ${localPath}`);
          resolve(fs.readFileSync(localPath));
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

const PERMISSION_EXEMPT_TOOLS = new Set([
  'Task', 'AskUserQuestion', 'ToolSearch',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskUpdate', 'TaskStop',
  // These tools can run for a long time without needing approval
  'Agent', 'WebFetch', 'WebSearch',
]);
// Tools that legitimately run long — use a slower permission timer instead of the default 7s
const PERMISSION_SLOW_TOOLS = new Set(['Bash']);
function isPermissionExempt(name) {
  return PERMISSION_EXEMPT_TOOLS.has(name) || name.startsWith('mcp__');
}

// --- Resolve projects root and dist dir ---
const workspacePath = process.argv[2] || null;
const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
const distDir = path.join(__dirname, 'dist');
// Vite outputs to dist/webview/. Assets (characters, pets, walls, etc.) are
// copied by Vite from webview-ui/public/ into dist/webview/. The historical
// dist/assets/ path was a holdover from the pre-Vite extension layout.
const assetsDir = path.join(distDir, 'webview', 'assets');

if (workspacePath) console.log(`Workspace hint: ${workspacePath}`);
console.log(`Scanning all projects under: ${projectsRoot}`);
console.log(`Dist dir: ${distDir}`);

// --- Agent state ---
let nextAgentId = 1;
const agents = new Map();
const waitingTimers = new Map();
const permissionTimers = new Map();
const knownFiles = new Set();
const skippedFiles = new Map(); // file -> mtimeMs when skipped
let wsClients = [];
// Cache of per-pet runtime state (walk/idle/sit/sleep/play) sent by the
// client periodically via `petStatesSnapshot`. Exposed in /api/layout so the
// narration bridge can skip pets that are asleep without subscribing to
// per-transition events.
const petRuntimeStates = new Map(); // uid → state string
let petRuntimeStatesUpdatedAt = 0;
// Usage panel state — populated by reporters over /ws/report (usage-report)
// or external posters via POST /api/usage. Pixel-office stays generic: sources
// are opaque records the producer defines (e.g. "Claude 87%", "Codex 6%").
// Sources are keyed by a JSON `[owner, id]` key so multiple producers (one per
// reporter machine, plus the 'http' REST path) don't clobber each other; each
// carries `owner` (for per-reporter cleanup on disconnect) and `updatedAt`
// (sources older than USAGE_STALE_MS are filtered out so a dead producer
// doesn't leave stale data on the kiosk forever).
const USAGE_STALE_MS = 5 * 60 * 1000;
const USAGE_MAX_SOURCES = 8; // per owner
const USAGE_MAX_BODY_BYTES = 16 * 1024;
const usageByKey = new Map(); // a JSON `[owner, id]` key -> { ...source, owner, updatedAt }
let usageUpdatedAt = 0;
const clientLastPong = new Map(); // ws -> timestamp of last pong
const WS_PING_INTERVAL_MS = 15000;
const WS_PONG_STALE_MS = 30000;

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wsClients) {
    try { ws.send(data); } catch {}
  }
}

// --- Folder name resolution ---
// Project dir hash: path separators (: \ /) replaced with dash
// e.g. "G--GitHub-pixel-office" from "G:\GitHub\pixel-office"
// Uses DFS with early pruning: each dash is a potential path separator.
// We recurse only when an intermediate path exists as a directory, so invalid
// branches are cut early and all combinations are implicitly tried.
function resolveFolderName(hashName) {
  const isWin = process.platform === 'win32';
  const sep = isWin ? '\\' : '/';
  let prefix, rest;
  if (isWin) {
    const m = hashName.match(/^([a-zA-Z])--(.*)$/);
    if (!m) return hashName;
    prefix = m[1] + ':' + sep;
    rest = m[2];
  } else {
    if (!hashName.startsWith('-')) return hashName;
    prefix = sep;
    rest = hashName.slice(1);
  }
  function search(dir, remaining) {
    for (let i = 1; i <= remaining.length; i++) {
      const isDash = i < remaining.length && remaining[i] === '-';
      const isEnd = i === remaining.length;
      if (!isDash && !isEnd) continue;
      const component = remaining.slice(0, i);
      const fullPath = dir + component;
      if (isEnd) {
        if (fs.existsSync(fullPath)) return path.basename(fullPath);
      } else {
        try {
          if (fs.statSync(fullPath).isDirectory()) {
            const found = search(fullPath + sep, remaining.slice(i + 1));
            if (found) return found;
          }
        } catch {}
      }
    }
    return null;
  }
  const exact = search(prefix, rest);
  if (exact) return exact;
  // Fallback: find the deepest valid directory prefix in the hash and return
  // everything after it as a best-guess name (handles moved/deleted projects).
  let bestGuess = null;
  function deepestPrefix(dir, remaining) {
    for (let i = 1; i < remaining.length; i++) {
      if (remaining[i] !== '-') continue;
      const component = remaining.slice(0, i);
      const fullPath = dir + component;
      try {
        if (fs.statSync(fullPath).isDirectory()) {
          const next = remaining.slice(i + 1);
          if (bestGuess === null || next.length < bestGuess.length) bestGuess = next;
          deepestPrefix(fullPath + sep, next);
        }
      } catch {}
    }
  }
  deepestPrefix(prefix, rest);
  // Only clean fallback results — if the path resolved exactly we have the real name already.
  const fallback = bestGuess || hashName;
  return fallback
    .replace(/^Local-Sites-/i, '')
    .replace(/-app-public$/i, '');
}

// --- Tool status formatting ---
function formatToolStatus(toolName, input) {
  const base = (p) => typeof p === 'string' ? path.basename(p) : '';
  switch (toolName) {
    case 'Read': return `Reading ${base(input.file_path)}`;
    case 'Edit': return `Editing ${base(input.file_path)}`;
    case 'Write': return `Writing ${base(input.file_path)}`;
    case 'Bash': {
      const cmd = (input.command || '');
      return `Running: ${cmd.length > BASH_CMD_MAX ? cmd.slice(0, BASH_CMD_MAX) + '\u2026' : cmd}`;
    }
    case 'Glob': return 'Searching files';
    case 'Grep': return 'Searching code';
    case 'WebFetch': return 'Fetching web content';
    case 'WebSearch': return 'Searching the web';
    case 'Task': {
      const desc = typeof input.description === 'string' ? input.description : '';
      return desc ? `Subtask: ${desc.length > TASK_DESC_MAX ? desc.slice(0, TASK_DESC_MAX) + '\u2026' : desc}` : 'Running subtask';
    }
    case 'AskUserQuestion': return 'Waiting for your answer';
    default: {
      // Strip MCP prefix: mcp__server-name__tool_name → tool_name
      const display = toolName.startsWith('mcp__') ? toolName.replace(/^mcp__.+?__/, '') : toolName;
      return `Using ${display}`;
    }
  }
}

// --- Timer management ---
function cancelTimer(map, id) {
  const t = map.get(id);
  if (t) { clearTimeout(t); map.delete(id); }
}

function removeAgent(id, reason) {
  const agent = agents.get(id);
  if (!agent) return;
  if (agent._watcher) { try { agent._watcher.close(); } catch {} }
  if (agent._pollInterval) clearInterval(agent._pollInterval);
  cancelTimer(waitingTimers, id);
  cancelTimer(permissionTimers, id);
  agents.delete(id);
  broadcast({ type: 'agentClosed', id });
  console.log(`Agent ${id} ${reason || 'removed'}`);
}

function clearAgentActivity(agent, agentId) {
  agent.activeToolIds.clear();
  agent.activeToolStatuses.clear();
  agent.activeToolNames.clear();
  agent.activeSubagentToolIds.clear();
  agent.activeSubagentToolNames.clear();
  if (agent.replayedToolIds) agent.replayedToolIds.clear();
  agent.isWaiting = false;
  agent.permissionSent = false;
  cancelTimer(permissionTimers, agentId);
  broadcast({ type: 'agentToolsClear', id: agentId });
  broadcast({ type: 'agentStatus', id: agentId, status: 'active' });
}

function startWaitingTimer(agentId, delayMs) {
  cancelTimer(waitingTimers, agentId);
  const t = setTimeout(() => {
    waitingTimers.delete(agentId);
    const agent = agents.get(agentId);
    if (agent) agent.isWaiting = true;
    broadcast({ type: 'agentStatus', id: agentId, status: 'waiting' });
  }, delayMs);
  waitingTimers.set(agentId, t);
}

function startPermissionTimer(agentId) {
  const agent = agents.get(agentId);
  if (agent && agent.permissionMode === 'bypassPermissions') return;
  cancelTimer(permissionTimers, agentId);

  // Pick the appropriate delay — use the slow timer if any active tool is a slow tool (e.g. Bash)
  let hasSlow = false;
  for (const toolId of agent.activeToolIds) {
    if (PERMISSION_SLOW_TOOLS.has(agent.activeToolNames.get(toolId) || '')) { hasSlow = true; break; }
  }
  const delay = hasSlow ? PERMISSION_SLOW_TIMER_DELAY_MS : PERMISSION_TIMER_DELAY_MS;

  const t = setTimeout(() => {
    permissionTimers.delete(agentId);
    const agent = agents.get(agentId);
    if (!agent) return;
    let hasNonExempt = false;
    for (const toolId of agent.activeToolIds) {
      if (!isPermissionExempt(agent.activeToolNames.get(toolId) || '')) {
        hasNonExempt = true; break;
      }
    }
    const stuckSubs = [];
    for (const [parentToolId, subNames] of agent.activeSubagentToolNames) {
      for (const [, toolName] of subNames) {
        if (!isPermissionExempt(toolName)) {
          stuckSubs.push(parentToolId); hasNonExempt = true; break;
        }
      }
    }
    if (hasNonExempt) {
      agent.permissionSent = true;
      broadcast({ type: 'agentToolPermission', id: agentId });
      for (const ptid of stuckSubs) {
        broadcast({ type: 'subagentToolPermission', id: agentId, parentToolId: ptid });
      }
    }
  }, delay);
  permissionTimers.set(agentId, t);
}

// --- Transcript processing (mirrors transcriptParser.ts) ---
function processLine(agentId, line) {
  const agent = agents.get(agentId);
  if (!agent) return;
  const replaying = agent.isReplaying;
  try {
    const record = JSON.parse(line);
    if (record.type === 'assistant' && Array.isArray(record.message?.content)) {
      const blocks = record.message.content;
      const hasToolUse = blocks.some(b => b.type === 'tool_use');
      if (hasToolUse) {
        if (!replaying) cancelTimer(waitingTimers, agentId);
        agent.isWaiting = false;
        agent.hadToolsInTurn = true;
        if (!replaying) broadcast({ type: 'agentStatus', id: agentId, status: 'active' });
        let hasNonExempt = false;
        for (const block of blocks) {
          if (block.type === 'tool_use' && block.id) {
            const toolName = block.name || '';
            const status = formatToolStatus(toolName, block.input || {});
            agent.activeToolIds.add(block.id);
            agent.activeToolStatuses.set(block.id, status);
            agent.activeToolNames.set(block.id, toolName);
            if (!isPermissionExempt(toolName)) hasNonExempt = true;
            if (!replaying) broadcast({ type: 'agentToolStart', id: agentId, toolId: block.id, status });
          }
        }
        if (hasNonExempt && !replaying) startPermissionTimer(agentId);
      } else if (blocks.some(b => b.type === 'text') && !agent.hadToolsInTurn) {
        if (!replaying) startWaitingTimer(agentId, TEXT_IDLE_DELAY_MS);
      }
    } else if (record.type === 'progress') {
      processProgress(agentId, record);
    } else if (record.type === 'user') {
      // Detect permission mode — if bypass, never show "needs approval"
      if (record.permissionMode) agent.permissionMode = record.permissionMode;
      const content = record.message?.content;
      if (Array.isArray(content)) {
        const hasToolResult = content.some(b => b.type === 'tool_result');
        if (hasToolResult) {
          for (const block of content) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              const tid = block.tool_use_id;
              if (agent.activeToolNames.get(tid) === 'Task') {
                agent.activeSubagentToolIds.delete(tid);
                agent.activeSubagentToolNames.delete(tid);
                if (!replaying) broadcast({ type: 'subagentClear', id: agentId, parentToolId: tid });
              }
              agent.activeToolIds.delete(tid);
              agent.activeToolStatuses.delete(tid);
              agent.activeToolNames.delete(tid);
              // Surface is_error so external bridges can react (empathy bubble, etc.).
              const isError = block.is_error === true;
              if (!replaying) setTimeout(() => broadcast({ type: 'agentToolDone', id: agentId, toolId: tid, isError }), TOOL_DONE_DELAY_MS);
            }
          }
          if (agent.activeToolIds.size === 0) agent.hadToolsInTurn = false;
        } else {
          if (!replaying) {
            cancelTimer(waitingTimers, agentId);
            clearAgentActivity(agent, agentId);
          } else {
            agent.activeToolIds.clear();
            agent.activeToolStatuses.clear();
            agent.activeToolNames.clear();
            agent.activeSubagentToolIds.clear();
            agent.activeSubagentToolNames.clear();
            agent.isWaiting = false;
            agent.permissionSent = false;
          }
          agent.hadToolsInTurn = false;
        }
      } else if (typeof content === 'string' && content.trim()) {
        // Detect /exit command (wrapped in <command-name> tags) as session termination
        if (content.trimStart().startsWith('<command-name>/exit</command-name>')) {
          agent.exitDetected = true;
          if (!replaying) {
            removeAgent(agentId);
            return;
          }
        }
        // Detect /clear command — placeholder for future actions (e.g. tidying animation)
        if (content.trimStart().startsWith('<command-name>/clear</command-name>')) {
          agent.clearDetected = true;
        }
        if (!replaying) {
          cancelTimer(waitingTimers, agentId);
          clearAgentActivity(agent, agentId);
        } else {
          agent.activeToolIds.clear();
          agent.activeToolStatuses.clear();
          agent.activeToolNames.clear();
          agent.activeSubagentToolIds.clear();
          agent.activeSubagentToolNames.clear();
          agent.isWaiting = false;
          agent.permissionSent = false;
        }
        agent.hadToolsInTurn = false;
      }
    } else if (record.type === 'system' && record.subtype === 'turn_duration') {
      if (!replaying) {
        cancelTimer(waitingTimers, agentId);
        cancelTimer(permissionTimers, agentId);
      }
      if (agent.activeToolIds.size > 0) {
        agent.activeToolIds.clear();
        agent.activeToolStatuses.clear();
        agent.activeToolNames.clear();
        agent.activeSubagentToolIds.clear();
        agent.activeSubagentToolNames.clear();
        if (!replaying) broadcast({ type: 'agentToolsClear', id: agentId });
      }
      agent.isWaiting = true;
      agent.permissionSent = false;
      agent.hadToolsInTurn = false;
      if (!replaying) broadcast({ type: 'agentStatus', id: agentId, status: 'waiting' });
    }
  } catch {}
}

function processProgress(agentId, record) {
  const agent = agents.get(agentId);
  if (!agent) return;
  const replaying = agent.isReplaying;
  const parentToolId = record.parentToolUseID;
  if (!parentToolId) return;
  const data = record.data;
  if (!data) return;
  if (data.type === 'bash_progress' || data.type === 'mcp_progress') {
    if (agent.activeToolIds.has(parentToolId) && !replaying) startPermissionTimer(agentId);
    return;
  }
  if (agent.activeToolNames.get(parentToolId) !== 'Task') return;
  const msg = data.message;
  if (!msg) return;
  const content = msg.message?.content;
  if (!Array.isArray(content)) return;
  if (msg.type === 'assistant') {
    let hasNonExempt = false;
    for (const block of content) {
      if (block.type === 'tool_use' && block.id) {
        const toolName = block.name || '';
        const status = formatToolStatus(toolName, block.input || {});
        let subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (!subTools) { subTools = new Set(); agent.activeSubagentToolIds.set(parentToolId, subTools); }
        subTools.add(block.id);
        let subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (!subNames) { subNames = new Map(); agent.activeSubagentToolNames.set(parentToolId, subNames); }
        subNames.set(block.id, toolName);
        if (!isPermissionExempt(toolName)) hasNonExempt = true;
        if (!replaying) broadcast({ type: 'subagentToolStart', id: agentId, parentToolId, toolId: block.id, status });
      }
    }
    if (hasNonExempt && !replaying) startPermissionTimer(agentId);
  } else if (msg.type === 'user') {
    for (const block of content) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        const subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (subTools) subTools.delete(block.tool_use_id);
        const subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (subNames) subNames.delete(block.tool_use_id);
        if (!replaying) {
          const tid = block.tool_use_id;
          setTimeout(() => broadcast({ type: 'subagentToolDone', id: agentId, parentToolId, toolId: tid }), 300);
        }
      }
    }
  }
}

// --- File reading ---
function readNewLines(agentId) {
  const agent = agents.get(agentId);
  if (!agent) return;
  const replaying = agent.isReplaying;
  try {
    const stat = fs.statSync(agent.jsonlFile);
    if (stat.size <= agent.fileOffset) return;
    const buf = Buffer.alloc(stat.size - agent.fileOffset);
    const fd = fs.openSync(agent.jsonlFile, 'r');
    fs.readSync(fd, buf, 0, buf.length, agent.fileOffset);
    fs.closeSync(fd);
    agent.fileOffset = stat.size;
    const text = agent.lineBuffer + buf.toString('utf-8');
    const lines = text.split('\n');
    agent.lineBuffer = lines.pop() || '';
    const hasLines = lines.some(l => l.trim());
    if (hasLines && !replaying) {
      agent.lastDataMs = Date.now();
      // Wake from resting state if new data arrives
      if (agent.isResting) {
        agent.isResting = false;
        broadcast({ type: 'agentStatus', id: agentId, status: 'active' });
      }
      cancelTimer(waitingTimers, agentId);
      cancelTimer(permissionTimers, agentId);
      if (agent.permissionSent) {
        agent.permissionSent = false;
        broadcast({ type: 'agentToolPermissionClear', id: agentId });
      }
    }
    for (const line of lines) {
      if (!line.trim()) continue;
      processLine(agentId, line);
    }
  } catch {}
}

function startFileWatching(agentId, filePath) {
  try {
    const watcher = fs.watch(filePath, () => readNewLines(agentId));
    const agent = agents.get(agentId);
    if (agent) agent._watcher = watcher;
  } catch {}
  const interval = setInterval(() => {
    if (!agents.has(agentId)) { clearInterval(interval); return; }
    readNewLines(agentId);
  }, 1000);
  const agent = agents.get(agentId);
  if (agent) agent._pollInterval = interval;
}

// --- PNG loading (mirrors assetLoader.ts) ---
function loadPng(filePath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(new PNG())
      .on('parsed', function () { resolve(this); })
      .on('error', reject);
  });
}

/** Nearest-neighbor upscale of a SpriteData (2D array of '' | hex) by integer factor. */
function upscaleSpriteData(sprite, factor) {
  if (factor <= 1) return sprite;
  const out = [];
  for (const row of sprite) {
    const upRow = [];
    for (const cell of row) for (let i = 0; i < factor; i++) upRow.push(cell);
    for (let i = 0; i < factor; i++) out.push(upRow.slice());
  }
  return out;
}

/**
 * Find the smallest axis-aligned rect that covers every non-transparent pixel
 * in the PNG. Used so oversize/AI-generated spritesheets that come with heavy
 * transparent padding (e.g. ChatGPT's 1536×1024 output where the dogs occupy
 * the middle ~1000×700) can still be sliced into 5×3 cells aligned to the
 * actual content instead of the padded image edges.
 */
function computeOpaqueBboxPng(png) {
  let minX = png.width, maxX = -1, minY = png.height, maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const a = png.data[(y * png.width + x) * 4 + 3];
      if (a >= PNG_ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Chroma-key out a flat magenta background (#FF00FF ± tolerance) from a pet
 * PNG buffer, in-place. Pets are spec'd (see pets/PROMPTS.md) to fall back to
 * a bright magenta fill when the generator can't produce true alpha; without
 * this step the loader would treat that fill as part of the pet, inflating
 * every frame's bbox and shrinking the entire roster.
 *
 * Tolerance is loose enough to catch slight AI dithering (e.g. #FE01FE) but
 * tight enough to leave pink-nose details alone. We only apply the key when
 * a meaningful fraction of pixels match — guards against eating sprite
 * detail in PNGs that already use real alpha.
 *
 * Returns true if keying was applied.
 */
const PET_MAGENTA_KEY_MIN_FRACTION = 0.08; // ≥8% magenta pixels → it's a background
function isPetMagentaPixel(r, g, b) {
  return r > 230 && g < 60 && b > 230 && r + b > 470;
}
function chromaKeyPetMagenta(png) {
  const data = png.data;
  const totalPixels = data.length / 4;
  let magentaCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < PNG_ALPHA_THRESHOLD) continue;
    if (isPetMagentaPixel(data[i], data[i + 1], data[i + 2])) magentaCount++;
  }
  if (magentaCount === 0) return false;
  if (magentaCount / totalPixels < PET_MAGENTA_KEY_MIN_FRACTION) return false;
  for (let i = 0; i < data.length; i += 4) {
    if (isPetMagentaPixel(data[i], data[i + 1], data[i + 2])) {
      data[i + 3] = 0;
    }
  }
  return true;
}

/**
 * Detect the 5×3 frame grid in a pet sheet by projecting alpha onto each
 * axis. Works on any layout where:
 *   - Rows of frames are separated by transparent gaps
 *   - Within each row, frames are separated by transparent gaps
 * Returns a 3×5 array of tight bboxes ({ x, y, w, h }) or null if the
 * detection didn't resolve to exactly 3 rows × 5 columns (caller falls
 * back to uniform-grid slicing).
 *
 * MIN_PIXELS_PER_LINE filters out lone stray pixels so a 1-px speck in a
 * gap between rows/columns doesn't merge two bands.
 */
function detectPetFrameGrid(png) {
  const W = png.width, H = png.height;
  const MIN_PIXELS_PER_ROW = Math.max(2, Math.floor(W * 0.005));
  const MIN_PIXELS_PER_COL = Math.max(2, Math.floor(H * 0.005));

  // Per-row opaque count
  const rowCount = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    let n = 0;
    const base = y * W * 4 + 3;
    for (let x = 0; x < W; x++) {
      if (png.data[base + x * 4] >= PNG_ALPHA_THRESHOLD) n++;
    }
    rowCount[y] = n;
  }
  const rowBands = findBands(rowCount, MIN_PIXELS_PER_ROW);
  if (rowBands.length !== 3) return null;

  const grid = [];
  for (const rb of rowBands) {
    // Per-column opaque count, restricted to this row band
    const colCount = new Int32Array(W);
    for (let y = rb.lo; y <= rb.hi; y++) {
      const base = y * W * 4 + 3;
      for (let x = 0; x < W; x++) {
        if (png.data[base + x * 4] >= PNG_ALPHA_THRESHOLD) colCount[x]++;
      }
    }
    const colBands = findBands(colCount, MIN_PIXELS_PER_COL);
    if (colBands.length !== 5) return null;
    const row = [];
    for (const cb of colBands) {
      // Tight bbox inside (rb × cb)
      let x0 = cb.hi, x1 = cb.lo, y0 = rb.hi, y1 = rb.lo;
      for (let y = rb.lo; y <= rb.hi; y++) {
        for (let x = cb.lo; x <= cb.hi; x++) {
          if (png.data[(y * W + x) * 4 + 3] >= PNG_ALPHA_THRESHOLD) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      row.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Detect 7 tile bboxes in a floor sheet PNG that has padded / framed layouts.
 *
 * AI image generators (ChatGPT, etc.) interpret "tile sheet" as a poster of
 * separate framed tile samples on a near-white background, not the tight 7:1
 * strip we ask for. This function chroma-keys near-white pixels as background,
 * projects the remaining content onto the X axis to find 7 column bands, then
 * returns one tight bbox per band.
 *
 * Returns null if exactly 7 bands cannot be found (caller falls back to
 * uniform width/7 slicing).
 */
function detectFloorCellBboxes(png) {
  const W = png.width, H = png.height;
  const isContent = (x, y) => {
    const idx = (y * W + x) * 4;
    const r = png.data[idx], g = png.data[idx + 1], b = png.data[idx + 2], a = png.data[idx + 3];
    if (a < PNG_ALPHA_THRESHOLD) return false;          // transparent → bg
    if (r > 235 && g > 235 && b > 235) return false;    // near-white → bg
    return true;
  };

  const MIN_PER_COL = Math.max(3, Math.floor(H * 0.02));
  const colCount = new Int32Array(W);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (isContent(x, y)) colCount[x]++;
    }
  }
  const colBands = findBands(colCount, MIN_PER_COL);
  if (colBands.length !== 7) return null;

  const bboxes = [];
  for (const cb of colBands) {
    let x0 = cb.hi, x1 = cb.lo, y0 = H, y1 = 0;
    for (let y = 0; y < H; y++) {
      for (let x = cb.lo; x <= cb.hi; x++) {
        if (isContent(x, y)) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x0 > x1 || y0 > y1) return null; // empty band — bail
    bboxes.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return bboxes;
}

function findBands(counts, threshold) {
  const bands = [];
  const len = counts.length;
  let i = 0;
  while (i < len) {
    while (i < len && counts[i] < threshold) i++;
    if (i >= len) break;
    const lo = i;
    while (i < len && counts[i] >= threshold) i++;
    bands.push({ lo, hi: i - 1 });
  }
  return bands;
}

/**
 * Mode-resample a PNG region down to an outW × outH grid by taking the
 * most-frequent opaque color in each source block. This preserves body
 * fill colors when downsampling raster art with thin outlines — center-
 * pixel nearest-neighbor often samples the outline (continuous lines hit
 * every stride) and ends up with a mostly-outline result. The mode keeps
 * the dominant local color so the body shows through.
 *
 * Output pixel is transparent when more than half of the source block is
 * transparent.
 */
function pngToSpriteDataModeDownsampled(png, srcX, srcY, srcW, srcH, outW, outH) {
  const sprite = [];
  for (let row = 0; row < outH; row++) {
    const y0 = srcY + Math.floor((row * srcH) / outH);
    let y1 = srcY + Math.floor(((row + 1) * srcH) / outH);
    if (y1 <= y0) y1 = y0 + 1;
    const line = [];
    for (let col = 0; col < outW; col++) {
      const x0 = srcX + Math.floor((col * srcW) / outW);
      let x1 = srcX + Math.floor(((col + 1) * srcW) / outW);
      if (x1 <= x0) x1 = x0 + 1;
      const counts = new Map();
      let opaque = 0, total = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          total++;
          const idx = (y * png.width + x) * 4;
          if (png.data[idx + 3] < PNG_ALPHA_THRESHOLD) continue;
          opaque++;
          const r = png.data[idx];
          const g = png.data[idx + 1];
          const b = png.data[idx + 2];
          const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
          counts.set(hex, (counts.get(hex) || 0) + 1);
        }
      }
      if (opaque * 2 < total) {
        line.push('');
      } else {
        let bestHex = '', bestC = -1;
        for (const [hex, c] of counts) {
          if (c > bestC) { bestC = c; bestHex = hex; }
        }
        line.push(bestHex);
      }
    }
    sprite.push(line);
  }
  return sprite;
}

/**
 * Resample a per-frame bbox from the PNG into the PET_CELL grid, using a
 * SHARED `scale` (passed in by the caller). All frames of a variant get the
 * same scale so the pet doesn't visibly grow/shrink between walk frames.
 * Output is anchored bottom-center inside the PET_CELL × PET_CELL canvas.
 * Uses mode-resampling so thin outlines don't dominate the result.
 */
function resampleFrameBbox(png, bbox, scale, cellSize) {
  const tw = Math.max(1, Math.round(bbox.w * scale));
  const th = Math.max(1, Math.round(bbox.h * scale));
  const inner = pngToSpriteDataModeDownsampled(png, bbox.x, bbox.y, bbox.w, bbox.h, tw, th);
  const offsetX = Math.round((cellSize - tw) / 2);
  const offsetY = cellSize - th;
  const out = [];
  for (let r = 0; r < cellSize; r++) {
    out.push(new Array(cellSize).fill(''));
  }
  for (let r = 0; r < th; r++) {
    const dst = out[offsetY + r];
    if (!dst) continue;
    const src = inner[r];
    for (let c = 0; c < tw; c++) {
      const px = src[c];
      if (px) dst[offsetX + c] = px;
    }
  }
  return out;
}

/**
 * Quantize sprite cells to a shared palette so the result reads as proper
 * pixel art instead of a noisy raster downsample.
 *
 * The ChatGPT-style sources are rasterized illustrations: every pixel can be
 * a slightly different shade (we saw 813 unique colors in a 48×48 cell). The
 * solution is to build a frequency histogram across ALL cells of the variant,
 * keep the top N colors as the palette, and snap every pixel to its nearest
 * palette color in RGB space.
 *
 * Operates in-place on the array of sprite frames.
 */
/**
 * Return the top-N most frequent opaque colors across all frames/directions
 * of a variant. Used to populate the swatch UI without modifying the sprites.
 */
function topColors(framesByDir, n) {
  const counts = new Map();
  for (const dir of Object.values(framesByDir)) {
    for (const frame of dir) {
      for (const row of frame) {
        for (const px of row) {
          if (!px) continue;
          counts.set(px, (counts.get(px) || 0) + 1);
        }
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([hex]) => hex);
}

function quantizeFramesToPalette(framesByDir, paletteSize) {
  // 1. Count colors across all frames/directions.
  const counts = new Map();
  for (const dir of Object.values(framesByDir)) {
    for (const frame of dir) {
      for (const row of frame) {
        for (const px of row) {
          if (!px) continue;
          counts.set(px, (counts.get(px) || 0) + 1);
        }
      }
    }
  }
  if (counts.size <= paletteSize) return Array.from(counts.keys());
  // 2. Take top-N most frequent as palette anchors.
  const palette = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, paletteSize)
    .map(([hex]) => hex);
  const paletteRgb = palette.map(hexToRgb);
  // 3. Snap every pixel to nearest palette color (Euclidean RGB). Cache
  //    decisions so repeat colors don't pay the full search cost.
  const snapCache = new Map();
  const snap = (hex) => {
    let dst = snapCache.get(hex);
    if (dst !== undefined) return dst;
    const [r, g, b] = hexToRgb(hex);
    let best = palette[0]; let bestD = Infinity;
    for (let i = 0; i < paletteRgb.length; i++) {
      const [pr, pg, pb] = paletteRgb[i];
      const dr = r - pr, dg = g - pg, db = b - pb;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = palette[i]; }
    }
    snapCache.set(hex, best);
    return best;
  };
  for (const dir of Object.values(framesByDir)) {
    for (const frame of dir) {
      for (let r = 0; r < frame.length; r++) {
        for (let c = 0; c < frame[r].length; c++) {
          const px = frame[r][c];
          if (px) frame[r][c] = snap(px);
        }
      }
    }
  }
  return palette;
}

function hexToRgb(hex) {
  // hex is '#rrggbb'
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function pngToSpriteData(png, x, y, w, h) {
  const sprite = [];
  for (let row = 0; row < h; row++) {
    const line = [];
    for (let col = 0; col < w; col++) {
      const idx = ((y + row) * png.width + (x + col)) * 4;
      const a = png.data[idx + 3];
      if (a < PNG_ALPHA_THRESHOLD) { line.push(''); }
      else {
        const r = png.data[idx];
        const g = png.data[idx + 1];
        const b = png.data[idx + 2];
        line.push('#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1));
      }
    }
    sprite.push(line);
  }
  return sprite;
}

/**
 * Extract a source rect from `png` and resample it to an `outW × outH` SpriteData
 * by nearest-from-center sampling: each output pixel takes the color of the
 * source pixel at the center of its corresponding source block.
 *
 * When srcW === outW && srcH === outH this is equivalent to `pngToSpriteData`
 * (pixel-perfect). When the source rect is larger (e.g. ChatGPT renders pixel
 * art at 9.6× the logical grid), this preserves the most representative color
 * of each logical pixel without blending neighbors.
 */
function pngToSpriteDataResampled(png, srcX, srcY, srcW, srcH, outW, outH) {
  const sprite = [];
  const scaleX = srcW / outW;
  const scaleY = srcH / outH;
  for (let row = 0; row < outH; row++) {
    const line = [];
    const sy = srcY + Math.floor((row + 0.5) * scaleY);
    for (let col = 0; col < outW; col++) {
      const sx = srcX + Math.floor((col + 0.5) * scaleX);
      const idx = (sy * png.width + sx) * 4;
      const a = png.data[idx + 3];
      if (a < PNG_ALPHA_THRESHOLD) { line.push(''); }
      else {
        const r = png.data[idx];
        const g = png.data[idx + 1];
        const b = png.data[idx + 2];
        line.push('#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1));
      }
    }
    sprite.push(line);
  }
  return sprite;
}

// Resample png to (outW × visualScale) × (outH × visualScale) and anchor it
// bottom-center inside an outW × outH transparent canvas. Used for small decor
// items where the AI raster fills the whole canvas but visually the prop
// should sit smaller within its tile footprint.
function pngToSpriteDataScaled(png, outW, outH, visualScale) {
  const contentW = Math.max(1, Math.round(outW * visualScale));
  const contentH = Math.max(1, Math.round(outH * visualScale));
  const offsetX = Math.floor((outW - contentW) / 2);
  const offsetY = outH - contentH;
  const content = pngToSpriteDataResampled(png, 0, 0, png.width, png.height, contentW, contentH);
  const sprite = [];
  for (let row = 0; row < outH; row++) {
    const line = new Array(outW).fill('');
    const cRow = row - offsetY;
    if (cRow >= 0 && cRow < contentH) {
      for (let col = 0; col < contentW; col++) {
        line[offsetX + col] = content[cRow][col];
      }
    }
    sprite.push(line);
  }
  return sprite;
}

// Community-installed character sprites live here (downloaded via "Use this
// Character" from the gallery). Bundled chars keep their stable numeric
// indices; community chars are appended after them sorted by id, so existing
// layouts that reference bundled `charIdx` values keep working.
const INSTALLED_CHARS_DIR = path.join(os.homedir(), '.pixel-office', 'community-assets', 'characters');

// Community-installed props (downloaded via "Use this Prop"). Each entry is a
// (sprite.png, metadata.json) pair keyed by community id. The furniture loader
// merges these into the catalog sent to the webview so the editor toolbar
// exposes them alongside the bundled hardcoded set.
const INSTALLED_PROPS_DIR = path.join(os.homedir(), '.pixel-office', 'community-assets', 'props');
const TILE_PIXELS = 16;

async function loadCharacterSprites() {
  const bundledDir = path.join(assetsDir, 'characters');
  // Default sheet: 7×3 grid of 24×32 frames (walk_A, idle, walk_B, type_A,
  // type_B, read_A, read_B) across 3 directions (down, up, right). Total 168×96.
  // Legacy: 112×96 sheets (16×32 cells) are detected by dims and loaded as-is —
  // they render correctly side-by-side with new sprites since the renderer
  // anchors at bottom-center using each sprite's intrinsic width/height.
  // Accept both numeric IDs (legacy `char_0.png`, `char_1.png`, …) and
  // descriptive IDs (`char_professor.png`, `char_punk_grandma.png`, …).
  // Numeric IDs sort by number for stable backwards-compat ordering;
  // descriptive IDs append after numeric, sorted alphabetically.
  const bundled = fs.existsSync(bundledDir)
    ? fs.readdirSync(bundledDir)
        .map((name) => {
          const m = name.match(/^char_([a-z0-9_-]+)\.png$/i);
          if (!m) return null;
          const raw = m[1];
          const numeric = /^\d+$/.test(raw) ? Number(raw) : null;
          return { id: raw, numeric, file: path.join(bundledDir, name) };
        })
        .filter(Boolean)
        .sort((a, b) => {
          if (a.numeric !== null && b.numeric !== null) return a.numeric - b.numeric;
          if (a.numeric !== null) return -1;
          if (b.numeric !== null) return 1;
          return a.id.localeCompare(b.id);
        })
    : [];
  // Community files use `char_community_<id>.png` naming so they never collide
  // with bundled numeric ids. They're appended after bundled, sorted by id.
  const community = fs.existsSync(INSTALLED_CHARS_DIR)
    ? fs.readdirSync(INSTALLED_CHARS_DIR)
        .map((name) => {
          const m = name.match(/^char_community_([a-z0-9_-]+)\.png$/i);
          return m ? { id: m[1], file: path.join(INSTALLED_CHARS_DIR, name) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];
  if (bundled.length === 0 && community.length === 0) return null;
  const chars = [];
  for (const { file } of [...bundled, ...community]) {
    const png = await loadPng(file);
    // Strip a flat magenta background (#FF00FF) if the generator fell back to
    // it — see characters/PROMPTS.md. Same step pets use; harmless on real
    // alpha sheets because chromaKeyPetMagenta no-ops below the 8% threshold.
    chromaKeyPetMagenta(png);
    // Three size paths, detected by sheet dimensions:
    //   112 × 96  → legacy 16 × 32 cells (sprite cache upscales 3× on render)
    //   168 × 96  → native bump 24 × 32 cells
    //   432 × 288 → high-res 48 × 96 cells (matches TILE_SIZE=48 era)
    //   anything else → assume high-res 48 × 96 and resample per-cell so a
    //   ChatGPT raster (~1500×900) still works
    let cellW, cellH, label;
    if (png.width === 112 && png.height === 96) {
      cellW = 16; cellH = 32; label = '16×32 legacy';
    } else if (png.width === 168 && png.height === 96) {
      cellW = 24; cellH = 32; label = '24×32 native';
    } else {
      cellW = 48; cellH = 96; label = `${png.width}×${png.height} → 48×96 cells (resampled)`;
    }
    const directions = { down: [], up: [], right: [] };
    const dirNames = ['down', 'up', 'right'];
    const isExact = (png.width === 7 * cellW) && (png.height === 3 * cellH);
    const srcCellW = isExact ? cellW : Math.round(png.width / 7);
    const srcCellH = isExact ? cellH : Math.round(png.height / 3);
    for (let d = 0; d < 3; d++) {
      for (let f = 0; f < 7; f++) {
        const sprite = isExact
          ? pngToSpriteData(png, f * cellW, d * cellH, cellW, cellH)
          : pngToSpriteDataResampled(png, f * srcCellW, d * srcCellH, srcCellW, srcCellH, cellW, cellH);
        directions[dirNames[d]].push(sprite);
      }
    }
    chars.push(directions);
    console.log(`  char ${path.basename(file)}: ${label}`);
  }
  return chars;
}

// Where community-installed pet variants live (downloaded via "Use this Pet"
// from the community gallery). Loader checks this dir IN ADDITION to the
// bundled dist/webview/assets/pets/ so installed variants appear without
// rebuilding the app.
const INSTALLED_PETS_DIR = path.join(os.homedir(), '.pixel-office', 'community-assets', 'pets');

// Per-variant frame-mapping sidecar.
//
// AI-generated pet sheets (ChatGPT) don't always follow the 5×3 grid spec:
// row 3 may be back views instead of side profiles, idle frames may end up
// in wrong cells, etc. Drop a `<species>_<variant>.json` next to the PNG to
// remap source cells to logical slots without re-rendering the art.
//
// Slot order per direction: walkA, walkB, idle, sleepA, sleepB (cols 0..4)
// Direction order: down (row 0), up (row 1), right (row 2)
//
// Schema:
//   {
//     "sizeScale": 0.7,   // OPTIONAL multiplier on top of the global render scale
//                         // (1.0 = no shrink; <1 = smaller). Use to make a cat
//                         // visibly smaller than a shepherd when ChatGPT drew them
//                         // at similar sizes in the source PNGs.
//     "directions": {
//       "<dir>": { "useDirection": "<otherDir>" }
//         // copies ALL 5 slots from another direction's row
//       | {
//           "walkA":  { "col": 0, "row": 0 },
//           "walkB":  { "col": 1, "row": 0 },
//           "idle":   { "col": 2, "row": 0 },
//           "sleepA": { "col": 3, "row": 2 },
//           "sleepB": { "col": 4, "row": 2 }
//         }
//         // per-slot override — any missing slot falls back to default (col=slot, row=dir)
//     }
//   }
//
// All fields are optional; only override what you need.
const PET_DIR_NAMES = ['down', 'up', 'right'];
const PET_SLOT_NAMES = ['walkA', 'walkB', 'idle', 'sleepA', 'sleepB'];

function loadPetVariantConfig(pngPath) {
  const jsonPath = pngPath.replace(/\.png$/i, '.json');
  if (!fs.existsSync(jsonPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch (e) {
    console.warn(`  pet config ${path.basename(jsonPath)} invalid JSON: ${e.message}`);
    return null;
  }
}

function resolvePetCellCoords(dirIdx, slotIdx, config) {
  let srcCol = slotIdx, srcRow = dirIdx;
  const dirConfig = config?.directions?.[PET_DIR_NAMES[dirIdx]];
  if (!dirConfig) return { srcCol, srcRow };
  if (typeof dirConfig.useDirection === 'string') {
    const srcDir = PET_DIR_NAMES.indexOf(dirConfig.useDirection);
    if (srcDir >= 0) srcRow = srcDir;
    return { srcCol, srcRow };
  }
  const slotConfig = dirConfig[PET_SLOT_NAMES[slotIdx]];
  if (slotConfig && Number.isInteger(slotConfig.col) && Number.isInteger(slotConfig.row)) {
    srcCol = slotConfig.col;
    srcRow = slotConfig.row;
  }
  return { srcCol, srcRow };
}

async function loadPetSprites() {
  // Collect (filePath, source) pairs from both bundled and installed dirs.
  const bundledDir = path.join(assetsDir, 'pets');
  const sources = [];
  for (const dir of [bundledDir, INSTALLED_PETS_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.png')) continue;
      sources.push({ filePath: path.join(dir, f), filename: f, dir });
    }
  }
  if (sources.length === 0) return null;
  // Result: { [species]: { [variant]: { down: [...5], up: [...5], right: [...5] } } }
  // File naming: <species>_<variant>.png, e.g. dog_dachshund.png, cat_calico.png.
  // Default sheet: 5×3 grid of 32×32 frames. Legacy 80×48 sheets are upscaled 2×.
  // High-res ChatGPT-style sheets are bbox-trimmed then resampled to PET_CELL.
  // PET_CELL must match the client's TILE_SIZE so pet sprites render 1:1
  // at native tile size without further downsample / upscale.
  const PET_CELL = 48;
  const result = {};
  // PASS 1: load every PNG, detect grids, collect ALL frame bboxes so we
  // can compute one global scale. Per-variant scales used to make every
  // pet fill its 48×48 cell independently — which flattened relative
  // sizes (a shepherd ended up the same on-screen size as a cat). A
  // global scale based on the largest bbox across ALL variants preserves
  // the size hierarchy in the source art (shepherd > cat > hamster).
  const prepared = [];
  let globalMaxW = 0, globalMaxH = 0;
  for (const { filePath, filename } of sources) {
    const m = filename.match(/^([a-z]+)_([a-z0-9_-]+)\.png$/i);
    if (!m) continue;
    const [, species, variant] = m;
    try {
      const png = await loadPng(filePath);
      const variantConfig = loadPetVariantConfig(filePath);
      const isLegacy16 = png.width === 80 && png.height === 48;
      const isNative = png.width === 160 && png.height === 96;
      // Strip magenta background (if any) before grid detection / bbox
      // measurement — the spec promises this safety net for AI generators
      // that can't emit true alpha. No-op when the PNG already has alpha.
      if (!isLegacy16 && !isNative) chromaKeyPetMagenta(png);
      let grid = null;
      if (!isLegacy16 && !isNative) {
        grid = detectPetFrameGrid(png);
        if (grid) {
          for (const row of grid) for (const b of row) {
            if (b.w > globalMaxW) globalMaxW = b.w;
            if (b.h > globalMaxH) globalMaxH = b.h;
          }
        }
      }
      prepared.push({ filePath, filename, species, variant, png, variantConfig, isLegacy16, isNative, grid });
    } catch (e) {
      console.error(`  pet sprite ${filename} failed to load:`, e.message);
    }
  }
  // Most restrictive scale: largest pet fills the cell, smaller pets stay
  // proportionally smaller. If only one variant is present this still works.
  const globalScale = globalMaxW > 0 && globalMaxH > 0
    ? Math.min(PET_CELL / globalMaxW, PET_CELL / globalMaxH)
    : 1;
  // PASS 2: render each variant using the global scale.
  for (const { filePath: _fp, filename, species, variant, png, variantConfig, isLegacy16, isNative, grid } of prepared) {
    try {
      // Three loading paths:
      //   - Legacy 80×48: 16×16 cells, upscale 2× to 32×32 logical
      //   - Native 160×96: 32×32 cells, pixel-perfect 1:1
      //   - Anything else: detect the opaque-content bbox per frame (so transparent
      //     padding from AI-generated sheets like ChatGPT's 1536×1024 is trimmed)
      //     and resample with the GLOBAL scale computed in pass 1.
      const directions = { down: [], up: [], right: [] };
      const dirNames = ['down', 'up', 'right'];
      const detectionMethod = grid ? 'auto-bbox' : 'uniform';
      // Per-variant sizeScale multiplies the global scale — values <1 shrink
      // a specific pet (e.g. cats vs a shepherd when ChatGPT drew both at
      // similar source sizes). Clamp to (0, 1] to avoid upscaling past cell.
      const variantSizeScale = (() => {
        const v = variantConfig?.sizeScale;
        if (typeof v !== 'number' || !isFinite(v) || v <= 0) return 1;
        return Math.min(1, v);
      })();
      const sharedScale = globalScale * variantSizeScale;
      // Fallback path: slice by full image dims (used for legacy/native and
      // when auto-detection can't resolve exactly 3×5 bands).
      const srcCellW = isLegacy16 ? 16 : png.width / 5;
      const srcCellH = isLegacy16 ? 16 : png.height / 3;
      for (let d = 0; d < 3; d++) {
        for (let frame = 0; frame < 5; frame++) {
          // Resolve which source cell (col, row) to pull for this logical
          // (direction, slot). Default is identity (frame, d); the sidecar
          // JSON can remap when the art has frames in the wrong cells.
          const { srcCol, srcRow } = resolvePetCellCoords(d, frame, variantConfig);
          let sprite;
          if (grid) {
            sprite = resampleFrameBbox(png, grid[srcRow][srcCol], sharedScale, PET_CELL);
          } else if (isLegacy16) {
            // 16×16 legacy → scale 3× directly to TILE_SIZE=48.
            sprite = pngToSpriteData(png, srcCol * 16, srcRow * 16, 16, 16);
            sprite = upscaleSpriteData(sprite, PET_CELL / 16);
          } else if (isNative) {
            // Legacy native 32-cell → resample 32 → PET_CELL.
            sprite = pngToSpriteDataResampled(
              png, srcCol * 32, srcRow * 32, 32, 32, PET_CELL, PET_CELL,
            );
          } else {
            // Uniform-grid fallback when auto-detection fails.
            const sx = Math.round(srcCol * srcCellW);
            const sy = Math.round(srcRow * srcCellH);
            const sw = Math.round((srcCol + 1) * srcCellW) - sx;
            const sh = Math.round((srcRow + 1) * srcCellH) - sy;
            sprite = pngToSpriteDataResampled(
              png, sx, sy, sw, sh, PET_CELL, PET_CELL,
            );
          }
          directions[dirNames[d]].push(sprite);
        }
      }
      // Extract the top-6 colours for the swatch UI (used to render a chip
      // strip in the pet editor) but DON'T snap pixels to a tiny palette —
      // it was washing out body fill on dogs with thick outlines (the
      // outline dominated frequency counts, so palette anchors clustered
      // around outline shades and the body tones snapped to dark anchors).
      // Mode-resample already collapses each output pixel to a single source
      // colour, so each sprite naturally ends up with ~30-50 colours instead
      // of the raw 800+ — that's already clean pixel art without quantising.
      const palette = topColors(directions, 6);
      if (!result[species]) result[species] = {};
      result[species][variant] = { ...directions, palette };
      if (isLegacy16) console.log(`  pet ${filename}: 16×16 legacy upscaled 3× → ${PET_CELL}×${PET_CELL}`);
      else if (isNative) console.log(`  pet ${filename}: 160×96 native, resampled to ${PET_CELL}×${PET_CELL}`);
      else if (detectionMethod === 'auto-bbox') {
        let minW = Infinity, minH = Infinity, maxW = 0, maxH = 0;
        for (const row of grid) for (const b of row) {
          if (b.w < minW) minW = b.w;
          if (b.h < minH) minH = b.h;
          if (b.w > maxW) maxW = b.w;
          if (b.h > maxH) maxH = b.h;
        }
        const renderedW = Math.round(maxW * sharedScale), renderedH = Math.round(maxH * sharedScale);
        console.log(`  pet ${filename}: ${png.width}×${png.height} auto-detected 5×3 grid, frame bbox ${minW}–${maxW}×${minH}–${maxH} → renders at ${renderedW}×${renderedH} in ${PET_CELL}×${PET_CELL} cell`);
      } else console.log(`  pet ${filename}: ${png.width}×${png.height} uniform-grid fallback ${srcCellW.toFixed(1)}×${srcCellH.toFixed(1)} → ${PET_CELL}×${PET_CELL}`);
      if (variantConfig) {
        const dirs = Object.keys(variantConfig.directions || {});
        console.log(`    + sidecar config: remapped ${dirs.join(', ')}`);
      }
    } catch (e) {
      console.error(`  pet sprite ${filename} failed:`, e.message);
    }
  }
  return result;
}

// Load the full furniture catalog + sprite map sent to the webview at boot
// (and re-broadcast when a community prop is installed). Merges:
//   1. Bundled catalog (assetsDir/furniture-catalog.json + assetsDir/furniture/*.png)
//      — generated by scripts/5-export-assets.ts. May not exist in dev builds.
//   2. Community props (INSTALLED_PROPS_DIR/<id>.json + <id>.png) — installed via
//      the gallery. We derive catalog entries from each metadata.json with sane
//      defaults so contributors can ship a minimal metadata.
// The webview's buildDynamicCatalog APPENDS this list to its hardcoded catalog
// (instead of replacing it), so bundled hand-drawn furniture keeps working even
// when the community catalog is empty.
async function loadFurnitureAssets() {
  const catalog = [];
  const sprites = {};

  // 1) Bundled catalog
  const catalogFile = path.join(assetsDir, 'furniture-catalog.json');
  const furnitureDir = path.join(assetsDir, 'furniture');
  if (fs.existsSync(catalogFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(catalogFile, 'utf-8'));
      // The exporter wraps entries in { version, timestamp, assets: [...] }.
      // Older flows pass the array directly — handle both.
      const entries = Array.isArray(raw) ? raw : Array.isArray(raw.assets) ? raw.assets : [];
      for (const entry of entries) catalog.push(entry);
    } catch (e) {
      console.warn('  furniture-catalog.json malformed:', e.message);
    }
  }
  if (fs.existsSync(furnitureDir)) {
    for (const f of fs.readdirSync(furnitureDir)) {
      if (!f.endsWith('.png')) continue;
      const name = f.replace(/\.png$/, '');
      try {
        const png = await loadPng(path.join(furnitureDir, f));
        // AI-generated prop sheets ship with a solid #FF00FF magenta background
        // (true alpha is unreliable from the generator). chromaKeyPetMagenta
        // is gated by an 8% magenta-pixel threshold so hand-authored alpha
        // sheets pass through untouched.
        chromaKeyPetMagenta(png);
        const sidecarPath = path.join(furnitureDir, `${name}.json`);
        const meta = fs.existsSync(sidecarPath)
          ? (() => {
              try { return JSON.parse(fs.readFileSync(sidecarPath, 'utf-8')); }
              catch (e) { console.warn(`  bundled prop sidecar ${name}.json invalid: ${e.message}`); return {}; }
            })()
          : null;

        // Door sheets ship as a horizontal 1×3 strip: closed | open-north |
        // open-south (doors swing away from the approaching actor). The loader
        // slices the strip into 3 sprites: the closed entry is catalog-visible
        // (with isDoor/isPetDoor from the sidecar) and the open variants attach
        // to it client-side via groupId + state ('open_n' / 'open_s').
        // Doorway sentinel: PURE CYAN pixels in the open cells mark the doorway
        // opening. They are remapped here to the engine's doorway placeholder
        // (#171310), which the client repaints per placement with the floor
        // color of the room beyond — an open door shows the floor through it.
        if (meta && meta.doorStates === 3) {
          const d = png.data;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] >= PNG_ALPHA_THRESHOLD && d[i] < 90 && d[i + 1] > 180 && d[i + 2] > 180) {
              d[i] = 0x17; d[i + 1] = 0x13; d[i + 2] = 0x10;
            }
          }
        }
        if (meta && meta.doorStates === 3) {
          const srcCellW = Math.floor(png.width / 3);
          const srcCellH = png.height;
          const CLIENT_TILE_PX = 48;
          const footprintW = Number.isFinite(meta.footprintW) && meta.footprintW > 0
            ? meta.footprintW
            : Math.max(1, Math.round(srcCellW / TILE_PIXELS));
          const footprintH = Number.isFinite(meta.footprintH) && meta.footprintH > 0
            ? meta.footprintH
            : Math.max(1, Math.round(srcCellH / TILE_PIXELS));
          const outW = footprintW * CLIENT_TILE_PX;
          const outH = footprintH * CLIENT_TILE_PX;
          const states = [
            { state: 'closed', id: name,              sx: 0 },
            { state: 'open_n', id: `${name}_open_n`,  sx: srcCellW },
            { state: 'open_s', id: `${name}_open_s`,  sx: srcCellW * 2 },
          ];
          for (const { state, id, sx } of states) {
            if (catalog.some((e) => e.id === id)) continue;
            sprites[id] = pngToSpriteDataResampled(png, sx, 0, srcCellW, srcCellH, outW, outH);
            catalog.push({
              id,
              label: meta.label || meta.name || name,
              category: meta.category || 'misc',
              width: outW,
              height: outH,
              footprintW,
              footprintH,
              isDesk: false,
              groupId: name,
              state,
              ...(meta.canPlaceOnWalls ? { canPlaceOnWalls: true } : {}),
              ...(typeof meta.backgroundTiles === 'number' ? { backgroundTiles: meta.backgroundTiles } : {}),
              ...(meta.isPetDoor ? { isPetDoor: true } : meta.isDoor ? { isDoor: true } : {}),
            });
          }
          continue;
        }

        // AI-generated props ship as 2×2 rotation sheets (top-L=front, top-R=right,
        // bot-L=back, bot-R=left). Loader slices into 4 sprites and exposes them as
        // a rotation group: only the `_front` variant is catalog-visible; the editor's
        // groupId+orientation infra cycles through the other three on rotate.
        if (meta && meta.directions === 4) {
          const srcCellW = png.width >> 1;
          const srcCellH = png.height >> 1;
          // Sidecar's footprintW/H is the in-game tile footprint. Resample each
          // cell from raw raster (often ~500-1000 px) down to LOGICAL pixels
          // (footprint × client TILE_SIZE = 48 per tile) so the sprite renders
          // at the correct in-game scale instead of dwarfing characters.
          const CLIENT_TILE_PX = 48;
          const footprintW = Number.isFinite(meta.footprintW) && meta.footprintW > 0
            ? meta.footprintW
            : Math.max(1, Math.round(srcCellW / TILE_PIXELS));
          const footprintH = Number.isFinite(meta.footprintH) && meta.footprintH > 0
            ? meta.footprintH
            : Math.max(1, Math.round(srcCellH / TILE_PIXELS));
          const outW = footprintW * CLIENT_TILE_PX;
          const outH = footprintH * CLIENT_TILE_PX;
          const orientations = [
            { o: 'front', sx: 0,        sy: 0 },
            { o: 'right', sx: srcCellW, sy: 0 },
            { o: 'back',  sx: 0,        sy: srcCellH },
            { o: 'left',  sx: srcCellW, sy: srcCellH },
          ];
          for (const { o, sx, sy } of orientations) {
            const id = `${name}_${o}`;
            if (catalog.some((e) => e.id === id)) continue;
            sprites[id] = pngToSpriteDataResampled(png, sx, sy, srcCellW, srcCellH, outW, outH);
            catalog.push({
              id,
              label: meta.label || meta.name || name,
              category: meta.category || 'decor',
              width: outW,
              height: outH,
              footprintW,
              footprintH,
              isDesk: !!meta.isDesk,
              groupId: name,
              orientation: o,
              ...(meta.canPlaceOnSurfaces ? { canPlaceOnSurfaces: true } : {}),
              ...(meta.canPlaceOnWalls ? { canPlaceOnWalls: true } : {}),
              ...(meta.providesSurface ? { providesSurface: true } : {}),
              ...(typeof meta.backgroundTiles === 'number' ? { backgroundTiles: meta.backgroundTiles } : {}),
            });
          }
        } else {
          // Legacy single-perspective prop. Resample from raw AI raster
          // (often ~1000+ px) down to LOGICAL pixels (footprint × CLIENT_TILE_PX)
          // so the sprite renders at the correct in-game scale instead of
          // dwarfing characters. visualScale < 1 shrinks the content
          // and anchors it bottom-center inside the footprint canvas.
          const CLIENT_TILE_PX = 48;
          const footprintW = Number.isFinite(meta && meta.footprintW) && meta.footprintW > 0
            ? meta.footprintW
            : Math.max(1, Math.round(png.width / TILE_PIXELS));
          const footprintH = Number.isFinite(meta && meta.footprintH) && meta.footprintH > 0
            ? meta.footprintH
            : Math.max(1, Math.round(png.height / TILE_PIXELS));
          const outW = footprintW * CLIENT_TILE_PX;
          const outH = footprintH * CLIENT_TILE_PX;
          const visualScale = Number.isFinite(meta && meta.visualScale) && meta.visualScale > 0 && meta.visualScale <= 1
            ? meta.visualScale
            : 1;
          sprites[name] = visualScale < 1
            ? pngToSpriteDataScaled(png, outW, outH, visualScale)
            : pngToSpriteDataResampled(png, 0, 0, png.width, png.height, outW, outH);
          const hasInCatalog = catalog.some((e) => e.id === name);
          if (!hasInCatalog && meta) {
            catalog.push({
              id: name,
              label: meta.label || meta.name || name,
              category: meta.category || 'decor',
              width: outW,
              height: outH,
              footprintW,
              footprintH,
              isDesk: !!meta.isDesk,
              ...(meta.canPlaceOnSurfaces ? { canPlaceOnSurfaces: true } : {}),
              ...(meta.canPlaceOnWalls ? { canPlaceOnWalls: true } : {}),
              ...(meta.providesSurface ? { providesSurface: true } : {}),
              ...(typeof meta.backgroundTiles === 'number' ? { backgroundTiles: meta.backgroundTiles } : {}),
            });
          }
        }
      } catch (e) {
        console.warn(`  bundled prop sprite ${f} failed:`, e.message);
      }
    }
  }

  // 2) Community-installed props
  if (fs.existsSync(INSTALLED_PROPS_DIR)) {
    for (const f of fs.readdirSync(INSTALLED_PROPS_DIR)) {
      if (!f.endsWith('.png')) continue;
      const id = f.replace(/\.png$/, '');
      const pngPath = path.join(INSTALLED_PROPS_DIR, f);
      const metaPath = path.join(INSTALLED_PROPS_DIR, `${id}.json`);
      try {
        const png = await loadPng(pngPath);
        const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf-8')) : {};
        // Prefix the catalog id so community props never collide with bundled
        // ids. Sprite map key uses the same prefixed id.
        const catalogId = `community-${id}`;
        sprites[catalogId] = pngToSpriteData(png, 0, 0, png.width, png.height);
        catalog.push({
          id: catalogId,
          label: meta.name || id,
          category: meta.category || 'decor',
          width: png.width,
          height: png.height,
          footprintW: Number.isFinite(meta.footprintW) && meta.footprintW > 0
            ? meta.footprintW
            : Math.max(1, Math.round(png.width / TILE_PIXELS)),
          footprintH: Number.isFinite(meta.footprintH) && meta.footprintH > 0
            ? meta.footprintH
            : Math.max(1, Math.round(png.height / TILE_PIXELS)),
          isDesk: !!meta.isDesk,
          ...(meta.canPlaceOnSurfaces ? { canPlaceOnSurfaces: true } : {}),
          ...(meta.canPlaceOnWalls ? { canPlaceOnWalls: true } : {}),
          ...(meta.providesSurface ? { providesSurface: true } : {}),
          ...(typeof meta.backgroundTiles === 'number' ? { backgroundTiles: meta.backgroundTiles } : {}),
        });
      } catch (e) {
        console.warn(`  community prop ${f} failed:`, e.message);
      }
    }
  }

  return { catalog, sprites };
}

async function loadOneFloorSheet(file) {
  const png = await loadPng(file);
  const aspect = png.width / png.height;
  if (aspect < 5.5 || aspect > 8.5) {
    const bboxes = detectFloorCellBboxes(png);
    if (bboxes && bboxes.length === 7) {
      console.log(`  ${path.basename(file)}: detected 7 cells in ${png.width}×${png.height} padded canvas → resampling each to 48×48`);
      return bboxes.map((b) => pngToSpriteDataResampled(png, b.x, b.y, b.w, b.h, 48, 48));
    }
    console.warn(`  ${path.basename(file)}: aspect ${aspect.toFixed(2)}:1 is far from 7:1 and bbox detection failed; falling back to uniform width/7 slicing`);
  }
  const cellW = Math.round(png.width / 7);
  const cellH = png.height;
  const sprites = [];
  for (let i = 0; i < 7; i++) {
    sprites.push(pngToSpriteData(png, i * cellW, 0, cellW, cellH));
  }
  return sprites;
}

/**
 * Scan the assets dir for `floors.png` (the default theme) and any
 * `floors_<id>.png` (additional themes). Returns an array of
 * `{id, sprites}` themes, or null if nothing's there. The client picks
 * which theme to render via the editor's theme dropdown.
 */
async function loadFloorTiles() {
  if (!fs.existsSync(assetsDir)) return null;
  const matches = fs.readdirSync(assetsDir).filter((f) => /^floors(?:_[a-z0-9_-]+)?\.png$/i.test(f));
  if (matches.length === 0) return null;
  // Stable order: default first (if present), then alphabetical.
  matches.sort((a, b) => (a === 'floors.png' ? -1 : b === 'floors.png' ? 1 : a.localeCompare(b)));
  const themes = [];
  for (const f of matches) {
    const id = f === 'floors.png' ? 'default' : f.replace(/^floors_/, '').replace(/\.png$/i, '');
    try {
      const sprites = await loadOneFloorSheet(path.join(assetsDir, f));
      themes.push({ id, sprites });
    } catch (e) {
      console.warn(`  ${f} failed to load: ${e.message}`);
    }
  }
  return themes;
}

async function loadWallTiles() {
  const file = path.join(assetsDir, 'walls.png');
  if (!fs.existsSync(file)) return null;
  const png = await loadPng(file);
  // Walls are 4 cols × 4 rows. Detect cell size from sheet dims:
  //   64 × 128 → legacy 16×32 cells
  //   192 × 384 → native 48×96 cells (TILE_SIZE=48 era)
  const cellW = Math.round(png.width / 4);
  const cellH = Math.round(png.height / 4);
  const sprites = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      sprites.push(pngToSpriteData(png, col * cellW, row * cellH, cellW, cellH));
    }
  }
  return sprites;
}

function loadDefaultLayout() {
  const file = path.join(assetsDir, 'default-layout.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

const LAYOUT_DIR = path.join(os.homedir(), '.pixel-office');
const LAYOUT_FILE = path.join(LAYOUT_DIR, 'layout.json');
const SETTINGS_FILE = path.join(LAYOUT_DIR, 'settings.json');
const PET_TEMPLATES_FILE = path.join(LAYOUT_DIR, 'pet-templates.json');
// Phase D — custom themes live as one sidecar JSON per theme under themes/,
// mirroring how pet-templates are stored. id is namespaced 'custom:<slug>' on
// the client; the colon is not filesystem-safe so the on-disk name strips it.
const THEMES_DIR = path.join(LAYOUT_DIR, 'themes');

function loadLayout() {
  if (!fs.existsSync(LAYOUT_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(LAYOUT_FILE, 'utf-8')); } catch { return null; }
}

function saveLayout(layout) {
  try {
    if (!fs.existsSync(LAYOUT_DIR)) fs.mkdirSync(LAYOUT_DIR, { recursive: true });
    const tmp = LAYOUT_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(layout, null, 2), 'utf-8');
    fs.renameSync(tmp, LAYOUT_FILE);
    lastOwnWriteMs = Date.now();
    console.log('Layout saved to', LAYOUT_FILE);
  } catch (e) {
    console.error('Failed to save layout:', e.message);
  }
}

function loadSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) return { soundEnabled: true };
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); } catch { return { soundEnabled: true }; }
}

function loadPetTemplates() {
  if (!fs.existsSync(PET_TEMPLATES_FILE)) return { version: 1, templates: [] };
  try {
    const data = JSON.parse(fs.readFileSync(PET_TEMPLATES_FILE, 'utf-8'));
    if (!data || !Array.isArray(data.templates)) return { version: 1, templates: [] };
    return data;
  } catch { return { version: 1, templates: [] }; }
}

function savePetTemplates(data) {
  try {
    if (!fs.existsSync(LAYOUT_DIR)) fs.mkdirSync(LAYOUT_DIR, { recursive: true });
    const tmp = PET_TEMPLATES_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, PET_TEMPLATES_FILE);
  } catch (e) {
    console.error('Failed to save pet templates:', e.message);
  }
}

// --- Custom themes (Phase D) — sidecar files under ~/.pixel-office/themes/ ---

/** Map a namespaced theme id ('custom:my-yard') to a filesystem-safe filename.
 *  Returns null for an id that would escape the directory or contains unexpected
 *  characters. Keeps the server OSS-safe and path-traversal-proof. */
function themeIdToFile(id) {
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) return null;
  // Only allow the documented namespaced shape: a 'custom:' prefix + slug.
  if (!/^custom:[a-z0-9][a-z0-9_-]*$/i.test(id)) return null;
  const safe = id.replace(/^custom:/, '').replace(/[^a-z0-9_-]/gi, '');
  if (!safe) return null;
  return path.join(THEMES_DIR, `${safe}.json`);
}

/** Load every custom-theme sidecar into an array of presets (skips invalid). */
function loadThemes() {
  if (!fs.existsSync(THEMES_DIR)) return [];
  const out = [];
  let files;
  try { files = fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith('.json')); }
  catch { return []; }
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, f), 'utf-8'));
      if (data && typeof data.id === 'string' && typeof data.name === 'string') out.push(data);
    } catch (e) {
      console.warn(`  theme ${f} failed to load: ${e.message}`);
    }
  }
  // Stable order: by name, then id.
  out.sort((a, b) => (a.name || '').localeCompare(b.name || '') || a.id.localeCompare(b.id));
  return out;
}

/** Atomically write one custom-theme sidecar. Returns true on success. */
function saveTheme(preset) {
  if (!preset || typeof preset.id !== 'string') return false;
  const file = themeIdToFile(preset.id);
  if (!file) { console.warn('  refused to save theme with bad id:', preset.id); return false; }
  try {
    if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(preset, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    console.error('Failed to save theme:', e.message);
    return false;
  }
}

/** Delete one custom-theme sidecar. Returns true if it no longer exists. */
function deleteTheme(id) {
  const file = themeIdToFile(id);
  if (!file) return false;
  try { if (fs.existsSync(file)) fs.unlinkSync(file); return true; }
  catch (e) { console.error('Failed to delete theme:', e.message); return false; }
}

function saveSettings(settings) {
  try {
    if (!fs.existsSync(LAYOUT_DIR)) fs.mkdirSync(LAYOUT_DIR, { recursive: true });
    const tmp = SETTINGS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8');
    fs.renameSync(tmp, SETTINGS_FILE);
    console.log('Settings saved to', SETTINGS_FILE);
  } catch (e) {
    console.error('Failed to save settings:', e.message);
  }
}

// Watch layout file for external changes (cross-tab sync)
let lastOwnWriteMs = 0;
function watchLayoutFile() {
  const checkLayout = () => {
    // Skip if we just wrote it ourselves (within 2s)
    if (Date.now() - lastOwnWriteMs < 2000) return;
    const layout = loadLayout();
    if (layout) broadcast({ type: 'layoutLoaded', layout });
  };
  try {
    fs.watch(LAYOUT_FILE, () => {
      setTimeout(checkLayout, 100); // small delay for write to complete
    });
  } catch {}
  // Polling fallback (fs.watch unreliable on Windows)
  setInterval(() => {
    try {
      const stat = fs.statSync(LAYOUT_FILE);
      if (stat.mtimeMs > lastOwnWriteMs + 2000) {
        lastOwnWriteMs = stat.mtimeMs;
        checkLayout();
      }
    } catch {}
  }, 3000);
}

// --- Broadcast final state after replay ---
function broadcastReplayState(agentId) {
  const agent = agents.get(agentId);
  if (!agent) return;

  // Send active tool starts
  for (const toolId of agent.activeToolIds) {
    const status = agent.activeToolStatuses.get(toolId) || '';
    broadcast({ type: 'agentToolStart', id: agentId, toolId, status });
  }

  // Send active subagent tool starts
  for (const [parentToolId, subNames] of agent.activeSubagentToolNames) {
    for (const [toolId, toolName] of subNames) {
      const status = formatToolStatus(toolName, {});
      broadcast({ type: 'subagentToolStart', id: agentId, parentToolId, toolId, status });
    }
  }

  // Send waiting status if applicable
  if (agent.isWaiting) {
    broadcast({ type: 'agentStatus', id: agentId, status: 'waiting' });
  } else if (agent.activeToolIds.size > 0) {
    broadcast({ type: 'agentStatus', id: agentId, status: 'active' });
  }

  // Start permission timer for replayed tools — if a tool was stuck on permission
  // when the server started, this will detect it after the appropriate delay
  if (agent.activeToolIds.size > 0) {
    startPermissionTimer(agentId);
  }
}

// --- Remote reporter support ---
// Reporters connect via WebSocket and send JSONL lines from remote machines.
// Each reporter identifies with a machineId; we track remote agents separately.
const reporterClients = new Map(); // ws -> { machineId }
const remoteAgents = new Map(); // `${machineId}:${sessionId}` -> agentId

function handleReporterMessage(ws, msg) {
  const reporter = reporterClients.get(ws);
  if (!reporter) return;
  const { machineId } = reporter;
  const remoteKey = `${machineId}:${msg.sessionId}`;

  if (msg.type === 'session-start') {
    if (remoteAgents.has(remoteKey)) return; // already tracked
    const id = nextAgentId++;
    const folderName = msg.folderName || msg.sessionId || machineId;
    const agentType = msg.agentType || 'claude';
    const agent = {
      id, jsonlFile: `remote:${remoteKey}`, projectDir: '', fileOffset: 0, lineBuffer: '',
      activeToolIds: new Set(), activeToolStatuses: new Map(), activeToolNames: new Map(),
      activeSubagentToolIds: new Map(), activeSubagentToolNames: new Map(),
      isWaiting: false, permissionSent: false, hadToolsInTurn: false, exitDetected: false, clearDetected: false,
      isReplaying: true, folderName, machineId, remote: true, isSDK: !!msg.sdk,
      permissionMode: msg.sdk ? 'bypassPermissions' : undefined,
      lastDataMs: Date.now(), isResting: false, agentType,
    };
    agents.set(id, agent);
    remoteAgents.set(remoteKey, id);
    console.log(`Remote agent ${id} [${agentType}] from ${machineId}: ${folderName}`);
    broadcast({ type: 'agentCreated', id, folderName, agentType });
  } else if (msg.type === 'session-replay-done') {
    const agentId = remoteAgents.get(remoteKey);
    if (agentId == null) { console.log(`session-replay-done: unknown key ${remoteKey}`); return; }
    const agent = agents.get(agentId);
    if (agent) {
      agent.isReplaying = false;
      agent.replayedToolIds = new Set(agent.activeToolIds);
      console.log(`Agent ${agentId} (${agent.folderName}) replay done — ${agent.activeToolIds.size} active tools`);
      broadcastReplayState(agentId);
    }
  } else if (msg.type === 'session-line') {
    const agentId = remoteAgents.get(remoteKey);
    if (agentId == null) return;
    processLine(agentId, msg.line);
  } else if (msg.type === 'session-context') {
    // Per-session context-window occupancy, computed by the reporter (which
    // owns the tool-specific token reading). We just attach it to the agent
    // and fan it out so the sidebar can show it inline. Generic: pixel-office
    // doesn't know which tool the numbers came from.
    const agentId = remoteAgents.get(remoteKey);
    if (agentId == null) return;
    const agent = agents.get(agentId);
    if (!agent) return;
    const ctx = sanitizeAgentContext(msg);
    agent.context = ctx;
    if (ctx) broadcast({ type: 'agentContext', id: agentId, ...ctx });
    else broadcast({ type: 'agentContext', id: agentId, pct: null });
  } else if (msg.type === 'session-end') {
    const agentId = remoteAgents.get(remoteKey);
    if (agentId == null) return;
    removeAgent(agentId, `remote session ended (${machineId})`);
    remoteAgents.delete(remoteKey);
  } else if (msg.type === 'usage-report') {
    // Generic quota panel: the reporter composes opaque usage sources (e.g.
    // "<account> · 5h" → 49%). Keyed by machineId so each reporter owns its
    // set; sources older than USAGE_STALE_MS are dropped automatically.
    setUsageForOwner(machineId, msg.sources);
    broadcast({ type: 'usageUpdate', sources: getActiveUsageSources(), updatedAt: usageUpdatedAt });
  }
}

function cleanupReporter(ws) {
  const reporter = reporterClients.get(ws);
  if (!reporter) return;
  const { machineId } = reporter;
  for (const [remoteKey, agentId] of [...remoteAgents]) {
    if (remoteKey.startsWith(machineId + ':')) {
      removeAgent(agentId, `reporter disconnected (${machineId})`);
      remoteAgents.delete(remoteKey);
    }
  }
  if (clearUsageForOwner(machineId)) {
    broadcast({ type: 'usageUpdate', sources: getActiveUsageSources(), updatedAt: usageUpdatedAt });
  }
  reporterClients.delete(ws);
  console.log(`Reporter disconnected: ${machineId}`);
}

// --- Auto-detect active JSONL sessions ---
function scanAndAdoptAgents() {
  // Iterate over ALL subdirectories under projectsRoot
  let projectDirs;
  try {
    projectDirs = fs.readdirSync(projectsRoot)
      .map(d => path.join(projectsRoot, d))
      .filter(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
  } catch { return; }

  const now = Date.now();
  for (const projDir of projectDirs) {
    let files;
    try {
      files = fs.readdirSync(projDir).filter(f => f.endsWith('.jsonl')).map(f => path.join(projDir, f));
    } catch { continue; }

    for (const file of files) {
      if (knownFiles.has(file)) continue;
      let stat;
      try {
        stat = fs.statSync(file);
        // Re-evaluate previously skipped files if they have new data
        if (skippedFiles.has(file)) {
          if (stat.mtimeMs <= (skippedFiles.get(file) || 0)) continue;
          skippedFiles.delete(file);
        }
      } catch { continue; }

      // Skip files older than max age — no need to replay them
      if (now - stat.mtimeMs > AUTO_DETECT_MAX_AGE_MS) continue;

      // Replay recent files to check for /exit
      const tempAgent = {
        jsonlFile: file, projectDir: projDir, fileOffset: 0, lineBuffer: '',
        activeToolIds: new Set(), activeToolStatuses: new Map(), activeToolNames: new Map(),
        activeSubagentToolIds: new Map(), activeSubagentToolNames: new Map(),
        isWaiting: false, permissionSent: false, hadToolsInTurn: false, exitDetected: false, clearDetected: false,
        isReplaying: true,
      };
      const tempId = -999;
      tempAgent.id = tempId;
      agents.set(tempId, tempAgent);
      readNewLines(tempId);
      agents.delete(tempId);

      // Session is truly finished if /exit detected
      const isFinished = tempAgent.exitDetected;
      if (isFinished) {
        try {
          const skipStat = fs.statSync(file);
          skippedFiles.set(file, skipStat.mtimeMs);
        } catch {
          skippedFiles.set(file, Date.now());
        }
        console.log(`Skipped ${path.basename(file)} in ${path.basename(projDir)} (session exited)`);
        continue;
      }

      // Session is active — create a real agent
      knownFiles.add(file);
      const id = nextAgentId++;
      // Derive folder name: try to find the actual directory on disk
      // Hash format: path separators (: \ /) → dash (G:\GitHub\pixel-office → G--GitHub-pixel-office)
      const dirBasename = path.basename(projDir);
      const folderName = resolveFolderName(dirBasename);
      const agent = {
        ...tempAgent,
        id, isReplaying: false,
        replayedToolIds: new Set(tempAgent.activeToolIds),
        folderName,
        lastDataMs: Date.now(), isResting: false,
      };
      agents.set(id, agent);
      console.log(`Agent ${id}: detected ${path.basename(file)} in ${path.basename(projDir)}`);
      broadcast({ type: 'agentCreated', id, folderName: agent.folderName });
      broadcastReplayState(id);

      // Start watching for new content (all future reads broadcast normally)
      startFileWatching(id, file);
    }
  }
}

// --- Idle agent lifecycle (resting → leave) ---
function checkIdleAgents() {
  const now = Date.now();
  for (const [id, agent] of agents) {
    // Skip remote/SDK agents — they have their own lifecycle
    if (agent.remote) continue;
    const idleMs = now - (agent.lastDataMs || now);
    if (idleMs >= IDLE_LEAVE_MS) {
      removeAgent(id, `idle for ${Math.round(idleMs / 60000)}m — left the office`);
    } else if (idleMs >= IDLE_REST_MS && !agent.isResting) {
      agent.isResting = true;
      broadcast({ type: 'agentStatus', id, status: 'resting' });
      console.log(`Agent ${id} resting after ${Math.round(idleMs / 60000)}m idle`);
    }
  }
}

// --- WebSocket server (using ws library) ---
const WebSocket = require('ws');

async function handleClientMessage(ws, msg) {
  if (msg.type === 'webviewReady') {
    console.log('webviewReady received, sending assets...');
    // Send assets, layout, and existing agents
    try {
      const chars = await loadCharacterSprites();
      if (chars) ws.send(JSON.stringify({ type: 'characterSpritesLoaded', characters: chars }));
      console.log(`  characterSprites: ${chars ? 'sent' : 'skipped'}`);
    } catch (e) { console.error('  characterSprites error:', e.message); }
    try {
      const pets = await loadPetSprites();
      if (pets) ws.send(JSON.stringify({ type: 'petSpritesLoaded', pets }));
      const variantCount = pets ? Object.values(pets).reduce((sum, v) => sum + Object.keys(v).length, 0) : 0;
      console.log(`  petSprites: ${pets ? `sent (${variantCount} variant${variantCount === 1 ? '' : 's'})` : 'skipped'}`);
    } catch (e) { console.error('  petSprites error:', e.message); }
    try {
      const tpl = loadPetTemplates();
      ws.send(JSON.stringify({ type: 'petTemplatesLoaded', templates: tpl.templates || [] }));
      console.log(`  petTemplates: sent (${(tpl.templates || []).length})`);
    } catch (e) { console.error('  petTemplates error:', e.message); }
    try {
      const themes = loadThemes();
      ws.send(JSON.stringify({ type: 'themesLoaded', themes }));
      console.log(`  customThemes: sent (${themes.length})`);
    } catch (e) { console.error('  customThemes error:', e.message); }
    try {
      const floorThemes = await loadFloorTiles();
      if (floorThemes) ws.send(JSON.stringify({ type: 'floorTilesLoaded', themes: floorThemes }));
      console.log(`  floorTiles: ${floorThemes ? `sent ${floorThemes.length} theme(s) [${floorThemes.map((t) => t.id).join(', ')}]` : 'skipped (no floors.png)'}`);
    } catch (e) { console.error('  floorTiles error:', e.message); }
    try {
      const walls = await loadWallTiles();
      if (walls) ws.send(JSON.stringify({ type: 'wallTilesLoaded', sprites: walls }));
      console.log(`  wallTiles: ${walls ? 'sent' : 'skipped'}`);
    } catch (e) { console.error('  wallTiles error:', e.message); }

    // Furniture catalog + sprites (bundled + community-installed props)
    try {
      const { catalog, sprites } = await loadFurnitureAssets();
      ws.send(JSON.stringify({ type: 'furnitureAssetsLoaded', catalog, sprites }));
      console.log(`  furnitureAssets: sent (${catalog.length} items, ${Object.keys(sprites).length} sprites)`);
    } catch (e) { console.error('  furnitureAssets error:', e.message); }

    // Send persisted settings (day/night mode, hemisphere, sound)
    const settings = loadSettings();
    ws.send(JSON.stringify({ type: 'settingsLoaded', ...settings }));

    // Send existing agents BEFORE layout (webview buffers them until layoutLoaded)
    const agentIds = [...agents.keys()].sort((a, b) => a - b);
    const folderNames = {};
    for (const [aid, ag] of agents) {
      if (ag.folderName) folderNames[aid] = ag.folderName;
    }
    ws.send(JSON.stringify({ type: 'existingAgents', agents: agentIds, agentMeta: {}, folderNames }));
    console.log(`  existingAgents: sent (${agentIds.length} agents)`);

    // Send layout LAST — triggers adding buffered agents
    const layout = loadLayout() || loadDefaultLayout();
    ws.send(JSON.stringify({ type: 'layoutLoaded', layout }));
    console.log(`  layoutLoaded: sent (${layout ? 'from file' : 'null'})`);

    // Send current tool state for each agent (replay state was broadcast before client connected)
    for (const [agentId, agent] of agents) {
      for (const toolId of agent.activeToolIds) {
        const status = agent.activeToolStatuses.get(toolId) || '';
        ws.send(JSON.stringify({ type: 'agentToolStart', id: agentId, toolId, status }));
      }
      for (const [parentToolId, subNames] of agent.activeSubagentToolNames) {
        for (const [toolId, toolName] of subNames) {
          const status = formatToolStatus(toolName, {});
          ws.send(JSON.stringify({ type: 'subagentToolStart', id: agentId, parentToolId, toolId, status }));
        }
      }
      if (agent.isWaiting) {
        ws.send(JSON.stringify({ type: 'agentStatus', id: agentId, status: 'waiting' }));
      } else if (agent.activeToolIds.size > 0) {
        ws.send(JSON.stringify({ type: 'agentStatus', id: agentId, status: 'active' }));
      }
      // Replay current per-agent context so a freshly opened tab shows it
      // immediately instead of waiting for the next reporter tick.
      if (agent.context) {
        ws.send(JSON.stringify({ type: 'agentContext', id: agentId, ...agent.context }));
      }
    }
  } else if (msg.type === 'saveLayout') {
    if (msg.layout) {
      saveLayout(msg.layout);
      // Broadcast to all OTHER clients so kiosk tab updates
      for (const client of wsClients) {
        if (client !== ws) {
          try { client.send(JSON.stringify({ type: 'layoutLoaded', layout: msg.layout })); } catch {}
        }
      }
    }
  } else if (msg.type === 'saveSettings') {
    // Merge incoming fields into persisted settings and broadcast to all other clients
    const current = loadSettings();
    const merged = { ...current, ...msg.settings };
    saveSettings(merged);
    for (const client of wsClients) {
      if (client !== ws) {
        try { client.send(JSON.stringify({ type: 'settingsLoaded', ...merged })); } catch {}
      }
    }
  } else if (msg.type === 'savePetTemplate') {
    // Upsert by id; client always supplies an id (new or existing)
    const tpl = msg.template;
    if (tpl && tpl.id && tpl.name) {
      const data = loadPetTemplates();
      const idx = data.templates.findIndex((t) => t.id === tpl.id);
      const stored = { ...tpl, updatedAt: new Date().toISOString() };
      if (idx >= 0) data.templates[idx] = stored;
      else data.templates.push({ ...stored, createdAt: stored.updatedAt });
      savePetTemplates(data);
      // Broadcast to every connected webview (including sender, so its list refreshes)
      const payload = JSON.stringify({ type: 'petTemplatesLoaded', templates: data.templates });
      for (const client of wsClients) {
        try { client.send(payload); } catch {}
      }
    }
  } else if (msg.type === 'deletePetTemplate') {
    if (msg.id) {
      const data = loadPetTemplates();
      data.templates = data.templates.filter((t) => t.id !== msg.id);
      savePetTemplates(data);
      const payload = JSON.stringify({ type: 'petTemplatesLoaded', templates: data.templates });
      for (const client of wsClients) {
        try { client.send(payload); } catch {}
      }
    }
  } else if (msg.type === 'saveTheme') {
    // Upsert a custom theme sidecar by id, then broadcast the full list to every
    // connected webview (including sender, so its picker refreshes).
    const preset = msg.preset;
    if (preset && preset.id && preset.name) {
      const now = new Date().toISOString();
      const existing = loadThemes().find((t) => t.id === preset.id);
      const stored = {
        ...preset,
        createdAt: (existing && existing.createdAt) || preset.createdAt || now,
        updatedAt: now,
      };
      if (saveTheme(stored)) {
        const payload = JSON.stringify({ type: 'themesLoaded', themes: loadThemes() });
        for (const client of wsClients) { try { client.send(payload); } catch {} }
      }
    }
  } else if (msg.type === 'deleteTheme') {
    if (msg.id && deleteTheme(msg.id)) {
      const payload = JSON.stringify({ type: 'themesLoaded', themes: loadThemes() });
      for (const client of wsClients) { try { client.send(payload); } catch {} }
    }
  } else if (msg.type === 'installCommunityAsset') {
    // Downloads a community asset to the per-user community-assets dir, then
    // reloads sprites + broadcasts. Kinds wired today: pets, characters, props.
    // Payloads:
    //   { kind: 'pet',       id, species: 'cat'|'dog' }
    //   { kind: 'character', id }
    //   { kind: 'prop',      id }
    (async () => {
      const { kind, id, species } = msg;
      if (kind === 'pet') {
        if (!id || !species || !/^[a-z0-9_-]+$/i.test(id) || !/^(cat|dog)$/i.test(species)) {
          try { ws.send(JSON.stringify({ type: 'communityAssetError', kind, id, error: 'invalid asset id or species' })); } catch {}
          return;
        }
        try {
          // Fetch the sprite PNG + metadata.json from the community repo.
          const spriteRemote = `sprites/pets/${id}/sprite.png`;
          const metadataRemote = `sprites/pets/${id}/metadata.json`;
          const spriteBuf = await fetchFromGitHub(spriteRemote);
          const metadataBuf = await fetchFromGitHub(metadataRemote);
          if (!fs.existsSync(INSTALLED_PETS_DIR)) fs.mkdirSync(INSTALLED_PETS_DIR, { recursive: true });
          // Filename convention: <species>_<variant>.png so the loader picks
          // up the right species mapping. id from the community repo already
          // includes a species prefix in most cases (e.g. cat_calico).
          const filename = id.startsWith(`${species}_`) ? `${id}.png` : `${species}_${id}.png`;
          fs.writeFileSync(path.join(INSTALLED_PETS_DIR, filename), spriteBuf);
          // Stash metadata alongside for future reference (e.g. credits panel).
          fs.writeFileSync(path.join(INSTALLED_PETS_DIR, filename.replace(/\.png$/, '.json')), metadataBuf);
          console.log(`Installed community pet → ${path.join(INSTALLED_PETS_DIR, filename)}`);

          // Reload pet sprites and broadcast.
          const pets = await loadPetSprites();
          if (pets) {
            const variantCount = Object.values(pets).reduce((s, v) => s + Object.keys(v).length, 0);
            const payload = JSON.stringify({ type: 'petSpritesLoaded', pets });
            for (const client of wsClients) {
              try { client.send(payload); } catch {}
            }
            try {
              ws.send(JSON.stringify({ type: 'communityAssetInstalled', kind, id, species, variantCount }));
            } catch {}
          }
        } catch (e) {
          console.error('installCommunityAsset failed:', e.message);
          try { ws.send(JSON.stringify({ type: 'communityAssetError', kind, id, error: e.message })); } catch {}
        }
      } else if (kind === 'character') {
        if (!id || !/^[a-z0-9_-]+$/i.test(id)) {
          try { ws.send(JSON.stringify({ type: 'communityAssetError', kind, id, error: 'invalid asset id' })); } catch {}
          return;
        }
        try {
          const spriteRemote = `sprites/characters/${id}/sprite.png`;
          const metadataRemote = `sprites/characters/${id}/metadata.json`;
          const spriteBuf = await fetchFromGitHub(spriteRemote);
          const metadataBuf = await fetchFromGitHub(metadataRemote);
          if (!fs.existsSync(INSTALLED_CHARS_DIR)) fs.mkdirSync(INSTALLED_CHARS_DIR, { recursive: true });
          const filename = `char_community_${id}.png`;
          fs.writeFileSync(path.join(INSTALLED_CHARS_DIR, filename), spriteBuf);
          fs.writeFileSync(path.join(INSTALLED_CHARS_DIR, filename.replace(/\.png$/, '.json')), metadataBuf);
          console.log(`Installed community character → ${path.join(INSTALLED_CHARS_DIR, filename)}`);

          const characters = await loadCharacterSprites();
          if (characters) {
            const payload = JSON.stringify({ type: 'characterSpritesLoaded', characters });
            for (const client of wsClients) {
              try { client.send(payload); } catch {}
            }
            try {
              ws.send(JSON.stringify({ type: 'communityAssetInstalled', kind, id, charCount: characters.length }));
            } catch {}
          }
        } catch (e) {
          console.error('installCommunityAsset failed:', e.message);
          try { ws.send(JSON.stringify({ type: 'communityAssetError', kind, id, error: e.message })); } catch {}
        }
      } else if (kind === 'prop') {
        if (!id || !/^[a-z0-9_-]+$/i.test(id)) {
          try { ws.send(JSON.stringify({ type: 'communityAssetError', kind, id, error: 'invalid asset id' })); } catch {}
          return;
        }
        try {
          const spriteRemote = `sprites/props/${id}/sprite.png`;
          const metadataRemote = `sprites/props/${id}/metadata.json`;
          const spriteBuf = await fetchFromGitHub(spriteRemote);
          const metadataBuf = await fetchFromGitHub(metadataRemote);
          if (!fs.existsSync(INSTALLED_PROPS_DIR)) fs.mkdirSync(INSTALLED_PROPS_DIR, { recursive: true });
          // Filename = community id; the loader prefixes with `community-` when
          // building the catalog so it never collides with bundled prop ids.
          fs.writeFileSync(path.join(INSTALLED_PROPS_DIR, `${id}.png`), spriteBuf);
          fs.writeFileSync(path.join(INSTALLED_PROPS_DIR, `${id}.json`), metadataBuf);
          console.log(`Installed community prop → ${path.join(INSTALLED_PROPS_DIR, `${id}.png`)}`);

          const { catalog, sprites } = await loadFurnitureAssets();
          const payload = JSON.stringify({ type: 'furnitureAssetsLoaded', catalog, sprites });
          for (const client of wsClients) {
            try { client.send(payload); } catch {}
          }
          try {
            ws.send(JSON.stringify({ type: 'communityAssetInstalled', kind, id, propCount: catalog.length }));
          } catch {}
        } catch (e) {
          console.error('installCommunityAsset failed:', e.message);
          try { ws.send(JSON.stringify({ type: 'communityAssetError', kind, id, error: e.message })); } catch {}
        }
      } else {
        try { ws.send(JSON.stringify({ type: 'communityAssetError', kind, id, error: `kind '${kind}' not yet supported` })); } catch {}
      }
    })();
  } else if (msg.type === 'petStatesSnapshot') {
    // Periodic snapshot from the client of every pet's current runtime state
    // (walk / idle / sit / sleep / play). Cached so /api/layout consumers
    // (e.g. the narration bridge) can skip pets that are asleep without
    // having to subscribe to per-transition events.
    if (msg.states && typeof msg.states === 'object') {
      petRuntimeStates.clear();
      for (const [uid, state] of Object.entries(msg.states)) {
        if (typeof uid === 'string' && typeof state === 'string') {
          petRuntimeStates.set(uid, state);
        }
      }
      petRuntimeStatesUpdatedAt = Date.now();
    }
  } else if (msg.type === 'closeAgent') {
    removeAgent(msg.id, 'closed by user');
  } else if (msg.type === 'fetchGalleryManifest') {
    (async () => {
      try {
        if (galleryCache && Date.now() - galleryCache.fetchedAt < GALLERY_CACHE_TTL_MS) {
          ws.send(JSON.stringify({ type: 'galleryManifest', manifest: galleryCache.data }));
          return;
        }
        const buf = await fetchFromGitHub('gallery.json');
        const manifest = JSON.parse(buf.toString('utf-8'));
        galleryCache = { data: manifest, fetchedAt: Date.now() };
        ws.send(JSON.stringify({ type: 'galleryManifest', manifest }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'galleryManifest', manifest: null, error: String(e) }));
      }
    })();
  } else if (msg.type === 'fetchGalleryScreenshot') {
    (async () => {
      try {
        const buf = await fetchFromGitHub(msg.path);
        const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
        ws.send(JSON.stringify({ type: 'galleryScreenshot', path: msg.path, dataUrl }));
      } catch {
        ws.send(JSON.stringify({ type: 'galleryScreenshot', path: msg.path, dataUrl: '' }));
      }
    })();
  } else if (msg.type === 'fetchGalleryLayout') {
    (async () => {
      try {
        const buf = await fetchFromGitHub(msg.path);
        const layout = JSON.parse(buf.toString('utf-8'));
        ws.send(JSON.stringify({ type: 'galleryLayout', path: msg.path, layout }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'galleryLayout', path: msg.path, layout: null, error: String(e) }));
      }
    })();
  } else if (msg.type === 'fetchGalleryBackgrounds') {
    // Proxy the backgrounds (themes) manifest from the community repo. Mirrors
    // fetchGalleryManifest but for backgrounds.json (no caching needed — the
    // webview caches it client-side per its lazy-fetch pattern).
    (async () => {
      try {
        const buf = await fetchFromGitHub('backgrounds.json');
        const manifest = JSON.parse(buf.toString('utf-8'));
        ws.send(JSON.stringify({ type: 'galleryBackgrounds', manifest }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'galleryBackgrounds', manifest: null, error: String(e) }));
      }
    })();
  } else if (msg.type === 'fetchGalleryTheme') {
    // Proxy a single theme.json (CustomThemePreset) from the community repo.
    // The webview then re-namespaces + saves it as a local custom theme and
    // applies it (mirroring fetchGalleryLayout → importGalleryLayout).
    (async () => {
      try {
        const buf = await fetchFromGitHub(msg.path);
        const theme = JSON.parse(buf.toString('utf-8'));
        ws.send(JSON.stringify({ type: 'galleryTheme', path: msg.path, theme }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'galleryTheme', path: msg.path, theme: null, error: String(e) }));
      }
    })();
  } else if (msg.type === 'importGalleryLayout') {
    if (msg.layout && msg.layout.version === 1 && Array.isArray(msg.layout.tiles)) {
      // Pets and background theme are personal — never import from community layouts
      const currentLayout = loadLayout();
      msg.layout.pets = currentLayout?.pets || [];
      if (!msg.layout.background && currentLayout?.background) {
        msg.layout.background = currentLayout.background;
      }
      saveLayout(msg.layout);
      for (const client of wsClients) {
        try { client.send(JSON.stringify({ type: 'layoutLoaded', layout: msg.layout })); } catch {}
      }
    }
  }
}

// --- HTTP server ---
const MIME_TYPES = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

// Pre-load all webview files into memory to avoid fs blocking the event loop
const fileCache = new Map();
function loadWebviewFiles(dir, prefix) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const urlPath = prefix + '/' + entry.name;
    if (entry.isDirectory()) {
      loadWebviewFiles(fullPath, urlPath);
    } else {
      const ext = path.extname(entry.name);
      const headers = { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' };
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      const data = fs.readFileSync(fullPath);
      headers['Content-Length'] = data.length;
      fileCache.set(urlPath, { data, headers });
    }
  }
}
loadWebviewFiles(path.join(distDir, 'webview'), '');
console.log(`Cached ${fileCache.size} webview files in memory`);

const server = http.createServer(async (req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  // ── OAuth: GitHub App login flow ──────────────────────────
  if (urlPath === '/auth/login') {
    if (!GITHUB_APP_CLIENT_ID) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('GITHUB_APP_CLIENT_ID not configured');
      return;
    }
    const redirectUri = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/auth/callback`;
    const state = crypto.randomBytes(16).toString('hex');
    // Store state briefly to prevent CSRF (auto-expires after 10 min)
    oauthSessions.set('state:' + state, { ts: Date.now() });
    setTimeout(() => oauthSessions.delete('state:' + state), 10 * 60 * 1000);
    const ghUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_APP_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    res.writeHead(302, { Location: ghUrl });
    res.end();
    return;
  }

  if (urlPath === '/auth/callback') {
    const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state || !oauthSessions.has('state:' + state)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid OAuth callback');
      return;
    }
    oauthSessions.delete('state:' + state);
    // Exchange code for token
    const postData = JSON.stringify({
      client_id: GITHUB_APP_CLIENT_ID,
      client_secret: GITHUB_APP_CLIENT_SECRET,
      code,
    });
    const tokenReq = https.request({
      hostname: 'github.com',
      path: '/login/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (tokenRes) => {
      const chunks = [];
      tokenRes.on('data', (c) => chunks.push(c));
      tokenRes.on('end', async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          if (!body.access_token) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('OAuth failed: ' + (body.error_description || body.error || 'unknown'));
            return;
          }
          // Fetch user info
          const userResp = await githubApiRequest('GET', '/user', body.access_token);
          const sessionId = crypto.randomBytes(24).toString('hex');
          oauthSessions.set(sessionId, {
            token: body.access_token,
            login: userResp.data.login || 'unknown',
            avatarUrl: userResp.data.avatar_url || '',
          });
          // Set cookie and serve a small HTML that notifies the opener and closes
          res.writeHead(200, {
            'Content-Type': 'text/html',
            'Set-Cookie': `po_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
          });
          res.end(`<!DOCTYPE html><html><body><script>
            if(window.opener){window.opener.postMessage({type:'authComplete'},'*');window.close();}
            else{location.href='/';}
          </script><p>Authenticated! You can close this tab.</p></body></html>`);
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Token exchange failed: ' + e.message);
        }
      });
    });
    tokenReq.on('error', (e) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Token request failed: ' + e.message);
    });
    tokenReq.write(postData);
    tokenReq.end();
    return;
  }

  if (urlPath === '/auth/user') {
    const session = getSession(req);
    if (!session) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ authenticated: false }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ authenticated: true, login: session.login, avatarUrl: session.avatarUrl }));
    return;
  }

  if (urlPath === '/auth/logout') {
    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies['po_session'];
    if (sid) oauthSessions.delete(sid);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'po_session=; Path=/; HttpOnly; Max-Age=0',
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── Like API (heart = +1 reaction, no downvotes) ─────────
  if (urlPath === '/api/votes/mine' && req.method === 'GET') {
    const session = getSession(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not authenticated' }));
      return;
    }
    const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const issueNumbers = (params.get('issues') || '').split(',').filter(Boolean).map(Number);
    const votes = {};
    const counts = {};
    try {
      await Promise.all(issueNumbers.map(async (num) => {
        const resp = await githubApiRequest('GET',
          `/repos/${GALLERY_REPO_OWNER}/${GALLERY_REPO_NAME}/issues/${num}/reactions?per_page=100`,
          session.token);
        if (resp.status === 200 && Array.isArray(resp.data)) {
          counts[num] = resp.data.filter(r => r.content === '+1').length;
          const mine = resp.data.find(r => r.user && r.user.login === session.login && r.content === '+1');
          if (mine) {
            votes[num] = { reactionId: mine.id };
          }
        }
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ votes, counts }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (urlPath === '/api/vote' && req.method === 'POST') {
    const session = getSession(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not authenticated' }));
      return;
    }
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', async () => {
      try {
        const { issueNumber } = JSON.parse(body);
        if (!issueNumber) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'issueNumber required' }));
          return;
        }
        const resp = await githubApiRequest('POST',
          `/repos/${GALLERY_REPO_OWNER}/${GALLERY_REPO_NAME}/issues/${issueNumber}/reactions`,
          session.token, { content: '+1' });
        const ok = resp.status === 200 || resp.status === 201;
        res.writeHead(ok ? 200 : resp.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(ok ? { ok: true, reactionId: resp.data.id } : { ok: false, error: resp.data.message || 'GitHub API error' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (urlPath === '/api/vote' && req.method === 'DELETE') {
    const session = getSession(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not authenticated' }));
      return;
    }
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', async () => {
      try {
        const { issueNumber, reactionId } = JSON.parse(body);
        if (!issueNumber || !reactionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'issueNumber and reactionId required' }));
          return;
        }
        const resp = await githubApiRequest('DELETE',
          `/repos/${GALLERY_REPO_OWNER}/${GALLERY_REPO_NAME}/issues/${issueNumber}/reactions/${reactionId}`,
          session.token);
        res.writeHead(resp.status === 204 ? 200 : resp.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Handle CORS preflight for vote endpoints
  if (req.method === 'OPTIONS' && (urlPath === '/api/vote' || urlPath === '/api/votes/mine')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // API: force all connected clients to reload
  if (urlPath === '/api/reload') {
    broadcast({ type: 'forceReload' });
    const body = JSON.stringify({ ok: true, clients: wsClients.length });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
    return;
  }

  // API: restart the server process (auto-launch.ps1 will respawn it)
  if (urlPath === '/api/restart') {
    const body = JSON.stringify({ ok: true, message: 'Restarting...' });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
    console.log('Restart requested via /api/restart');
    setTimeout(() => process.exit(0), 500);
    return;
  }

  // API: community gallery proxy
  if (urlPath === '/api/gallery') {
    (async () => {
      try {
        if (galleryCache && Date.now() - galleryCache.fetchedAt < GALLERY_CACHE_TTL_MS) {
          const body = JSON.stringify(galleryCache.data);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(body);
          return;
        }
        const buf = await fetchFromGitHub('gallery.json');
        const manifest = JSON.parse(buf.toString('utf-8'));
        galleryCache = { data: manifest, fetchedAt: Date.now() };
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(buf);
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e) }));
      }
    })();
    return;
  }

  // API: status endpoint for remote monitoring
  if (urlPath === '/api/status') {
    const agentList = [];
    for (const [id, agent] of agents) {
      agentList.push({
        id,
        folderName: agent.folderName || '',
        isWaiting: agent.isWaiting,
        permissionPending: !!agent.permissionSent,
        activeTools: agent.activeToolIds.size,
        sdk: !!agent.isSDK,
        agentType: agent.agentType || 'claude',
        context: agent.context || null,
      });
    }
    const body = JSON.stringify({ agents: agentList, count: agentList.length });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
    return;
  }

  // API: remove an agent by id
  const deleteMatch = urlPath.match(/^\/api\/agents\/(\d+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const id = parseInt(deleteMatch[1], 10);
    if (!agents.has(id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Agent not found' }));
      return;
    }
    // Also clean up remoteAgents index if applicable
    for (const [remoteKey, agentId] of remoteAgents) {
      if (agentId === id) { remoteAgents.delete(remoteKey); break; }
    }
    removeAgent(id, 'removed via API');
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, id }));
    return;
  }

  // API: read-only layout snapshot. Allows external tools (e.g. an LLM
  // narration bridge) to see which pets and agents are placed without
  // having to read the layout file directly.
  if (urlPath === '/api/layout' && req.method === 'GET') {
    const layout = loadLayout();
    if (!layout) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No layout' }));
      return;
    }
    // Decorate the layout with current runtime pet states (if a recent snapshot
    // exists) so consumers like the narration bridge can skip sleeping pets.
    let response = layout;
    if (petRuntimeStates.size > 0 && Date.now() - petRuntimeStatesUpdatedAt < 60_000) {
      response = { ...layout, petStates: Object.fromEntries(petRuntimeStates) };
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(response));
    return;
  }

  // API: read-only list of saved custom themes (Phase D). The webview also gets
  // these over WS (`themesLoaded`); this REST path lets external tools / CI
  // inspect or export them without a socket. POST/DELETE go over WS.
  if (urlPath === '/api/themes' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ themes: loadThemes() }));
    return;
  }

  // API: usage panel — generic surface for any local producer to push tool
  // quotas (e.g. Claude 87%, Codex 6%). The primary producer is the reporter
  // over /ws/report (usage-report); this REST path is an alternative for
  // standalone posters and is owned by 'http'. Pixel-office is agnostic about
  // which tool a source represents; the producer composes the strings.
  // Loopback callers don't need a token; remote callers must present
  // `x-pixel-office-usage-token` matching PIXEL_OFFICE_USAGE_TOKEN.
  if (urlPath === '/api/usage' && req.method === 'GET') {
    const body = JSON.stringify({ sources: getActiveUsageSources(), updatedAt: usageUpdatedAt });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
    return;
  }
  if (urlPath === '/api/usage' && (req.method === 'POST' || req.method === 'PUT')) {
    if (!authorizeUsageWrite(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    let body = '';
    let aborted = false;
    req.on('data', (c) => {
      body += c;
      if (body.length > USAGE_MAX_BODY_BYTES) { aborted = true; req.destroy(); }
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        const parsed = JSON.parse(body || '{}');
        const count = setUsageForOwner('http', parsed.sources);
        broadcast({ type: 'usageUpdate', sources: getActiveUsageSources(), updatedAt: usageUpdatedAt });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, count }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad json' }));
      }
    });
    return;
  }
  if (urlPath === '/api/usage' && req.method === 'DELETE') {
    if (!authorizeUsageWrite(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    clearUsageForOwner('http');
    broadcast({ type: 'usageUpdate', sources: getActiveUsageSources(), updatedAt: usageUpdatedAt });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // API: client health check — reports whether any UI client has responded to a WS ping recently
  if (urlPath === '/api/client-health') {
    const now = Date.now();
    let ok = false;
    for (const [, lastPong] of clientLastPong) {
      if (now - lastPong < WS_PONG_STALE_MS) { ok = true; break; }
    }
    // If no UI clients connected at all, report ok (nothing to health-check)
    if (wsClients.length === 0) ok = true;
    const body = JSON.stringify({ ok, clients: wsClients.length });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
    return;
  }

  // Serve from dist/webview/ (cached in memory)
  const cached = fileCache.get(urlPath);
  if (cached) {
    res.writeHead(200, cached.headers);
    res.end(cached.data);
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocket.Server({ server });

// Types that external broadcasters are allowed to inject. Anything else is
// dropped to prevent a malicious or buggy bridge from injecting layout
// edits, agent state, etc. Extend as new event types stabilize.
const BROADCAST_ALLOWED_TYPES = new Set(['petSpeak', 'petReactionBubble', 'agentSpeak', 'petWalkToAgent', 'dailySummary']);
const broadcasterClients = new Set();

wss.on('connection', (ws, req) => {
  const urlPath = (req.url || '').split('?')[0];

  // External broadcaster: /ws/broadcast?token=XXX
  // Authenticated clients can inject messages whose type is in
  // BROADCAST_ALLOWED_TYPES; the server fans them out to viewers.
  if (urlPath === '/ws/broadcast') {
    const expected = process.env.PIXEL_OFFICE_BROADCAST_TOKEN;
    if (!expected) {
      console.warn('Broadcast connection rejected: PIXEL_OFFICE_BROADCAST_TOKEN not set');
      ws.close(1008, 'broadcast disabled');
      return;
    }
    const params = new URL(req.url, 'http://localhost').searchParams;
    const token = params.get('token');
    if (token !== expected) {
      console.warn('Broadcast connection rejected: invalid token');
      ws.close(1008, 'invalid token');
      return;
    }
    broadcasterClients.add(ws);
    console.log('Broadcaster connected');

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg && typeof msg.type === 'string' && BROADCAST_ALLOWED_TYPES.has(msg.type)) {
          broadcast(msg);
        }
      } catch {}
    });
    ws.on('close', () => { broadcasterClients.delete(ws); console.log('Broadcaster disconnected'); });
    ws.on('error', () => { broadcasterClients.delete(ws); });
    return;
  }

  // Reporter connections: /ws/report?machineId=xxx
  if (urlPath === '/ws/report') {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const machineId = params.get('machineId') || `unknown-${Date.now()}`;
    reporterClients.set(ws, { machineId });
    console.log(`Reporter connected: ${machineId}`);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleReporterMessage(ws, msg);
      } catch {}
    });

    ws.on('close', () => cleanupReporter(ws));
    ws.on('error', () => cleanupReporter(ws));
    return;
  }

  // Regular UI client connections
  wsClients.push(ws);
  clientLastPong.set(ws, Date.now());
  console.log('WebSocket client connected');

  ws.on('pong', () => {
    clientLastPong.set(ws, Date.now());
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleClientMessage(ws, msg);
    } catch {}
  });

  ws.on('close', () => {
    wsClients = wsClients.filter(c => c !== ws);
    clientLastPong.delete(ws);
    console.log('WebSocket client disconnected');
  });

  ws.on('error', () => {
    wsClients = wsClients.filter(c => c !== ws);
    clientLastPong.delete(ws);
  });
});

// Ping UI clients periodically for health monitoring
setInterval(() => {
  for (const ws of wsClients) {
    try { ws.ping(); } catch {}
  }
}, WS_PING_INTERVAL_MS);

const noScan = process.env.NO_SCAN === '1';
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Pixel Office: http://localhost:${PORT} (listening on all interfaces)`);
  if (!noScan) {
    // Initial scan
    scanAndAdoptAgents();
    // Periodic scan for new sessions
    setInterval(scanAndAdoptAgents, SCAN_INTERVAL_MS);
    setInterval(checkIdleAgents, IDLE_CHECK_INTERVAL_MS);
  } else {
    console.log('NO_SCAN=1: skipping JSONL auto-detection (reporter-only mode)');
  }
  // Watch layout file for cross-tab sync
  watchLayoutFile();
});
