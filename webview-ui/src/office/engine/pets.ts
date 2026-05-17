import { PetState, Direction, TILE_SIZE, PetPersonality } from '../types.js'
import type { Pet, PlacedPet, SpriteData, TileType as TileTypeVal, PetPersonality as PetPersonalityType } from '../types.js'
import { findPath } from '../layout/tileMap.js'
import { getPetSprites, colorPetSprite, listPetVariants } from '../sprites/petSprites.js'
import {
  PET_WALK_SPEED_PX_PER_SEC,
  PET_WALK_FRAME_DURATION_SEC,
  PET_IDLE_MIN_SEC,
  PET_IDLE_MAX_SEC,
  PET_SLEEP_MIN_SEC,
  PET_SLEEP_MAX_SEC,
  PET_SLEEP_FRAME_DURATION_SEC,
  PET_WANDER_MOVES_MIN,
  PET_WANDER_MOVES_MAX,
  PET_REACTION_DURATION_SEC,
  PET_PERK_DURATION_SEC,
  PET_IDLE_OFFICE_THRESHOLD_SEC,
  PET_DOG_FOLLOW_CHANCE,
  PET_DOG_FOLLOW_MAX_DIST,
} from '../../constants.js'

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomRange(min, max + 1))
}

function tileCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  }
}

function directionBetween(fromCol: number, fromRow: number, toCol: number, toRow: number): Direction {
  const dc = toCol - fromCol
  const dr = toRow - fromRow
  if (Math.abs(dc) > Math.abs(dr)) {
    return dc > 0 ? Direction.RIGHT : Direction.LEFT
  }
  return dr > 0 ? Direction.DOWN : Direction.UP
}

/** Weighted random behavior selection */
interface BehaviorWeight {
  state: PetState
  weight: number
  minDuration: number
  maxDuration: number
}

const CAT_BEHAVIORS: BehaviorWeight[] = [
  { state: PetState.SLEEP, weight: 35, minDuration: PET_SLEEP_MIN_SEC, maxDuration: PET_SLEEP_MAX_SEC },
  { state: PetState.SIT, weight: 25, minDuration: 5, maxDuration: 20 },
  { state: PetState.IDLE, weight: 25, minDuration: PET_IDLE_MIN_SEC, maxDuration: PET_IDLE_MAX_SEC },
  { state: PetState.WALK, weight: 15, minDuration: 0, maxDuration: 0 }, // duration determined by path
]

const DOG_BEHAVIORS: BehaviorWeight[] = [
  { state: PetState.WALK, weight: 30, minDuration: 0, maxDuration: 0 },
  { state: PetState.SIT, weight: 25, minDuration: 5, maxDuration: 15 },
  { state: PetState.IDLE, weight: 20, minDuration: PET_IDLE_MIN_SEC, maxDuration: PET_IDLE_MAX_SEC },
  { state: PetState.SLEEP, weight: 25, minDuration: PET_SLEEP_MIN_SEC, maxDuration: PET_SLEEP_MAX_SEC },
]

/** Personality multipliers for each behavior state */
const PERSONALITY_MODS: Record<string, Partial<Record<string, number>>> = {
  [PetPersonality.LAZY]:      { [PetState.SLEEP]: 1.8, [PetState.SIT]: 1.3, [PetState.WALK]: 0.4, [PetState.IDLE]: 1.0 },
  [PetPersonality.PLAYFUL]:   { [PetState.SLEEP]: 0.5, [PetState.SIT]: 0.6, [PetState.WALK]: 1.8, [PetState.IDLE]: 0.8 },
  [PetPersonality.CHILL]:     { [PetState.SLEEP]: 1.2, [PetState.SIT]: 1.5, [PetState.WALK]: 0.7, [PetState.IDLE]: 1.3 },
  [PetPersonality.ENERGETIC]: { [PetState.SLEEP]: 0.3, [PetState.SIT]: 0.5, [PetState.WALK]: 2.0, [PetState.IDLE]: 0.6 },
}

function getBehaviors(species: string, personality?: PetPersonalityType): BehaviorWeight[] {
  const base = species === 'dog' ? DOG_BEHAVIORS : CAT_BEHAVIORS
  if (!personality) return base
  const mods = PERSONALITY_MODS[personality]
  if (!mods) return base
  return base.map((b) => ({
    ...b,
    weight: b.weight * (mods[b.state] ?? 1),
  }))
}

