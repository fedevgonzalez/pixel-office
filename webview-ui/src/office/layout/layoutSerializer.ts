import { TileType, FurnitureType, DEFAULT_COLS, DEFAULT_ROWS, TILE_SIZE, Direction } from '../types.js'
import type { TileType as TileTypeVal, OfficeLayout, PlacedFurniture, Seat, FurnitureInstance, FloorColor, SpriteData, PlacedInteractionPoint } from '../types.js'
import { getCatalogEntry } from './furnitureCatalog.js'
import { getColorizedSprite } from '../colorize.js'
import { LAMP_OFF_SPRITE, LAMP_SPRITE, WALL_SCONCE_OFF_SPRITE, WALL_SCONCE_ON_SPRITE } from '../sprites/spriteData.js'
import { getActiveFloorThemeId } from '../floorTiles.js'
import { isExteriorTile, isNorthWall } from './tileKinds.js'
import { WALL_DECOR_Z_EPSILON } from '../../constants.js'

/** Convert flat tile array from layout into 2D grid */
export function layoutToTileMap(layout: OfficeLayout): TileTypeVal[][] {
  const map: TileTypeVal[][] = []
  for (let r = 0; r < layout.rows; r++) {
    const row: TileTypeVal[] = []
    for (let c = 0; c < layout.cols; c++) {
      row.push(layout.tiles[r * layout.cols + c])
    }
    map.push(row)
  }
  return map
}

/** Convert placed furniture into renderable FurnitureInstance[].
 *  `tileMap` (optional) enables north-wall decor mounting: when a canPlaceOnWalls
 *  item sits on a camera-facing wall its z-order is lifted so it draws ON the
 *  wall's hanging face (in front of the wall) yet stays behind floor actors. */
export function layoutToFurnitureInstances(
  furniture: PlacedFurniture[],
  tileMap?: TileTypeVal[][],
): FurnitureInstance[] {
  // Pre-compute surface zY per tile so stackable items can sort in front of their host surface
  const surfaceZByTile = new Map<string, number>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || !(entry.providesSurface || entry.isDesk)) continue
    const surfaceZY = item.row * TILE_SIZE + entry.sprite.length
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`
        const prev = surfaceZByTile.get(key)
        if (prev === undefined || surfaceZY > prev) surfaceZByTile.set(key, surfaceZY)
      }
    }
  }

  const instances: FurnitureInstance[] = []
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const x = item.col * TILE_SIZE
    const y = item.row * TILE_SIZE
    const spriteH = entry.sprite.length
    let zY = y + spriteH

    // Chair z-sorting: ensure characters sitting on chairs render correctly
    if (entry.category === 'chairs') {
      if (entry.orientation === 'back') {
        // Back-facing chairs render IN FRONT of the seated character
        // (the chair back visually occludes the character behind it)
        zY = (item.row + 1) * TILE_SIZE + 1
      } else {
        // All other chairs: cap zY to first row bottom so characters
        // at any seat tile render in front of the chair
        zY = (item.row + 1) * TILE_SIZE
      }
    }

    // Surface items render in front of the surface they sit on
    if (entry.canPlaceOnSurfaces) {
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          const surfaceZ = surfaceZByTile.get(`${item.col + dc},${item.row + dr}`)
          if (surfaceZ !== undefined && surfaceZ + 0.5 > zY) zY = surfaceZ + 0.5
        }
      }
    }

    // Wall decor on a camera-facing (north) wall mounts ON the wall's vertical
    // face: lift zY just past the wall's z baseline ((row+1)*TILE_SIZE) so it
    // draws over the face instead of being hidden behind the opaque wall sprite,
    // while staying below floor actors on the row below (zY ≈ (row+1)*TILE_SIZE
    // + ~24) so they still walk in front of it. Anchored at the item's top-left
    // (the wall tile). No-op when tileMap is absent (backward compat / tests).
    if (tileMap && entry.canPlaceOnWalls && isNorthWall(item.col, item.row, tileMap)) {
      zY = (item.row + 1) * TILE_SIZE + WALL_DECOR_Z_EPSILON
    }

    // Day/night fixtures (desk lamp, wall sconce) carry two sprites: the placed
    // instance shows the unlit OFF sprite by day; the renderer swaps to
    // `onSprite` (glowing) at night. The catalog keeps the ON sprite as the
    // palette icon. Other furniture has no alternate sprite.
    const isLamp = item.type === FurnitureType.LAMP
    const isSconce = item.type === FurnitureType.WALL_SCONCE
    const baseSprite = isLamp ? LAMP_OFF_SPRITE : isSconce ? WALL_SCONCE_OFF_SPRITE : entry.sprite

    // Colorize sprite if this furniture has a color override
    let sprite = baseSprite
    let onSprite: SpriteData | undefined = isLamp ? LAMP_SPRITE : isSconce ? WALL_SCONCE_ON_SPRITE : undefined
    if (item.color) {
      const { h, s, b: bv, c: cv } = item.color
      const key = `furn-${item.type}-${h}-${s}-${bv}-${cv}-${item.color.colorize ? 1 : 0}`
      sprite = getColorizedSprite(key, baseSprite, item.color)
      if (onSprite) onSprite = getColorizedSprite(`${key}-on`, onSprite, item.color)
    }

    instances.push({ sprite, x, y, zY, ...(onSprite ? { onSprite } : {}) })
  }
  return instances
}

/** Get all tiles blocked by furniture footprints, optionally excluding a set of tiles.
 *  Skips top backgroundTiles rows so characters can walk through them. */
export function getBlockedTiles(furniture: PlacedFurniture[], excludeTiles?: Set<string>): Set<string> {
  const tiles = new Set<string>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const bgRows = entry.backgroundTiles || 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue // skip background rows — characters can walk through
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`
        if (excludeTiles && excludeTiles.has(key)) continue
        tiles.add(key)
      }
    }
  }
  return tiles
}

