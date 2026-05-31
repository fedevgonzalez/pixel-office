import { TileType } from '../types.js'
import type { SpriteData, FloorColor, TileType as TileTypeVal } from '../types.js'
import {
  GRASS_TILE,
  GRASS_TILE_2,
  SIDEWALK_TILE,
  ROAD_TILE,
  ROAD_CENTER_LINE,
  CURB_TILE,
} from './backgroundSprites.js'
import { getColorizedSprite } from '../colorize.js'

/**
 * Exterior (outdoor) tile sprites for the unified grid (D1 / A2).
 *
 * The renderer reads exterior TileTypes (9–18) straight off `tiles[]` and draws
 * the matching 16px-native sprite via `getExteriorTileSprite`. GRASS/GRASS_ALT/
 * SIDEWALK/ROAD/ROAD_LINE/CURB reuse the existing hand-authored sprites that the
 * procedural background already uses (so a painted preset matches the procedural
 * look pixel-for-pixel). PATH/WATER/FENCE/DIRT are NEW, authored here at true
 * 16px native — the sprite cache nearest-upscales them x3 UNIFORMLY (never
 * deformed; the NEVER-DEFORM rule). All keep a hard-edged, limited palette in
 * the warm pixel-office style.
 *
 * `color` is an optional per-tile FloorColor override (from `layout.tileColors`).
 * When present the sprite is HSL-adjusted (NOT colorized — these are authored in
 * their own palette, so we shift rather than remap to grayscale) and cached by a
 * stable key. Absent color → the authored sprite is returned as-is.
 */

// ── PATH — stone/paver footpath ─────────────────────────────────
// Warm tan pavers in a 2-column brick bond, 1px darker mortar seams. Calm, flat,
// chunky (each paver is several native px), seamless across the tile edge.
const Pb = '#b7a07c' // paver base
const Pl = '#c4af8c' // paver highlight (top edge of each course)
const Pd = '#a08a66' // paver shade (bottom edge of each course)
const Pm = '#7d6b4e' // mortar seam
export const PATH_TILE: SpriteData = [
  [Pl, Pl, Pl, Pm, Pl, Pl, Pl, Pl, Pm, Pl, Pl, Pl, Pl, Pm, Pl, Pl],
  [Pb, Pb, Pb, Pm, Pb, Pb, Pb, Pb, Pm, Pb, Pb, Pb, Pb, Pm, Pb, Pb],
  [Pd, Pd, Pd, Pm, Pd, Pd, Pd, Pd, Pm, Pd, Pd, Pd, Pd, Pm, Pd, Pd],
  [Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm],
  [Pl, Pm, Pl, Pl, Pl, Pl, Pm, Pl, Pl, Pl, Pl, Pm, Pl, Pl, Pl, Pl],
  [Pb, Pm, Pb, Pb, Pb, Pb, Pm, Pb, Pb, Pb, Pb, Pm, Pb, Pb, Pb, Pb],
  [Pd, Pm, Pd, Pd, Pd, Pd, Pm, Pd, Pd, Pd, Pd, Pm, Pd, Pd, Pd, Pd],
  [Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm],
  [Pl, Pl, Pl, Pm, Pl, Pl, Pl, Pl, Pm, Pl, Pl, Pl, Pl, Pm, Pl, Pl],
  [Pb, Pb, Pb, Pm, Pb, Pb, Pb, Pb, Pm, Pb, Pb, Pb, Pb, Pm, Pb, Pb],
  [Pd, Pd, Pd, Pm, Pd, Pd, Pd, Pd, Pm, Pd, Pd, Pd, Pd, Pm, Pd, Pd],
  [Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm],
  [Pl, Pm, Pl, Pl, Pl, Pl, Pm, Pl, Pl, Pl, Pl, Pm, Pl, Pl, Pl, Pl],
  [Pb, Pm, Pb, Pb, Pb, Pb, Pm, Pb, Pb, Pb, Pb, Pm, Pb, Pb, Pb, Pb],
  [Pd, Pm, Pd, Pd, Pd, Pd, Pm, Pd, Pd, Pd, Pd, Pm, Pd, Pd, Pd, Pd],
  [Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm, Pm],
]

