// Pixel-office layout source format <-> engine format (pure, no deps).
//
// The engine consumes a FLAT layout: parallel arrays (tiles[], tileColors[],
// tileThemes[], zones[]) indexed row*cols+col, plus furniture[]/pets[]/background.
// That is efficient for the renderer/pathfinder but hostile to edit by hand or
// by an LLM (you must compute exact indices and keep four arrays in lockstep).
//
// This module adds a human/LLM-friendly SOURCE format that round-trips to the
// engine format. The engine never sees the source; only authoring tools do.
//
//   compile(source)   -> engine layout (flat, version:1) — what the engine reads
//   decompile(layout) -> source        (ASCII map + legend + sections)
//
// Source shape:
//   {
//     "format": "pixel-office-source@1",
//     "size": { "cols": N, "rows": M },
//     "legend": { "<glyph>": { "tile": "FLOOR_5", "color": {...}?, "theme": "..."?, "zone": "play"? }, ... },
//     "map": ["<N chars>", ... M rows],
//     "furniture": [ { "type": "...", "at": [col,row], "uid"?, "color"? }, ... ],
//     "pets":      [ { "species": "...", "name": "...", "at": [col,row], ... }, ... ],
//     "background": { ... },
//     "version": 1
//   }

export const SOURCE_FORMAT = 'pixel-office-source@1'

// TileType (mirrors webview-ui/src/office/types.ts) — name <-> numeric value.
const TILE_NAME_TO_VALUE = {
  WALL: 0, FLOOR_1: 1, FLOOR_2: 2, FLOOR_3: 3, FLOOR_4: 4,
  FLOOR_5: 5, FLOOR_6: 6, FLOOR_7: 7, VOID: 8,
}
const TILE_VALUE_TO_NAME = Object.fromEntries(
  Object.entries(TILE_NAME_TO_VALUE).map(([k, v]) => [v, k]),
)
const VALID_ZONES = new Set(['focus', 'play'])

// Glyphs reserved for the common cases so a decompiled map reads intuitively.
const PREFERRED = { WALL: '#', VOID: '~', __play: 'g', __focus: 'f', __floor: '.' }
// General pool for everything else, in a stable order. Excludes the reserved
// glyphs above and anything ambiguous (space, quotes, backslash).
const GLYPH_POOL = (
  ',:;=+-*o0123456789' +
  'abcdehijklmnpqrstuvwxyz' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  "!$%&/?<>[]{}()@"
).split('')

// Canonical key for grouping cells into one legend glyph.
function cellKey(tile, color, theme, zone) {
  return JSON.stringify([tile, color ?? null, theme ?? null, zone ?? null])
}

function normalizeParallel(arr, len) {
  const out = Array.isArray(arr) ? arr.slice(0, len) : []
  while (out.length < len) out.push(null)
  return out
}

/** engine flat layout -> source (ASCII map + legend + sections). */
export function decompile(layout) {
  const cols = layout.cols, rows = layout.rows, n = cols * rows
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) {
    throw new Error('decompile: layout.cols/rows must be integers')
  }
  if (!Array.isArray(layout.tiles) || layout.tiles.length !== n) {
    throw new Error(`decompile: tiles length ${layout.tiles?.length} != cols*rows ${n}`)
  }
  const tileColors = normalizeParallel(layout.tileColors, n)
  const tileThemes = normalizeParallel(layout.tileThemes, n)
  const zones = normalizeParallel(layout.zones, n)

  const used = new Set()
  const keyToGlyph = new Map()
  const legend = {}
  let floorGlyphTaken = false

  function takeGlyph(tileName, zone) {
    // preferred assignments first, if still free
    if (tileName === 'WALL' && !used.has(PREFERRED.WALL)) return PREFERRED.WALL
    if (tileName === 'VOID' && !used.has(PREFERRED.VOID)) return PREFERRED.VOID
    if (zone === 'play' && !used.has(PREFERRED.__play)) return PREFERRED.__play
    if (zone === 'focus' && !used.has(PREFERRED.__focus)) return PREFERRED.__focus
    if (!zone && tileName.startsWith('FLOOR') && !floorGlyphTaken && !used.has(PREFERRED.__floor)) {
      floorGlyphTaken = true
      return PREFERRED.__floor
    }
    for (const g of GLYPH_POOL) if (!used.has(g)) return g
    throw new Error('decompile: ran out of glyphs (too many distinct cell types)')
  }

  const mapRows = []
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const tile = layout.tiles[i]
      const tileName = TILE_VALUE_TO_NAME[tile]
      if (tileName === undefined) throw new Error(`decompile: unknown tile value ${tile} at (${c},${r})`)
      const color = tileColors[i], theme = tileThemes[i], zone = zones[i]
      const key = cellKey(tile, color, theme, zone)
      let glyph = keyToGlyph.get(key)
      if (glyph === undefined) {
        glyph = takeGlyph(tileName, zone)
        used.add(glyph)
        keyToGlyph.set(key, glyph)
        const entry = { tile: tileName }
        if (color != null) entry.color = color
        if (theme != null) entry.theme = theme
        if (zone != null) entry.zone = zone
        legend[glyph] = entry
      }
      line += glyph
    }
    mapRows.push(line)
  }

  const source = {
    format: SOURCE_FORMAT,
    size: { cols, rows },
    legend,
    map: mapRows,
    furniture: (layout.furniture || []).map((f) => {
      const out = { type: f.type, at: [f.col, f.row] }
      if (f.uid !== undefined) out.uid = f.uid
      if (f.color !== undefined) out.color = f.color
      return out
    }),
    pets: (layout.pets || []).map((p) => {
      const { col, row, ...rest } = p
      return { ...rest, at: [col, row] }
    }),
    version: layout.version ?? 1,
  }
  if (layout.background !== undefined) source.background = layout.background
  return source
}

