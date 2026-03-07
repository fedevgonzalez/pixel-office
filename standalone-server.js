// Standalone web server for Pixel Agents — no VS Code required.
// Usage: node standalone-server.js [workspace-path]
// Then open http://localhost:3300

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { PNG } = require('pngjs');

const PORT = 3300;
const SCAN_INTERVAL_MS = 5000;
const AUTO_DETECT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const TOOL_DONE_DELAY_MS = 300;
const TEXT_IDLE_DELAY_MS = 5000;
const PERMISSION_TIMER_DELAY_MS = 7000;
const BASH_CMD_MAX = 30;
const TASK_DESC_MAX = 40;
const PNG_ALPHA_THRESHOLD = 128;

const PERMISSION_EXEMPT_TOOLS = new Set([
  'Task', 'AskUserQuestion', 'ToolSearch',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskUpdate', 'TaskStop',
]);
function isPermissionExempt(name) {
  return PERMISSION_EXEMPT_TOOLS.has(name) || name.startsWith('mcp__');
}

// --- Resolve projects root and dist dir ---
const workspacePath = process.argv[2] || null;
const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
const distDir = path.join(__dirname, 'dist');
const assetsDir = path.join(distDir, 'assets');

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

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wsClients) {
    try { ws.send(data); } catch {}
  }
}

// --- Folder name resolution ---
// Project dir hash: path separators (: \ /) replaced with dash
// e.g. "G--GitHub-pixel-agents" from "G:\GitHub\pixel-agents"
// Try to reconstruct the real path and return basename
function resolveFolderName(hashName) {
  const isWin = process.platform === 'win32';
  const sep = isWin ? '\\' : '/';

  // On Windows: "G--GitHub-pixel-agents" → "G:\GitHub-pixel-agents" (drive letter reconstruction)
  // On Unix: "home-user-projects-foo" → "/home-user-projects-foo" (leading slash)
  let candidate;
  if (isWin) {
    // Match drive letter pattern: single letter followed by --
    candidate = hashName.replace(/^([a-zA-Z])--/, '$1:' + sep);
  } else {
    // Unix paths start with / which becomes a leading dash
    candidate = sep + hashName;
  }

  // Try progressively replacing dashes with path separators from left to right
  // and check if the directory exists
  const startIdx = isWin ? candidate.indexOf(sep) + 1 : 1; // skip drive prefix or leading /
  const dashes = [];
  for (let i = startIdx; i < candidate.length; i++) {
    if (candidate[i] === '-') dashes.push(i);
  }
  // Try replacing all dashes (most specific path)
  let full = candidate;
  for (const idx of dashes) {
    full = full.substring(0, idx) + sep + full.substring(idx + 1);
  }
  if (fs.existsSync(full)) return path.basename(full);
  // Try replacing dashes from left to right, checking each time
  for (let n = dashes.length; n >= 1; n--) {
    let attempt = candidate;
    for (let i = 0; i < n; i++) {
      attempt = attempt.substring(0, dashes[i]) + sep + attempt.substring(dashes[i] + 1);
    }
    if (fs.existsSync(attempt)) return path.basename(attempt);
  }
  // Fallback: just use the hash name
  return hashName;
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
    default: return `Using ${toolName}`;
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
  cancelTimer(permissionTimers, agentId);
  const t = setTimeout(() => {
    permissionTimers.delete(agentId);
    const agent = agents.get(agentId);
    if (!agent) return;
    let hasNonExempt = false;
    for (const toolId of agent.activeToolIds) {
      // Skip tools that were already active at replay time — they were already approved
      if (agent.replayedToolIds && agent.replayedToolIds.has(toolId)) continue;
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
  }, PERMISSION_TIMER_DELAY_MS);
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
        // Detect /exit command or Goodbye! response as session termination
        if (content.includes('/exit') || content.includes('Goodbye!')) {
          agent.exitDetected = true;
          if (!replaying) {
            removeAgent(agentId);
            return;
          }
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
  const chars = [];
  for (let i = 0; i < 6; i++) {
    const file = path.join(assetsDir, 'characters', `char_${i}.png`);
    if (!fs.existsSync(file)) return null;
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

const LAYOUT_DIR = path.join(os.homedir(), '.pixel-agents');
const LAYOUT_FILE = path.join(LAYOUT_DIR, 'layout.json');

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

      // Always replay to check for /exit, regardless of age
      const tempAgent = {
        jsonlFile: file, projectDir: projDir, fileOffset: 0, lineBuffer: '',
        activeToolIds: new Set(), activeToolStatuses: new Map(), activeToolNames: new Map(),
        activeSubagentToolIds: new Map(), activeSubagentToolNames: new Map(),
        isWaiting: false, permissionSent: false, hadToolsInTurn: false, exitDetected: false,
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

      // Skip old sessions that didn't /exit (idle too long to be relevant)
      if (now - stat.mtimeMs > AUTO_DETECT_MAX_AGE_MS) continue;

      // Session is active — create a real agent
      knownFiles.add(file);
      const id = nextAgentId++;
      // Derive folder name: try to find the actual directory on disk
      // Hash format: path separators (: \ /) → dash (G:\GitHub\pixel-agents → G--GitHub-pixel-agents)
      const dirBasename = path.basename(projDir);
      const folderName = resolveFolderName(dirBasename);
      const agent = {
        ...tempAgent,
        id, isReplaying: false,
        replayedToolIds: new Set(tempAgent.activeToolIds),
        folderName,
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

    // Send settings
    ws.send(JSON.stringify({ type: 'settingsLoaded', soundEnabled: true }));

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
  } else if (msg.type === 'closeAgent') {
    removeAgent(msg.id, 'closed by user');
  }
}

// --- HTTP server ---
const MIME_TYPES = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  // API: force all connected clients to reload
  if (urlPath === '/api/reload') {
    broadcast({ type: 'forceReload' });
    const body = JSON.stringify({ ok: true, clients: wsClients.length });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
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
        activeTools: agent.activeToolIds.size,
      });
    }
    const body = JSON.stringify({ agents: agentList, count: agentList.length });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
    return;
  }

  // Serve from dist/webview/
  const filePath = path.join(distDir, 'webview', urlPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const headers = { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' };
    // HTML: no cache (so rebuilds are picked up immediately)
    // Assets with hash in filename: cache forever
    if (ext === '.html') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    }
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  wsClients.push(ws);
  console.log('WebSocket client connected');

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleClientMessage(ws, msg);
    } catch {}
  });

  ws.on('close', () => {
    wsClients = wsClients.filter(c => c !== ws);
    console.log('WebSocket client disconnected');
  });

  ws.on('error', () => {
    wsClients = wsClients.filter(c => c !== ws);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Pixel Agents web: http://localhost:${PORT} (listening on all interfaces)`);
  // Initial scan
  scanAndAdoptAgents();
  // Periodic scan for new sessions
  setInterval(scanAndAdoptAgents, SCAN_INTERVAL_MS);
  // Watch layout file for cross-tab sync
  watchLayoutFile();
});