function pickBehavior(species: string, personality?: PetPersonalityType): BehaviorWeight {
  const behaviors = getBehaviors(species, personality)
  const totalWeight = behaviors.reduce((sum, b) => sum + b.weight, 0)
  let roll = Math.random() * totalWeight
  for (const b of behaviors) {
    roll -= b.weight
    if (roll <= 0) return b
  }
  return behaviors[0]
}

export function createPet(placed: PlacedPet): Pet {
  const center = tileCenter(placed.col, placed.row)
  return {
    uid: placed.uid,
    species: placed.species,
    name: placed.name,
    state: PetState.IDLE,
    dir: Direction.DOWN,
    x: center.x,
    y: center.y,
    tileCol: placed.col,
    tileRow: placed.row,
    path: [],
    moveProgress: 0,
    frame: 0,
    frameTimer: 0,
    behaviorTimer: randomRange(PET_IDLE_MIN_SEC, PET_IDLE_MAX_SEC),
    variant: placed.variant,
    color: placed.color,
    petColors: placed.petColors,
    personality: placed.personality,
    reactionBubble: null,
    reactionTimer: 0,
    isPerkedUp: false,
    perkTimer: 0,
    speechText: null,
    speechTimer: 0,
    speechFullDuration: 0,
  }
}

/** Show a speech bubble above the pet for `durationSec` seconds. */
export function setPetSpeech(pet: Pet, text: string, durationSec: number): void {
  pet.speechText = text
  pet.speechTimer = durationSec
  pet.speechFullDuration = durationSec
}

export function updatePet(
  pet: Pet,
  dt: number,
  walkableTiles: Array<{ col: number; row: number }>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
  activeAgentPositions?: Array<{ col: number; row: number }>,
  officeIdleTime?: number,
  doorTiles?: Set<string>,
): void {
  // Bounds check: if pet is outside the grid, relocate to a walkable tile
  const rows = tileMap.length
  const cols = rows > 0 ? tileMap[0].length : 0
  if (pet.tileCol < 0 || pet.tileCol >= cols || pet.tileRow < 0 || pet.tileRow >= rows) {
    if (walkableTiles.length > 0) {
      const spawn = walkableTiles[Math.floor(Math.random() * walkableTiles.length)]
      pet.tileCol = spawn.col
      pet.tileRow = spawn.row
      pet.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
      pet.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
      pet.path = []
      pet.state = PetState.IDLE
      pet.behaviorTimer = randomRange(PET_IDLE_MIN_SEC, PET_IDLE_MAX_SEC)
    }
    return
  }

  // Tick reaction bubble
  if (pet.reactionBubble) {
    pet.reactionTimer -= dt
    if (pet.reactionTimer <= 0) {
      pet.reactionBubble = null
      pet.reactionTimer = 0
    }
  }

  // Tick perk timer
  if (pet.isPerkedUp) {
    pet.perkTimer -= dt
    if (pet.perkTimer <= 0) {
      pet.isPerkedUp = false
      pet.perkTimer = 0
    }
  }

  // Tick speech bubble
  if (pet.speechText) {
    pet.speechTimer -= dt
    if (pet.speechTimer <= 0) {
      pet.speechText = null
      pet.speechTimer = 0
      pet.speechFullDuration = 0
    }
  }

  // Office idle: pets go to sleep when nobody is active
  if (officeIdleTime !== undefined && officeIdleTime > PET_IDLE_OFFICE_THRESHOLD_SEC) {
    if (pet.state === PetState.IDLE || pet.state === PetState.SIT) {
      pet.state = PetState.SLEEP
      pet.frame = 0
      pet.frameTimer = 0
      pet.behaviorTimer = randomRange(PET_SLEEP_MIN_SEC, PET_SLEEP_MAX_SEC)
    }
  }

  pet.frameTimer += dt

  switch (pet.state) {
    case PetState.IDLE:
    case PetState.SIT: {
      // Static pose, just count down
      pet.frame = 0 // idle frame
      pet.behaviorTimer -= dt
      if (pet.behaviorTimer <= 0) {
        transitionToNewBehavior(pet, walkableTiles, tileMap, blockedTiles, activeAgentPositions, doorTiles)
      }
      break
    }

    case PetState.SLEEP: {
      // Sleep animation: alternate between sleep frames
      if (pet.frameTimer >= PET_SLEEP_FRAME_DURATION_SEC) {
        pet.frameTimer -= PET_SLEEP_FRAME_DURATION_SEC
        pet.frame = pet.frame === 0 ? 1 : 0
      }
      pet.behaviorTimer -= dt
      if (pet.behaviorTimer <= 0) {
        transitionToNewBehavior(pet, walkableTiles, tileMap, blockedTiles, activeAgentPositions, doorTiles)
      }
      break
    }

    case PetState.WALK: {
      // Walk animation
      if (pet.frameTimer >= PET_WALK_FRAME_DURATION_SEC) {
        pet.frameTimer -= PET_WALK_FRAME_DURATION_SEC
        pet.frame = (pet.frame + 1) % 2
      }

      if (pet.path.length === 0) {
        // Arrived — pick new behavior
        transitionToNewBehavior(pet, walkableTiles, tileMap, blockedTiles, activeAgentPositions, doorTiles)
        break
      }

      // Move toward next path tile
      const next = pet.path[0]
      const target = tileCenter(next.col, next.row)
      const dx = target.x - pet.x
      const dy = target.y - pet.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const step = PET_WALK_SPEED_PX_PER_SEC * dt

      if (step >= dist) {
        // Arrived at tile
        pet.x = target.x
        pet.y = target.y
        pet.tileCol = next.col
        pet.tileRow = next.row
        pet.path.shift()

        if (pet.path.length > 0) {
          const nextNext = pet.path[0]
          pet.dir = directionBetween(pet.tileCol, pet.tileRow, nextNext.col, nextNext.row)
        }
      } else {
        pet.x += (dx / dist) * step
        pet.y += (dy / dist) * step
      }
      break
    }

    case PetState.PLAY: {
      // Play animation (simple frame cycle)
      if (pet.frameTimer >= PET_WALK_FRAME_DURATION_SEC) {
        pet.frameTimer -= PET_WALK_FRAME_DURATION_SEC
        pet.frame = (pet.frame + 1) % 2
      }
      pet.behaviorTimer -= dt
      if (pet.behaviorTimer <= 0) {
        transitionToNewBehavior(pet, walkableTiles, tileMap, blockedTiles, activeAgentPositions, doorTiles)
      }
      break
    }
  }
}

