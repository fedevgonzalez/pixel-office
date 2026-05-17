#!/usr/bin/env node
// Integrate AI-generated sprite sheets into pixel-office.
//
// Usage:
//   node scripts/integrate-sprite-sheet.mjs <input.png> <type> <out-name>
//   type ∈ { char, pet }
//
// Pipeline:
//   1. Run proper-pixel-art (https://github.com/KennethJAllen/proper-pixel-art)
//      via uvx to clean anti-aliasing and quantize to a tight palette. Requires
//      `uvx` (part of `uv`). Install with:  brew install uv
//   2. Find sprite bounding boxes by scanning for non-transparent regions in
//      the cleaned image, then cluster them into the expected rows × cols.
//   3. Nearest-neighbor downscale each sprite into a target cell (24×32 chars,
//      32×32 pets) and compose into the final sheet. The detector tolerates
//      ChatGPT's non-uniform layout (frames spaced unevenly with variable
//      padding) by using transparent gaps as separators rather than assuming
//      a strict uniform 1/cols × 1/rows grid.
//
// **Best results:** generate the source PNGs with ChatGPT image gen. Gemini
// bakes the transparency-checker pattern into the file as opaque pixels and
// step 2 fails. ChatGPT outputs proper alpha channels.

import { PNG } from 'pngjs'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

const [, , inputPath, type, outName] = process.argv
if (!inputPath || !type || !outName) {
  console.error('usage: integrate-sprite-sheet.mjs <input.png> <char|pet> <out-name>')
  process.exit(1)
}

// Target cell dimensions per asset type.
// - char 24×32: bumped from 16×32 to allow visible accessories (glasses, ties).
//   Legacy 16-wide sheets are still accepted by the runtime loader.
// - pet 32×32: bumped from 16×16 so different species look proportionally
//   different (kitten ~20×20, shepherd ~30×28) within the same cell.
const TARGETS = {
  char: { cols: 7, rows: 3, cellW: 24, cellH: 32 },
  pet:  { cols: 5, rows: 3, cellW: 32, cellH: 32 },
}
const target = TARGETS[type]
if (!target) { console.error(`unknown type: ${type}`); process.exit(1) }

// ── 1. Clean with proper-pixel-art ───────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppa-'))
const cleaned = path.join(tmpDir, 'cleaned.png')
console.log(`→ cleaning with proper-pixel-art…`)
try {
  execFileSync('uvx', [
    '--from', 'proper-pixel-art', 'ppa',
    inputPath, '-o', cleaned,
    '-c', '8', '-s', '1', '-t',
  ], { stdio: ['ignore', 'inherit', 'inherit'] })
} catch (e) {
  console.error('ppa failed. Is `uv` installed?  brew install uv')
  process.exit(1)
}

const src = PNG.sync.read(fs.readFileSync(cleaned))
console.log(`  cleaned to ${src.width} × ${src.height}`)

const idx = (x, y) => (y * src.width + x) * 4
const alphaAt = (x, y) => src.data[idx(x, y) + 3]

// ── 2. Find sprite bounding boxes ────────────────────────────
// Scan for non-transparent rows; runs become row bands. Same for columns
// inside each row band → cell bounding boxes. With real PNG transparency
// this is trivial; no BG color heuristics needed.
function findRunBands(isContentAt, length, expectedCount) {
  const bands = []
  let start = -1
  for (let i = 0; i < length; i++) {
    if (isContentAt(i)) { if (start < 0) start = i }
    else { if (start >= 0) { bands.push([start, i - 1]); start = -1 } }
  }
  if (start >= 0) bands.push([start, length - 1])
  // Discard noise bands (single-pixel orphans from stray AA leftovers)
  const minSize = type === 'char' ? 6 : 4
  const real = bands.filter(([a, b]) => b - a + 1 >= minSize)
  if (real.length !== expectedCount) {
    console.warn(`!! found ${real.length} bands, expected ${expectedCount} — falling back to even split`)
    const step = Math.floor(length / expectedCount)
    return Array.from({ length: expectedCount }, (_, i) => [i * step, (i + 1) * step - 1])
  }
  return real
}

const rowContent = (y) => {
  for (let x = 0; x < src.width; x++) if (alphaAt(x, y) > 32) return true
  return false
}
const rowBands = findRunBands(rowContent, src.height, target.rows)
console.log(`  row bands: ${rowBands.map(([a, b]) => `[${a},${b}]`).join(' ')}`)

const colBandsPerRow = rowBands.map(([yLo, yHi]) => {
  const colContent = (x) => {
    for (let y = yLo; y <= yHi; y++) if (alphaAt(x, y) > 32) return true
    return false
  }
  return findRunBands(colContent, src.width, target.cols)
})

// ── 3. Resample each cell into a target tile ─────────────────
// Nearest-neighbor with center-of-block sampling. Source cells aren't square
// (16×32 char cells in particular) so we map source extents proportionally
// into the target cell, preserving baseline alignment by anchoring at center.
function resampleCellInto(out, outOffsetX, outOffsetY, x0, y0, x1, y1) {
  const srcW = x1 - x0 + 1
  const srcH = y1 - y0 + 1
  for (let oy = 0; oy < target.cellH; oy++) {
    for (let ox = 0; ox < target.cellW; ox++) {
      const sx = x0 + Math.min(srcW - 1, Math.floor(((ox + 0.5) / target.cellW) * srcW))
      const sy = y0 + Math.min(srcH - 1, Math.floor(((oy + 0.5) / target.cellH) * srcH))
      const si = idx(sx, sy)
      const dx = outOffsetX + ox
      const dy = outOffsetY + oy
      const di = (dy * (target.cols * target.cellW) + dx) * 4
      out.data[di]     = src.data[si]
      out.data[di + 1] = src.data[si + 1]
      out.data[di + 2] = src.data[si + 2]
      out.data[di + 3] = src.data[si + 3]
    }
  }
}

const outW = target.cols * target.cellW
const outH = target.rows * target.cellH
const out = new PNG({ width: outW, height: outH })
out.data.fill(0)

const palette = new Set()
for (let r = 0; r < target.rows; r++) {
  const [yLo, yHi] = rowBands[r]
  const cols = colBandsPerRow[r]
  for (let c = 0; c < target.cols; c++) {
    const [xLo, xHi] = cols[c]
    resampleCellInto(out, c * target.cellW, r * target.cellH, xLo, yLo, xHi, yHi)
  }
}
for (let i = 0; i < out.data.length; i += 4) {
  if (out.data[i + 3] > 0) palette.add(`${out.data[i]},${out.data[i + 1]},${out.data[i + 2]}`)
}

const outDir = type === 'char'
  ? path.join('webview-ui/public/assets/characters')
  : path.join('webview-ui/public/assets/pets')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, `${outName}.png`)
fs.writeFileSync(outPath, PNG.sync.write(out))
fs.rmSync(tmpDir, { recursive: true, force: true })

console.log(`\n✓ wrote ${outPath}`)
console.log(`  dimensions: ${outW} × ${outH}`)
console.log(`  unique colors: ${palette.size}`)