// ── WATER — calm 2-tone with a subtle ordered dither ────────────
// Two blues only + a sparse highlight glint, arranged as a low-contrast checker
// dither so it reads as gentle ripple, not noise. Edges tile seamlessly.
const Wb = '#2f6f96' // water base (darker)
const Ww = '#3d83ad' // water lighter (dither)
const Wg = '#6fb6d6' // sparse glint
export const WATER_TILE: SpriteData = [
  [Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww],
  [Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb],
  [Wb, Ww, Wb, Ww, Wg, Wg, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww],
  [Ww, Wb, Ww, Wb, Wg, Wg, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb],
  [Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww],
  [Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb],
  [Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wg, Wg, Wb, Ww],
  [Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Wg, Wg, Ww, Wb],
  [Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww],
  [Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb],
  [Wb, Ww, Wg, Wg, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww],
  [Ww, Wb, Wg, Wg, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb],
  [Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww],
  [Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Wg, Wg, Ww, Wb, Ww, Wb, Ww, Wb],
  [Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wg, Wg, Wb, Ww, Wb, Ww, Wb, Ww],
  [Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb, Ww, Wb],
]

// ── FENCE — wooden picket / rail over grass ─────────────────────
// Transparent background (grass shows through) with two horizontal rails and
// evenly-spaced vertical pickets, hard 1px dark outline, two wood tones. Authored
// so adjacent fence tiles join into a continuous run.
const Fw = '#9a6b3c' // wood light
const Fd = '#6f4a26' // wood shade
const Fo = '#3f2a14' // outline
const _ = '' // transparent (grass/ground beneath shows through)
export const FENCE_TILE: SpriteData = [
  [Fo, Fw, Fd, Fo, _, _, _, Fo, Fw, Fd, Fo, _, _, _, Fo, Fw],
  [Fo, Fw, Fd, Fo, _, _, _, Fo, Fw, Fd, Fo, _, _, _, Fo, Fw],
  [Fo, Fw, Fd, Fo, _, _, _, Fo, Fw, Fd, Fo, _, _, _, Fo, Fw],
  [Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo],
  [Fw, Fw, Fw, Fw, Fw, Fw, Fw, Fw, Fw, Fw, Fw, Fw, Fw, Fw, Fw, Fw],
  [Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo],
  [Fo, Fw, Fd, Fo, _, _, _, Fo, Fw, Fd, Fo, _, _, _, Fo, Fw],
  [Fo, Fw, Fd, Fo, _, _, _, Fo, Fw, Fd, Fo, _, _, _, Fo, Fw],
  [Fo, Fw, Fd, Fo, _, _, _, Fo, Fw, Fd, Fo, _, _, _, Fo, Fw],
  [Fo, Fw, Fd, Fo, _, _, _, Fo, Fw, Fd, Fo, _, _, _, Fo, Fw],
  [Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo],
  [Fd, Fd, Fd, Fd, Fd, Fd, Fd, Fd, Fd, Fd, Fd, Fd, Fd, Fd, Fd, Fd],
  [Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo, Fo],
  [Fo, Fw, Fd, Fo, _, _, _, Fo, Fw, Fd, Fo, _, _, _, Fo, Fw],
  [Fo, Fw, Fd, Fo, _, _, _, Fo, Fw, Fd, Fo, _, _, _, Fo, Fw],
  [Fo, Fw, Fd, Fo, _, _, _, Fo, Fw, Fd, Fo, _, _, _, Fo, Fw],
]

