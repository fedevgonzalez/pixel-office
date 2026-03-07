#!/usr/bin/env node
// Pixel Office Reporter — lightweight agent that watches local Claude Code
// sessions and reports them to a central Pixel Office server via WebSocket.
//
// Usage: node pixel-office-reporter.js [server-url]
// Example: node pixel-office-reporter.js ws://192.168.68.100:3300/ws/report
//
// Env vars:
//   PIXEL_OFFICE_SERVER — WebSocket URL (default: ws://192.168.68.100:3300/ws/report)
//   PIXEL_OFFICE_MACHINE_ID — Machine identifier (default: hostname)

const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const http = require('http');

const SERVER_URL = process.argv[2] || process.env.PIXEL_OFFICE_SERVER || 'ws://192.168.68.100:3300/ws/report';
const MACHINE_ID = process.env.PIXEL_OFFICE_MACHINE_ID || os.hostname();
const LOCAL_SERVER = process.env.PIXEL_OFFICE_LOCAL || 'http://localhost:3300';
const PROJECTS_ROOT = path.join(os.homedir(), '.claude', 'projects');
const SCAN_INTERVAL_MS = 5000;
const RECONNECT_DELAY_MS = 5000;

let ws = null;
let connected = false;
const sessions = new Map(); // filePath -> { sessionId, offset, watcher, pollInterval, folderName }

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function send(msg) {
  if (ws && connected) {
    try { ws.send(JSON.stringify(msg)); } catch {}
  }
}

// --- Folder name resolution (simplified) ---
function resolveFolderName(hashName) {
  const isWin = process.platform === 'win32';
  const sep = isWin ? '\\' : '/';
  let candidate;
  if (isWin) {
    candidate = hashName.replace(/^([a-zA-Z])--/, '$1:' + sep);
  } else {
    candidate = sep + hashName;
  }
  const startIdx = isWin ? candidate.indexOf(sep) + 1 : 1;
  const dashes = [];
  for (let i = startIdx; i < candidate.length; i++) {
    if (candidate[i] === '-') dashes.push(i);
  }
  let full = candidate;
  for (const idx of dashes) {
    full = full.substring(0, idx) + sep + full.substring(idx + 1);
  }
  if (fs.existsSync(full)) return path.basename(full);
  for (let n = dashes.length; n >= 1; n--) {
    let attempt = candidate;
    for (let i = 0; i < n; i++) {
      attempt = attempt.substring(0, dashes[i]) + sep + attempt.substring(dashes[i] + 1);
    }
    if (fs.existsSync(attempt)) return path.basename(attempt);
  }
  return hashName;
}

// --- Check if session has /exit (must be a user message, not just a reference) ---
function hasExitCommand(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.includes('<command-name>/exit</command-name>')) continue;
      try {
        const record = JSON.parse(line);
        if (record.type === 'user') {
          const c = record.message?.content;
          if (typeof c === 'string' && c.includes('<command-name>/exit</command-name>')) return true;
        }
      } catch {}
    }
    return false;
  } catch { return false; }
}

// --- Read new lines from a session file and send them ---
function readNewLines(filePath) {
  const session = sessions.get(filePath);
  if (!session) return;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size <= session.offset) return;
    const buf = Buffer.alloc(stat.size - session.offset);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, buf.length, session.offset);
    fs.closeSync(fd);
    session.offset = stat.size;
    const text = session.lineBuffer + buf.toString('utf-8');
    const lines = text.split('\n');
    session.lineBuffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      send({ type: 'session-line', sessionId: session.sessionId, line });
      // Check for /exit
      if (line.includes('<command-name>/exit</command-name>')) {
        endSession(filePath);
        return;
      }
    }
  } catch {}
}

// --- Start tracking a session file ---
function startSession(filePath, projDir) {
  const sessionId = path.basename(filePath, '.jsonl');
  const folderName = resolveFolderName(path.basename(projDir));

  // Replay existing content to get current state
  let offset = 0;
  const replayLines = [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    offset = Buffer.byteLength(content, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.trim()) replayLines.push(line);
    }
  } catch {}

  const session = { sessionId, offset, lineBuffer: '', folderName, filePath };
  sessions.set(filePath, session);

  // Notify server of new session
  send({ type: 'session-start', sessionId, folderName });

  // Send replay lines so server builds current state
  for (const line of replayLines) {
    send({ type: 'session-line', sessionId, line });
  }

  // Watch for new content
  try {
    session.watcher = fs.watch(filePath, () => readNewLines(filePath));
  } catch {}
  session.pollInterval = setInterval(() => {
    if (!sessions.has(filePath)) return;
    readNewLines(filePath);
  }, 1000);

  log(`Tracking: ${folderName}/${sessionId}`);
}

