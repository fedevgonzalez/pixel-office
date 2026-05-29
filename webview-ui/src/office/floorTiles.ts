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
import { getColorizedSprite, clearColorizeCache } from './colorize.js'
import { TILE_SIZE, FALLBACK_FLOOR_COLOR } from '../constants.js'

const FLOOR_THEME_STORAGE_KEY = 'pixel-office:editor:floorTheme'

/** Default solid gray 16×16 tile used when floors.png is not loaded */
const DEFAULT_FLOOR_SPRITE: SpriteData = Array.from(
  { length: TILE_SIZE },
  () => Array(TILE_SIZE).fill(FALLBACK_FLOOR_COLOR) as string[],
)

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