// ── DIRT — bare packed earth ────────────────────────────────────
// Warm brown base with sparse chunky 2x2 pebble/clod specks in two earth tones.
// Calm and flat (like ROAD/GRASS) — texture is deliberate blocks, not 1px noise.
const Db = '#8a6a44' // dirt base
const Dd = '#765636' // darker clod
const Dl = '#9c7c54' // lighter dust
export const DIRT_TILE: SpriteData = [
  [Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db],
  [Db, Db, Dd, Dd, Db, Db, Db, Db, Db, Db, Db, Dl, Dl, Db, Db, Db],
  [Db, Db, Dd, Dd, Db, Db, Db, Db, Db, Db, Db, Dl, Dl, Db, Db, Db],
  [Db, Db, Db, Db, Db, Db, Db, Dl, Dl, Db, Db, Db, Db, Db, Db, Db],
  [Db, Dl, Dl, Db, Db, Db, Db, Dl, Dl, Db, Db, Db, Db, Db, Db, Db],
  [Db, Dl, Dl, Db, Db, Db, Db, Db, Db, Db, Db, Db, Dd, Dd, Db, Db],
  [Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Dd, Dd, Db, Db],
  [Db, Db, Db, Db, Db, Dd, Dd, Db, Db, Db, Db, Db, Db, Db, Db, Db],
  [Db, Db, Db, Db, Db, Dd, Dd, Db, Db, Db, Dl, Dl, Db, Db, Db, Db],
  [Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Dl, Dl, Db, Db, Db, Db],
  [Db, Db, Db, Dl, Dl, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db],
  [Db, Db, Db, Dl, Dl, Db, Db, Db, Dd, Dd, Db, Db, Db, Db, Db, Db],
  [Db, Db, Db, Db, Db, Db, Db, Db, Dd, Dd, Db, Db, Db, Db, Db, Db],
  [Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Dl, Dl, Db],
  [Db, Db, Dd, Dd, Db, Db, Db, Db, Db, Db, Db, Db, Db, Dl, Dl, Db],
  [Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db, Db],
]

/**
 * Two grass variants, so a painted GRASS field alternates by position hash the
 * same way the procedural background does (`renderWorldBackground`'s grass
 * branch). Keeps a painted preset visually identical to the procedural look.
 */
const GRASS_VARIANTS: SpriteData[] = [GRASS_TILE, GRASS_TILE_2]

/** Base (uncolored) sprite for each exterior TileType. GRASS varies by position. */
function baseExteriorSprite(t: TileTypeVal, col: number, row: number): SpriteData | null {
  switch (t) {
    case TileType.GRASS:
    case TileType.GRASS_ALT: {
      // Position-hashed variant pick — matches renderWorldBackground's grass hash
      // (`(col*7 + row*13) % variants`) so painted grass mirrors the procedural field.
      const hash = ((col * 7 + row * 13) & 0x7fffffff) % GRASS_VARIANTS.length
      return GRASS_VARIANTS[hash]
    }
    case TileType.SIDEWALK:
      return SIDEWALK_TILE
    case TileType.ROAD:
      return ROAD_TILE
    case TileType.ROAD_LINE:
      return ROAD_CENTER_LINE
    case TileType.CURB:
      return CURB_TILE
    case TileType.PATH:
      return PATH_TILE
    case TileType.WATER:
      return WATER_TILE
    case TileType.FENCE:
      return FENCE_TILE
    case TileType.DIRT:
      return DIRT_TILE
    default:
      return null
  }
}

/**
 * Resolve the (optionally color-adjusted) sprite for an exterior tile.
 *
 * @param t    Exterior TileType (9–18). Non-exterior types return null.
 * @param col  Tile column (drives the grass variant hash; pass 0 if N/A).
 * @param row  Tile row.
 * @param color Optional per-tile FloorColor override (`layout.tileColors[i]`).
 *
 * NEVER deforms: returns SpriteData authored at 16px native; the sprite cache
 * upscales x3 uniformly. When `color` is provided the authored sprite is
 * HSL-adjusted (not colorized — these aren't grayscale) and cached by a stable
 * key so the per-tile color picker (A3) tints exterior tiles too.
 */
export function getExteriorTileSprite(
  t: TileTypeVal,
  col: number,
  row: number,
  color?: FloorColor | null,
): SpriteData | null {
  const base = baseExteriorSprite(t, col, row)
  if (!base) return null
  if (!color) return base
  // A truly neutral color is a no-op — skip the adjust pass and its cache entry.
  if (color.h === 0 && color.s === 0 && color.b === 0 && color.c === 0) return base
  // Variant index is part of the key so the two grass variants don't collide.
  const variant = t === TileType.GRASS || t === TileType.GRASS_ALT
    ? ((col * 7 + row * 13) & 0x7fffffff) % GRASS_VARIANTS.length
    : 0
  const key = `ext-${t}-${variant}-${color.h}-${color.s}-${color.b}-${color.c}-${color.colorize ? 1 : 0}`
  return getColorizedSprite(key, base, { ...color })
}