/** source (ASCII map + legend + sections) -> engine flat layout (version:1). */
export function compile(source) {
  if (!source || typeof source !== 'object') throw new Error('compile: source must be an object')
  if (source.format && source.format !== SOURCE_FORMAT) {
    throw new Error(`compile: unsupported format "${source.format}" (expected ${SOURCE_FORMAT})`)
  }
  const size = source.size || {}
  const cols = size.cols, rows = size.rows
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) {
    throw new Error('compile: size.cols/size.rows must be positive integers')
  }
  if (!Array.isArray(source.map)) throw new Error('compile: map must be an array of strings')
  if (source.map.length !== rows) {
    throw new Error(`compile: map has ${source.map.length} rows, size.rows is ${rows}`)
  }
  const legend = source.legend || {}
  // pre-resolve legend entries to validated, expanded specs
  const spec = {}
  for (const [glyph, e] of Object.entries(legend)) {
    if (glyph.length !== 1) throw new Error(`compile: legend glyph "${glyph}" must be a single char`)
    if (!e || typeof e !== 'object' || typeof e.tile !== 'string') {
      throw new Error(`compile: legend "${glyph}" needs a {tile} string`)
    }
    if (!(e.tile in TILE_NAME_TO_VALUE)) {
      throw new Error(`compile: legend "${glyph}" has unknown tile "${e.tile}" (valid: ${Object.keys(TILE_NAME_TO_VALUE).join(',')})`)
    }
    if (e.zone != null && !VALID_ZONES.has(e.zone)) {
      throw new Error(`compile: legend "${glyph}" has invalid zone "${e.zone}" (valid: focus,play)`)
    }
    spec[glyph] = {
      value: TILE_NAME_TO_VALUE[e.tile],
      color: e.color ?? null,
      theme: e.theme ?? null,
      zone: e.zone ?? null,
    }
  }

  const n = cols * rows
  const tiles = new Array(n)
  const tileColors = new Array(n)
  const tileThemes = new Array(n)
  const zones = new Array(n)

  for (let r = 0; r < rows; r++) {
    const line = source.map[r]
    if (typeof line !== 'string') throw new Error(`compile: map row ${r} is not a string`)
    if (line.length !== cols) {
      throw new Error(`compile: map row ${r} is ${line.length} chars, size.cols is ${cols}`)
    }
    for (let c = 0; c < cols; c++) {
      const glyph = line[c]
      const s = spec[glyph]
      if (!s) throw new Error(`compile: map (${c},${r}) uses glyph "${glyph}" not in legend`)
      const i = r * cols + c
      tiles[i] = s.value
      tileColors[i] = s.color
      tileThemes[i] = s.theme
      zones[i] = s.zone
    }
  }

  const layout = {
    version: source.version ?? 1,
    cols, rows,
    tiles, tileColors, tileThemes, zones,
    furniture: (source.furniture || []).map((f, idx) => {
      if (!f || typeof f.type !== 'string') throw new Error(`compile: furniture[${idx}] needs a {type}`)
      if (!Array.isArray(f.at) || f.at.length !== 2) throw new Error(`compile: furniture[${idx}] needs at:[col,row]`)
      const out = { uid: f.uid ?? `f-${idx}`, type: f.type, col: f.at[0], row: f.at[1] }
      if (f.color !== undefined) out.color = f.color
      return out
    }),
    pets: (source.pets || []).map((p, idx) => {
      if (!Array.isArray(p.at) || p.at.length !== 2) throw new Error(`compile: pets[${idx}] needs at:[col,row]`)
      const { at, ...rest } = p
      return { ...rest, col: at[0], row: at[1] }
    }),
  }
  if (source.background !== undefined) layout.background = source.background
  return layout
}

/** Normalize an engine layout so a decompile/compile round-trip can be compared
 *  for equality (parallel arrays padded to cols*rows; furniture uids defaulted
 *  the same way compile() does). Pure; does not mutate the input. */
export function normalizeLayout(layout) {
  const n = layout.cols * layout.rows
  return {
    version: layout.version ?? 1,
    cols: layout.cols, rows: layout.rows,
    tiles: layout.tiles.slice(0, n),
    tileColors: normalizeParallel(layout.tileColors, n),
    tileThemes: normalizeParallel(layout.tileThemes, n),
    zones: normalizeParallel(layout.zones, n),
    furniture: (layout.furniture || []).map((f, idx) => {
      const out = { uid: f.uid ?? `f-${idx}`, type: f.type, col: f.col, row: f.row }
      if (f.color !== undefined) out.color = f.color
      return out
    }),
    pets: (layout.pets || []).map((p) => ({ ...p })),
    ...(layout.background !== undefined ? { background: layout.background } : {}),
  }
}
