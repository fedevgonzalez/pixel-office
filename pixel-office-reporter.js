#!/usr/bin/env node
// Pixel Office Reporter — lightweight agent that watches local Claude Code
// sessions and reports them to a central Pixel Office server via WebSocket.
//
// Usage: node pixel-office-reporter.js [server-url]
// Example: node pixel-office-reporter.js ws://localhost:3300/ws/report
//
// Env vars:
//   PIXEL_OFFICE_SERVER — WebSocket URL (default: ws://localhost:3300/ws/report)
//   PIXEL_OFFICE_MACHINE_ID — Machine identifier (default: hostname)

const fs = require('fs');
const path = require('path');
const os = require('os');
// Prefer 'ws' package (EventEmitter API) over native WebSocket (browser API, no .on())
let WebSocket;
try { WebSocket = require('ws'); } catch {
  WebSocket = globalThis.WebSocket;
  if (!WebSocket) {
    console.error('Error: WebSocket not available. Install ws: npm install ws');
    process.exit(1);
  }
}

const SERVER_URL = process.argv[2] || process.env.PIXEL_OFFICE_SERVER || 'ws://localhost:3300/ws/report';
const MACHINE_ID = process.env.PIXEL_OFFICE_MACHINE_ID || os.hostname();
const PROJECTS_ROOT = path.join(os.homedir(), '.claude', 'projects');
const SCAN_INTERVAL_MS = 5000;
const RECONNECT_DELAY_MS = 5000;
const AUTO_DETECT_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min — match server's IDLE_LEAVE_MS (server handles resting state)

let ws = null;
let connected = false;
const sessions = new Map(); // filePath -> { sessionId, offset, watcher, pollInterval, folderName }
const skippedFiles = new Map(); // filePath -> mtimeMs at time of skip (re-detect if mtime changes)

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function send(msg) {
  if (ws && connected) {
    try { ws.send(JSON.stringify(msg)); } catch {}
  }
}

// --- Folder name resolution ---
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
  // Strips common path boilerplate left in partial hashes (e.g. Local by Flywheel paths
  // like ~/Local Sites/<name>/app/public → hash fallback: Local-Sites-<name>-app-public).
  const fallback = bestGuess || hashName;
  return fallback
    .replace(/^Local-Sites-/i, '')
    .replace(/-app-public$/i, '');
}

// --- Check if session has /exit as the LAST user action ---
// A session can be restarted after /exit, so we check if there's activity after the last /exit.
function hasExitCommand(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    let lastExitIdx = -1;
    let lastActivityIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      if (line.includes('<command-name>/exit</command-name>')) {
        try {
          const record = JSON.parse(line);
          if (record.type === 'user') {
            const c = record.message?.content;
            if (typeof c === 'string' && c.trimStart().startsWith('<command-name>/exit</command-name>')) {
              lastExitIdx = i;
            }
          }
        } catch {}
      }
      // Track last meaningful activity (assistant or user messages)
      try {
        const record = JSON.parse(line);
        if (record.type === 'assistant' || record.type === 'user') {
          lastActivityIdx = i;
        }
      } catch {}
    }
    // Only consider exited if /exit is the last meaningful action
    return lastExitIdx !== -1 && lastExitIdx >= lastActivityIdx;
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
      // Check for /exit (must be a user message starting with the command tag)
      if (line.includes('<command-name>/exit</command-name>')) {
        try {
          const rec = JSON.parse(line);
          if (rec.type === 'user') {
            const c = rec.message?.content;
            if (typeof c === 'string' && c.trimStart().startsWith('<command-name>/exit</command-name>')) {
              endSession(filePath);
              return;
            }
          }
        } catch {}
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
  send({ type: 'session-replay-done', sessionId });

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

// --- Scan for active JSONL sessions directly ---
function scanLocalFiles() {
  const activeFiles = new Set();
  let projectDirs;
  try {
    projectDirs = fs.readdirSync(PROJECTS_ROOT)
      .map(d => path.join(PROJECTS_ROOT, d))
      .filter(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
  } catch { return activeFiles; }

  const now = Date.now();
  for (const projDir of projectDirs) {
    let files;
    try {
      files = fs.readdirSync(projDir).filter(f => f.endsWith('.jsonl')).map(f => path.join(projDir, f));
    } catch { continue; }

    for (const file of files) {
      try {
        const stat = fs.statSync(file);
        if (now - stat.mtimeMs > AUTO_DETECT_MAX_AGE_MS) continue;
        if (hasExitCommand(file)) continue;
        // Skip files that were idle-timed-out unless their mtime changed (new activity)
        const skippedMtime = skippedFiles.get(file);
        if (skippedMtime !== undefined) {
          if (stat.mtimeMs <= skippedMtime) continue;
          skippedFiles.delete(file); // new activity — allow re-detection
          log(`Re-detected activity: ${path.basename(file, '.jsonl')}`);
        }
        activeFiles.add(file);
      } catch {}
    }
  }
  return activeFiles;
}

// --- Scan: detect active sessions and report them ---
function scan() {
  if (!connected) return;

  const activeFiles = scanLocalFiles();

  // Start sessions for files we're not tracking yet
  for (const file of activeFiles) {
    if (sessions.has(file)) continue;
    const projDir = path.dirname(file);
    startSession(file, projDir);
  }

  // End sessions for files no longer active or idle too long
  for (const [filePath] of [...sessions]) {
    if (!activeFiles.has(filePath)) {
      endSession(filePath);
      continue;
    }
    // End sessions whose JSONL hasn't been modified in IDLE_TIMEOUT_MS
    try {
      const stat = fs.statSync(filePath);
      if (Date.now() - stat.mtimeMs > IDLE_TIMEOUT_MS) {
        log(`Idle timeout: ${sessions.get(filePath)?.folderName || filePath}`);
        skippedFiles.set(filePath, stat.mtimeMs); // prevent re-detection flapping
        endSession(filePath);
      }
    } catch {}
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
