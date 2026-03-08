// Pixel Office SDK Reporter
// Lightweight module for reporting Agent SDK sessions to a Pixel Office server.
// Works with any custom agent (not just Claude Code CLI).
//
// Usage:
//   const { createPixelReporter } = require('./reporter-sdk');
//   const reporter = createPixelReporter({ serverUrl: 'ws://192.168.68.100:3300/ws/report', agentName: 'finance-agent' });
//   reporter.connect();
//
//   // When a scheduled task starts:
//   reporter.taskStart('daily-report');
//   reporter.toolStart('Read', { file_path: 'data.csv' });
//   reporter.toolEnd('Read');
//   reporter.taskEnd();
//
//   // For Agent SDK streaming:
//   for await (const msg of sdk.query(...)) {
//     reporter.reportSDKMessage(msg);
//   }

const os = require('os');

let WebSocket = globalThis.WebSocket;
if (!WebSocket) {
  try { WebSocket = require('ws'); } catch {
    console.error('[pixel-reporter] WebSocket not available. Install ws: npm install ws');
  }
}

function createPixelReporter(options = {}) {
  const serverUrl = options.serverUrl || process.env.PIXEL_OFFICE_SERVER || 'ws://localhost:3300/ws/report';
  const machineId = options.machineId || process.env.PIXEL_OFFICE_MACHINE_ID || os.hostname();
  const agentName = options.agentName || 'sdk-agent';
  const reconnect = options.reconnect !== false;
  const reconnectDelay = options.reconnectDelay || 5000;
  const persistent = options.persistent !== false; // true = stay visible when idle

  let ws = null;
  let connected = false;
  let sessionId = null;
  let toolCounter = 0;
  const activeTools = new Map(); // name -> toolUseId
  let destroyed = false;

  function log(msg) {
    if (options.silent) return;
    console.log(`[pixel-reporter:${agentName}] ${msg}`);
  }

  function send(msg) {
    if (ws && connected) {
      try { ws.send(JSON.stringify(msg)); } catch {}
    }
  }

  function sendLine(record) {
    if (!sessionId) return;
    send({ type: 'session-line', sessionId, line: JSON.stringify(record) });
  }

  function generateToolId() {
    return `sdk_tool_${++toolCounter}_${Date.now()}`;
  }

  // --- Connection management ---

  function connect() {
    if (destroyed || !WebSocket) return;
    const url = `${serverUrl}?machineId=${encodeURIComponent(machineId)}`;
    log(`Connecting to ${serverUrl}...`);

    ws = new WebSocket(url);

    ws.on('open', () => {
      connected = true;
      log('Connected');
      if (persistent) startSession();
    });

    ws.on('close', () => {
      connected = false;
      sessionId = null;
      activeTools.clear();
      if (!destroyed && reconnect) {
        log(`Disconnected. Reconnecting in ${reconnectDelay / 1000}s...`);
        setTimeout(connect, reconnectDelay);
      }
    });

    ws.on('error', () => {}); // close handles reconnect
  }

  function disconnect() {
    destroyed = true;
    if (sessionId) {
      send({ type: 'session-end', sessionId });
      sessionId = null;
    }
    if (ws) { try { ws.close(); } catch {} }
  }

  // --- Session lifecycle ---

  function startSession() {
    sessionId = `${agentName}-${Date.now()}`;
    send({ type: 'session-start', sessionId, folderName: agentName, sdk: true });
    send({ type: 'session-replay-done', sessionId });
    // Start in waiting/idle state
    sendLine({ type: 'system', subtype: 'turn_duration' });
    log(`Session started: ${sessionId}`);
  }

  // --- Task lifecycle (for cron/scheduled agents) ---

  function taskStart(taskName) {
    if (!connected) return;
    if (!sessionId && persistent) startSession();
    // Send a "user message" to clear waiting state and activate agent
    sendLine({
      type: 'user',
      message: { content: taskName || 'Task started' }
    });
    log(`Task started: ${taskName || '(unnamed)'}`);
  }

  function taskEnd() {
    // Clear all active tools
    if (activeTools.size > 0) {
      const toolResults = [];
      for (const [, toolId] of activeTools) {
        toolResults.push({ type: 'tool_result', tool_use_id: toolId, content: 'done' });
      }
      sendLine({ type: 'user', message: { content: toolResults } });
      activeTools.clear();
    }
    // Go back to waiting/idle
    sendLine({ type: 'system', subtype: 'turn_duration' });
    log('Task ended');

    // If not persistent, end the session
    if (!persistent) {
      send({ type: 'session-end', sessionId });
      sessionId = null;
    }
  }

  // --- Tool reporting (manual) ---

  function toolStart(toolName, input) {
    const toolId = generateToolId();
    activeTools.set(toolName, toolId);
    sendLine({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id: toolId, name: toolName, input: input || {} }]
      }
    });
    return toolId;
  }

  function toolEnd(toolName) {
    const toolId = activeTools.get(toolName);
    if (!toolId) return;
    activeTools.delete(toolName);
    sendLine({
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: toolId, content: 'done' }]
      }
    });
  }

  // --- Agent SDK message translation ---
  // Translates Claude Agent SDK streaming messages into the JSONL format
  // that the pixel-office server understands.

  function reportSDKMessage(msg) {
    if (!sessionId) {
      if (persistent && connected) startSession();
      else return;
    }

    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'system': {
        // SDK system init — treat as session start / user turn
        if (msg.subtype === 'init' && !sessionId) {
          startSession();
        }
        break;
      }

      case 'assistant': {
        // SDK assistant message — forward content blocks directly
        const content = msg.message?.content || msg.content;
        if (Array.isArray(content)) {
          // Track tool_use blocks
          for (const block of content) {
            if (block.type === 'tool_use' && block.id) {
              activeTools.set(block.id, block.id);
            }
          }
          sendLine({ type: 'assistant', message: { content } });
        }
        break;
      }

      case 'user': {
        // SDK user/tool_result message — forward directly
        const content = msg.message?.content || msg.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              activeTools.delete(block.tool_use_id);
            }
          }
          sendLine({ type: 'user', message: { content } });
        }
        break;
      }

      case 'result': {
        // SDK result — turn ended
        if (activeTools.size > 0) {
          const toolResults = [];
          for (const [, toolId] of activeTools) {
            toolResults.push({ type: 'tool_result', tool_use_id: toolId, content: 'done' });
          }
          sendLine({ type: 'user', message: { content: toolResults } });
          activeTools.clear();
        }
        sendLine({ type: 'system', subtype: 'turn_duration' });
        // If not persistent, end the session
        if (!persistent) {
          send({ type: 'session-end', sessionId });
          sessionId = null;
        }
        break;
      }
    }
  }

  return {
    connect,
    disconnect,
    taskStart,
    taskEnd,
    toolStart,
    toolEnd,
    reportSDKMessage,
    get connected() { return connected; },
    get sessionId() { return sessionId; },
  };
}

module.exports = { createPixelReporter };
