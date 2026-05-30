/**
 * Floor tile pattern storage and caching.
 *
 * Stores N themes of 7 grayscale floor patterns each, loaded from
 * floors*.png on the server. The default theme comes from `floors.png`;
 * additional themes come from `floors_<id>.png` files in the same dir.
 *
 * Uses shared colorize module for HSL tinting (Photoshop-style Colorize).
 * Caches colorized SpriteData by (pattern, h, s, b, c) key.
 */

import type { SpriteData, FloorColor } from './types.js'
import { TileType } from './types.js'
import { getColorizedSprite, clearColorizeCache } from './colorize.js'
import { TILE_SIZE, FALLBACK_FLOOR_COLOR } from '../constants.js'

/** Pattern index of the office wood-plank floor (default theme). */
const DEFAULT_FLOOR_PATTERN = TileType.FLOOR_5

const FLOOR_THEME_STORAGE_KEY = 'pixel-office:editor:floorTheme'

/** Default solid gray 16×16 tile used when floors.png is not loaded */
const DEFAULT_FLOOR_SPRITE: SpriteData = Array.from(
  { length: TILE_SIZE },
  () => Array(TILE_SIZE).fill(FALLBACK_FLOOR_COLOR) as string[],
)

/**
 * Chunky 16px-native wood-plank floor (grayscale base for the colorize pipeline).
 *
 * The office floor (default theme, pattern FLOOR_5) historically used a FINE
 * herringbone cell from floors.png that resampled to ~1-2px sub-tile detail —
 * far finer than the chunky 3px-block furniture/agent sprites, so it read as a
 * different art style. This authors a low-detail plank pattern at TRUE 16px/tile
 * native density (every feature is a 3×3 screen-px block at the renderer's ×3),
 * then nearest-upscales to TILE_SIZE so colorize tints it warm walnut/terracotta.
 *
 * Stays grayscale: the existing Colorize pipeline (getColorizedFloorSprite) maps
 * each pixel's luminance → HSL(hue, sat) from the tile's FloorColor, so the
 * editor's per-tile color picker keeps working unchanged.
 *
 * Layout: 4 horizontal plank rows (4 native px tall each), a 1px darker seam at
 * each plank's top edge, staggered vertical end-joints (brick bond) and a couple
 * of subtle grain stripes per plank for warmth without sub-3px noise.
 */
const CHUNKY_PLANK_GRAY_SPRITE: SpriteData = (() => {
  const N = 16
  // Grayscale levels (0-255). Chosen so the colorize luminance→lightness map
  // lands in the office's warm walnut/terracotta band.
  const SEAM = 0x57 // darker seam / end-joint
  const PLANK = [0xb6, 0xa6, 0xc0, 0xab] // base face tone per plank row
  const FACE_LIGHT = 0x0c // slightly lighter near plank top
  const FACE_DARK = 0x08 // slightly darker near plank bottom
  const GRAIN = 0x10 // subtle grain stripe darkening
  // Staggered vertical end-joints per plank row (brick bond).
  const JOINTS: number[][] = [[7, 15], [3, 11], [7, 15], [3, 11]]
  // Subtle grain stripe columns per plank row.
  const GRAIN_COLS: number[][] = [[2, 12], [6], [10], [1, 14]]

  const clamp = (v: number) => Math.max(0, Math.min(255, v))
  const hex = (v: number) => {
    const h = clamp(v).toString(16).padStart(2, '0')
    return `#${h}${h}${h}`.toUpperCase()
  }

  // Build the 16×16 native grayscale grid.
  const native: number[][] = []
  for (let y = 0; y < N; y++) {
    const prow = (y / 4) | 0
    const sub = y % 4
    const base = PLANK[prow]
    const row: number[] = []
    for (let x = 0; x < N; x++) {
      let v: number
      if (sub === 0) {
        v = SEAM // horizontal seam between planks
      } else {
        // board face shading: lighter near top, darker near bottom of the plank
        v = base + (sub === 1 ? FACE_LIGHT : sub === 3 ? -FACE_DARK : 0)
        if (GRAIN_COLS[prow].includes(x)) v -= GRAIN
      }
      // vertical end-joints (not on the seam row)
      if (sub !== 0 && JOINTS[prow].includes(x)) v = SEAM + 0x06
      row.push(clamp(v))
    }
    native.push(row)
  }

  // Nearest-upscale 16×16 native → TILE_SIZE×TILE_SIZE so every native cell is a
  // (TILE_SIZE/16)² block (3×3 at TILE_SIZE=48) → crisp 3px blocks, no AA.
  const scale = TILE_SIZE / N
  const sprite: SpriteData = []
  for (let y = 0; y < TILE_SIZE; y++) {
    const ny = Math.floor(y / scale)
    const line: string[] = []
    for (let x = 0; x < TILE_SIZE; x++) {
      const nx = Math.floor(x / scale)
      line.push(hex(native[ny][nx]))
    }
    sprite.push(line)
  }
  return sprite
})()

