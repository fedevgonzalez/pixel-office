/**
 * Wall tile auto-tiling: sprite storage and bitmask-based piece selection.
 *
 * Stores 16 wall sprites (one per 4-bit bitmask) loaded from walls.png.
 * At render time, each wall tile's 4 cardinal neighbors are checked to build
 * a bitmask, and the corresponding sprite is drawn directly.
 * No changes to the layout model — auto-tiling is purely visual.
 *
 * Bitmask convention: N=1, E=2, S=4, W=8. Out-of-bounds = NOT wall.
 */

import type { SpriteData, TileType as TileTypeVal, FloorColor, FurnitureInstance } from './types.js'
import { TileType, TILE_SIZE } from './types.js'
import { WALL_FACE_BAND_NATIVE } from '../constants.js'
import { getColorizedSprite } from './colorize.js'
import { getSpriteRenderSize } from './sprites/spriteCache.js'
import { isNorthWall } from './layout/tileKinds.js'

/** 16 wall sprites indexed by bitmask (0-15) — interior / side / south walls. */
let wallSprites: SpriteData[] | null = null
/** 16 wall sprites for camera-facing (north) walls — same bitmask indexing, but
 *  each is taller: a masonry FACE band is appended below the base cell so the
 *  wall reads as a vertical surface that hangs into the floor tile below. */
let wallSpritesNorth: SpriteData[] | null = null
/** Render height (logical px) of a base wall sprite BEFORE the north face band
 *  is appended. North sprites anchor by this height (not their taller own
 *  height) so the original cell stays put and only the extra band hangs DOWN. */
let baseWallRenderHeight = TILE_SIZE

// ── Chunky masonry detail ─────────────────────────────────────────
//
// The loaded walls.png cells are FLAT fills: a warm-grey top band (~#CAC6B9),
// a stark-white front face (#FFFFFF) and a 1px dark edge/seam (#302A28). Next
// to the chunky 3px-block furniture/agents the flat walls read as a different,
// undetailed style. `detailWallSprite` re-tones each non-edge pixel in place —
// WITHOUT changing the wall geometry/shape — into a subtle masonry read:
//   • front face → warm running-bond brick (4px courses, half-brick offset,
//     1px mortar recess + 1px top highlight + 1px bottom shadow per course),
//     and the stark white is toned down to a light plaster so it reads as the
//     lighter element without glaring.
//   • top band → a quiet coping cap (1px shadow lip + 1px highlight per course).
// Dark edges/seams (the 1px outline) are left untouched so auto-tiling stays
// crisp. The whole palette stays inside the existing 3 hues; it just gains a
// handful of derived shades (~11 colors total) at the same ~3px density as the
// rest of the scene. Region detection is by luminance, so it works for any
// walls.png and the colorize path (getColorizedWallSprite) still sees a
// grayscale-luminance ramp and tints it correctly.

/** Luminance bands separating the dark edge / grey top / light face regions. */
const WALL_EDGE_LUM_MAX = 90
const WALL_FACE_LUM_MIN = 235
/** Running-bond brick geometry on the front face (native px). */
const BRICK_COURSE = 4 // course height
const BRICK_LEN = 8 // brick length (vertical joint spacing)
/** Per-region tone deltas (added to each RGB channel, 0-255). */
const FACE_TONE = -26 // tone stark white → light plaster
const FACE_MORTAR = -30 // mortar recess (horizontal + vertical joints)
const FACE_TOP_HI = 12 // 1px highlight under each course (brick top)
const FACE_BOTTOM_SHADE = -7 // 1px shadow at brick bottom
const FACE_WARMTH = 3 // nudge the neutral face slightly warm to match the top
const CAP_SHADOW = -14 // top-band coping shadow lip
const CAP_HIGHLIGHT = 10 // top-band coping highlight

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, v | 0))
}

