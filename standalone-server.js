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
const GALLERY_REPO_RAW_BASE = 'https://raw.githubusercontent.com/fedevgonzalez/pixel-office-layouts/main/';
const GALLERY_REPO_API_BASE = 'https://api.github.com/repos/fedevgonzalez/pixel-office-layouts/contents/';
const GALLERY_REPO_OWNER = 'fedevgonzalez';
const GALLERY_REPO_NAME = 'pixel-office-layouts';
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

// Local gallery repo path for development (fallback when GitHub repo is private)
const GALLERY_LOCAL_DIR = path.join(__dirname, '..', 'pixel-office-layouts');

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
              if (!replaying) setTimeout(() => broadcast({ type: 'agentToolDone', id: agentId, toolId: tid }), TOOL_DONE_DELAY_MS);
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

async function loadCharacterSprites() {
  const dir = path.join(assetsDir, 'characters');
  if (!fs.existsSync(dir)) return null;
  // Scan dir for char_*.png and load in numeric order. Used to be hard-coded
  // to exactly 6 files which blocked adding new variants without code changes.
  const entries = fs.readdirSync(dir)
    .map((name) => {
      const m = name.match(/^char_(\d+)\.png$/);
      return m ? { idx: Number(m[1]), file: path.join(dir, name) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.idx - b.idx);
  if (entries.length === 0) return null;
  const chars = [];
  for (const { file } of entries) {
    const png = await loadPng(file);
    const directions = { down: [], up: [], right: [] };
    const dirNames = ['down', 'up', 'right'];
    for (let d = 0; d < 3; d++) {
      for (let f = 0; f < 7; f++) {
        directions[dirNames[d]].push(pngToSpriteData(png, f * 16, d * 32, 16, 32));
      }
    }
    chars.push(directions);
  }
  return chars;
}

async function loadPetSprites() {
  const dir = path.join(assetsDir, 'pets');
  if (!fs.existsSync(dir)) return null;
  // File naming: <species>_<variant>.png, e.g. dog_dachshund.png, cat_calico.png.
  // Each file is a 5×3 grid of 16×16 frames (walk1, walk2, idle, sleep1, sleep2)
  // across 3 directions (down, up, right).
  const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
  if (entries.length === 0) return null;
  // Result: { [species]: { [variant]: { down: [...5], up: [...5], right: [...5] } } }
  const result = {};
  for (const f of entries) {
    const m = f.match(/^([a-z]+)_([a-z0-9_-]+)\.png$/i);
    if (!m) continue;
    const [, species, variant] = m;
    try {
      const png = await loadPng(path.join(dir, f));
      const directions = { down: [], up: [], right: [] };
      const dirNames = ['down', 'up', 'right'];
      for (let d = 0; d < 3; d++) {
        for (let frame = 0; frame < 5; frame++) {
          directions[dirNames[d]].push(pngToSpriteData(png, frame * 16, d * 16, 16, 16));
        }
      }
      if (!result[species]) result[species] = {};
      result[species][variant] = directions;
    } catch (e) {
      console.error(`  pet sprite ${f} failed:`, e.message);
    }
  }
  return result;
}

async function loadFloorTiles() {
  const file = path.join(assetsDir, 'floors.png');
  if (!fs.existsSync(file)) return null;
  const png = await loadPng(file);
  const sprites = [];
  for (let i = 0; i < 7; i++) {
    sprites.push(pngToSpriteData(png, i * 16, 0, 16, 16));
  }
  return sprites;
}

async function loadWallTiles() {
  const file = path.join(assetsDir, 'walls.png');
  if (!fs.existsSync(file)) return null;
  const png = await loadPng(file);
  const sprites = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      sprites.push(pngToSpriteData(png, col * 16, row * 32, 16, 32));
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
  } else if (msg.type === 'session-end') {
    const agentId = remoteAgents.get(remoteKey);
    if (agentId == null) return;
    removeAgent(agentId, `remote session ended (${machineId})`);
    remoteAgents.delete(remoteKey);
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
      const floors = await loadFloorTiles();
      if (floors) ws.send(JSON.stringify({ type: 'floorTilesLoaded', sprites: floors }));
      console.log(`  floorTiles: ${floors ? 'sent' : 'skipped (no floors.png)'}`);
    } catch (e) { console.error('  floorTiles error:', e.message); }
    try {
      const walls = await loadWallTiles();
      if (walls) ws.send(JSON.stringify({ type: 'wallTilesLoaded', sprites: walls }));
      console.log(`  wallTiles: ${walls ? 'sent' : 'skipped'}`);
    } catch (e) { console.error('  wallTiles error:', e.message); }

    // Furniture catalog + sprites
    try {
      const catalogFile = path.join(assetsDir, 'furniture-catalog.json');
      const furnitureDir = path.join(assetsDir, 'furniture');
      const catalog = fs.existsSync(catalogFile) ? JSON.parse(fs.readFileSync(catalogFile, 'utf-8')) : [];
      const sprites = {};
      if (fs.existsSync(furnitureDir)) {
        for (const f of fs.readdirSync(furnitureDir)) {
          if (!f.endsWith('.png')) continue;
          const name = f.replace('.png', '');
          const png = await loadPng(path.join(furnitureDir, f));
          sprites[name] = pngToSpriteData(png, 0, 0, png.width, png.height);
        }
      }
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
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(layout));
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
const BROADCAST_ALLOWED_TYPES = new Set(['agentToolStatusRefined', 'petSpeak']);
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
