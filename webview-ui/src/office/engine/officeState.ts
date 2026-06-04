import { TILE_SIZE, MATRIX_EFFECT_DURATION, CharacterState, Direction } from '../types.js'
import {
  PALETTE_COUNT,
  HUE_SHIFT_MIN_DEG,
  HUE_SHIFT_RANGE_DEG,
  WAITING_BUBBLE_DURATION_SEC,
  DISMISS_BUBBLE_FAST_FADE_SEC,
  INACTIVE_SEAT_TIMER_MIN_SEC,
  INACTIVE_SEAT_TIMER_RANGE_SEC,
  AUTO_ON_FACING_DEPTH,
  AUTO_ON_SIDE_DEPTH,
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_HIT_HALF_WIDTH,
  CHARACTER_HIT_HEIGHT,
  PET_HIT_HALF_WIDTH,
  PET_HIT_HEIGHT,
} from '../../constants.js'
import type { Character, Seat, FurnitureInstance, TileType as TileTypeVal, OfficeLayout, PlacedFurniture, Pet, FloorColor, PetColors } from '../types.js'
import { INTERACTION_POINT_TYPES, DEFAULT_INTERACTION_RADIUS } from '../types.js'
import { createCharacter, updateCharacter } from './characters.js'
import { createPet, updatePet, triggerPetReaction, perkUpPet, walkPetToTile as petWalkToTile, setPetSpeech, setPetReactionBubble } from './pets.js'
import { matrixEffectSeeds } from './matrixEffect.js'
import { isWalkable, getWalkableTiles, findPath, findNearestWalkable } from '../layout/tileMap.js'
import {
  createDefaultLayout,
  layoutToTileMap,
  layoutToFurnitureInstances,
  layoutToSeats,
  getBlockedTiles,
} from '../layout/layoutSerializer.js'
import { getCatalogEntry, getOnStateType } from '../layout/furnitureCatalog.js'

export class OfficeState {
  layout: OfficeLayout
  tileMap: TileTypeVal[][]
  seats: Map<string, Seat>
  blockedTiles: Set<string>
  furniture: FurnitureInstance[]
  walkableTiles: Array<{ col: number; row: number }>
  characters: Map<number, Character> = new Map()
  pets: Map<string, Pet> = new Map()
  selectedAgentId: number | null = null
  cameraFollowId: number | null = null
  hoveredAgentId: number | null = null
  hoveredTile: { col: number; row: number } | null = null
  selectedPetId: string | null = null
  hoveredPetId: string | null = null
  /** Seconds since any agent was last active (for pet sleep behavior) */
  officeIdleTime = 0
  /** End-of-day banner text from an external narration source, or null */
  dailySummaryText: string | null = null
  /** Countdown timer for the banner (seconds remaining) */
  dailySummaryTimer = 0
  /** Original duration of the current banner, for fade-out alpha */
  dailySummaryFullDuration = 0
  /** Maps "parentId:toolId" → sub-agent character ID (negative) */
  subagentIdMap: Map<string, number> = new Map()
  /** Reverse lookup: sub-agent character ID → parent info */
  subagentMeta: Map<number, { parentAgentId: number; parentToolId: string }> = new Map()
  private nextSubagentId = -1

  /** Tiles occupied by doors — walkable even though underlying tile is WALL.
   *  Pet doors are NOT included: characters never path through them. */
  doorTiles: Set<string> = new Set()

  /** Door tiles for PETS: regular doors plus pet doors. Pets path through both. */
  petDoorTiles: Set<string> = new Set()

  /** Per-actor allowed-tile Sets, built ONCE on rebuild from
   *  layout.movementBoundary (Phase B / D2-D3). `undefined` = unrestricted
   *  (legacy: actor roams anywhere walkable). Built from "col,row" keys of mask
   *  cells === true; an absent or all-null mask yields `undefined`. */
  characterBoundary: Set<string> | undefined = undefined
  petBoundary: Set<string> | undefined = undefined

