#!/usr/bin/env node
/**
 * Record an animated GIF demo of Pixel Office.
 *
 * Two modes:
 *   --simulate   Start a clean server on port 3399 with 3 fake agents (no real sessions)
 *   (default)    Record from an already-running server
 *
 * Usage:
 *   node scripts/record-demo-gif.js --simulate
 *   node scripts/record-demo-gif.js --url http://localhost:3300
 *
 * Options:
 *   --url        Base URL (default: http://localhost:3300, or :3399 in simulate mode)
 *   --duration   Recording duration in seconds (default: 8)
 *   --fps        Frames per second (default: 10)
 *   --width      Viewport width (default: 960)
 *   --height     Viewport height (default: 600)
 *   --output     Output GIF path (default: docs/screenshots/demo.gif)
 *   --kiosk      Record kiosk mode
 *   --simulate   Spawn a clean server with fake agents
 *
 * Requires: npm install --save-dev playwright gifenc
 *           npx playwright install chromium
 */

const { chromium } = require('playwright')
const { GIFEncoder, quantize, applyPalette } = require('gifenc')
const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')
const { spawn } = require('child_process')
const WebSocket = require('ws')

// Parse CLI args
const args = process.argv.slice(2)
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback
}
const hasFlag = (name) => args.includes(`--${name}`)

const SIMULATE = hasFlag('simulate')
const SIM_PORT = 3399
const BASE_URL = getArg('url', SIMULATE ? `http://localhost:${SIM_PORT}` : 'http://localhost:3300')
const DURATION_SEC = Number(getArg('duration', '8'))
const FPS = Number(getArg('fps', '10'))
const WIDTH = Number(getArg('width', '960'))
const HEIGHT = Number(getArg('height', '600'))
const OUTPUT = getArg('output', 'docs/screenshots/demo.gif')
const KIOSK = hasFlag('kiosk')

const TOTAL_FRAMES = DURATION_SEC * FPS
const FRAME_DELAY_MS = 1000 / FPS

// ── Fake agent simulation ───────────────────────────────────────
// Simulates 3 agents with realistic tool activity patterns

const FAKE_AGENTS = [
  { sessionId: 'agent-1', folderName: 'my-project', tools: ['Edit', 'Write', 'Bash'] },
  { sessionId: 'agent-2', folderName: 'api-server', tools: ['Read', 'Grep', 'Glob'] },
  { sessionId: 'agent-3', folderName: 'frontend', tools: ['Edit', 'Bash', 'Write'] },
]

function makeLine(role, content) {
  return JSON.stringify({ type: role, ...content })
}

function makeToolUseLine(toolName, toolId) {
  return makeLine('assistant', {
    message: {
      content: [{ type: 'tool_use', id: toolId, name: toolName, input: {} }]
    }
  })
}

function makeToolResultLine(toolId) {
  return makeLine('user', {
    message: {
      content: [{ type: 'tool_result', tool_use_id: toolId }]
    }
  })
}

function makeTurnDoneLine() {
  return makeLine('system', { subtype: 'turn_duration', data: { duration_ms: 5000 } })
}