export interface FloorTheme {
  /** Theme identifier — "default" for floors.png, "<id>" for floors_<id>.png. */
  id: string
  sprites: SpriteData[]
}

/** Module-level storage for floor themes. */
let floorThemes: FloorTheme[] = []
let activeFloorThemeId: string | null = null

/** Wall color constant */
export const WALL_COLOR = '#3A3A5C'

/** Set the available floor themes. Preserves the previously-active theme if it
 *  still exists in the new list; otherwise falls back to the first theme. */
export function setFloorThemes(themes: FloorTheme[]): void {
  floorThemes = themes
  clearColorizeCache()
  try {
    const stored = typeof window !== 'undefined'
      ? window.localStorage.getItem(FLOOR_THEME_STORAGE_KEY)
      : null
    if (stored && themes.some((t) => t.id === stored)) {
      activeFloorThemeId = stored
      return
    }
  } catch { /* localStorage unavailable — kiosk private mode */ }
  activeFloorThemeId = themes.length > 0 ? themes[0].id : null
}

/** Backwards-compat shim — old WS payload sent just a flat sprites array. */
export function setFloorSprites(sprites: SpriteData[]): void {
  setFloorThemes([{ id: 'default', sprites }])
}

export function getFloorThemes(): FloorTheme[] {
  return floorThemes
}

export function getActiveFloorThemeId(): string | null {
  return activeFloorThemeId
}

export function setActiveFloorTheme(id: string): void {
  if (!floorThemes.some((t) => t.id === id)) return
  activeFloorThemeId = id
  // No cache clear: per-tile themes mean changing the active theme only
  // affects new paints, not already-rendered tiles.
  try { window.localStorage.setItem(FLOOR_THEME_STORAGE_KEY, id) } catch { /* ignore */ }
}

function getActiveSprites(): SpriteData[] {
  const t = floorThemes.find((t) => t.id === activeFloorThemeId)
  return t ? t.sprites : []
}

function getSpritesFor(themeId: string | null): SpriteData[] {
  if (themeId === null) return getActiveSprites()
  const t = floorThemes.find((t) => t.id === themeId)
  return t ? t.sprites : getActiveSprites()
}

/** Get the raw (grayscale) floor sprite for a pattern index (1-7 -> array
 *  index 0-6). Falls back to the default solid gray tile when no theme has
 *  loaded sprites yet. */
export function getFloorSprite(patternIndex: number, themeId: string | null = null): SpriteData | null {
  // The office floor (default theme, FLOOR_5) uses a chunky 16px-native wood
  // plank authored here instead of the fine herringbone cell from floors.png,
  // so its pixel density matches the 3px-block furniture/agent sprites. Other
  // themes/patterns keep their loaded sheet cells untouched.
  const resolvedTheme = themeId ?? activeFloorThemeId
  if (patternIndex === DEFAULT_FLOOR_PATTERN && (resolvedTheme === 'default' || resolvedTheme === null)) {
    return CHUNKY_PLANK_GRAY_SPRITE
  }

  const sprites = getSpritesFor(themeId)
  const idx = patternIndex - 1
  if (idx < 0) return null
  if (idx < sprites.length) return sprites[idx]
  if (sprites.length === 0 && patternIndex >= 1) return DEFAULT_FLOOR_SPRITE
  return null
}

/** Check if floor sprites are available (always true — falls back to default solid tile) */
export function hasFloorSprites(): boolean {
  return true
}

/** Get count of available floor patterns (at least 1 for the default solid tile) */
export function getFloorPatternCount(): number {
  const sprites = getActiveSprites()
  return sprites.length > 0 ? sprites.length : 1
}

/** Get all floor sprites of the active theme (for preview rendering, falls
 *  back to default solid tile). */
export function getAllFloorSprites(): SpriteData[] {
  const sprites = getActiveSprites()
  return sprites.length > 0 ? sprites : [DEFAULT_FLOOR_SPRITE]
}

/**
 * Get a colorized version of a floor sprite for a specific theme.
 * Uses Photoshop-style Colorize: grayscale -> HSL with given hue/saturation,
 * then brightness/contrast adjustment. Pass `themeId = null` to use the
 * currently-active theme (legacy callers).
 */
export function getColorizedFloorSprite(
  patternIndex: number,
  color: FloorColor,
  themeId: string | null = null,
): SpriteData {
  const resolvedTheme = themeId ?? activeFloorThemeId ?? 'none'
  const key = `floor-${resolvedTheme}-${patternIndex}-${color.h}-${color.s}-${color.b}-${color.c}`

  const base = getFloorSprite(patternIndex, themeId)
  if (!base) {
    // Return a 16x16 magenta error tile
    const err: SpriteData = Array.from({ length: 16 }, () => Array(16).fill('#FF00FF'))
    return err
  }

  // Floor tiles are always colorized (grayscale patterns need Photoshop-style Colorize)
  return getColorizedSprite(key, base, { ...color, colorize: true })
}
