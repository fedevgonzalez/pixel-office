import { TileType, MAX_COLS, MAX_ROWS, WorldBackgroundTheme } from '../types.js'
import { DEFAULT_NEUTRAL_COLOR } from '../../constants.js'
import type { TileType as TileTypeVal, OfficeLayout, PlacedFurniture, FloorColor, ZoneType as ZoneTypeVal, WorldBackgroundTheme as WorldBackgroundThemeVal, PlacedInteractionPoint } from '../types.js'
import { getCatalogEntry, getRotatedType, getToggledType } from '../layout/furnitureCatalog.js'
import { getPlacementBlockedTiles } from '../layout/layoutSerializer.js'
import { getThemeConfig, getZoneTileType } from '../backgrounds/backgroundThemes.js'
import { isExteriorTile, isExteriorDefaultWalkable } from '../layout/tileKinds.js'

/** Paint a single tile with pattern, color, and theme. Returns new layout (immutable). */
export function paintTile(
  layout: OfficeLayout,
  col: number,
  row: number,
  tileType: TileTypeVal,
  color?: FloorColor,
  themeId?: string | null,
): OfficeLayout {
  const idx = row * layout.cols + col
  if (idx < 0 || idx >= layout.tiles.length) return layout

  const existingColors = layout.tileColors || new Array(layout.tiles.length).fill(null)
  const existingThemes = layout.tileThemes || new Array(layout.tiles.length).fill(null)
  const newColor = color ?? (tileType === TileType.WALL || tileType === TileType.VOID ? null : { ...DEFAULT_NEUTRAL_COLOR })
  // Floor tiles get a theme; walls and void clear it.
  const isFloor = tileType !== TileType.WALL && tileType !== TileType.VOID
  const newTheme: string | null = isFloor ? (themeId ?? existingThemes[idx] ?? null) : null

  // Check if anything actually changed
  if (layout.tiles[idx] === tileType && existingThemes[idx] === newTheme) {
    const existingColor = existingColors[idx]
    if (newColor === null && existingColor === null) return layout
    if (newColor && existingColor &&
      newColor.h === existingColor.h && newColor.s === existingColor.s &&
      newColor.b === existingColor.b && newColor.c === existingColor.c &&
      !!newColor.colorize === !!existingColor.colorize) return layout
  }

  const tiles = [...layout.tiles]
  tiles[idx] = tileType
  const tileColors = [...existingColors]
  tileColors[idx] = newColor
  const tileThemes = [...existingThemes]
  tileThemes[idx] = newTheme
  return { ...layout, tiles, tileColors, tileThemes }
}

/**
 * Paint a single cell of one actor's movement-boundary mask (Phase B / D3).
 *
 * Walkability becomes data: `movementBoundary.character` / `.pet` are masks
 * parallel to `tiles` (length cols*rows). `true` = the actor may enter the tile,
 * `null` = unrestricted for that cell. We never write `false` — clearing returns
 * a cell to `null` (unrestricted) so a partially-painted mask doesn't silently
 * fence the actor out of every un-touched tile; the engine treats a mask with
 * ANY `true` entry as "the allowed set is exactly the true cells" (see
 * officeState.boundarySetFromMask).
 *
 * The mask array is created lazily on the first paint (so layouts without a
 * boundary stay unrestricted = legacy behavior). Returns a new layout
 * (immutable); returns the same layout when nothing changes.
 *
 * @param allowed true → mark the cell as in-boundary; false → clear to null.
 */
export function paintMovementBoundary(
  layout: OfficeLayout,
  col: number,
  row: number,
  actor: 'character' | 'pet',
  allowed: boolean,
): OfficeLayout {
  if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) return layout
  const idx = row * layout.cols + col
  const n = layout.cols * layout.rows
  const existing = layout.movementBoundary?.[actor]
  const newValue: boolean | null = allowed ? true : null

  // No-op when the cell already holds the target value (treat undefined as null).
  if (existing && (existing[idx] ?? null) === newValue) return layout
  // Clearing a cell of an absent mask is a no-op (already unrestricted).
  if (!existing && !allowed) return layout

  const mask: Array<boolean | null> = existing
    ? [...existing]
    : new Array(n).fill(null)
  mask[idx] = newValue

  return {
    ...layout,
    movementBoundary: {
      ...layout.movementBoundary,
      [actor]: mask,
    },
  }
}