function pixelLum(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function shadePixel(hex: string, d: number, warm = 0): string {
  const r = clampByte(parseInt(hex.slice(1, 3), 16) + d + warm)
  const g = clampByte(parseInt(hex.slice(3, 5), 16) + d)
  const b = clampByte(parseInt(hex.slice(5, 7), 16) + d - warm)
  const h = (v: number) => v.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase()
}

/** Add subtle chunky masonry detail to one wall cell, preserving its shape. */
function detailWallSprite(cell: SpriteData): SpriteData {
  return cell.map((row, y) =>
    row.map((p, x) => {
      if (p === '') return '' // transparent
      const L = pixelLum(p)
      if (L <= WALL_EDGE_LUM_MAX) return p // keep dark edges/seams crisp
      if (L >= WALL_FACE_LUM_MIN) {
        // Front face: warm running-bond brick.
        let d = FACE_TONE
        const cy = y % BRICK_COURSE
        const offset = ((y / BRICK_COURSE) | 0) % 2 ? BRICK_LEN / 2 : 0
        if (cy === 0) d += FACE_MORTAR // horizontal mortar course
        else if (cy === 1) d += FACE_TOP_HI // brick top highlight
        else if (cy === BRICK_COURSE - 1) d += FACE_BOTTOM_SHADE // brick bottom
        // Vertical joints fall on bricks, not on the mortar course row.
        if (cy !== 0 && (x + offset) % BRICK_LEN === 0) d += FACE_MORTAR
        return shadePixel(p, d, FACE_WARMTH)
      }
      // Top band: quiet coping cap.
      let d = 0
      const by = y % BRICK_COURSE
      if (by === 0) d += CAP_SHADOW
      else if (by === 1) d += CAP_HIGHLIGHT
      else if (by === BRICK_COURSE - 1) d += CAP_SHADOW / 2
      return shadePixel(p, d)
    }),
  )
}

/**
 * Build a NORTH-wall variant of a RAW wall cell by appending a masonry FACE band
 * below it. The raw walls.png cell is a warm-grey top band + a stark-white front
 * face + a 1px dark border. For a north wall (floor below) the bottom border is
 * a closed dark edge; we replace it with `WALL_FACE_BAND_NATIVE` extra rows of
 * front-face (stark white, seeded per-column from the cell's existing face) and
 * re-close the bottom with the cell's own dark edge color. Running this through
 * `detailWallSprite` afterwards tones the new rows into the SAME running-bond
 * brick as the rest of the face (its luminance test catches the white), so the
 * band is visually seamless. Columns that are transparent at the cell's base
 * (auto-tile corners/edges) stay transparent so no face sticks out past the wall.
 */
function extendToNorthWallSprite(rawCell: SpriteData): SpriteData {
  const band = WALL_FACE_BAND_NATIVE
  if (band <= 0 || rawCell.length === 0) return rawCell
  const w = rawCell[0].length

  // Per column: lightest opaque pixel (front-face color) and darkest opaque
  // pixel (the dark edge color). Used to seed the band + re-close the bottom.
  const faceColor: (string | null)[] = []
  const edgeColor: (string | null)[] = []
  for (let x = 0; x < w; x++) {
    let lightest: string | null = null
    let lightestL = -1
    let darkest: string | null = null
    let darkestL = 256
    for (let y = 0; y < rawCell.length; y++) {
      const p = rawCell[y][x]
      if (p === '') continue
      const L = pixelLum(p)
      if (L > lightestL) { lightestL = L; lightest = p }
      if (L < darkestL) { darkestL = L; darkest = p }
    }
    faceColor.push(lightest)
    edgeColor.push(darkest)
  }

  // Keep all original rows EXCEPT a trailing all-edge bottom border row (we
  // re-add a closing edge after the band). Detect that row: present only when
  // this cell has no wall below (the north case). If the last row is not a
  // closed edge (e.g. a mask that connects downward), leave it as-is.
  const rows = rawCell.map((r) => r.slice())

  const out: SpriteData = rows
  for (let i = 0; i < band; i++) {
    const isLast = i === band - 1
    out.push(
      faceColor.map((fc, x) => {
        if (fc === null) return '' // column has no wall here → no face overhang
        // Last band row closes the face with the cell's dark edge for a crisp base.
        return isLast ? (edgeColor[x] ?? fc) : fc
      }),
    )
  }
  return out
}

/** Set wall sprites (called once when extension sends wallTilesLoaded).
 *  Builds the regular set (detailed in place) AND a parallel north set whose
 *  cells carry a hanging masonry face band, both from the same raw cells. */
export function setWallSprites(sprites: SpriteData[]): void {
  wallSprites = sprites.map(detailWallSprite)
  wallSpritesNorth = sprites.map((s) => detailWallSprite(extendToNorthWallSprite(s)))
  // Anchor north sprites by the BASE (un-extended) height so the original cell
  // stays aligned and only the band hangs below. All cells share one height.
  baseWallRenderHeight = wallSprites[0]
    ? getSpriteRenderSize(wallSprites[0]).height
    : TILE_SIZE
}

/** Check if wall sprites have been loaded */
export function hasWallSprites(): boolean {
  return wallSprites !== null
}

/** 4-bit cardinal-neighbor bitmask (N=1, E=2, S=4, W=8) for auto-tiling. */
function wallNeighborMask(col: number, row: number, tileMap: TileTypeVal[][]): number {
  const tmRows = tileMap.length
  const tmCols = tmRows > 0 ? tileMap[0].length : 0
  let mask = 0
  if (row > 0 && tileMap[row - 1][col] === TileType.WALL) mask |= 1            // N
  if (col < tmCols - 1 && tileMap[row][col + 1] === TileType.WALL) mask |= 2   // E
  if (row < tmRows - 1 && tileMap[row + 1][col] === TileType.WALL) mask |= 4   // S
  if (col > 0 && tileMap[row][col - 1] === TileType.WALL) mask |= 8            // W
  return mask
}

/**
 * Bottom-anchor a wall sprite to its tile. North sprites are taller (they carry
 * a hanging face band) and must anchor by the BASE height so the original cell
 * stays put and only the band hangs DOWN past the tile; regular sprites anchor
 * by their own rendered height. Using rendered height (post legacy auto-upscale)
 * keeps the anchor correct when 16-native cells are upscaled ×3 to fill the tile.
 */
function wallOffsetY(sprite: SpriteData, isNorth: boolean): number {
  const h = isNorth ? baseWallRenderHeight : getSpriteRenderSize(sprite).height
  return TILE_SIZE - h
}

/**
 * Get the wall sprite for a tile based on its cardinal neighbors.
 * North (camera-facing) walls draw the taller face-band variant; all others
 * use the regular set. Returns the sprite + Y offset, or null to fall back to
 * solid WALL_COLOR.
 */
export function getWallSprite(
  col: number,
  row: number,
  tileMap: TileTypeVal[][],
): { sprite: SpriteData; offsetY: number } | null {
  if (!wallSprites) return null

  const mask = wallNeighborMask(col, row, tileMap)
  const north = wallSpritesNorth !== null && isNorthWall(col, row, tileMap)
  const sprite = (north ? wallSpritesNorth! : wallSprites)[mask]
  if (!sprite) return null

  return { sprite, offsetY: wallOffsetY(sprite, north) }
}

/**
 * Get a colorized wall sprite for a tile based on its cardinal neighbors.
 * Uses Colorize mode (grayscale → HSL) like floor tiles.
 * Returns the colorized sprite + Y offset, or null if no wall sprites loaded.
 */
export function getColorizedWallSprite(
  col: number,
  row: number,
  tileMap: TileTypeVal[][],
  color: FloorColor,
): { sprite: SpriteData; offsetY: number } | null {
  if (!wallSprites) return null

  const mask = wallNeighborMask(col, row, tileMap)
  const north = wallSpritesNorth !== null && isNorthWall(col, row, tileMap)
  const sprite = (north ? wallSpritesNorth! : wallSprites)[mask]
  if (!sprite) return null

  const cacheKey = `wall-${north ? 'n-' : ''}${mask}-${color.h}-${color.s}-${color.b}-${color.c}`
  const colorized = getColorizedSprite(cacheKey, sprite, { ...color, colorize: true })

  // Anchor by base height for north (band hangs below); see wallOffsetY.
  return { sprite: colorized, offsetY: wallOffsetY(colorized, north) }
}

/**
 * Build FurnitureInstance-like objects for all wall tiles so they can participate
 * in z-sorting with furniture and characters.
 */
export function getWallInstances(
  tileMap: TileTypeVal[][],
  tileColors?: Array<FloorColor | null>,
  cols?: number,
): FurnitureInstance[] {
  if (!wallSprites) return []
  const tmRows = tileMap.length
  const tmCols = tmRows > 0 ? tileMap[0].length : 0
  const layoutCols = cols ?? tmCols
  const instances: FurnitureInstance[] = []
  for (let r = 0; r < tmRows; r++) {
    for (let c = 0; c < tmCols; c++) {
      if (tileMap[r][c] !== TileType.WALL) continue
      const colorIdx = r * layoutCols + c
      const wallColor = tileColors?.[colorIdx]
      const wallInfo = wallColor
        ? getColorizedWallSprite(c, r, tileMap, wallColor)
        : getWallSprite(c, r, tileMap)
      if (!wallInfo) continue
      instances.push({
        sprite: wallInfo.sprite,
        x: c * TILE_SIZE,
        y: r * TILE_SIZE + wallInfo.offsetY,
        zY: (r + 1) * TILE_SIZE,
      })
    }
  }
  return instances
}

/**
 * Compute the flat fill hex color for a wall tile with a given FloorColor.
 * Uses same Colorize algorithm as floor tiles: 50% gray → HSL.
 */
export function wallColorToHex(color: FloorColor): string {
  const { h, s, b, c } = color
  // Start with 50% gray (wall base)
  let lightness = 0.5

  // Apply contrast
  if (c !== 0) {
    const factor = (100 + c) / 100
    lightness = 0.5 + (lightness - 0.5) * factor
  }

  // Apply brightness
  if (b !== 0) {
    lightness = lightness + b / 200
  }

  lightness = Math.max(0, Math.min(1, lightness))

  // HSL to hex (same as colorize.ts hslToHex)
  const satFrac = s / 100
  const ch = (1 - Math.abs(2 * lightness - 1)) * satFrac
  const hp = h / 60
  const x = ch * (1 - Math.abs(hp % 2 - 1))
  let r1 = 0, g1 = 0, b1 = 0

  if (hp < 1) { r1 = ch; g1 = x; b1 = 0 }
  else if (hp < 2) { r1 = x; g1 = ch; b1 = 0 }
  else if (hp < 3) { r1 = 0; g1 = ch; b1 = x }
  else if (hp < 4) { r1 = 0; g1 = x; b1 = ch }
  else if (hp < 5) { r1 = x; g1 = 0; b1 = ch }
  else { r1 = ch; g1 = 0; b1 = x }

  const m = lightness - ch / 2
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255)))

  return `#${clamp(r1).toString(16).padStart(2, '0')}${clamp(g1).toString(16).padStart(2, '0')}${clamp(b1).toString(16).padStart(2, '0')}`
}