async function simulateAgents(wsUrl) {
  const ws = new WebSocket(`${wsUrl}?machineId=demo-recorder`)
  await new Promise((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })

  // Create agents
  for (const agent of FAKE_AGENTS) {
    ws.send(JSON.stringify({ type: 'session-start', sessionId: agent.sessionId, folderName: agent.folderName }))
  }
  // Mark replay done so they appear as live agents
  for (const agent of FAKE_AGENTS) {
    ws.send(JSON.stringify({ type: 'session-replay-done', sessionId: agent.sessionId }))
  }

  await sleep(500)

  // Activity simulation loop — runs in background during recording
  let running = true
  const activityLoop = async () => {
    let toolCounter = 0
    while (running) {
      for (const agent of FAKE_AGENTS) {
        // Random chance to start/stop tools
        if (Math.random() < 0.3) {
          const toolId = `tool_${++toolCounter}`
          const toolName = agent.tools[Math.floor(Math.random() * agent.tools.length)]
          // Start tool
          ws.send(JSON.stringify({
            type: 'session-line',
            sessionId: agent.sessionId,
            line: makeToolUseLine(toolName, toolId),
          }))
          // End tool after a delay
          const endDelay = 1000 + Math.random() * 3000
          setTimeout(() => {
            if (!running) return
            ws.send(JSON.stringify({
              type: 'session-line',
              sessionId: agent.sessionId,
              line: makeToolResultLine(toolId),
            }))
          }, endDelay)
        }
      }
      await sleep(800 + Math.random() * 1200)
    }
  }
  activityLoop()

  // Make agent-3 waiting after 2s
  setTimeout(() => {
    if (!running) return
    ws.send(JSON.stringify({
      type: 'session-line',
      sessionId: 'agent-3',
      line: makeTurnDoneLine(),
    }))
  }, 2000)

  return {
    stop: () => {
      running = false
      ws.close()
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Main recording logic ────────────────────────────────────────

async function main() {
  let serverProcess = null
  let simulator = null

  try {
    if (SIMULATE) {
      console.log(`Starting clean server on port ${SIM_PORT}...`)
      // Start server with a temp empty dir so it finds no real sessions
      const emptyDir = path.join(__dirname, '..', '.demo-tmp')
      fs.mkdirSync(emptyDir, { recursive: true })
      // We can't override projectsRoot, but we can start on a different port
      // and the server will still scan ~/.claude/projects — that's OK, we just
      // need a fresh server. The reporters will add our fake agents on top.
      serverProcess = spawn('node', [path.join(__dirname, '..', 'standalone-server.js')], {
        env: { ...process.env, PORT: String(SIM_PORT), NO_SCAN: '1' },
        stdio: 'pipe',
      })
      serverProcess.stderr.on('data', (d) => process.stderr.write(d))

      // Wait for server to be ready
      console.log('Waiting for server...')
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch(`http://localhost:${SIM_PORT}/api/status`)
          if (res.ok) break
        } catch {}
        await sleep(500)
      }

      // Connect fake reporter
      console.log('Connecting simulated agents...')
      simulator = await simulateAgents(`ws://localhost:${SIM_PORT}/ws/report`)
      await sleep(2000) // Let agents settle into positions
    }

    const url = KIOSK ? `${BASE_URL}/?kiosk` : BASE_URL
    console.log(`Recording ${DURATION_SEC}s @ ${FPS}fps (${TOTAL_FRAMES} frames) → ${OUTPUT}`)
    console.log(`Viewport: ${WIDTH}x${HEIGHT}, URL: ${url}`)

    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })

    await page.goto(url)
    console.log('Waiting for app to render...')
    await page.waitForTimeout(4000)

    // Set up GIF encoder
    const gif = GIFEncoder()

    console.log('Recording frames...')
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const buffer = await page.screenshot({ type: 'png' })
      const png = PNG.sync.read(buffer)
      const rgba = new Uint8Array(png.data)
      const palette = quantize(rgba, 256, { format: 'rgba444' })
      const index = applyPalette(rgba, palette, 'rgba444')
      gif.writeFrame(index, WIDTH, HEIGHT, { palette, delay: Math.round(1000 / FPS) })

      if ((i + 1) % FPS === 0 || i === TOTAL_FRAMES - 1) {
        process.stdout.write(`  ${i + 1}/${TOTAL_FRAMES} frames\r`)
      }
      await page.waitForTimeout(FRAME_DELAY_MS)
    }

    console.log(`\nEncoding...`)
    gif.finish()

    const outputPath = path.resolve(OUTPUT)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, gif.bytes())

    await browser.close()

    const stat = fs.statSync(outputPath)
    console.log(`Done! ${outputPath} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`)

  } finally {
    if (simulator) simulator.stop()
    if (serverProcess) {
      serverProcess.kill()
      // Clean up temp dir
      try { fs.rmSync(path.join(__dirname, '..', '.demo-tmp'), { recursive: true }) } catch {}
    }
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
