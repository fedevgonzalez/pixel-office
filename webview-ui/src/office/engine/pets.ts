import { PetState, Direction, TILE_SIZE } from '../types.js'
import type { Pet, PlacedPet, SpriteData, TileType as TileTypeVal } from '../types.js'
import { findPath } from '../layout/tileMap.js'
import { getPetSprites } from '../sprites/petSprites.js'
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

function getBehaviors(species: string): BehaviorWeight[] {
  return species === 'dog' ? DOG_BEHAVIORS : CAT_BEHAVIORS
}

function pickBehavior(species: string): BehaviorWeight {
  const behaviors = getBehaviors(species)
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
    color: placed.color,
  }
}

export function updatePet(
  pet: Pet,
  dt: number,
  walkableTiles: Array<{ col: number; row: number }>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): void {
  pet.frameTimer += dt

  switch (pet.state) {
    case PetState.IDLE:
    case PetState.SIT: {
      // Static pose, just count down
      pet.frame = 0 // idle frame
      pet.behaviorTimer -= dt
      if (pet.behaviorTimer <= 0) {
        transitionToNewBehavior(pet, walkableTiles, tileMap, blockedTiles)
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
        transitionToNewBehavior(pet, walkableTiles, tileMap, blockedTiles)
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
        transitionToNewBehavior(pet, walkableTiles, tileMap, blockedTiles)
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
        transitionToNewBehavior(pet, walkableTiles, tileMap, blockedTiles)
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
): void {
  const behavior = pickBehavior(pet.species)

  if (behavior.state === PetState.WALK) {
    // Pick a random walkable tile and pathfind to it
    const movesTarget = randomInt(PET_WANDER_MOVES_MIN, PET_WANDER_MOVES_MAX)
    // Pick a random walkable tile within reasonable distance
    const candidates = walkableTiles.filter((t) => {
      const dist = Math.abs(t.col - pet.tileCol) + Math.abs(t.row - pet.tileRow)
      return dist > 0 && dist <= movesTarget * 2
    })

    if (candidates.length > 0) {
      const target = candidates[Math.floor(Math.random() * candidates.length)]
      const path = findPath(pet.tileCol, pet.tileRow, target.col, target.row, tileMap, blockedTiles)
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

/** Get the current sprite frame for a pet */
export function getPetSprite(pet: Pet): SpriteData {
  const sprites = getPetSprites(pet.species)
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

  const sprite = sprites.frames[dirIndex]?.[frameIdx]
  if (!sprite) return sprites.frames[0][2] // fallback to front idle

  // Flip for LEFT direction
  if (pet.dir === Direction.LEFT) {
    return sprite.map((row) => [...row].reverse())
  }

  return sprite
}
