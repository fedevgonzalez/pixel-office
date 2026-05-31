import { TileType } from '../types.js'
import type { TileType as TileTypeVal } from '../types.js'

/**
 * Pure tile-kind predicates + default exterior walkability table.
 *
 * No side effects, no imports beyond the TileType enum object. These classify
 * tiles in the single unified grid (D1): interior floors are 1–7, WALL=0,
 * VOID=8, and exterior tiles are 9+. A1 ships only the helpers — the renderer
 * (A2), boundary engine (Phase B), and editor palette (A3) consume them later.
 */

/** Lowest exterior TileType value. Everything `>= this` is exterior. */
export const FIRST_EXTERIOR_TILE = TileType.GRASS // 9

/** True for exterior (outdoor) tile types: GRASS..DIRT (9–18). */
export function isExteriorTile(t: TileTypeVal): boolean {
  return t >= FIRST_EXTERIOR_TILE
}

/** True for interior floor tiles FLOOR_1..FLOOR_7 (1–7). Excludes WALL/VOID. */
export function isFloorLike(t: TileTypeVal): boolean {
  return t >= TileType.FLOOR_1 && t <= TileType.FLOOR_7
}

/**
 * True for exterior tile types that a user may paint from the outdoor palette.
 * Currently the full exterior range is paintable; kept as its own predicate so
 * A3 can carve out non-paintable derived/decoration types later without
 * touching call sites.
 */
export function isPaintableExterior(t: TileTypeVal): boolean {
  return isExteriorTile(t)
}

/**
 * Default walkability for each exterior tile type, used to seed the per-actor
 * movement boundary when a theme preset is applied (A2/Phase B). Ground-cover
 * (grass/sidewalk/path/road/dirt) is walkable for both actors; WATER and FENCE
 * are not. Interior tiles are intentionally absent — their walkability is
 * derived from WALL/VOID + furniture, not this table.
 *
 * OQ-6 (LOCKED): newly-painted exterior walkable types are walkable for BOTH
 * pets and characters until a boundary mask restricts them.
 */
export const EXTERIOR_DEFAULT_WALKABLE: Partial<Record<TileTypeVal, boolean>> = {
  [TileType.GRASS]: true,
  [TileType.GRASS_ALT]: true,
  [TileType.SIDEWALK]: true,
  [TileType.ROAD]: true,
  [TileType.ROAD_LINE]: true,
  [TileType.CURB]: true,
  [TileType.PATH]: true,
  [TileType.DIRT]: true,
  [TileType.WATER]: false,
  [TileType.FENCE]: false,
}

/**
 * Whether an exterior tile defaults to walkable. Non-exterior tiles return
 * `false` here (their walkability is not governed by this table). Unknown
 * exterior values default to walkable (safe for ground cover).
 */
export function isExteriorDefaultWalkable(t: TileTypeVal): boolean {
  if (!isExteriorTile(t)) return false
  const v = EXTERIOR_DEFAULT_WALKABLE[t]
  return v === undefined ? true : v
}