/** Get tiles blocked for placement purposes — skips top backgroundTiles rows per item */
export function getPlacementBlockedTiles(furniture: PlacedFurniture[], excludeUid?: string): Set<string> {
  const tiles = new Set<string>()
  for (const item of furniture) {
    if (item.uid === excludeUid) continue
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const bgRows = entry.backgroundTiles || 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue // skip background rows
      for (let dc = 0; dc < entry.footprintW; dc++) {
        tiles.add(`${item.col + dc},${item.row + dr}`)
      }
    }
  }
  return tiles
}

/** Map chair orientation to character facing direction */
function orientationToFacing(orientation: string): Direction {
  switch (orientation) {
    case 'front': return Direction.DOWN
    case 'back': return Direction.UP
    case 'left': return Direction.LEFT
    case 'right': return Direction.RIGHT
    default: return Direction.DOWN
  }
}

/** Generate seats from chair furniture.
 *  Facing priority: 1) chair orientation, 2) adjacent desk, 3) forward (DOWN). */
export function layoutToSeats(furniture: PlacedFurniture[]): Map<string, Seat> {
  const seats = new Map<string, Seat>()

  // Build set of all desk tiles
  const deskTiles = new Set<string>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || !entry.isDesk) continue
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        deskTiles.add(`${item.col + dc},${item.row + dr}`)
      }
    }
  }

  const dirs: Array<{ dc: number; dr: number; facing: Direction }> = [
    { dc: 0, dr: -1, facing: Direction.UP },    // desk is above chair → face UP
    { dc: 0, dr: 1, facing: Direction.DOWN },   // desk is below chair → face DOWN
    { dc: -1, dr: 0, facing: Direction.LEFT },   // desk is left of chair → face LEFT
    { dc: 1, dr: 0, facing: Direction.RIGHT },   // desk is right of chair → face RIGHT
  ]

  // For each chair, every footprint tile becomes a seat.
  // Multi-tile chairs (e.g. 2-tile couches) produce multiple seats.
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || entry.category !== 'chairs') continue

    let seatCount = 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const tileCol = item.col + dc
        const tileRow = item.row + dr

        // Determine facing direction:
        // 1) Chair orientation takes priority
        // 2) Adjacent desk direction
        // 3) Default forward (DOWN)
        let facingDir: Direction = Direction.DOWN
        if (entry.orientation) {
          facingDir = orientationToFacing(entry.orientation)
        } else {
          for (const d of dirs) {
            if (deskTiles.has(`${tileCol + d.dc},${tileRow + d.dr}`)) {
              facingDir = d.facing
              break
            }
          }
        }

        // First seat uses chair uid (backward compat), subsequent use uid:N
        const seatUid = seatCount === 0 ? item.uid : `${item.uid}:${seatCount}`
        seats.set(seatUid, {
          uid: seatUid,
          seatCol: tileCol,
          seatRow: tileRow,
          facingDir,
          assigned: false,
        })
        seatCount++
      }
    }
  }

  return seats
}

