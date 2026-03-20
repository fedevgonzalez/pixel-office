#!/usr/bin/env node
// Pixel Office Reporter for OpenClaw
// Translates OpenClaw's JSONL session format to the pixel-office protocol.
//
// OpenClaw uses a different JSONL format than Claude Code CLI:
//   - type: "message" (not "assistant"/"user")
//   - block type: "toolCall" (not "tool_use")
//   - block type: "toolResult" (not "tool_result")
//   - block field: "toolCallId" (not "tool_use_id")
//   - turn end: type: "custom", subtype: "turn_end"
//
// This reporter watches the newest session JSONL file, translates new lines,
// and streams them to the Pixel Office server via the /ws/report WebSocket.
//
// Usage:
//   PIXEL_OFFICE_SERVER=ws://pixel.lab:3300/ws/report node openclaw-reporter.js
//
// Environment variables:
//   PIXEL_OFFICE_SERVER     — WebSocket URL (default: ws://localhost:3300/ws/report)
//   PIXEL_OFFICE_MACHINE_ID — Machine label (default: "openclaw-vps")
//   PIXEL_OFFICE_AGENT_NAME — Display name in office (default: "OpenClaw")
//   OPENCLAW_SESSIONS_DIR   — Path to session JSONL files
//                             (default: /data/.openclaw/agents/main/sessions)

const fs = require("fs");
const path = require("path");
const WS = require("ws");

const SERVER_URL = process.env.PIXEL_OFFICE_SERVER || "ws://localhost:3300/ws/report";
const MACHINE_ID = process.env.PIXEL_OFFICE_MACHINE_ID || "openclaw-vps";
const AGENT_NAME = process.env.PIXEL_OFFICE_AGENT_NAME || "OpenClaw";
const SESSIONS_DIR = process.env.OPENCLAW_SESSIONS_DIR || "/data/.openclaw/agents/main/sessions";
const SCAN_INTERVAL = 2000;

let ws = null;
let connected = false;
let currentSession = null;
let watchedFile = null;
let fileOffset = 0;

function log(msg) { console.log("[pixel] " + msg); }

function send(msg) {
  if (ws && connected) try { ws.send(JSON.stringify(msg)); } catch {}
}

function sendLine(line) {
  if (currentSession) send({ type: "session-line", sessionId: currentSession, line: line });
}

// Translate OpenClaw JSONL → pixel-office JSONL format
function translateLine(record) {
  if (record.type === "message" && record.message) {
    var role = record.message.role;
    var content = record.message.content;
    if (!Array.isArray(content)) return null;

    var translated = [];
    for (var i = 0; i < content.length; i++) {
      var block = content[i];
      if (block.type === "toolCall") {
        translated.push({
          type: "tool_use",
          id: block.id || ("t_" + Date.now() + "_" + i),
          name: block.name || "unknown",
          input: block.input || {}
        });
      } else if (block.type === "toolResult") {
        translated.push({
          type: "tool_result",
          tool_use_id: block.toolCallId || block.id || "",
          content: "done"
        });
      } else if (block.type === "text" || block.type === "thinking") {
        translated.push(block);
      }
    }

    if (role === "assistant") {
      return JSON.stringify({ type: "assistant", message: { content: translated } });
    } else if (role === "user") {
      return JSON.stringify({ type: "user", message: { content: translated } });
    }
  } else if (record.type === "custom" && record.subtype === "turn_end") {
    return JSON.stringify({ type: "system", subtype: "turn_duration" });
  }
  return null;
}

function connect() {
  var url = SERVER_URL + (SERVER_URL.includes("?") ? "&" : "?") + "machineId=" + encodeURIComponent(MACHINE_ID);
  log("Connecting to " + SERVER_URL.split("?")[0] + "...");
  ws = new WS(url);
  ws.on("open", function() {
    connected = true;
    log("Connected!");
    currentSession = AGENT_NAME + "-" + Date.now();
    send({ type: "session-start", sessionId: currentSession, folderName: AGENT_NAME, sdk: true, agentType: "openclaw" });
    send({ type: "session-replay-done", sessionId: currentSession });
    log("Session: " + currentSession);
    scanLoop();
  });
  ws.on("close", function() {
    connected = false;
    currentSession = null;
    log("Disconnected. Reconnecting in 5s...");
    setTimeout(connect, 5000);
  });
  ws.on("error", function() {});
}

function scanLoop() {
  setInterval(function() {
    if (!connected || !currentSession) return;
    try {
      // Find newest JSONL file
      var files = fs.readdirSync(SESSIONS_DIR).filter(function(f) { return f.endsWith(".jsonl"); });
      var newest = null;
      var newestMtime = 0;
      files.forEach(function(f) {
        try {
          var fp = path.join(SESSIONS_DIR, f);
          var s = fs.statSync(fp);
          if (s.mtimeMs > newestMtime) { newestMtime = s.mtimeMs; newest = fp; }
        } catch {}
      });

      if (!newest || Date.now() - newestMtime > 5 * 60 * 1000) return;

      // New file — reset offset
      if (newest !== watchedFile) {
        watchedFile = newest;
        var stat = fs.statSync(newest);
        fileOffset = Math.max(0, stat.size - 2000); // Start near end to avoid full replay
        log("Watching: " + path.basename(newest));
      }

      var stat = fs.statSync(newest);
      if (stat.size <= fileOffset) return;

      // Read only new bytes
      var buf = Buffer.alloc(stat.size - fileOffset);
      var fd = fs.openSync(newest, "r");
      fs.readSync(fd, buf, 0, buf.length, fileOffset);
      fs.closeSync(fd);
      fileOffset = stat.size;

      var chunk = buf.toString("utf-8");
      var lines = chunk.split("\n").filter(Boolean);
      var sent = 0;
      lines.forEach(function(line) {
        try {
          var record = JSON.parse(line);
          var translated = translateLine(record);
          if (translated) {
            sendLine(translated);
            sent++;
          }
        } catch {}
      });
      if (sent > 0) log("Sent " + sent + " events");
    } catch {}
  }, SCAN_INTERVAL);
}

connect();

process.on("SIGTERM", function() {
  if (currentSession) send({ type: "session-end", sessionId: currentSession });
  if (ws) try { ws.close(); } catch {}
  process.exit(0);
});
process.on("SIGINT", function() {
  if (currentSession) send({ type: "session-end", sessionId: currentSession });
  if (ws) try { ws.close(); } catch {}
  process.exit(0);
});

log("OpenClaw Pixel Reporter v3 (with format translation)");
log("Server: " + SERVER_URL.split("?")[0]);
log("Sessions: " + SESSIONS_DIR);
log("Agent: " + AGENT_NAME + " @ " + MACHINE_ID);
