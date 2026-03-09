#!/usr/bin/env node
/**
 * Record an animated GIF demo of Pixel Office using Playwright + gifenc.
 *
 * Usage:
 *   node scripts/record-demo-gif.js [options]
 *
 * Options:
 *   --url        Base URL (default: http://localhost:3300)
 *   --duration   Recording duration in seconds (default: 8)
 *   --fps        Frames per second (default: 10)
 *   --width      Viewport width (default: 960)
 *   --height     Viewport height (default: 600)
 *   --output     Output GIF path (default: docs/screenshots/demo.gif)
 *   --kiosk      Record kiosk mode instead of normal view
 *
 * Requires: npm install --save-dev playwright gifenc
 *           npx playwright install chromium
 */

const { chromium } = require('playwright')
const { GIFEncoder, quantize, applyPalette } = require('gifenc')
const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')

// Parse CLI args
const args = process.argv.slice(2)
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback
}
const hasFlag = (name) => args.includes(`--${name}`)

const BASE_URL = getArg('url', 'http://localhost:3300')
const DURATION_SEC = Number(getArg('duration', '8'))
const FPS = Number(getArg('fps', '10'))
const WIDTH = Number(getArg('width', '960'))
const HEIGHT = Number(getArg('height', '600'))
const OUTPUT = getArg('output', 'docs/screenshots/demo.gif')
const KIOSK = hasFlag('kiosk')

const TOTAL_FRAMES = DURATION_SEC * FPS
const FRAME_DELAY_MS = 1000 / FPS

async function main() {
  console.log(`Recording ${DURATION_SEC}s @ ${FPS}fps (${TOTAL_FRAMES} frames) → ${OUTPUT}`)
  console.log(`Viewport: ${WIDTH}x${HEIGHT}, URL: ${BASE_URL}${KIOSK ? '/?kiosk' : ''}`)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })

  const url = KIOSK ? `${BASE_URL}/?kiosk` : BASE_URL
  await page.goto(url)

  // Wait for the app to load and render
  console.log('Waiting for app to load...')
  await page.waitForTimeout(4000)

  // Set up GIF encoder
  const gif = GIFEncoder()

  console.log('Recording frames...')

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const buffer = await page.screenshot({ type: 'png' })
    const png = PNG.sync.read(buffer)

    // Convert RGBA to RGB array for gifenc
    const rgba = new Uint8Array(png.data)

    // Quantize to 256-color palette
    const palette = quantize(rgba, 256, { format: 'rgba444' })
    const index = applyPalette(rgba, palette, 'rgba444')

    // Write frame (delay in 1/100ths of a second)
    gif.writeFrame(index, WIDTH, HEIGHT, {
      palette,
      delay: Math.round(1000 / FPS),
    })

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
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