/** Get the set of tiles occupied by seats (so they can be excluded from blocked tiles) */
export function getSeatTiles(seats: Map<string, Seat>): Set<string> {
  const tiles = new Set<string>()
  for (const seat of seats.values()) {
    tiles.add(`${seat.seatCol},${seat.seatRow}`)
  }
  return tiles
}

/** Default floor colors for the two rooms */
const DEFAULT_LEFT_ROOM_COLOR: FloorColor = { h: 35, s: 30, b: 15, c: 0 }  // warm beige
const DEFAULT_RIGHT_ROOM_COLOR: FloorColor = { h: 25, s: 45, b: 5, c: 10 }  // warm brown
const DEFAULT_CARPET_COLOR: FloorColor = { h: 280, s: 40, b: -5, c: 0 }     // purple
const DEFAULT_DOORWAY_COLOR: FloorColor = { h: 35, s: 25, b: 10, c: 0 }     // tan

/** Create the default office layout matching the current hardcoded office */
export function createDefaultLayout(): OfficeLayout {
  const W = TileType.WALL
  const F1 = TileType.FLOOR_1
  const F2 = TileType.FLOOR_2
  const F3 = TileType.FLOOR_3
  const F4 = TileType.FLOOR_4

  const tiles: TileTypeVal[] = []
  const tileColors: Array<FloorColor | null> = []

  for (let r = 0; r < DEFAULT_ROWS; r++) {
    for (let c = 0; c < DEFAULT_COLS; c++) {
      if (r === 0 || r === DEFAULT_ROWS - 1) { tiles.push(W); tileColors.push(null); continue }
      if (c === 0 || c === DEFAULT_COLS - 1) { tiles.push(W); tileColors.push(null); continue }
      if (c === 10) {
        if (r >= 4 && r <= 6) {
          tiles.push(F4); tileColors.push(DEFAULT_DOORWAY_COLOR)
        } else {
          tiles.push(W); tileColors.push(null)
        }
        continue
      }
      if (c >= 15 && c <= 18 && r >= 7 && r <= 9) {
        tiles.push(F3); tileColors.push(DEFAULT_CARPET_COLOR); continue
      }
      if (c < 10) {
        tiles.push(F1); tileColors.push(DEFAULT_LEFT_ROOM_COLOR)
      } else {
        tiles.push(F2); tileColors.push(DEFAULT_RIGHT_ROOM_COLOR)
      }
    }
  }

  const furniture: PlacedFurniture[] = [
    { uid: 'desk-left', type: FurnitureType.DESK, col: 4, row: 3 },
    { uid: 'desk-right', type: FurnitureType.DESK, col: 13, row: 3 },
    { uid: 'bookshelf-1', type: FurnitureType.BOOKSHELF, col: 1, row: 5 },
    { uid: 'plant-left', type: FurnitureType.PLANT, col: 1, row: 1 },
    { uid: 'cooler-1', type: FurnitureType.COOLER, col: 17, row: 7 },
    { uid: 'plant-right', type: FurnitureType.PLANT, col: 18, row: 1 },
    { uid: 'whiteboard-1', type: FurnitureType.WHITEBOARD, col: 15, row: 0 },
    // Left desk chairs
    { uid: 'chair-l-top', type: FurnitureType.CHAIR, col: 4, row: 2 },
    { uid: 'chair-l-bottom', type: FurnitureType.CHAIR, col: 5, row: 5 },
    { uid: 'chair-l-left', type: FurnitureType.CHAIR, col: 3, row: 4 },
    { uid: 'chair-l-right', type: FurnitureType.CHAIR, col: 6, row: 3 },
    // Right desk chairs
    { uid: 'chair-r-top', type: FurnitureType.CHAIR, col: 13, row: 2 },
    { uid: 'chair-r-bottom', type: FurnitureType.CHAIR, col: 14, row: 5 },
    { uid: 'chair-r-left', type: FurnitureType.CHAIR, col: 12, row: 4 },
    { uid: 'chair-r-right', type: FurnitureType.CHAIR, col: 15, row: 3 },
    // Door (top wall, left room)
    { uid: 'door-main', type: FurnitureType.DOOR, col: 8, row: 0 },
    // Break room items (right room carpet area)
    { uid: 'coffee-1', type: FurnitureType.COFFEE_MACHINE, col: 18, row: 7 },
    { uid: 'couch-1', type: FurnitureType.BREAK_COUCH, col: 15, row: 9 },
  ]

  // v2 shape: interior-only, no exterior tiles painted (procedural background
  // still renders), unrestricted movement boundary. Interaction points derived
  // from the default break-room furniture for forward-compat.
  return {
    version: 2,
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    tiles,
    tileColors,
    furniture,
    movementBoundary: { character: null, pet: null },
    interactionPoints: deriveInteractionPointsFromFurniture(furniture),
  }
}