  constructor(layout?: OfficeLayout) {
    this.layout = layout || createDefaultLayout()
    this.tileMap = layoutToTileMap(this.layout)
    this.seats = layoutToSeats(this.layout.furniture)
    this.blockedTiles = getBlockedTiles(this.layout.furniture, undefined, this.tileMap)
    this.doorTiles = this.computeDoorTiles()
    this.furniture = layoutToFurnitureInstances(this.layout.furniture, this.tileMap)
    this.characterBoundary = this.buildBoundarySet('character')
    this.petBoundary = this.buildBoundarySet('pet')
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles, this.doorTiles)
  }

  /**
   * Build a per-actor allowed-tile Set from layout.movementBoundary once.
   * Returns `undefined` when the mask is absent or has NO `true` cell — that
   * means "unrestricted" so a freshly-created or all-cleared mask never seals an
   * actor in (backward compat). When the mask has at least one `true` cell, the
   * Set is exactly those cells: the actor may only roam there.
   */
  private buildBoundarySet(actor: 'character' | 'pet'): Set<string> | undefined {
    const mask = this.layout.movementBoundary?.[actor]
    if (!mask) return undefined
    const cols = this.layout.cols
    const set = new Set<string>()
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === true) {
        set.add(`${i % cols},${Math.floor(i / cols)}`)
      }
    }
    return set.size > 0 ? set : undefined
  }

  /** Rebuild all derived state from a new layout. Reassigns existing characters.
   *  @param shift Optional pixel shift to apply when grid expands left/up */
  rebuildFromLayout(layout: OfficeLayout, shift?: { col: number; row: number }): void {
    this.layout = layout
    this.tileMap = layoutToTileMap(layout)
    this.seats = layoutToSeats(layout.furniture)
    this.blockedTiles = getBlockedTiles(layout.furniture, undefined, this.tileMap)
    this.doorTiles = this.computeDoorTiles()
    this.rebuildFurnitureInstances()
    // Rebuild per-actor boundary Sets ONCE here (never per frame).
    this.characterBoundary = this.buildBoundarySet('character')
    this.petBoundary = this.buildBoundarySet('pet')
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles, this.doorTiles)

    // Shift character positions when grid expands left/up
    if (shift && (shift.col !== 0 || shift.row !== 0)) {
      for (const ch of this.characters.values()) {
        ch.tileCol += shift.col
        ch.tileRow += shift.row
        ch.x += shift.col * TILE_SIZE
        ch.y += shift.row * TILE_SIZE
        // Clear path since tile coords changed
        ch.path = []
        ch.moveProgress = 0
      }
    }

    // Reassign characters to new seats, preserving existing assignments when possible
    for (const seat of this.seats.values()) {
      seat.assigned = false
    }

    // First pass: try to keep characters at their existing seats
    for (const ch of this.characters.values()) {
      if (ch.seatId && this.seats.has(ch.seatId)) {
        const seat = this.seats.get(ch.seatId)!
        if (!seat.assigned) {
          seat.assigned = true
          // Snap character to seat position
          ch.tileCol = seat.seatCol
          ch.tileRow = seat.seatRow
          const cx = seat.seatCol * TILE_SIZE + TILE_SIZE / 2
          const cy = seat.seatRow * TILE_SIZE + TILE_SIZE / 2
          ch.x = cx
          ch.y = cy
          ch.dir = seat.facingDir
          continue
        }
      }
      ch.seatId = null // will be reassigned below
    }

    // Second pass: assign remaining characters to free seats
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue
      const seatId = this.findFreeSeat()
      if (seatId) {
        this.seats.get(seatId)!.assigned = true
        ch.seatId = seatId
        const seat = this.seats.get(seatId)!
        ch.tileCol = seat.seatCol
        ch.tileRow = seat.seatRow
        ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2
        ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2
        ch.dir = seat.facingDir
      }
    }

    // Relocate any characters that ended up outside bounds, on non-walkable
    // tiles, or stranded outside a freshly-painted character boundary. Seated
    // characters keep their seat (their seat is home, even if interior tiles are
    // not in the boundary set).
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue // seated characters are fine
      const outOfBounds = ch.tileCol < 0 || ch.tileCol >= layout.cols || ch.tileRow < 0 || ch.tileRow >= layout.rows
      const outOfBoundary = !!this.characterBoundary && !this.characterBoundary.has(`${ch.tileCol},${ch.tileRow}`)
      if (outOfBounds || outOfBoundary) {
        this.relocateCharacterToWalkable(ch)
      }
    }

    // Rebuild pets from layout
    this.rebuildPets()
  }

  /** Allowed-tile Set for characters, or undefined when unrestricted. */
  getCharacterBoundary(): Set<string> | undefined {
    return this.characterBoundary
  }

  /** Allowed-tile Set for pets, or undefined when unrestricted. */
  getPetBoundary(): Set<string> | undefined {
    return this.petBoundary
  }

  /** Walkable tiles a character may roam (clamped to its boundary). */
  getCharacterWalkableTiles(): Array<{ col: number; row: number }> {
    if (!this.characterBoundary) return this.walkableTiles
    return this.walkableTiles.filter((t) => this.characterBoundary!.has(`${t.col},${t.row}`))
  }

  /** Walkable tiles a pet may roam (clamped to its boundary). */
  getPetWalkableTiles(): Array<{ col: number; row: number }> {
    if (!this.petBoundary) return this.walkableTiles
    return this.walkableTiles.filter((t) => this.petBoundary!.has(`${t.col},${t.row}`))
  }

  /** Create/update pets from layout.pets array */
  rebuildPets(): void {
    const layoutPets = this.layout.pets || []
    const existingUids = new Set(layoutPets.map((p) => p.uid))

    // Remove pets no longer in layout
    for (const uid of this.pets.keys()) {
      if (!existingUids.has(uid)) {
        this.pets.delete(uid)
      }
    }

    // Add new pets (preserve existing ones)
    for (const placed of layoutPets) {
      if (!this.pets.has(placed.uid)) {
        this.pets.set(placed.uid, createPet(placed))
      }
    }

    // Relocate any pets that ended up outside bounds, on non-walkable tiles, or
    // stranded outside a freshly-painted pet boundary.
    for (const pet of this.pets.values()) {
      const outOfBounds = pet.tileCol < 0 || pet.tileCol >= this.layout.cols || pet.tileRow < 0 || pet.tileRow >= this.layout.rows
      const outOfBoundary = !!this.petBoundary && !this.petBoundary.has(`${pet.tileCol},${pet.tileRow}`)
      if (outOfBounds || outOfBoundary) {
        this.relocatePetToWalkable(pet)
      }
    }
  }

  /** Move a character to the nearest in-boundary walkable tile (random within
   *  the boundary when stranded far outside it). Clamped to the character mask. */
  private relocateCharacterToWalkable(ch: Character): void {
    const pool = this.getCharacterWalkableTiles()
    if (pool.length === 0) return
    // Prefer the nearest in-boundary tile so the character doesn't teleport
    // across the map when the user paints them out of a region.
    const near = findNearestWalkable(ch.tileCol, ch.tileRow, this.tileMap, this.blockedTiles, this.doorTiles, this.characterBoundary)
    const spawn = near ?? pool[Math.floor(Math.random() * pool.length)]
    ch.tileCol = spawn.col
    ch.tileRow = spawn.row
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
    ch.path = []
    ch.moveProgress = 0
  }

  /** Move a pet to the nearest in-boundary walkable tile. Clamped to pet mask. */
  private relocatePetToWalkable(pet: Pet): void {
    const pool = this.getPetWalkableTiles()
    if (pool.length === 0) return
    const near = findNearestWalkable(pet.tileCol, pet.tileRow, this.tileMap, this.blockedTiles, this.petDoorTiles, this.petBoundary)
    const spawn = near ?? pool[Math.floor(Math.random() * pool.length)]
    pet.tileCol = spawn.col
    pet.tileRow = spawn.row
    pet.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
    pet.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
    pet.path = []
  }

  getLayout(): OfficeLayout {
    return this.layout
  }

  /** Get the blocked-tile key for a character's own seat, or null */
  private ownSeatKey(ch: Character): string | null {
    if (!ch.seatId) return null
    const seat = this.seats.get(ch.seatId)
    if (!seat) return null
    return `${seat.seatCol},${seat.seatRow}`
  }

  /** Temporarily unblock a character's own seat, run fn, then re-block */
  private withOwnSeatUnblocked<T>(ch: Character, fn: () => T): T {
    const key = this.ownSeatKey(ch)
    if (key) this.blockedTiles.delete(key)
    const result = fn()
    if (key) this.blockedTiles.add(key)
    return result
  }

  private findFreeSeat(): string | null {
    for (const [uid, seat] of this.seats) {
      if (!seat.assigned) return uid
    }
    return null
  }

  /** Compute the door-tile sets for walkability override. Regular doors go in
   *  `doorTiles` (characters + pets); pet doors only in `petDoorTiles` (pets). */
  private computeDoorTiles(): Set<string> {
    const tiles = new Set<string>()
    this.petDoorTiles = new Set<string>()
    for (const f of this.layout.furniture) {
      const entry = getCatalogEntry(f.type)
      if (!entry?.isDoor && !entry?.isPetDoor) continue
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          const key = `${f.col + dc},${f.row + dr}`
          this.petDoorTiles.add(key)
          if (!entry.isPetDoor) tiles.add(key)
        }
      }
    }
    return tiles
  }

  /** Find the bottom tile of the nearest door furniture, or null if no doors exist */
  private findNearestDoorTile(fromCol: number, fromRow: number): { col: number; row: number } | null {
    let best: { col: number; row: number } | null = null
    let bestDist = Infinity
    for (const f of this.layout.furniture) {
      const entry = getCatalogEntry(f.type)
      if (!entry?.isDoor) continue
      // Door bottom tile = f.col, f.row + footprintH - 1 (the walkable doorstep)
      const doorCol = f.col
      const doorRow = f.row + (entry.footprintH - 1)
      const dist = Math.abs(doorCol - fromCol) + Math.abs(doorRow - fromRow)
      if (dist < bestDist) {
        bestDist = dist
        best = { col: doorCol, row: doorRow }
      }
    }
    return best
  }

  /** Find any door tile (for spawning — just picks the first one) */
  private findAnyDoorTile(): { col: number; row: number } | null {
    for (const f of this.layout.furniture) {
      const entry = getCatalogEntry(f.type)
      if (!entry?.isDoor) continue
      return { col: f.col, row: f.row + (entry.footprintH - 1) }
    }
    return null
  }

  /**
   * Walkable tiles that idle agents head to for a break / interaction (coffee
   * machine, cooler, couch). Phase C / D4 resolves these from the explicit
   * `layout.interactionPoints` FIRST; only when that field is absent does it
   * fall back to the legacy furniture `isBreakRoom` scan (points-first,
   * furniture-fallback, no double-counting). An empty (but present) list means
   * "the user removed all points" → no break-room destinations, NOT a fallback.
   */
  getBreakRoomTiles(): Array<{ col: number; row: number }> {
    const points = this.layout.interactionPoints
    if (points !== undefined) {
      return this.interactionPointTiles(points, 'char')
    }
    return this.breakRoomTilesFromFurniture()
  }

  /**
   * Collect walkable tiles within each interaction point's reach radius
   * (default 1) for a given actor. Only points whose `type` has engine behavior
   * (coffee/cooler/break — `behavior: true` in INTERACTION_POINT_TYPES) and
   * whose `requiredBy` admits the actor contribute tiles. `requiredBy: 'both'`
   * (or absent) admits both; 'char'/'pet' restrict to that actor. The point's
   * own tile is skipped (it's where the appliance stands); we want the tiles
   * AROUND it. Honors the per-actor movement boundary (Phase B) implicitly via
   * the caller filtering, but also keeps only currently-walkable tiles.
   */
  private interactionPointTiles(
    points: Array<{ type: string; col: number; row: number; interactionRadius?: number; requiredBy?: 'pet' | 'char' | 'both' }>,
    actor: 'char' | 'pet',
  ): Array<{ col: number; row: number }> {
    const tiles: Array<{ col: number; row: number }> = []
    const seen = new Set<string>()
    const behaviorTypes = new Set<string>(INTERACTION_POINT_TYPES.filter((t) => t.behavior).map((t) => t.type))
    for (const p of points) {
      if (!behaviorTypes.has(p.type)) continue
      const req = p.requiredBy ?? 'both'
      if (req !== 'both' && req !== actor) continue
      const radius = Math.max(1, p.interactionRadius ?? DEFAULT_INTERACTION_RADIUS)
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (dc === 0 && dr === 0) continue // the appliance tile itself
          const col = p.col + dc
          const row = p.row + dr
          const key = `${col},${row}`
          if (seen.has(key)) continue
          if (isWalkable(col, row, this.tileMap, this.blockedTiles, this.doorTiles)) {
            tiles.push({ col, row })
            seen.add(key)
          }
        }
      }
    }
    return tiles
  }

  /** Legacy fallback: walkable tiles adjacent to break-room furniture (coffee
   *  machines, coolers, couches). Used only when `layout.interactionPoints` is
   *  absent (un-migrated layout). */
  private breakRoomTilesFromFurniture(): Array<{ col: number; row: number }> {
    const tiles: Array<{ col: number; row: number }> = []
    const seen = new Set<string>()
    for (const f of this.layout.furniture) {
      const entry = getCatalogEntry(f.type)
      if (!entry?.isBreakRoom) continue
      // For interaction points (coffee machine), find adjacent walkable tiles
      // For couches, find adjacent walkable tiles too
      for (let dr = -1; dr <= entry.footprintH; dr++) {
        for (let dc = -1; dc <= entry.footprintW; dc++) {
          // Skip tiles inside the furniture footprint
          if (dr >= 0 && dr < entry.footprintH && dc >= 0 && dc < entry.footprintW) continue
          const col = f.col + dc
          const row = f.row + dr
          const key = `${col},${row}`
          if (seen.has(key)) continue
          if (isWalkable(col, row, this.tileMap, this.blockedTiles, this.doorTiles)) {
            tiles.push({ col, row })
            seen.add(key)
          }
        }
      }
    }
    return tiles
  }

  /** Build a Set of "col,row" keys for tiles designated as focus zones */
  getFocusZoneTiles(): Set<string> {
    const zones = this.layout.zones
    if (!zones) return new Set()
    const result = new Set<string>()
    const cols = this.layout.cols
    for (let i = 0; i < zones.length; i++) {
      if (zones[i] === 'focus') {
        const col = i % cols
        const row = Math.floor(i / cols)
        result.add(`${col},${row}`)
      }
    }
    return result
  }

  /**
   * Walkable tiles designated as the "green" play zone (zones[i] === 'play').
   * Pets head here to play. Empty array when no such tiles exist (no zone).
   */
  getPlayZoneTiles(): Array<{ col: number; row: number }> {
    const zones = this.layout.zones
    if (!zones) return []
    const cols = this.layout.cols
    const result: Array<{ col: number; row: number }> = []
    for (const t of this.walkableTiles) {
      if (zones[t.row * cols + t.col] === 'play') {
        result.push({ col: t.col, row: t.row })
      }
    }
    return result
  }

  /**
   * Pick a diverse palette for a new agent based on currently active agents.
   * First 6 agents each get a unique skin (random order). Beyond 6, skins
   * repeat in balanced rounds with a random hue shift (≥45°).
   */
  private pickDiversePalette(): { palette: number; hueShift: number } {
    // Count how many non-sub-agents use each base palette (0-5)
    const counts = new Array(PALETTE_COUNT).fill(0) as number[]
    for (const ch of this.characters.values()) {
      if (ch.isSubagent) continue
      counts[ch.palette]++
    }
    const minCount = Math.min(...counts)
    // Available = palettes at the minimum count (least used)
    const available: number[] = []
    for (let i = 0; i < PALETTE_COUNT; i++) {
      if (counts[i] === minCount) available.push(i)
    }
    const palette = available[Math.floor(Math.random() * available.length)]
    // First round (minCount === 0): no hue shift. Subsequent rounds: random ≥45°.
    let hueShift = 0
    if (minCount > 0) {
      hueShift = HUE_SHIFT_MIN_DEG + Math.floor(Math.random() * HUE_SHIFT_RANGE_DEG)
    }
    return { palette, hueShift }
  }

  addAgent(id: number, preferredPalette?: number, preferredHueShift?: number, preferredSeatId?: string, skipSpawnEffect?: boolean, folderName?: string): void {
    if (this.characters.has(id)) return

    let palette: number
    let hueShift: number
    if (preferredPalette !== undefined) {
      palette = preferredPalette
      hueShift = preferredHueShift ?? 0
    } else {
      const pick = this.pickDiversePalette()
      palette = pick.palette
      hueShift = pick.hueShift
    }

    // Try preferred seat first, then any free seat
    let seatId: string | null = null
    if (preferredSeatId && this.seats.has(preferredSeatId)) {
      const seat = this.seats.get(preferredSeatId)!
      if (!seat.assigned) {
        seatId = preferredSeatId
      }
    }
    if (!seatId) {
      seatId = this.findFreeSeat()
    }

    let ch: Character
    if (seatId) {
      const seat = this.seats.get(seatId)!
      seat.assigned = true
      ch = createCharacter(id, palette, seatId, seat, hueShift)
    } else {
      // No seats — spawn at random walkable tile
      const spawn = this.walkableTiles.length > 0
        ? this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
        : { col: 1, row: 1 }
      ch = createCharacter(id, palette, null, null, hueShift)
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
      ch.tileCol = spawn.col
      ch.tileRow = spawn.row
    }

    if (folderName) {
      ch.folderName = folderName
    }
    if (!skipSpawnEffect) {
      // Try door-based spawn: start at door, walk to seat
      const doorTile = this.findAnyDoorTile()
      if (doorTile && seatId) {
        const seat = this.seats.get(seatId)!
        // Position character at door
        ch.tileCol = doorTile.col
        ch.tileRow = doorTile.row
        ch.x = doorTile.col * TILE_SIZE + TILE_SIZE / 2
        ch.y = doorTile.row * TILE_SIZE + TILE_SIZE / 2
        // Pathfind from door to seat
        const path = this.withOwnSeatUnblocked(ch, () =>
          findPath(doorTile.col, doorTile.row, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles, this.doorTiles),
        )
        if (path.length > 0) {
          ch.state = CharacterState.ENTERING
          ch.path = path
          ch.frame = 0
          ch.frameTimer = 0
          ch.moveProgress = 0
        } else {
          // No path from door to seat — fallback to matrix spawn at seat
          ch.tileCol = seat.seatCol
          ch.tileRow = seat.seatRow
          ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2
          ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2
          ch.matrixEffect = 'spawn'
          ch.matrixEffectTimer = 0
          ch.matrixEffectSeeds = matrixEffectSeeds()
        }
      } else {
        // No door — use matrix spawn effect
        ch.matrixEffect = 'spawn'
        ch.matrixEffectTimer = 0
        ch.matrixEffectSeeds = matrixEffectSeeds()
      }
    }
    this.characters.set(id, ch)
  }

  removeAgent(id: number): void {
    const ch = this.characters.get(id)
    if (!ch) return
    if (ch.matrixEffect === 'despawn') return // already despawning
    if (ch.state === CharacterState.LEAVING) return // already leaving via door
    // Free seat and clear selection immediately
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId)
      if (seat) seat.assigned = false
    }
    if (this.selectedAgentId === id) this.selectedAgentId = null
    if (this.cameraFollowId === id) this.cameraFollowId = null
    ch.bubbleType = null

    // Try door-based despawn: walk to nearest door then remove
    const doorTile = this.findNearestDoorTile(ch.tileCol, ch.tileRow)
    if (doorTile) {
      const path = findPath(ch.tileCol, ch.tileRow, doorTile.col, doorTile.row, this.tileMap, this.blockedTiles, this.doorTiles)
      if (path.length > 0) {
        ch.state = CharacterState.LEAVING
        ch.path = path
        ch.frame = 0
        ch.frameTimer = 0
        ch.moveProgress = 0
        ch.isActive = false
        return
      }
    }

    // No door or no path — use matrix despawn effect
    ch.matrixEffect = 'despawn'
    ch.matrixEffectTimer = 0
    ch.matrixEffectSeeds = matrixEffectSeeds()
  }

  /** Find seat uid at a given tile position, or null */
  getSeatAtTile(col: number, row: number): string | null {
    for (const [uid, seat] of this.seats) {
      if (seat.seatCol === col && seat.seatRow === row) return uid
    }
    return null
  }

  /** Reassign an agent from their current seat to a new seat */
  reassignSeat(agentId: number, seatId: string): void {
    const ch = this.characters.get(agentId)
    if (!ch) return
    // Unassign old seat
    if (ch.seatId) {
      const old = this.seats.get(ch.seatId)
      if (old) old.assigned = false
    }
    // Assign new seat
    const seat = this.seats.get(seatId)
    if (!seat || seat.assigned) return
    seat.assigned = true
    ch.seatId = seatId
    // Pathfind to new seat (unblock own seat tile for this query)
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles, this.doorTiles)
    )
    if (path.length > 0) {
      ch.path = path
      ch.moveProgress = 0
      ch.state = CharacterState.WALK
      ch.frame = 0
      ch.frameTimer = 0
    } else {
      // Already at seat or no path — sit down
      ch.state = CharacterState.TYPE
      ch.dir = seat.facingDir
      ch.frame = 0
      ch.frameTimer = 0
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC
      }
    }
  }

  /** Send an agent back to their currently assigned seat */
  sendToSeat(agentId: number): void {
    const ch = this.characters.get(agentId)
    if (!ch || !ch.seatId) return
    const seat = this.seats.get(ch.seatId)
    if (!seat) return
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles, this.doorTiles)
    )
    if (path.length > 0) {
      ch.path = path
      ch.moveProgress = 0
      ch.state = CharacterState.WALK
      ch.frame = 0
      ch.frameTimer = 0
    } else {
      // Already at seat — sit down
      ch.state = CharacterState.TYPE
      ch.dir = seat.facingDir
      ch.frame = 0
      ch.frameTimer = 0
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC
      }
    }
  }

  /** Walk an agent to an arbitrary walkable tile (right-click command) */
  walkToTile(agentId: number, col: number, row: number): boolean {
    const ch = this.characters.get(agentId)
    if (!ch || ch.isSubagent) return false
    if (!isWalkable(col, row, this.tileMap, this.blockedTiles, this.doorTiles)) {
      // Also allow walking to own seat tile (blocked for others but not self)
      const key = this.ownSeatKey(ch)
      if (!key || key !== `${col},${row}`) return false
    }
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, col, row, this.tileMap, this.blockedTiles, this.doorTiles)
    )
    if (path.length === 0) return false
    ch.path = path
    ch.moveProgress = 0
    ch.state = CharacterState.WALK
    ch.frame = 0
    ch.frameTimer = 0
    return true
  }

  /** Create a sub-agent character with the parent's palette. Returns the sub-agent ID. */
  addSubagent(parentAgentId: number, parentToolId: string): number {
    const key = `${parentAgentId}:${parentToolId}`
    if (this.subagentIdMap.has(key)) return this.subagentIdMap.get(key)!

    const id = this.nextSubagentId--
    const parentCh = this.characters.get(parentAgentId)
    const palette = parentCh ? parentCh.palette : 0
    const hueShift = parentCh ? parentCh.hueShift : 0

    // Find the free seat closest to the parent agent
    const parentCol = parentCh ? parentCh.tileCol : 0
    const parentRow = parentCh ? parentCh.tileRow : 0
    const dist = (c: number, r: number) =>
      Math.abs(c - parentCol) + Math.abs(r - parentRow)

    let bestSeatId: string | null = null
    let bestDist = Infinity
    for (const [uid, seat] of this.seats) {
      if (!seat.assigned) {
        const d = dist(seat.seatCol, seat.seatRow)
        if (d < bestDist) {
          bestDist = d
          bestSeatId = uid
        }
      }
    }

    let ch: Character
    if (bestSeatId) {
      const seat = this.seats.get(bestSeatId)!
      seat.assigned = true
      ch = createCharacter(id, palette, bestSeatId, seat, hueShift)
    } else {
      // No seats — spawn at closest walkable tile to parent
      let spawn = { col: 1, row: 1 }
      if (this.walkableTiles.length > 0) {
        let closest = this.walkableTiles[0]
        let closestDist = dist(closest.col, closest.row)
        for (let i = 1; i < this.walkableTiles.length; i++) {
          const d = dist(this.walkableTiles[i].col, this.walkableTiles[i].row)
          if (d < closestDist) {
            closest = this.walkableTiles[i]
            closestDist = d
          }
        }
        spawn = closest
      }
      ch = createCharacter(id, palette, null, null, hueShift)
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
      ch.tileCol = spawn.col
      ch.tileRow = spawn.row
    }
    ch.isSubagent = true
    ch.parentAgentId = parentAgentId
    ch.matrixEffect = 'spawn'
    ch.matrixEffectTimer = 0
    ch.matrixEffectSeeds = matrixEffectSeeds()
    this.characters.set(id, ch)

    this.subagentIdMap.set(key, id)
    this.subagentMeta.set(id, { parentAgentId, parentToolId })
    return id
  }

  /** Remove a specific sub-agent character and free its seat */
  removeSubagent(parentAgentId: number, parentToolId: string): void {
    const key = `${parentAgentId}:${parentToolId}`
    const id = this.subagentIdMap.get(key)
    if (id === undefined) return

    const ch = this.characters.get(id)
    if (ch) {
      if (ch.matrixEffect === 'despawn') {
        // Already despawning — just clean up maps
        this.subagentIdMap.delete(key)
        this.subagentMeta.delete(id)
        return
      }
      if (ch.seatId) {
        const seat = this.seats.get(ch.seatId)
        if (seat) seat.assigned = false
      }
      // Start despawn animation — keep character in map for rendering
      ch.matrixEffect = 'despawn'
      ch.matrixEffectTimer = 0
      ch.matrixEffectSeeds = matrixEffectSeeds()
      ch.bubbleType = null
    }
    // Clean up tracking maps immediately so keys don't collide
    this.subagentIdMap.delete(key)
    this.subagentMeta.delete(id)
    if (this.selectedAgentId === id) this.selectedAgentId = null
    if (this.cameraFollowId === id) this.cameraFollowId = null
  }

  /** Remove all sub-agents belonging to a parent agent */
  removeAllSubagents(parentAgentId: number): void {
    const toRemove: string[] = []
    for (const [key, id] of this.subagentIdMap) {
      const meta = this.subagentMeta.get(id)
      if (meta && meta.parentAgentId === parentAgentId) {
        const ch = this.characters.get(id)
        if (ch) {
          if (ch.matrixEffect === 'despawn') {
            // Already despawning — just clean up maps
            this.subagentMeta.delete(id)
            toRemove.push(key)
            continue
          }
          if (ch.seatId) {
            const seat = this.seats.get(ch.seatId)
            if (seat) seat.assigned = false
          }
          // Start despawn animation
          ch.matrixEffect = 'despawn'
          ch.matrixEffectTimer = 0
          ch.matrixEffectSeeds = matrixEffectSeeds()
          ch.bubbleType = null
        }
        this.subagentMeta.delete(id)
        if (this.selectedAgentId === id) this.selectedAgentId = null
        if (this.cameraFollowId === id) this.cameraFollowId = null
        toRemove.push(key)
      }
    }
    for (const key of toRemove) {
      this.subagentIdMap.delete(key)
    }
  }

  /** Look up the sub-agent character ID for a given parent+toolId, or null */
  getSubagentId(parentAgentId: number, parentToolId: string): number | null {
    return this.subagentIdMap.get(`${parentAgentId}:${parentToolId}`) ?? null
  }

  setAgentActive(id: number, active: boolean): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.isActive = active
      if (!active) {
        // Sentinel -1: signals turn just ended, skip next seat rest timer.
        // Prevents the WALK handler from setting a 2-4 min rest on arrival.
        ch.seatTimer = -1
        ch.path = []
        ch.moveProgress = 0
      }
      this.rebuildFurnitureInstances()
    }
  }

  setAgentResting(id: number, resting: boolean): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.isResting = resting
      if (resting) {
        ch.isActive = false
        ch.path = []
        ch.moveProgress = 0
      }
    }
  }

  /** Rebuild furniture instances with auto-state applied (active agents turn electronics ON) */
  private rebuildFurnitureInstances(): void {
    // Collect tiles where active agents face desks
    const autoOnTiles = new Set<string>()
    for (const ch of this.characters.values()) {
      if (!ch.isActive || !ch.seatId) continue
      const seat = this.seats.get(ch.seatId)
      if (!seat) continue
      // Find the desk tile(s) the agent faces from their seat
      const dCol = seat.facingDir === Direction.RIGHT ? 1 : seat.facingDir === Direction.LEFT ? -1 : 0
      const dRow = seat.facingDir === Direction.DOWN ? 1 : seat.facingDir === Direction.UP ? -1 : 0
      // Check tiles in the facing direction (desk could be 1-3 tiles deep)
      for (let d = 1; d <= AUTO_ON_FACING_DEPTH; d++) {
        const tileCol = seat.seatCol + dCol * d
        const tileRow = seat.seatRow + dRow * d
        autoOnTiles.add(`${tileCol},${tileRow}`)
      }
      // Also check tiles to the sides of the facing direction (desks can be wide)
      for (let d = 1; d <= AUTO_ON_SIDE_DEPTH; d++) {
        const baseCol = seat.seatCol + dCol * d
        const baseRow = seat.seatRow + dRow * d
        if (dCol !== 0) {
          // Facing left/right: check tiles above and below
          autoOnTiles.add(`${baseCol},${baseRow - 1}`)
          autoOnTiles.add(`${baseCol},${baseRow + 1}`)
        } else {
          // Facing up/down: check tiles left and right
          autoOnTiles.add(`${baseCol - 1},${baseRow}`)
          autoOnTiles.add(`${baseCol + 1},${baseRow}`)
        }
      }
    }

    if (autoOnTiles.size === 0) {
      this.furniture = layoutToFurnitureInstances(this.layout.furniture, this.tileMap)
      return
    }

    // Build modified furniture list with auto-state applied
    const modifiedFurniture: PlacedFurniture[] = this.layout.furniture.map((item) => {
      const entry = getCatalogEntry(item.type)
      if (!entry) return item
      // Check if any tile of this furniture overlaps an auto-on tile
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          if (autoOnTiles.has(`${item.col + dc},${item.row + dr}`)) {
            const onType = getOnStateType(item.type)
            if (onType !== item.type) {
              return { ...item, type: onType }
            }
            return item
          }
        }
      }
      return item
    })

    this.furniture = layoutToFurnitureInstances(modifiedFurniture, this.tileMap)
  }

  setAgentTool(id: number, tool: string | null): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.currentTool = tool
      // Perk up nearby pets when agent uses a tool
      if (tool) {
        this.perkUpNearbyPets(ch.tileCol, ch.tileRow, 4)
      }
    }
  }

  showPermissionBubble(id: number): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.bubbleType = 'permission'
      ch.bubbleTimer = 0
    }
  }

  clearPermissionBubble(id: number): void {
    const ch = this.characters.get(id)
    if (ch && ch.bubbleType === 'permission') {
      ch.bubbleType = null
      ch.bubbleTimer = 0
    }
  }

  showWaitingBubble(id: number): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.bubbleType = 'waiting'
      ch.bubbleTimer = WAITING_BUBBLE_DURATION_SEC
    }
  }

  /** Dismiss bubble on click — permission: instant, waiting: quick fade */
  dismissBubble(id: number): void {
    const ch = this.characters.get(id)
    if (!ch || !ch.bubbleType) return
    if (ch.bubbleType === 'permission') {
      ch.bubbleType = null
      ch.bubbleTimer = 0
    } else if (ch.bubbleType === 'waiting') {
      // Trigger immediate fade (0.3s remaining)
      ch.bubbleTimer = Math.min(ch.bubbleTimer, DISMISS_BUBBLE_FAST_FADE_SEC)
    }
  }

  /** Get pet at pixel position (for hit testing). Returns uid or null. */
  getPetAt(worldX: number, worldY: number): string | null {
    // Sort pets by descending Y (front pets first for picking)
    const sorted = [...this.pets.values()].sort((a, b) => b.y - a.y)
    for (const pet of sorted) {
      // Pet sprite is 16x16, anchored bottom-center
      const left = pet.x - PET_HIT_HALF_WIDTH
      const right = pet.x + PET_HIT_HALF_WIDTH
      const top = pet.y - PET_HIT_HEIGHT
      const bottom = pet.y
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return pet.uid
      }
    }
    return null
  }

  /** Delete a pet from the office and layout */
  deletePet(uid: string): OfficeLayout | null {
    this.pets.delete(uid)
    if (this.selectedPetId === uid) this.selectedPetId = null
    if (this.hoveredPetId === uid) this.hoveredPetId = null
    const pets = (this.layout.pets || []).filter((p) => p.uid !== uid)
    this.layout = { ...this.layout, pets }
    return this.layout
  }

  /** Edit a pet's name, color, petColors, variantColors, and/or personality */
  editPet(uid: string, updates: { name?: string; color?: FloorColor; petColors?: PetColors; personality?: string; variant?: string | null; variantColors?: Record<string, string> | null; backstory?: string | null; voiceStyle?: string | null }): OfficeLayout | null {
    // Only stored on the layout — runtime Pet doesn't read them; the bridge does.
    const layoutPet = (this.layout.pets || []).find((p) => p.uid === uid)
    const pet = this.pets.get(uid)
    if (!pet) return null
    if (updates.name !== undefined) pet.name = updates.name
    if (updates.color !== undefined) pet.color = updates.color
    if (updates.petColors !== undefined) pet.petColors = updates.petColors
    if (updates.personality !== undefined) pet.personality = updates.personality as Pet['personality']
    // null sentinel = clear (back to default sprite); undefined = leave alone.
    if (updates.variant !== undefined) pet.variant = updates.variant ?? undefined
    if (updates.variantColors !== undefined) pet.variantColors = updates.variantColors ?? undefined
    if (layoutPet) {
      if (updates.name !== undefined) layoutPet.name = updates.name
      if (updates.color !== undefined) layoutPet.color = updates.color
      if (updates.petColors !== undefined) layoutPet.petColors = updates.petColors
      if (updates.personality !== undefined) layoutPet.personality = updates.personality as Pet['personality']
      if (updates.variant !== undefined) layoutPet.variant = updates.variant ?? undefined
      if (updates.variantColors !== undefined) layoutPet.variantColors = updates.variantColors ?? undefined
      if (updates.backstory !== undefined) layoutPet.backstory = updates.backstory ?? undefined
      if (updates.voiceStyle !== undefined) layoutPet.voiceStyle = updates.voiceStyle ?? undefined
    }
    return this.layout
  }

  /** Trigger a reaction on a pet (heart/happy bubble) */
  triggerPetReaction(uid: string): void {
    const pet = this.pets.get(uid)
    if (pet) triggerPetReaction(pet)
  }

  /** Show a speech bubble above a pet for `durationSec` seconds */
  setPetSpeech(uid: string, text: string, durationSec: number): void {
    const pet = this.pets.get(uid)
    if (pet) setPetSpeech(pet, text, durationSec)
  }

  /** Show a specific reaction-bubble sprite (heart/happy) above a pet */
  setPetReactionBubble(uid: string, type: 'heart' | 'happy', durationSec: number): void {
    const pet = this.pets.get(uid)
    if (pet) setPetReactionBubble(pet, type, durationSec)
  }

  /** Show a free-text speech bubble above an agent character */
  setCharacterSpeech(id: number, text: string, durationSec: number): void {
    const ch = this.characters.get(id)
    if (!ch) return
    ch.speechText = text
    ch.speechTimer = durationSec
    ch.speechFullDuration = durationSec
  }

  /** Send a pet to walk toward a tile */
  walkPetToTile(uid: string, col: number, row: number): boolean {
    const pet = this.pets.get(uid)
    if (!pet) return false
    return petWalkToTile(pet, col, row, this.tileMap, this.blockedTiles, this.petDoorTiles)
  }

  /** Show an end-of-day banner over the whole canvas for `durationSec` seconds. */
  setDailySummary(text: string, durationSec: number): void {
    this.dailySummaryText = text
    this.dailySummaryTimer = durationSec
    this.dailySummaryFullDuration = durationSec
  }

  /** Send a pet toward an agent's seat. Tries the agent's tile first, then
   *  cardinal neighbours, then nothing if every option is blocked. */
  walkPetToAgent(petUid: string, agentId: number): boolean {
    const pet = this.pets.get(petUid)
    const ch = this.characters.get(agentId)
    if (!pet || !ch) return false
    const offsets = [
      { c: 0, r: 0 },   // agent's own tile (usually blocked by seat, but try)
      { c: 0, r: 1 }, { c: 0, r: -1 }, { c: 1, r: 0 }, { c: -1, r: 0 },
      { c: 1, r: 1 }, { c: -1, r: 1 }, { c: 1, r: -1 }, { c: -1, r: -1 },
    ]
    for (const o of offsets) {
      if (petWalkToTile(pet, ch.tileCol + o.c, ch.tileRow + o.r, this.tileMap, this.blockedTiles, this.petDoorTiles)) {
        return true
      }
    }
    return false
  }

  /** Perk up nearby pets when an agent does something */
  perkUpNearbyPets(agentCol: number, agentRow: number, radius: number): void {
    for (const pet of this.pets.values()) {
      const dist = Math.abs(pet.tileCol - agentCol) + Math.abs(pet.tileRow - agentRow)
      if (dist <= radius) {
        perkUpPet(pet)
      }
    }
  }

  update(dt: number): void {
    const toDelete: number[] = []
    // Resting agents wander off to relax. Destinations = the play-zone grass
    // (the outdoor yard) plus any break-room furniture tiles. The grass yard
    // has far more tiles, so a uniform pick lands an idle agent outside on the
    // lawn most of the time — they "go out to the grass" — while still
    // occasionally using the indoor couches.
    const allBreakRoomTiles = [...this.getPlayZoneTiles(), ...this.getBreakRoomTiles()]
    const focusZoneTiles = this.getFocusZoneTiles()
    // Clamp wander candidates + break-room destinations to the character
    // boundary (Phase B). Undefined boundary = unrestricted (legacy).
    const charBoundary = this.characterBoundary
    const charWalkable = charBoundary
      ? this.walkableTiles.filter((t) => charBoundary.has(`${t.col},${t.row}`))
      : this.walkableTiles
    const breakRoomTiles = charBoundary
      ? allBreakRoomTiles.filter((t) => charBoundary.has(`${t.col},${t.row}`))
      : allBreakRoomTiles
    for (const ch of this.characters.values()) {
      // Handle matrix effect animation
      if (ch.matrixEffect) {
        ch.matrixEffectTimer += dt
        if (ch.matrixEffectTimer >= MATRIX_EFFECT_DURATION) {
          if (ch.matrixEffect === 'spawn') {
            // Spawn complete — clear effect, resume normal FSM
            ch.matrixEffect = null
            ch.matrixEffectTimer = 0
            ch.matrixEffectSeeds = []
          } else {
            // Despawn complete — mark for deletion
            toDelete.push(ch.id)
          }
        }
        continue // skip normal FSM while effect is active
      }

      // Temporarily unblock own seat so character can pathfind to it. Wander
      // candidates + break-room tiles are pre-clamped to the boundary; the
      // boundary itself is passed so wander pathing stays inside it. Seat-return
      // pathing inside updateCharacter is intentionally unclamped so a character
      // can always reach its home seat (its seat is its anchor, even if interior
      // tiles aren't in the painted boundary).
      this.withOwnSeatUnblocked(ch, () =>
        updateCharacter(ch, dt, charWalkable, this.seats, this.tileMap, this.blockedTiles, breakRoomTiles, focusZoneTiles, this.doorTiles, charBoundary)
      )

      // Tick bubble timer for waiting bubbles
      if (ch.bubbleType === 'waiting') {
        ch.bubbleTimer -= dt
        if (ch.bubbleTimer <= 0) {
          ch.bubbleType = null
          ch.bubbleTimer = 0
        }
      }

      // Tick free-text speech bubble
      if (ch.speechText) {
        ch.speechTimer -= dt
        if (ch.speechTimer <= 0) {
          ch.speechText = null
          ch.speechTimer = 0
          ch.speechFullDuration = 0
        }
      }
    }
    // Remove characters that finished despawn
    for (const id of toDelete) {
      this.characters.delete(id)
    }

    // Track office idle time and collect active agent positions
    let anyActive = false
    const activeAgentPositions: Array<{ col: number; row: number }> = []
    for (const ch of this.characters.values()) {
      if (ch.isActive) {
        anyActive = true
        activeAgentPositions.push({ col: ch.tileCol, row: ch.tileRow })
      }
    }
    if (anyActive) {
      this.officeIdleTime = 0
    } else {
      this.officeIdleTime += dt
    }

    // Tick daily summary banner
    if (this.dailySummaryText) {
      this.dailySummaryTimer -= dt
      if (this.dailySummaryTimer <= 0) {
        this.dailySummaryText = null
        this.dailySummaryTimer = 0
        this.dailySummaryFullDuration = 0
      }
    }

    // Update pets. Snapshot every pet's tile so each one can avoid stacking on
    // top of (or directly below) the others when picking a wander target.
    const petTiles = Array.from(this.pets.values()).map((p) => ({
      uid: p.uid, col: p.tileCol, row: p.tileRow,
    }))
    // Clamp pet wander candidates + play-zone destinations to the pet boundary
    // (Phase B). Undefined boundary = unrestricted (legacy).
    const petBoundary = this.petBoundary
    const allPlayZoneTiles = this.getPlayZoneTiles()
    const petWalkable = petBoundary
      ? this.walkableTiles.filter((t) => petBoundary.has(`${t.col},${t.row}`))
      : this.walkableTiles
    const playZoneTiles = petBoundary
      ? allPlayZoneTiles.filter((t) => petBoundary.has(`${t.col},${t.row}`))
      : allPlayZoneTiles
    for (const pet of this.pets.values()) {
      updatePet(pet, dt, petWalkable, this.tileMap, this.blockedTiles, activeAgentPositions, this.officeIdleTime, this.petDoorTiles, petTiles, playZoneTiles, petBoundary)
    }
  }

  getCharacters(): Character[] {
    return Array.from(this.characters.values())
  }

  /** Get character at pixel position (for hit testing). Returns id or null. */
  getCharacterAt(worldX: number, worldY: number): number | null {
    const chars = this.getCharacters().sort((a, b) => b.y - a.y)
    for (const ch of chars) {
      // Skip characters that are despawning or leaving
      if (ch.matrixEffect === 'despawn') continue
      if (ch.state === CharacterState.LEAVING) continue
      // Character sprite is 16x24, anchored bottom-center
      // Apply sitting offset to match visual position
      const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0
      const anchorY = ch.y + sittingOffset
      const left = ch.x - CHARACTER_HIT_HALF_WIDTH
      const right = ch.x + CHARACTER_HIT_HALF_WIDTH
      const top = anchorY - CHARACTER_HIT_HEIGHT
      const bottom = anchorY
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return ch.id
      }
    }
    return null
  }
}