function transitionToNewBehavior(
  pet: Pet,
  walkableTiles: Array<{ col: number; row: number }>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
  activeAgentPositions?: Array<{ col: number; row: number }>,
  doorTiles?: Set<string>,
): void {
  const behavior = pickBehavior(pet.species, pet.personality)

  if (behavior.state === PetState.WALK) {
    // Dogs may follow active agents instead of wandering randomly
    if (pet.species === 'dog' && activeAgentPositions && activeAgentPositions.length > 0 && Math.random() < PET_DOG_FOLLOW_CHANCE) {
      // Pick nearest active agent within range
      let bestAgent: { col: number; row: number } | null = null
      let bestDist = Infinity
      for (const pos of activeAgentPositions) {
        const d = Math.abs(pos.col - pet.tileCol) + Math.abs(pos.row - pet.tileRow)
        if (d <= PET_DOG_FOLLOW_MAX_DIST && d < bestDist) {
          bestDist = d
          bestAgent = pos
        }
      }
      if (bestAgent) {
        // Walk to a tile adjacent to the agent (not on top of them)
        const adjacent = walkableTiles.filter((t) => {
          const d = Math.abs(t.col - bestAgent.col) + Math.abs(t.row - bestAgent.row)
          return d === 1 || d === 2
        })
        if (adjacent.length > 0) {
          const target = adjacent[Math.floor(Math.random() * adjacent.length)]
          const path = findPath(pet.tileCol, pet.tileRow, target.col, target.row, tileMap, blockedTiles, doorTiles)
          if (path.length > 0) {
            pet.state = PetState.WALK
            pet.path = path
            pet.frame = 0
            pet.frameTimer = 0
            pet.dir = directionBetween(pet.tileCol, pet.tileRow, path[0].col, path[0].row)
            return
          }
        }
      }
    }

    // Default wander: pick a random walkable tile and pathfind to it
    const movesTarget = randomInt(PET_WANDER_MOVES_MIN, PET_WANDER_MOVES_MAX)
    const candidates = walkableTiles.filter((t) => {
      const dist = Math.abs(t.col - pet.tileCol) + Math.abs(t.row - pet.tileRow)
      return dist > 0 && dist <= movesTarget * 2
    })

    if (candidates.length > 0) {
      const target = candidates[Math.floor(Math.random() * candidates.length)]
      const path = findPath(pet.tileCol, pet.tileRow, target.col, target.row, tileMap, blockedTiles, doorTiles)
      if (path.length > 0) {
        pet.state = PetState.WALK
        pet.path = path
        pet.frame = 0
        pet.frameTimer = 0
        pet.dir = directionBetween(pet.tileCol, pet.tileRow, path[0].col, path[0].row)
        return
      }
    }
    // Fallback: just sit
    pet.state = PetState.SIT
    pet.frame = 0
    pet.behaviorTimer = randomRange(PET_IDLE_MIN_SEC, PET_IDLE_MAX_SEC)
  } else if (behavior.state === PetState.SLEEP) {
    pet.state = PetState.SLEEP
    pet.frame = 0
    pet.frameTimer = 0
    pet.behaviorTimer = randomRange(behavior.minDuration, behavior.maxDuration)
  } else {
    pet.state = behavior.state
    pet.frame = 0
    pet.frameTimer = 0
    pet.behaviorTimer = randomRange(behavior.minDuration, behavior.maxDuration)
  }
}