/** Serialize layout to JSON string */
export function serializeLayout(layout: OfficeLayout): string {
  return JSON.stringify(layout)
}

/** Deserialize layout from JSON string, migrating old tile types if needed */
export function deserializeLayout(json: string): OfficeLayout | null {
  try {
    const obj = JSON.parse(json)
    if (
      obj &&
      (obj.version === 1 || obj.version === 2) &&
      Array.isArray(obj.tiles) &&
      Array.isArray(obj.furniture)
    ) {
      return migrateLayout(obj as OfficeLayout)
    }
  } catch { /* ignore parse errors */ }
  return null
}

/** True if the layout has any painted exterior tile (TileType >= 9). Used by the
 *  renderer (A2) to decide whether the grid owns the look (skip procedural
 *  background) or the legacy procedural fallback still applies. */
export function hasExteriorTiles(layout: OfficeLayout): boolean {
  return layout.tiles.some((t) => isExteriorTile(t))
}

/**
 * Dev-only invariant check: every parallel array must have length cols*rows.
 * Length mismatch is the top regression risk once resize touches multiple
 * arrays (Phase A.5). No-op in production-shaped callers; logs in dev. Returns
 * true when the layout is internally consistent.
 */
export function validateLayout(layout: OfficeLayout): boolean {
  const expected = layout.cols * layout.rows
  const problems: string[] = []
  const check = (name: string, arr: unknown[] | null | undefined) => {
    if (arr && arr.length !== expected) {
      problems.push(`${name}.length=${arr.length} (expected ${expected})`)
    }
  }
  if (layout.tiles.length !== expected) {
    problems.push(`tiles.length=${layout.tiles.length} (expected ${expected})`)
  }
  check('tileColors', layout.tileColors)
  check('tileThemes', layout.tileThemes)
  check('zones', layout.zones)
  check('movementBoundary.character', layout.movementBoundary?.character ?? undefined)
  check('movementBoundary.pet', layout.movementBoundary?.pet ?? undefined)
  if (problems.length > 0) {
    console.warn('[validateLayout] parallel-array length mismatch:', problems.join('; '))
    return false
  }
  return true
}

/**
 * Derive interaction points from furniture flags ONCE (D4 / Phase C). Every
 * break-room / interaction furniture item (`isBreakRoom` OR `isInteractionPoint`
 * — coffee machine, water cooler, break couch) becomes an explicit point
 * anchored at the furniture's origin tile, with a behavior `type` key. This
 * mirrors the LEGACY `getBreakRoomTiles` furniture scan exactly (which collected
 * tiles around any `isBreakRoom` furniture), so the points-first runtime
 * produces the same idle-agent destinations after migration — no behavior
 * regression. Points-first, no auto-create after migration (OQ-8): once a v2
 * layout carries this list, placing more furniture does NOT add points.
 */