/**
 * Place a first-class interaction point at a tile (Phase C / D4). If a point
 * already sits on the exact tile, its `type` is updated in place (so a second
 * click doesn't stack duplicates). The `interactionPoints` array is created
 * lazily — once present it becomes the runtime source of truth (points-first,
 * furniture-fallback), so newly-placed points fully drive behavior. Immutable;
 * returns the same layout when nothing changes.
 */
export function placeInteractionPoint(
  layout: OfficeLayout,
  col: number,
  row: number,
  type: string,
): OfficeLayout {
  if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) return layout
  const points = layout.interactionPoints ?? []
  const existingIdx = points.findIndex((p) => p.col === col && p.row === row)
  if (existingIdx >= 0) {
    if (points[existingIdx].type === type) return layout
    const next = [...points]
    next[existingIdx] = { ...points[existingIdx], type }
    return { ...layout, interactionPoints: next }
  }
  const uid = `ip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const point: PlacedInteractionPoint = { uid, type, col, row, requiredBy: 'both' }
  return { ...layout, interactionPoints: [...points, point] }
}

/**
 * Remove the interaction point on a tile (right-click in INTERACTION_PLACE).
 * Immutable; returns the same layout when no point is on the tile. Leaves an
 * empty `interactionPoints: []` in place so the runtime keeps using the explicit
 * (now empty) list rather than silently falling back to furniture flags — once
 * the user starts editing points, points are the source of truth (D4).
 */
export function deleteInteractionPoint(layout: OfficeLayout, col: number, row: number): OfficeLayout {
  const points = layout.interactionPoints
  if (!points || points.length === 0) return layout
  const next = points.filter((p) => !(p.col === col && p.row === row))
  if (next.length === points.length) return layout
  return { ...layout, interactionPoints: next }
}

/** Place furniture. Returns new layout (immutable). */
export function placeFurniture(layout: OfficeLayout, item: PlacedFurniture): OfficeLayout {
  if (!canPlaceFurniture(layout, item.type, item.col, item.row)) return layout
  return { ...layout, furniture: [...layout.furniture, item] }
}

/** Remove furniture by uid. Returns new layout (immutable). */
export function removeFurniture(layout: OfficeLayout, uid: string): OfficeLayout {
  const filtered = layout.furniture.filter((f) => f.uid !== uid)
  if (filtered.length === layout.furniture.length) return layout
  return { ...layout, furniture: filtered }
}

/** Move furniture to new position. Returns new layout (immutable). */
export function moveFurniture(layout: OfficeLayout, uid: string, newCol: number, newRow: number): OfficeLayout {
  const item = layout.furniture.find((f) => f.uid === uid)
  if (!item) return layout
  if (!canPlaceFurniture(layout, item.type, newCol, newRow, uid)) return layout
  return {
    ...layout,
    furniture: layout.furniture.map((f) => (f.uid === uid ? { ...f, col: newCol, row: newRow } : f)),
  }
}

/** Rotate furniture to the next orientation. Returns new layout (immutable). */
export function rotateFurniture(layout: OfficeLayout, uid: string, direction: 'cw' | 'ccw'): OfficeLayout {
  const item = layout.furniture.find((f) => f.uid === uid)
  if (!item) return layout
  const newType = getRotatedType(item.type, direction)
  if (!newType) return layout
  return {
    ...layout,
    furniture: layout.furniture.map((f) => (f.uid === uid ? { ...f, type: newType } : f)),
  }
}

/** Toggle furniture state (on/off). Returns new layout (immutable). */
export function toggleFurnitureState(layout: OfficeLayout, uid: string): OfficeLayout {
  const item = layout.furniture.find((f) => f.uid === uid)
  if (!item) return layout
  const newType = getToggledType(item.type)
  if (!newType) return layout
  return {
    ...layout,
    furniture: layout.furniture.map((f) => (f.uid === uid ? { ...f, type: newType } : f)),
  }
}

/** For wall items, offset the row so the bottom row aligns with the hovered tile. */
export function getWallPlacementRow(type: string, row: number): number {
  const entry = getCatalogEntry(type)
  if (!entry?.canPlaceOnWalls) return row
  return row - (entry.footprintH - 1)
}

/** Check if furniture can be placed at (col, row) without overlapping. */
export function canPlaceFurniture(
  layout: OfficeLayout,
  type: string, // FurnitureType enum or asset ID
  col: number,
  row: number,
  excludeUid?: string,
): boolean {
  const entry = getCatalogEntry(type)
  if (!entry) return false

  // Check bounds — wall items may extend above the map (top rows hang above the wall)
  if (entry.canPlaceOnWalls) {
    const bottomRow = row + entry.footprintH - 1
    if (col < 0 || col + entry.footprintW > layout.cols || bottomRow < 0 || bottomRow >= layout.rows) {
      return false
    }
  } else {
    if (col < 0 || row < 0 || col + entry.footprintW > layout.cols || row + entry.footprintH > layout.rows) {
      return false
    }
  }

  // Wall/VOID placement check (background rows skip this check)
  const bgRows = entry.backgroundTiles || 0
  for (let dr = 0; dr < entry.footprintH; dr++) {
    if (dr < bgRows) continue
    if (row + dr < 0) continue // row above map (wall items extending upward)
    // Wall items: only the bottom row must be on wall tiles; upper rows can overlap VOID/anything
    if (entry.canPlaceOnWalls && dr < entry.footprintH - 1) continue
    for (let dc = 0; dc < entry.footprintW; dc++) {
      const idx = (row + dr) * layout.cols + (col + dc)
      const tileVal = layout.tiles[idx]
      if (entry.canPlaceOnWalls) {
        if (tileVal !== TileType.WALL) return false
      } else {
        if (tileVal === TileType.VOID) return false // Cannot place on VOID
        if (tileVal === TileType.WALL) return false // Normal items cannot overlap walls
        // Exterior non-walkable tiles (WATER/FENCE) reject furniture — can't drop
        // a desk in a pond or on a fence rail. Walkable exterior (grass/path/…) OK.
        if (isExteriorTile(tileVal) && !isExteriorDefaultWalkable(tileVal)) return false
      }
    }
  }

  // Build occupied set excluding the item being moved, skipping background tile rows
  const occupied = getPlacementBlockedTiles(layout.furniture, excludeUid)

  // If this item can be placed on surfaces, build set of surface tiles to exclude from collision
  let surfaceTiles: Set<string> | null = null
  if (entry.canPlaceOnSurfaces) {
    surfaceTiles = new Set<string>()
    for (const item of layout.furniture) {
      if (item.uid === excludeUid) continue
      const itemEntry = getCatalogEntry(item.type)
      if (!itemEntry || !(itemEntry.providesSurface || itemEntry.isDesk)) continue
      for (let dr = 0; dr < itemEntry.footprintH; dr++) {
        for (let dc = 0; dc < itemEntry.footprintW; dc++) {
          surfaceTiles.add(`${item.col + dc},${item.row + dr}`)
        }
      }
    }
  }

  // Check overlap — also skip the NEW item's own background rows
  const newBgRows = entry.backgroundTiles || 0
  for (let dr = 0; dr < entry.footprintH; dr++) {
    if (dr < newBgRows) continue // new item's background rows can overlap existing items
    if (row + dr < 0) continue // row above map (wall items extending upward)
    for (let dc = 0; dc < entry.footprintW; dc++) {
      const key = `${col + dc},${row + dr}`
      if (occupied.has(key) && !(surfaceTiles?.has(key))) return false
    }
  }

  return true
}

export type ExpandDirection = 'left' | 'right' | 'up' | 'down'

/**
 * Expand layout by 1 tile in the given direction. New tiles are VOID.
 * Furniture and tile indices are shifted when expanding left or up.
 * Returns { layout, shift } or null if exceeding MAX_COLS/MAX_ROWS.
 */
export function expandLayout(
  layout: OfficeLayout,
  direction: ExpandDirection,
): { layout: OfficeLayout; shift: { col: number; row: number } } | null {
  const { cols, rows, tiles, furniture, tileColors, tileThemes, zones } = layout
  const existingColors = tileColors || new Array(tiles.length).fill(null)
  const existingThemes = tileThemes || new Array(tiles.length).fill(null)
  const existingZones = zones || new Array(tiles.length).fill(null)

  let newCols = cols
  let newRows = rows
  let shiftCol = 0
  let shiftRow = 0

  if (direction === 'right') {
    newCols = cols + 1
  } else if (direction === 'left') {
    newCols = cols + 1
    shiftCol = 1
  } else if (direction === 'down') {
    newRows = rows + 1
  } else if (direction === 'up') {
    newRows = rows + 1
    shiftRow = 1
  }

  if (newCols > MAX_COLS || newRows > MAX_ROWS) return null

  // Build new tile array
  const newTiles: TileTypeVal[] = new Array(newCols * newRows).fill(TileType.VOID as TileTypeVal)
  const newColors: Array<FloorColor | null> = new Array(newCols * newRows).fill(null)
  const newThemes: Array<string | null> = new Array(newCols * newRows).fill(null)
  const newZones: Array<ZoneTypeVal | null> = new Array(newCols * newRows).fill(null)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const oldIdx = r * cols + c
      const newIdx = (r + shiftRow) * newCols + (c + shiftCol)
      newTiles[newIdx] = tiles[oldIdx]
      newColors[newIdx] = existingColors[oldIdx]
      newThemes[newIdx] = existingThemes[oldIdx]
      newZones[newIdx] = existingZones[oldIdx]
    }
  }

  // Shift furniture positions
  const newFurniture: PlacedFurniture[] = furniture.map((f) => ({
    ...f,
    col: f.col + shiftCol,
    row: f.row + shiftRow,
  }))

  return {
    layout: { ...layout, cols: newCols, rows: newRows, tiles: newTiles, tileColors: newColors, tileThemes: newThemes, zones: newZones, furniture: newFurniture },
    shift: { col: shiftCol, row: shiftRow },
  }
}

/** Per-edge tile deltas for a resize. Positive = add tiles (expand), negative
 *  = remove tiles (shrink). Each edge is independent. */
export interface ResizeDeltas {
  top: number
  bottom: number
  left: number
  right: number
}

/** Result of a resize: the new layout + the coordinate shift applied to
 *  existing cells (so callers can re-anchor characters/ghosts), OR an error
 *  string explaining why the resize was refused (clip / max-size). */
export type ResizeResult =
  | { ok: true; layout: OfficeLayout; shift: { col: number; row: number } }
  | { ok: false; error: string }

/**
 * General per-edge resize. Reallocates EVERY parallel array (tiles, tileColors,
 * tileThemes, zones, and movementBoundary.character/pet if present) to the new
 * cols×rows, preserving existing cells at their shifted positions. Furniture and
 * pets are shifted by the same offset.
 *
 * - EXPAND (positive deltas): new margin cells start VOID, then are AUTO-FILLED
 *   with the current theme's preset ring (via getZoneTileType / the same band
 *   logic applyThemePreset uses) so the user instantly gets a themed exterior to
 *   edit. If the layout has no theme config (e.g. 'void'), new cells stay VOID.
 * - SHRINK (negative deltas): REFUSED with an error if removing those rows/cols
 *   would clip any furniture footprint or any pet (the caller surfaces the
 *   message). Otherwise the clipped band is dropped.
 *
 * Clamped to MAX_COLS/MAX_ROWS (96) and a 1×1 minimum. Single immutable result;
 * the caller wraps it in one undo entry. Always passes validateLayout (all
 * parallel arrays === newCols*newRows).
 */
export function resizeLayout(layout: OfficeLayout, deltas: ResizeDeltas): ResizeResult {
  const { top, bottom, left, right } = deltas
  if (top === 0 && bottom === 0 && left === 0 && right === 0) {
    return { ok: true, layout, shift: { col: 0, row: 0 } }
  }

  const { cols, rows } = layout
  const newCols = cols + left + right
  const newRows = rows + top + bottom

  if (newCols < 1 || newRows < 1) {
    return { ok: false, error: 'Map must stay at least 1×1.' }
  }
  if (newCols > MAX_COLS || newRows > MAX_ROWS) {
    return { ok: false, error: `Max map size is ${MAX_COLS}×${MAX_ROWS}.` }
  }

  // Existing cell (oc, or) maps to new cell (oc + shiftCol, or + shiftRow).
  // A positive `left`/`top` shifts existing content right/down; a negative one
  // (shrink) shifts it up/left and clips the removed band.
  const shiftCol = left
  const shiftRow = top

  // ── Shrink clip-check: refuse if any furniture footprint or pet would fall
  //    outside the new bounds after the shift. We check BEFORE allocating.
  const wouldClip: string[] = []
  for (const f of layout.furniture) {
    const entry = getCatalogEntry(f.type)
    const fw = entry?.footprintW ?? 1
    const fh = entry?.footprintH ?? 1
    const nc = f.col + shiftCol
    const nr = f.row + shiftRow
    // Wall items may legally hang above the top edge (negative rows), like in
    // canPlaceFurniture — only their bottom row must stay in-bounds vertically.
    const topRowMustBeIn = !entry?.canPlaceOnWalls
    if (nc < 0 || nc + fw > newCols || (topRowMustBeIn && nr < 0) || nr + fh > newRows) {
      wouldClip.push(entry?.label ?? f.type)
    }
  }
  if (wouldClip.length > 0) {
    const uniq = Array.from(new Set(wouldClip)).slice(0, 3).join(', ')
    return { ok: false, error: `Shrink would clip furniture (${uniq}${wouldClip.length > 3 ? '…' : ''}). Move it first.` }
  }
  const pets = layout.pets ?? []
  const petClips = pets.some((p) => {
    const nc = p.col + shiftCol
    const nr = p.row + shiftRow
    return nc < 0 || nc >= newCols || nr < 0 || nr >= newRows
  })
  if (petClips) {
    return { ok: false, error: 'Shrink would clip a pet. Move it first.' }
  }

  const existingColors = layout.tileColors || new Array(layout.tiles.length).fill(null)
  const existingThemes = layout.tileThemes || new Array(layout.tiles.length).fill(null)
  const existingZones = layout.zones || new Array(layout.tiles.length).fill(null)
  const charMask = layout.movementBoundary?.character
  const petMask = layout.movementBoundary?.pet

  const n = newCols * newRows
  const newTiles: TileTypeVal[] = new Array(n).fill(TileType.VOID as TileTypeVal)
  const newColors: Array<FloorColor | null> = new Array(n).fill(null)
  const newThemes: Array<string | null> = new Array(n).fill(null)
  const newZones: Array<ZoneTypeVal | null> = new Array(n).fill(null)
  const newChar: Array<boolean | null> | null = charMask ? new Array(n).fill(null) : null
  const newPet: Array<boolean | null> | null = petMask ? new Array(n).fill(null) : null

  // Copy existing cells that survive the shift into their new positions.
  for (let r = 0; r < rows; r++) {
    const nr = r + shiftRow
    if (nr < 0 || nr >= newRows) continue
    for (let c = 0; c < cols; c++) {
      const nc = c + shiftCol
      if (nc < 0 || nc >= newCols) continue
      const oldIdx = r * cols + c
      const newIdx = nr * newCols + nc
      newTiles[newIdx] = layout.tiles[oldIdx]
      newColors[newIdx] = existingColors[oldIdx]
      newThemes[newIdx] = existingThemes[oldIdx]
      newZones[newIdx] = existingZones[oldIdx]
      if (newChar && charMask) newChar[newIdx] = charMask[oldIdx] ?? null
      if (newPet && petMask) newPet[newIdx] = petMask[oldIdx] ?? null
    }
  }

  // Shift furniture + pets by the same offset.
  const newFurniture: PlacedFurniture[] = layout.furniture.map((f) => ({
    ...f,
    col: f.col + shiftCol,
    row: f.row + shiftRow,
  }))
  const newPets = pets.length > 0
    ? pets.map((p) => ({ ...p, col: p.col + shiftCol, row: p.row + shiftRow }))
    : layout.pets

  // Shift interaction points by the same offset (Phase C). On a shrink, points
  // whose tile falls outside the new bounds are dropped (markers, not blocking
  // furniture — no need to refuse the resize). An empty array is preserved so
  // the points-first runtime source-of-truth survives.
  const newInteractionPoints = layout.interactionPoints
    ? layout.interactionPoints
        .map((p) => ({ ...p, col: p.col + shiftCol, row: p.row + shiftRow }))
        .filter((p) => p.col >= 0 && p.col < newCols && p.row >= 0 && p.row < newRows)
    : layout.interactionPoints

  let next: OfficeLayout = {
    ...layout,
    cols: newCols,
    rows: newRows,
    tiles: newTiles,
    tileColors: newColors,
    tileThemes: newThemes,
    zones: newZones,
    furniture: newFurniture,
    ...(newPets ? { pets: newPets } : {}),
    ...(newInteractionPoints ? { interactionPoints: newInteractionPoints } : {}),
  }
  if (newChar || newPet) {
    next.movementBoundary = {
      ...layout.movementBoundary,
      ...(newChar ? { character: newChar } : {}),
      ...(newPet ? { pet: newPet } : {}),
    }
  }

  // On EXPAND, auto-fill the newly-added margin (still VOID) with the current
  // theme's preset ring so the user gets a themed exterior immediately. This is
  // fill-empty-only by construction (only the new VOID margin gets touched —
  // surviving cells were copied above and the rest of the grid is unchanged
  // interior), and reuses the exact same band logic as applyThemePreset.
  const expanding = left > 0 || right > 0 || top > 0 || bottom > 0
  if (expanding) {
    next = applyThemePreset(next, next.background?.theme ?? WorldBackgroundTheme.VOID)
  }

  return { ok: true, layout: next, shift: { col: shiftCol, row: shiftRow } }
}

/**
 * Bounding box (inclusive) of the interior building region: all non-VOID,
 * non-exterior tiles (WALL + FLOOR_1..7). Falls back to the full grid when the
 * layout has no interior tiles at all (so a blank grid still gets a centered
 * ring). Returned in grid coordinates.
 */
function getBuildingBBox(layout: OfficeLayout): { minCol: number; minRow: number; maxCol: number; maxRow: number } {
  let minCol = Infinity, minRow = Infinity, maxCol = -Infinity, maxRow = -Infinity
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const t = layout.tiles[r * layout.cols + c]
      if (t === TileType.VOID || isExteriorTile(t)) continue
      if (c < minCol) minCol = c
      if (c > maxCol) maxCol = c
      if (r < minRow) minRow = r
      if (r > maxRow) maxRow = r
    }
  }
  if (minCol === Infinity) {
    return { minCol: 0, minRow: 0, maxCol: layout.cols - 1, maxRow: layout.rows - 1 }
  }
  return { minCol, minRow, maxCol, maxRow }
}

/**
 * Core preset-fill. Writes exterior TileTypes (+ neutral colors) into `tiles[]`/
 * `tileColors[]` using the theme's zone bands — the SAME distance/band logic as
 * the procedural background (`getZoneTileType` mirrors `renderWorldBackground`'s
 * getZone), so a painted preset reproduces the procedural ring's look. Also
 * seeds the per-actor movement boundary from `EXTERIOR_DEFAULT_WALKABLE` (OQ-6:
 * grass/sidewalk/road walkable for both; WATER/FENCE not) for every tile it
 * writes, so Phase B's clamp has data without forcing it now.
 *
 * `overwrite=false` (default, OQ-4): only fills tiles that are currently VOID,
 * PRESERVING any interior tile and any hand-painted exterior tile.
 * `overwrite=true`: also rewrites existing exterior tiles (full ring reset);
 * interior tiles (WALL/FLOOR) are never touched.
 *
 * Immutable, idempotent (running twice yields the same grid), single result —
 * callers wrap one call in one undo entry. Records `background.theme` metadata.
 */
function fillThemePreset(
  layout: OfficeLayout,
  themeId: WorldBackgroundThemeVal,
  overwrite: boolean,
): OfficeLayout {
  const config = getThemeConfig(themeId)
  // No config (e.g. 'void' or unimplemented theme) — only record the metadata.
  if (!config) {
    return { ...layout, background: { ...layout.background, theme: themeId } }
  }

  const n = layout.cols * layout.rows
  const tiles = [...layout.tiles]
  const tileColors: Array<FloorColor | null> = layout.tileColors ? [...layout.tileColors] : new Array(n).fill(null)
  const tileThemes: Array<string | null> = layout.tileThemes ? [...layout.tileThemes] : new Array(n).fill(null)

  // Seed boundary masks only if a (non-null) mask already exists; otherwise leave
  // absent → "unrestricted" (legacy). We never CREATE a mask here — that would
  // silently restrict actors on an un-bounded layout. If a mask exists we set the
  // cells we paint per EXTERIOR_DEFAULT_WALKABLE so it stays consistent.
  const charMask = layout.movementBoundary?.character
  const petMask = layout.movementBoundary?.pet
  const newChar = charMask ? [...charMask] : null
  const newPet = petMask ? [...petMask] : null

  const { minCol, minRow, maxCol, maxRow } = getBuildingBBox(layout)
  const officeCols = maxCol - minCol + 1
  const officeRows = maxRow - minRow + 1

  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const idx = r * layout.cols + c
      const existing = tiles[idx]
      // Never touch interior tiles (WALL / FLOOR_1..7).
      if (existing !== TileType.VOID && !isExteriorTile(existing)) continue
      // Fill-empty-only: skip already-painted exterior tiles unless overwriting.
      if (!overwrite && existing !== TileType.VOID) continue

      // Building-local coords (relative to the building bbox top-left), matching
      // the procedural getZone convention.
      const localCol = c - minCol
      const localRow = r - minRow
      const zoneTile = getZoneTileType(localCol, localRow, officeCols, officeRows, config.zones)
      if (zoneTile === null) continue // inside building footprint — leave VOID

      tiles[idx] = zoneTile
      tileColors[idx] = { ...DEFAULT_NEUTRAL_COLOR }
      tileThemes[idx] = null
      if (newChar) newChar[idx] = isExteriorDefaultWalkable(zoneTile)
      if (newPet) newPet[idx] = isExteriorDefaultWalkable(zoneTile)
    }
  }

  const next: OfficeLayout = {
    ...layout,
    tiles,
    tileColors,
    tileThemes,
    background: { ...layout.background, theme: themeId },
  }
  if (newChar || newPet) {
    next.movementBoundary = {
      ...layout.movementBoundary,
      ...(newChar ? { character: newChar } : {}),
      ...(newPet ? { pet: newPet } : {}),
    }
  }
  return next
}

/**
 * Apply a theme as a preset fill — fill-empty-only (OQ-4 LOCKED). Writes the
 * theme's exterior ring into VOID tiles, PRESERVING interior + hand-painted
 * exterior tiles. Single undo entry, idempotent, valid layout. This is what the
 * "pick a theme" UI calls (A3 wires it up).
 */
export function applyThemePreset(layout: OfficeLayout, themeId: WorldBackgroundThemeVal): OfficeLayout {
  return fillThemePreset(layout, themeId, false)
}

/**
 * Apply a theme as a FULL exterior reset (the explicit "Re-apply theme
 * (overwrite all exterior)" action). Rewrites every exterior tile to the
 * theme's ring; interior tiles are never touched. Single undo entry.
 */
export function applyThemePresetOverwrite(layout: OfficeLayout, themeId: WorldBackgroundThemeVal): OfficeLayout {
  return fillThemePreset(layout, themeId, true)
}