/** Trigger a reaction bubble on a pet (heart for cats, happy for dogs) */
export function triggerPetReaction(pet: Pet): void {
  pet.reactionBubble = pet.species === 'cat' ? 'heart' : 'happy'
  pet.reactionTimer = PET_REACTION_DURATION_SEC
}

/** Perk up a pet — subtle energy boost when agents are active nearby */
export function perkUpPet(pet: Pet): void {
  if (pet.state === PetState.SLEEP) return // don't wake sleeping pets with just perk
  pet.isPerkedUp = true
  pet.perkTimer = PET_PERK_DURATION_SEC
}

/** Send a pet to walk toward a specific tile */
export function walkPetToTile(
  pet: Pet,
  col: number,
  row: number,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
  doorTiles?: Set<string>,
): boolean {
  const path = findPath(pet.tileCol, pet.tileRow, col, row, tileMap, blockedTiles, doorTiles)
  if (path.length === 0) return false
  pet.state = PetState.WALK
  pet.path = path
  pet.frame = 0
  pet.frameTimer = 0
  pet.dir = directionBetween(pet.tileCol, pet.tileRow, path[0].col, path[0].row)
  return true
}

/** djb2-style hash of a string into [0, n) — deterministic per uid. */
function hashStringTo(str: string, n: number): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i)
  return Math.abs(h) % Math.max(1, n)
}

/**
 * Resolve which variant a pet should render with.
 * - Explicit `pet.variant` wins.
 * - Pets with custom `petColors` keep the default sprite (their customization stays meaningful).
 * - Otherwise pick a variant deterministically from the species' available variants via uid hash.
 */
function resolveEffectiveVariant(pet: Pet): string | undefined {
  if (pet.variant) return pet.variant
  if (pet.petColors) return undefined
  const available = listPetVariants(pet.species)
  if (available.length === 0) return undefined
  return available[hashStringTo(pet.uid, available.length)]
}

/** Get the current sprite frame for a pet (with palette swap if petColors set) */
export function getPetSprite(pet: Pet): SpriteData {
  const effectiveVariant = resolveEffectiveVariant(pet)
  const sprites = getPetSprites(pet.species, effectiveVariant)
  // Direction mapping: DOWN=0, LEFT=flip of RIGHT=2, RIGHT=2, UP=1
  const dirIndex = pet.dir === Direction.UP ? 1 : pet.dir === Direction.RIGHT || pet.dir === Direction.LEFT ? 2 : 0

  // Frame index into [walk1, walk2, idle, sleep1, sleep2]
  let frameIdx: number
  switch (pet.state) {
    case PetState.WALK:
    case PetState.PLAY:
      frameIdx = pet.frame % 2 // walk1, walk2
      break
    case PetState.SLEEP:
      frameIdx = 3 + (pet.frame % 2) // sleep1, sleep2
      break
    default: // IDLE, SIT
      frameIdx = 2 // idle
      break
  }

  let sprite = sprites.frames[dirIndex]?.[frameIdx]
  if (!sprite) sprite = sprites.frames[0][2] // fallback to front idle

  // Apply palette swap + pattern. Skip when a variant is in use — variants
  // come pre-colored (zone-based recoloring of variants is v2).
  if (pet.petColors && !effectiveVariant) {
    sprite = colorPetSprite(sprite, pet.species, pet.petColors)
  }

  // Flip for LEFT direction
  if (pet.dir === Direction.LEFT) {
    return sprite.map((row) => [...row].reverse())
  }

  return sprite
}