function deriveInteractionPointsFromFurniture(furniture: PlacedFurniture[]): PlacedInteractionPoint[] {
  const points: PlacedInteractionPoint[] = []
  for (const f of furniture) {
    const entry = getCatalogEntry(f.type)
    if (!entry?.isInteractionPoint && !entry?.isBreakRoom) continue
    const type = f.type === FurnitureType.COFFEE_MACHINE ? 'coffee'
      : f.type === FurnitureType.COOLER ? 'cooler'
      : f.type === FurnitureType.BREAK_COUCH ? 'break'
      : 'break'
    points.push({
      uid: `ip-${f.uid}`,
      type,
      col: f.col,
      row: f.row,
      requiredBy: 'both',
      derivedFromFurnitureUid: f.uid,
    })
  }
  return points
}

/**
 * Ensure layout has tileColors. If missing, generate defaults based on tile types.
 * Exported for use by message handlers that receive layouts over the wire.
 */
export function migrateLayoutColors(layout: OfficeLayout): OfficeLayout {
  return migrateLayout(layout)
}

/**
 * Migrate old layouts to the current schema (v2).
 *
 * Backward compat (v1 → v2) is non-destructive and produces a render-identical
 * scene (D7): tiles/colors/themes/zones are kept as-is, exterior tiles are left
 * UNPAINTED (so the procedural background still renders until a preset is
 * applied in A2), an empty/unrestricted `movementBoundary` is added (null masks
 * = legacy "roam anywhere", Phase B), and `interactionPoints` are derived from
 * furniture flags once (D4 / Phase C data part).
 *
 * Also handles legacy tile-type colorization (TILE_FLOOR=1, WOOD_FLOOR=2,
 * CARPET=3, DOORWAY=4) and backfills tileThemes for pre-theme layouts.
 */
function migrateLayout(layout: OfficeLayout): OfficeLayout {
  let out = layout

  if (!out.tileColors || out.tileColors.length !== out.tiles.length) {
    const tileColors: Array<FloorColor | null> = []
    for (const tile of out.tiles) {
      switch (tile) {
        case 0: // WALL
          tileColors.push(null)
          break
        case 1: // was TILE_FLOOR → FLOOR_1 beige
          tileColors.push(DEFAULT_LEFT_ROOM_COLOR)
          break
        case 2: // was WOOD_FLOOR → FLOOR_2 brown
          tileColors.push(DEFAULT_RIGHT_ROOM_COLOR)
          break
        case 3: // was CARPET → FLOOR_3 purple
          tileColors.push(DEFAULT_CARPET_COLOR)
          break
        case 4: // was DOORWAY → FLOOR_4 tan
          tileColors.push(DEFAULT_DOORWAY_COLOR)
          break
        default:
          tileColors.push(tile > 0 ? { h: 0, s: 0, b: 0, c: 0 } : null)
      }
    }
    out = { ...out, tileColors }
  }

  if (!out.tileThemes || out.tileThemes.length !== out.tiles.length) {
    const defaultTheme = getActiveFloorThemeId()
    const tileThemes: Array<string | null> = out.tiles.map((tile) => {
      // Only floor tiles (1-7) carry a theme; WALL=0 and VOID=8 stay null.
      if (tile >= 1 && tile <= 7) return defaultTheme
      return null
    })
    out = { ...out, tileThemes }
  }

  // ── v2 additive fields (non-destructive; render-identical) ──────────────
  // Empty/unrestricted movement boundary: null masks = legacy "roam anywhere".
  if (!out.movementBoundary) {
    out = { ...out, movementBoundary: { character: null, pet: null } }
  }

  // Derive interaction points from furniture flags ONCE. Skip if already present
  // (a v2 layout that has been edited owns its points — never re-derive).
  if (!out.interactionPoints) {
    out = { ...out, interactionPoints: deriveInteractionPointsFromFurniture(out.furniture) }
  }

  // Bump schema version last so the persisted layout round-trips as v2.
  if (out.version !== 2) {
    out = { ...out, version: 2 }
  }

  return out
}
