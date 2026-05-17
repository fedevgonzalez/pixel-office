// Thin client for the claude-service /ask endpoint.
// Fire-and-forget by default: caller never awaits the network round trip
// in a hot path. Returns null on timeout or non-2xx so callers can fall
// back to whatever pre-LLM label/text they already have.

const http = require('http');
const https = require('https');
const { URL } = require('url');

const SERVICE_URL = process.env.CLAUDE_SERVICE_URL || 'http://localhost:3100';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MODEL = 'fast';

// Model alias → claude-service modelOverride string.
// Kept in sync with the env vars in claude-service: CLAUDE_MODEL_FAST,
// CLAUDE_MODEL, CLAUDE_MODEL_INTELLIGENT.
const MODELS = {
  fast: 'claude-haiku-4-5',
  default: 'claude-sonnet-4-6',
  intelligent: 'claude-opus-4-6',
};

// In-flight dedup: identical concurrent calls share the same promise so we
// don't fan out N HTTP requests for the same prompt. Cache lives at the
// service too, but this avoids the round trip entirely.
const inFlight = new Map();

function keyOf(model, systemPrompt, prompt) {
  return model + '\0' + systemPrompt + '\0' + prompt;
}

function pickModel(alias) {
  if (!alias) return MODELS[DEFAULT_MODEL];
  return MODELS[alias] || alias; // allow caller to pass a raw model string
}

function postJson(urlStr, body, timeoutMs) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const data = Buffer.from(JSON.stringify(body));
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) return resolve(null);
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
          catch { resolve(null); }
        });
        res.on('error', () => resolve(null));
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(data);
    req.end();
  });
}

/**
 * Ask claude-service for a short completion.
 * @param {string} prompt
 * @param {object} [opts]
 * @param {string} [opts.systemPrompt]  defaults to a generic helper persona
 * @param {'fast'|'default'|'intelligent'|string} [opts.model]  defaults to 'fast' (Haiku)
 * @param {number} [opts.timeoutMs]  defaults to 10_000
 * @param {boolean} [opts.cache]  passed through to /ask; defaults to true
 * @returns {Promise<string|null>}  trimmed result text, or null on failure
 */
async function askClaude(prompt, opts = {}) {
  const systemPrompt = opts.systemPrompt || 'You are a concise assistant. Reply with a single short sentence, no preamble, no quotes.';
  const model = pickModel(opts.model);
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const cache = opts.cache !== false;
  const key = keyOf(model, systemPrompt, prompt);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const run = postJson(SERVICE_URL + '/ask', { systemPrompt, prompt, model, cache }, timeoutMs)
    .then((body) => (body && body.success ? String(body.result || '').trim() || null : null))
    .finally(() => { inFlight.delete(key); });

  inFlight.set(key, run);
  return run;
}

/**
 * Specialized helper: turn a Claude Code tool_use into a 4–7-word retro
 * narrator label in Spanish. Caller should already have a synchronous
 * fallback in place and use this to refine after the WebSocket broadcast.
 *
 * @param {string} toolName
 * @param {object} input  the tool_use input object (will be truncated)
 * @returns {Promise<string|null>}
 */
async function classifyTool(toolName, input) {
  const inputSummary = JSON.stringify(input || {}).slice(0, 200);
  return askClaude(
    `Tool: ${toolName}\nInput: ${inputSummary}\n\nResumí en 4-7 palabras en castellano qué está haciendo el agente. Sin emojis, sin comillas, sin punto final.`,
    {
      systemPrompt:
        'Sos un narrador retro que describe qué hace un programador en una oficina pixel art. Respondé con una frase muy corta en castellano rioplatense, sin emojis ni comillas.',
      model: 'fast',
      // 30s tolerates the Agent SDK spawn overhead on cold cache hits.
      // The first call is slow; the server's own cache makes repeats <10ms.
      timeoutMs: 30_000,
    },
  );
}

module.exports = { askClaude, classifyTool, MODELS, SERVICE_URL };
