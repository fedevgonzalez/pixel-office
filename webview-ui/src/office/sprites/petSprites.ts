import type { SpriteData } from '../types.js'

/**
 * Pet sprites are 16x16 (single tile, unlike 16x32 characters).
 * Format: each sprite is a SpriteData (string[][] where '' = transparent).
 *
 * Animation frames per direction:
 *   walk1, walk2, idle, sleep1, sleep2
 *
 * Directions: down (front), up (back), right (side)
 * Left = flipped right at runtime (same as characters).
 */

export interface PetSpriteSet {
  /** [direction][frame] — direction: 0=down, 1=up, 2=right. frame: 0-4 */
  frames: SpriteData[][]
}

// ── Cat sprites (simple pixel art) ─────────────────────────
// 16x16 top-down cat — basic template for colorization

const _ = ''
const B = '#2a2a3a' // outline/dark
const W = '#e8e0d0' // body light
const G = '#b0a090' // body mid
const D = '#807060' // body dark
const E = '#40c040' // eyes
const P = '#f0a0b0' // nose/inner ear
const T = '#c09080' // tail

// Cat facing down (front view) - walk frame 1
const CAT_DOWN_WALK1: SpriteData = [
  [_, _, _, _, _, B, B, B, B, B, B, _, _, _, _, _],
  [_, _, _, _, B, W, W, W, W, W, W, B, _, _, _, _],
  [_, _, _, B, W, W, W, W, W, W, W, W, B, _, _, _],
  [_, _, B, W, W, E, W, W, W, E, W, W, B, _, _, _],
  [_, _, B, W, W, W, W, P, W, W, W, W, B, _, _, _],
  [_, _, B, G, W, W, W, W, W, W, W, G, B, _, _, _],
  [_, _, _, B, G, W, W, W, W, W, G, B, _, _, _, _],
  [_, _, _, B, G, G, W, W, W, G, G, B, _, _, _, _],
  [_, _, _, B, G, G, G, G, G, G, G, B, _, _, _, _],
  [_, _, _, B, G, G, G, G, G, G, G, B, _, _, _, _],
  [_, _, _, B, G, G, G, G, G, G, G, B, _, _, _, _],
  [_, _, _, B, D, G, G, G, G, G, D, B, _, _, _, _],
  [_, _, _, B, D, _, _, _, _, _, D, B, _, _, _, _],
  [_, _, _, B, B, _, _, _, _, _, B, B, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Cat facing down - walk frame 2 (legs shifted)
const CAT_DOWN_WALK2: SpriteData = [
  [_, _, _, _, _, B, B, B, B, B, B, _, _, _, _, _],
  [_, _, _, _, B, W, W, W, W, W, W, B, _, _, _, _],
  [_, _, _, B, W, W, W, W, W, W, W, W, B, _, _, _],
  [_, _, B, W, W, E, W, W, W, E, W, W, B, _, _, _],
  [_, _, B, W, W, W, W, P, W, W, W, W, B, _, _, _],
  [_, _, B, G, W, W, W, W, W, W, W, G, B, _, _, _],
  [_, _, _, B, G, W, W, W, W, W, G, B, _, _, _, _],
  [_, _, _, B, G, G, W, W, W, G, G, B, _, _, _, _],
  [_, _, _, B, G, G, G, G, G, G, G, B, _, _, _, _],
  [_, _, _, B, G, G, G, G, G, G, G, B, _, _, _, _],
  [_, _, _, B, G, G, G, G, G, G, G, B, _, _, _, _],
  [_, _, _, B, D, G, G, G, G, G, D, B, _, _, _, _],
  [_, _, _, _, B, D, _, _, _, D, B, _, _, _, _, _],
  [_, _, _, _, B, B, _, _, _, B, B, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Cat idle (same as walk1 but static)
const CAT_DOWN_IDLE: SpriteData = CAT_DOWN_WALK1

// Cat sleep frame 1 (curled up)
const CAT_DOWN_SLEEP1: SpriteData = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, B, B, B, B, B, B, B, _, _, _, _, _],
  [_, _, _, B, G, G, G, G, G, G, G, B, _, _, _, _],
  [_, _, B, G, G, W, W, W, W, G, G, G, B, _, _, _],
  [_, _, B, G, W, W, W, W, W, W, G, G, B, _, _, _],
  [_, _, B, G, W, B, W, W, B, W, G, G, B, _, _, _],
  [_, _, B, G, G, W, W, W, W, G, G, G, B, _, _, _],
  [_, _, _, B, G, G, G, G, G, G, G, B, _, _, _, _],
  [_, _, _, _, B, B, T, T, B, B, B, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Cat sleep frame 2 (breathing)
const CAT_DOWN_SLEEP2: SpriteData = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, B, B, B, B, B, B, B, _, _, _, _, _],
  [_, _, _, B, G, G, G, G, G, G, G, B, _, _, _, _],
  [_, _, B, G, G, W, W, W, W, G, G, G, B, _, _, _],
  [_, _, B, G, W, W, W, W, W, W, G, G, B, _, _, _],
  [_, _, B, G, W, B, W, W, B, W, G, G, B, _, _, _],
  [_, _, B, G, G, W, W, W, W, G, G, G, B, B, _, _],
  [_, _, _, B, G, G, G, G, G, G, G, G, B, _, _, _],
  [_, _, _, _, B, B, T, T, B, B, B, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Cat facing up (back view)
const CAT_UP_WALK1: SpriteData = [
  [_, _, _, _, _, B, B, B, B, B, B, _, _, _, _, _],
  [_, _, _, _, B, G, G, G, G, G, G, B, _, _, _, _],
  [_, _, _, B, G, G, G, G, G, G, G, G, B, _, _, _],
  [_, _, B, G, G, G, G, G, G, G, G, G, B, _, _, _],
  [_, _, B, G, G, G, G, G, G, G, G, G, B, _, _, _],
  [_, _, B, D, G, G, G, G, G, G, G, D, B, _, _, _],
  [_, _, _, B, D, G, G, G, G, G, D, B, _, _, _, _],
  [_, _, _, B, D, D, G, G, G, D, D, B, _, _, _, _],
  [_, _, _, B, D, D, D, D, D, D, D, B, _, _, _, _],
  [_, _, _, B, D, D, D, D, D, D, D, B, _, _, _, _],
  [_, _, _, B, D, D, D, D, D, D, D, B, _, _, _, _],
  [_, _, _, B, D, D, D, D, D, D, D, B, _, _, _, _],
  [_, _, _, B, D, _, _, T, _, _, D, B, _, _, _, _],
  [_, _, _, B, B, _, _, T, _, _, B, B, _, _, _, _],
  [_, _, _, _, _, _, _, B, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CAT_UP_WALK2: SpriteData = CAT_UP_WALK1
const CAT_UP_IDLE: SpriteData = CAT_UP_WALK1
const CAT_UP_SLEEP1: SpriteData = CAT_DOWN_SLEEP1
const CAT_UP_SLEEP2: SpriteData = CAT_DOWN_SLEEP2

// Cat facing right (side view)
const CAT_RIGHT_WALK1: SpriteData = [
  [_, _, _, _, _, _, B, B, B, _, _, _, _, _, _, _],
  [_, _, _, _, _, B, W, W, W, B, _, _, _, _, _, _],
  [_, _, _, _, B, W, E, W, W, W, B, _, _, _, _, _],
  [_, _, _, _, B, W, W, P, W, W, B, _, _, _, _, _],
  [_, _, _, _, B, G, W, W, W, G, B, _, _, _, _, _],
  [_, _, _, B, G, G, G, G, G, G, G, B, _, _, _, _],
  [_, _, B, G, G, G, G, G, G, G, G, G, B, _, _, _],
  [_, _, B, G, G, G, G, G, G, G, G, G, B, _, _, _],
  [_, _, B, G, G, G, G, G, G, G, G, G, B, _, _, _],
  [_, _, B, D, G, G, G, G, G, G, G, D, B, _, _, _],
  [_, _, B, D, _, _, _, _, _, _, _, D, B, _, _, _],
  [_, _, B, B, _, _, _, _, _, _, _, B, B, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, T, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, T, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CAT_RIGHT_WALK2: SpriteData = CAT_RIGHT_WALK1
const CAT_RIGHT_IDLE: SpriteData = CAT_RIGHT_WALK1
const CAT_RIGHT_SLEEP1: SpriteData = CAT_DOWN_SLEEP1
const CAT_RIGHT_SLEEP2: SpriteData = CAT_DOWN_SLEEP2

export const CAT_SPRITES: PetSpriteSet = {
  frames: [
    // Direction 0: Down
    [CAT_DOWN_WALK1, CAT_DOWN_WALK2, CAT_DOWN_IDLE, CAT_DOWN_SLEEP1, CAT_DOWN_SLEEP2],
    // Direction 1: Up
    [CAT_UP_WALK1, CAT_UP_WALK2, CAT_UP_IDLE, CAT_UP_SLEEP1, CAT_UP_SLEEP2],
    // Direction 2: Right
    [CAT_RIGHT_WALK1, CAT_RIGHT_WALK2, CAT_RIGHT_IDLE, CAT_RIGHT_SLEEP1, CAT_RIGHT_SLEEP2],
  ],
}

// ── Dog sprites (simple placeholder — similar structure) ────

const Db = '#4a3020' // dog body dark
const Dl = '#c09060' // dog body light
const Dm = '#906840' // dog body mid
const Dn = '#302010' // dog nose
const De = '#201008' // dog eyes

const DOG_DOWN_WALK1: SpriteData = [
  [_, _, _, _, B, B, B, B, B, B, B, B, _, _, _, _],
  [_, _, _, B, Dl, Dl, Dl, Dl, Dl, Dl, Dl, Dl, B, _, _, _],
  [_, _, B, Dl, Dl, Dl, Dl, Dl, Dl, Dl, Dl, Dl, B, _, _, _],
  [_, _, B, Dl, Dl, De, Dl, Dl, Dl, De, Dl, Dl, B, _, _, _],
  [_, _, B, Dl, Dl, Dl, Dl, Dn, Dl, Dl, Dl, Dl, B, _, _, _],
  [_, _, B, Dm, Dl, Dl, Dl, Dl, Dl, Dl, Dl, Dm, B, _, _, _],
  [_, _, _, B, Dm, Dl, Dl, Dl, Dl, Dl, Dm, B, _, _, _, _],
  [_, _, _, B, Dm, Dm, Dl, Dl, Dl, Dm, Dm, B, _, _, _, _],
  [_, _, _, B, Dm, Dm, Dm, Dm, Dm, Dm, Dm, B, _, _, _, _],
  [_, _, _, B, Dm, Dm, Dm, Dm, Dm, Dm, Dm, B, _, _, _, _],
  [_, _, _, B, Dm, Dm, Dm, Dm, Dm, Dm, Dm, B, _, _, _, _],
  [_, _, _, B, Db, Dm, Dm, Dm, Dm, Dm, Db, B, _, _, _, _],
  [_, _, _, B, Db, _, _, _, _, _, Db, B, _, _, _, _],
  [_, _, _, B, B, _, _, _, _, _, B, B, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const DOG_DOWN_WALK2: SpriteData = DOG_DOWN_WALK1
const DOG_DOWN_IDLE: SpriteData = DOG_DOWN_WALK1

const DOG_DOWN_SLEEP1: SpriteData = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, B, B, B, B, B, B, B, _, _, _, _, _],
  [_, _, _, B, Dm, Dm, Dm, Dm, Dm, Dm, Dm, B, _, _, _, _],
  [_, _, B, Dm, Dm, Dl, Dl, Dl, Dl, Dm, Dm, Dm, B, _, _, _],
  [_, _, B, Dm, Dl, Dl, Dl, Dl, Dl, Dl, Dm, Dm, B, _, _, _],
  [_, _, B, Dm, Dl, B, Dl, Dl, B, Dl, Dm, Dm, B, _, _, _],
  [_, _, B, Dm, Dm, Dl, Dl, Dl, Dl, Dm, Dm, Dm, B, _, _, _],
  [_, _, _, B, Dm, Dm, Dm, Dm, Dm, Dm, Dm, B, _, _, _, _],
  [_, _, _, _, B, B, Db, Db, B, B, B, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const DOG_DOWN_SLEEP2: SpriteData = DOG_DOWN_SLEEP1

const DOG_UP_WALK1: SpriteData = DOG_DOWN_WALK1
const DOG_UP_WALK2: SpriteData = DOG_DOWN_WALK1
const DOG_UP_IDLE: SpriteData = DOG_DOWN_WALK1
const DOG_UP_SLEEP1: SpriteData = DOG_DOWN_SLEEP1
const DOG_UP_SLEEP2: SpriteData = DOG_DOWN_SLEEP1

const DOG_RIGHT_WALK1: SpriteData = DOG_DOWN_WALK1
const DOG_RIGHT_WALK2: SpriteData = DOG_DOWN_WALK1
const DOG_RIGHT_IDLE: SpriteData = DOG_DOWN_WALK1
const DOG_RIGHT_SLEEP1: SpriteData = DOG_DOWN_SLEEP1
const DOG_RIGHT_SLEEP2: SpriteData = DOG_DOWN_SLEEP1

export const DOG_SPRITES: PetSpriteSet = {
  frames: [
    [DOG_DOWN_WALK1, DOG_DOWN_WALK2, DOG_DOWN_IDLE, DOG_DOWN_SLEEP1, DOG_DOWN_SLEEP2],
    [DOG_UP_WALK1, DOG_UP_WALK2, DOG_UP_IDLE, DOG_UP_SLEEP1, DOG_UP_SLEEP2],
    [DOG_RIGHT_WALK1, DOG_RIGHT_WALK2, DOG_RIGHT_IDLE, DOG_RIGHT_SLEEP1, DOG_RIGHT_SLEEP2],
  ],
}

export function getPetSprites(species: string): PetSpriteSet {
  switch (species) {
    case 'dog': return DOG_SPRITES
    case 'cat':
    default: return CAT_SPRITES
  }
}