// --- Stop tracking a session ---
function endSession(filePath) {
  const session = sessions.get(filePath);
  if (!session) return;
  if (session.watcher) try { session.watcher.close(); } catch {}
  if (session.pollInterval) clearInterval(session.pollInterval);
  send({ type: 'session-end', sessionId: session.sessionId });
  sessions.delete(filePath);
  log(`Ended: ${session.folderName}/${session.sessionId}`);
}

// --- Query local standalone server for active agents ---
function fetchLocalAgents() {
  return new Promise((resolve) => {
    const url = `${LOCAL_SERVER}/api/status`;
    http.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.agents || []);
        } catch { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

// --- Find JSONL file for a given folder name ---
function findSessionFile(folderName) {
  let projectDirs;
  try {
    projectDirs = fs.readdirSync(PROJECTS_ROOT)
      .map(d => path.join(PROJECTS_ROOT, d))
      .filter(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
  } catch { return null; }

  for (const projDir of projectDirs) {
    const resolved = resolveFolderName(path.basename(projDir));
    if (resolved !== folderName) continue;
    let files;
    try {
      files = fs.readdirSync(projDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => path.join(projDir, f));
    } catch { continue; }
    // Find the most recently modified non-exited file
    let best = null;
    let bestMtime = 0;
    for (const file of files) {
      try {
        const stat = fs.statSync(file);
        if (stat.mtimeMs > bestMtime && !hasExitCommand(file)) {
          best = { file, projDir };
          bestMtime = stat.mtimeMs;
        }
      } catch {}
    }
    if (best) return best;
  }
  return null;
}

// --- Scan: sync with local standalone server ---
async function scan() {
  if (!connected) return;

  const localAgents = await fetchLocalAgents();
  const activeFolders = new Set(localAgents.map(a => a.folderName));

  // Start sessions for agents we're not tracking yet
  for (const agent of localAgents) {
    // Check if we already have a session for this folder
    let alreadyTracking = false;
    for (const [, session] of sessions) {
      if (session.folderName === agent.folderName) { alreadyTracking = true; break; }
    }
    if (alreadyTracking) continue;

    const found = findSessionFile(agent.folderName);
    if (found) startSession(found.file, found.projDir);
  }

  // End sessions for agents no longer on local server
  for (const [filePath, session] of [...sessions]) {
    if (!activeFolders.has(session.folderName)) {
      endSession(filePath);
    }
  }
}

// --- WebSocket connection with auto-reconnect ---
function connect() {
  const url = `${SERVER_URL}?machineId=${encodeURIComponent(MACHINE_ID)}`;
  log(`Connecting to ${SERVER_URL} as "${MACHINE_ID}"...`);

  ws = new WebSocket(url);

  ws.on('open', () => {
    connected = true;
    log('Connected to Pixel Office server');
    scan(); // Initial scan on connect
  });

  ws.on('close', () => {
    connected = false;
    // Clean up all sessions (server will clean up on its end too)
    for (const [filePath] of [...sessions]) {
      const session = sessions.get(filePath);
      if (session) {
        if (session.watcher) try { session.watcher.close(); } catch {}
        if (session.pollInterval) clearInterval(session.pollInterval);
      }
      sessions.delete(filePath);
    }
    log(`Disconnected. Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
    setTimeout(connect, RECONNECT_DELAY_MS);
  });

  ws.on('error', () => {}); // close event will handle reconnect
}

// --- Main ---
log(`Pixel Office Reporter`);
log(`Machine ID: ${MACHINE_ID}`);
log(`Projects root: ${PROJECTS_ROOT}`);
log(`Server: ${SERVER_URL}`);

connect();
setInterval(scan, SCAN_INTERVAL_MS);

process.on('SIGINT', () => {
  log('Shutting down...');
  for (const [filePath] of [...sessions]) endSession(filePath);
  if (ws) ws.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  for (const [filePath] of [...sessions]) endSession(filePath);
  if (ws) ws.close();
  process.exit(0);
});
