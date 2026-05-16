#!/usr/bin/env node
// Integrate AI-generated sprite sheets into pixel-office.
//
// Usage:
//   node scripts/integrate-sprite-sheet.mjs <input.png> <type> <out-name>
//   type ∈ { char, pet }
//
// What it does:
//   1. Detects the cell grid by scanning for transparent or "BG checker" stripes.
//   2. Extracts each cell, strips BG (flood fill from cell corners against BG palette).
//   3. Nearest-neighbor downscales each cell to the project target (16×32 for chars,
//      16×16 for pets) using a "majority non-BG color" rule per source block.
//   4. Writes a clean PNG to webview-ui/public/assets/characters/<name>.png (or pets/).
//
// Heuristics intentionally tolerant — AI outputs vary in scale, dividers, BG fill.

import { PNG } from 'pngjs'
import fs from 'fs'
import path from 'path'

const [, , inputPath, type, outName] = process.argv
if (!inputPath || !type || !outName) {
  console.error('usage: integrate-sprite-sheet.mjs <input.png> <char|pet> <out-name>')
  process.exit(1)
}

const TARGETS = {
  char: { cols: 7, rows: 3, cellW: 16, cellH: 32 },
  pet:  { cols: 5, rows: 3, cellW: 16, cellH: 16 },
}
const target = TARGETS[type]
if (!target) { console.error(`unknown type: ${type}`); process.exit(1) }

const src = PNG.sync.read(fs.readFileSync(inputPath))
console.log(`loaded ${src.width} × ${src.height} (RGBA)`)

const idx = (x, y) => (y * src.width + x) * 4
const get = (x, y) => [src.data[idx(x,y)], src.data[idx(x,y)+1], src.data[idx(x,y)+2], src.data[idx(x,y)+3]]

// ── BG detection ─────────────────────────────────────────────
// Sample corner-adjacent regions; the dominant 2 colors are likely the
// checkerboard BG tiles. Also accept fully-transparent pixels.
function detectBG() {
  const counts = new Map()
  const sampleAreas = [
    [0, 0, 30, 30],
    [src.width - 30, 0, src.width, 30],
    [0, src.height - 30, 30, src.height],
    [src.width - 30, src.height - 30, src.width, src.height],
  ]
  for (const [x0, y0, x1, y1] of sampleAreas) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const [r, g, b, a] = get(x, y)
        if (a < 8) continue
        // Bucket into 8-step quantized color so near-identical pixels group
        const key = `${r >> 3}_${g >> 3}_${b >> 3}`
        counts.set(key, (counts.get(key) || 0) + 1)
      }
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  // Take any color appearing in >5% of sampled corner pixels as BG
  const total = sorted.reduce((s, [, n]) => s + n, 0)
  const bgKeys = new Set(sorted.filter(([, n]) => n / total > 0.05).map(([k]) => k))
  console.log(`detected BG color buckets: ${[...bgKeys].join(', ')}`)
  return bgKeys
}
const bgKeys = detectBG()
function isBG(r, g, b, a) {
  if (a < 8) return true
  return bgKeys.has(`${r >> 3}_${g >> 3}_${b >> 3}`)
}

// ── Palette extraction ────────────────────────────────────────
// Find the N dominant non-BG colors in the source image. We quantize to
// 5-bit/channel to bucket near-identical AA shades together, then take
// the most frequent buckets. Output pixels later snap to this palette.
function extractPalette(n = 8) {
  const counts = new Map()
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const [r, g, b, a] = get(x, y)
      if (isBG(r, g, b, a)) continue
      const key = `${r >> 3}_${g >> 3}_${b >> 3}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  // Frequency-sorted candidate list
  const candidates = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, c]) => ({ rgb: k.split('_').map((v) => (Number(v) << 3) | 4), count: c }))

  // Greedy diversification: pick most-frequent, then each next must be ≥
  // MIN_DIST away (RGB euclidean) from every already-picked color. This
  // prevents 3 near-identical pink shades from monopolizing the palette
  // while a less-frequent but visually distinct color (e.g. green hoodie)
  // gets skipped.
  const MIN_DIST = 50 // ~ noticeable color jump
  const palette = []
  for (const c of candidates) {
    if (palette.length === 0) { palette.push(c.rgb); continue }
    const ok = palette.every((p) => {
      const dr = p[0] - c.rgb[0], dg = p[1] - c.rgb[1], db = p[2] - c.rgb[2]
      return Math.sqrt(dr*dr + dg*dg + db*db) >= MIN_DIST
    })
    if (ok) palette.push(c.rgb)
    if (palette.length >= n) break
  }
  console.log(`extracted palette (${palette.length} colors):`)
  for (const [r, g, b] of palette) console.log(`  rgb(${r}, ${g}, ${b})  #${[r,g,b].map((v)=>v.toString(16).padStart(2,'0')).join('')}`)
  return palette
}
const palette = extractPalette(8)
function snapToPalette(r, g, b) {
  let best = palette[0], bd = Infinity
  for (const p of palette) {
    const d = (p[0]-r)**2 + (p[1]-g)**2 + (p[2]-b)**2
    if (d < bd) { bd = d; best = p }
  }
  return best
}

// ── Divider lines ────────────────────────────────────────────
// Sample 1-px-wide vertical stripes; any stripe whose pixels are >85%
// either BG or near-black (regardless of bgKeys hit) is treated as a
// row/column divider. Black-line dividers won't pass the BG color check
// so we add explicit "near-black" tolerance here.
function isDividerStripe(stripePixels) {
  let div = 0
  for (const [r, g, b, a] of stripePixels) {
    if (isBG(r, g, b, a)) { div++; continue }
    if (a > 200 && r < 30 && g < 30 && b < 35) { div++; continue }
  }
  return div / stripePixels.length > 0.85
}

function detectGridX() {
  const flags = []
  for (let x = 0; x < src.width; x++) {
    const strip = []
    for (let y = 0; y < src.height; y++) strip.push(get(x, y))
    flags.push(isDividerStripe(strip))
  }
  return flags
}
function detectGridY() {
  const flags = []
  for (let y = 0; y < src.height; y++) {
    const strip = []
    for (let x = 0; x < src.width; x++) strip.push(get(x, y))
    flags.push(isDividerStripe(strip))
  }
  return flags
}

function bandsFromFlags(flags, expectedBands) {
  // Find runs of non-divider stripes → these are the content bands.
  const bands = []
  let start = -1
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) { if (start < 0) start = i }
    else { if (start >= 0) { bands.push([start, i - 1]); start = -1 } }
  }
  if (start >= 0) bands.push([start, flags.length - 1])
  // Filter out micro-bands (under 8px — too small to be a cell)
  const real = bands.filter(([a, b]) => b - a + 1 >= 8)
  console.log(`bands found: ${real.length} (expected ${expectedBands})`)
  if (real.length !== expectedBands) {
    console.warn(`!! band count mismatch — falling back to even split`)
    const cellSize = Math.floor(flags.length / expectedBands)
    return Array.from({ length: expectedBands }, (_, i) => [i * cellSize, (i + 1) * cellSize - 1])
  }
  return real
}

const colBands = bandsFromFlags(detectGridX(), target.cols)
const rowBands = bandsFromFlags(detectGridY(), target.rows)
console.log(`col bands:`, colBands)
console.log(`row bands:`, rowBands)

// ── Resample each cell to target size ─────────────────────────
// For each output pixel, average source pixels in the corresponding
// source block; if majority is BG, emit transparent; otherwise emit
// the dominant non-BG color (quantized to 4 bits/channel to suppress
// near-identical color noise).
function resampleCell(x0, y0, x1, y1, outW, outH) {
  const out = new Uint8Array(outW * outH * 4)
  const srcW = x1 - x0 + 1
  const srcH = y1 - y0 + 1
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const sx0 = x0 + Math.floor((ox * srcW) / outW)
      const sy0 = y0 + Math.floor((oy * srcH) / outH)
      const sx1 = x0 + Math.floor(((ox + 1) * srcW) / outW)
      const sy1 = y0 + Math.floor(((oy + 1) * srcH) / outH)
      const counts = new Map()
      let bg = 0, fg = 0
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const [r, g, b, a] = get(sx, sy)
          if (isBG(r, g, b, a)) { bg++; continue }
          // Quantize to 4-bit per channel to merge anti-alias noise
          const qr = (r >> 4) << 4, qg = (g >> 4) << 4, qb = (b >> 4) << 4
          const key = `${qr}_${qg}_${qb}`
          counts.set(key, (counts.get(key) || 0) + 1)
          fg++
        }
      }
      const i = (oy * outW + ox) * 4
      if (bg >= fg || fg === 0) {
        out[i] = 0; out[i+1] = 0; out[i+2] = 0; out[i+3] = 0
      } else {
        // Pick the most frequent quantized color in this source block,
        // then snap it to the global palette to suppress AA leakage.
        const parts = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split('_').map(Number)
        const [pr, pg, pb] = snapToPalette(parts[0], parts[1], parts[2])
        out[i] = pr; out[i+1] = pg; out[i+2] = pb; out[i+3] = 255
      }
    }
  }
  return out
}

// ── Compose final PNG ────────────────────────────────────────
const outW = target.cols * target.cellW
const outH = target.rows * target.cellH
const out = new PNG({ width: outW, height: outH })
out.data.fill(0)

const finalPalette = new Set()
for (let r = 0; r < target.rows; r++) {
  for (let c = 0; c < target.cols; c++) {
    const [x0, x1] = colBands[c]
    const [y0, y1] = rowBands[r]
    const cell = resampleCell(x0, y0, x1, y1, target.cellW, target.cellH)
    for (let py = 0; py < target.cellH; py++) {
      for (let px = 0; px < target.cellW; px++) {
        const si = (py * target.cellW + px) * 4
        const dx = c * target.cellW + px
        const dy = r * target.cellH + py
        const di = (dy * outW + dx) * 4
        out.data[di]   = cell[si]
        out.data[di+1] = cell[si+1]
        out.data[di+2] = cell[si+2]
        out.data[di+3] = cell[si+3]
        if (cell[si+3] > 0) finalPalette.add(`${cell[si]},${cell[si+1]},${cell[si+2]}`)
      }
    }
  }
}

const outDir = type === 'char'
  ? path.join('webview-ui/public/assets/characters')
  : path.join('webview-ui/public/assets/pets')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, `${outName}.png`)
fs.writeFileSync(outPath, PNG.sync.write(out))
console.log(`\n✓ wrote ${outPath}`)
console.log(`  dimensions: ${outW} × ${outH}`)
console.log(`  unique colors: ${finalPalette.size}`)
if (finalPalette.size > 14) console.warn(`  !! many unique colors — may indicate anti-aliasing leaked through`)
