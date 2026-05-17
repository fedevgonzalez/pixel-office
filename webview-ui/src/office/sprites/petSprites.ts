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

/**
 * Find the smallest axis-aligned rect that covers every opaque pixel across
 * every frame/direction of a variant. The crop must be consistent across
 * frames so the walk animation doesn't wobble (each frame uses the SAME
 * source rect — the union of all frames' bboxes).
 */
interface Bbox { top: number; bottom: number; left: number; right: number }
function computeVariantBbox(v: LoadedPetData): Bbox | null {
  let top = Infinity, bottom = -1, left = Infinity, right = -1
  for (const dir of [v.down, v.up, v.right]) {
    for (const s of dir) {
      for (let r = 0; r < s.length; r++) {
        const row = s[r]
        for (let c = 0; c < row.length; c++) {
          if (row[c]) {
            if (r < top) top = r
            if (r > bottom) bottom = r
            if (c < left) left = c
            if (c > right) right = c
          }
        }
      }
    }
  }
  if (bottom < 0) return null
  return { top, bottom, left, right }
}

/**
 * Crop the source frame to `bbox` and nearest-neighbor resample the crop to
 * `targetW × targetH`. Anchor stays at bottom-center of the resulting cell,
 * which is what the renderer assumes.
 */
function cropResample(s: SpriteData, bbox: Bbox, targetW: number, targetH: number): SpriteData {
  const cropW = bbox.right - bbox.left + 1
  const cropH = bbox.bottom - bbox.top + 1
  const out: SpriteData = []
  for (let r = 0; r < targetH; r++) {
    const srcR = bbox.top + Math.min(cropH - 1, Math.floor(r * cropH / targetH))
    const row: string[] = []
    for (let c = 0; c < targetW; c++) {
      const srcC = bbox.left + Math.min(cropW - 1, Math.floor(c * cropW / targetW))
      row.push(s[srcR]?.[srcC] ?? '')
    }
    out.push(row)
  }
  return out
}

/**
 * Per-species target visual size in cell pixels. Cats are normalised to a
 * single size so a black shorthair (filling its 32-cell) doesn't tower over a
 * gray tabby (drawn with padding). Dog cell size scales with the artist's
 * bbox — a shepherd whose bbox is bigger than a corgi's gets a proportionally
 * bigger render cell — clamped so nothing dwarfs the agents.
 */
function speciesCellSize(species: string, bbox: Bbox): { w: number; h: number } {
  const bboxW = bbox.right - bbox.left + 1
  const bboxH = bbox.bottom - bbox.top + 1
  if (species === 'cat') {
    // All cats render at 14×12 — pixel-art cats look better slightly wider than tall.
    return { w: 14, h: 12 }
  }
  // Dogs: scale relative to bbox dim, clamped to [14, 18]. A bbox of 20 hits
  // the upper cap (shepherd-ish); a 14 bbox hits the lower (corgi-ish).
  const target = (d: number) => Math.max(14, Math.min(18, Math.round(d * 0.75)))
  return { w: target(bboxW), h: target(bboxH) }
}

function normalizeVariant(species: string, data: LoadedPetData): LoadedPetData {
  const bbox = computeVariantBbox(data)
  if (!bbox) return data
  const { w: tw, h: th } = speciesCellSize(species, bbox)
  return {
    down: data.down.map((f) => cropResample(f, bbox, tw, th)),
    up: data.up.map((f) => cropResample(f, bbox, tw, th)),
    right: data.right.map((f) => cropResample(f, bbox, tw, th)),
    palette: data.palette,
  }
}

// Server-loaded variant sprites, keyed [species][variant]. Populated from the
// `petSpritesLoaded` WS message. When a pet has a `variant` set and that
// species+variant exists here, it overrides the hardcoded sprite.
type LoadedPetData = {
  down: SpriteData[]
  up: SpriteData[]
  right: SpriteData[]
  palette?: string[]
}
let loadedPetVariants: Record<string, Record<string, LoadedPetData>> | null = null

export function setLoadedPetVariants(data: Record<string, Record<string, LoadedPetData>>): void {
  // Variants come from the server as 32×32 PNG-derived sprite data. Each
  // artist drew the animal at a different size inside the cell, so a uniform
  // downsample produced wildly inconsistent visual sizes (filled-cell black
  // cats towered over a padded gray tabby). normalizeVariant detects the
  // content bbox and re-crops + resamples every frame to a species-specific
  // target cell — within cats they all match; within dogs the cell scales
  // with the artist's bbox so a shepherd reads bigger than a corgi.
  const normalised: Record<string, Record<string, LoadedPetData>> = {}
  for (const [species, variants] of Object.entries(data)) {
    normalised[species] = {}
    for (const [name, v] of Object.entries(variants)) {
      normalised[species][name] = normalizeVariant(species, v)
    }
  }
  loadedPetVariants = normalised
}

/** List variant names available for a species (deterministic order). Returns [] if none loaded. */
export function listPetVariants(species: string): string[] {
  if (!loadedPetVariants) return []
  const variants = loadedPetVariants[species]
  if (!variants) return []
  return Object.keys(variants).sort()
}

/** Top-N most-frequent opaque colors in the variant sprite (extracted server-side). */
export function getPetVariantPalette(species: string, variant: string): string[] {
  return loadedPetVariants?.[species]?.[variant]?.palette ?? []
}

/** Apply a srcHex → dstHex substitution to every cell of a sprite. */
function recolorSprite(sprite: SpriteData, subs: Record<string, string>): SpriteData {
  return sprite.map((row) => row.map((cell) => (cell && subs[cell]) || cell))
}

/**
 * Resolve sprite set for a (species, variant) pair.
 * - If variant is set and loaded → return that variant's PNG sprites.
 * - Else → fall back to hardcoded CAT_SPRITES / DOG_SPRITES.
 * - If `variantColors` provides srcHex→dstHex remappings, apply them per-pixel.
 */
export function getPetSprites(
  species: string,
  variant?: string | null,
  variantColors?: Record<string, string> | null,
): PetSpriteSet {
  if (variant && loadedPetVariants) {
    const v = loadedPetVariants[species]?.[variant]
    if (v) {
      const subs = variantColors && Object.keys(variantColors).length > 0 ? variantColors : null
      const pick = (sprites: SpriteData[]) =>
        subs ? sprites.map((s) => recolorSprite(s, subs)) : sprites
      const down = pick(v.down)
      const up = pick(v.up)
      const right = pick(v.right)
      return {
        frames: [
          [down[0], down[1], down[2], down[3], down[4]],
          [up[0], up[1], up[2], up[3], up[4]],
          [right[0], right[1], right[2], right[3], right[4]],
        ],
      }
    }
  }
  switch (species) {
    case 'dog': return DOG_SPRITES
    case 'cat':
    default: return CAT_SPRITES
  }
}

/** Derive light/dark body shades from a mid-tone hex color */
function deriveBodyShades(midHex: string): { light: string; mid: string; dark: string } {
  const r = parseInt(midHex.slice(1, 3), 16)
  const g = parseInt(midHex.slice(3, 5), 16)
  const b = parseInt(midHex.slice(5, 7), 16)
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0')
  // Light: brighten by ~40%
  const light = `#${toHex(r + (255 - r) * 0.4)}${toHex(g + (255 - g) * 0.4)}${toHex(b + (255 - b) * 0.4)}`
  // Dark: darken by ~40%
  const dark = `#${toHex(r * 0.6)}${toHex(g * 0.6)}${toHex(b * 0.6)}`
  return { light, mid: midHex, dark }
}

/** Build a color replacement map for a pet sprite given custom colors */
export function buildPetColorMap(
  species: string,
  petColors: { body?: string; eyes?: string; nose?: string },
): Map<string, string> | null {
  const hasAny = petColors.body || petColors.eyes || petColors.nose
  if (!hasAny) return null

  const isCat = species !== 'dog'
  const map = new Map<string, string>()

  if (petColors.body) {
    const shades = deriveBodyShades(petColors.body)
    if (isCat) {
      map.set(W, shades.light)
      map.set(G, shades.mid)
      map.set(D, shades.dark)
      map.set(T, shades.dark) // tail follows body dark
    } else {
      map.set(Dl, shades.light)
      map.set(Dm, shades.mid)
      map.set(Db, shades.dark)
    }
  }

  if (petColors.eyes) {
    if (isCat) {
      map.set(E, petColors.eyes)
    } else {
      map.set(De, petColors.eyes)
    }
  }

  if (petColors.nose) {
    if (isCat) {
      map.set(P, petColors.nose)
    } else {
      map.set(Dn, petColors.nose)
    }
  }

  return map.size > 0 ? map : null
}

/** Apply palette swap to a sprite using a color replacement map */
export function swapPetPalette(sprite: SpriteData, colorMap: Map<string, string>): SpriteData {
  return sprite.map((row) =>
    row.map((px) => {
      if (px === '') return px
      const lower = px.toLowerCase()
      return colorMap.get(lower) ?? colorMap.get(px) ?? px
    }),
  )
}

/** Check if a pixel is a body color for the given species */
function isBodyPixel(px: string, species: string): 'light' | 'mid' | 'dark' | null {
  if (species === 'dog') {
    if (px === Dl) return 'light'
    if (px === Dm) return 'mid'
    if (px === Db) return 'dark'
    return null
  }
  // Cat (default)
  if (px === W) return 'light'
  if (px === G) return 'mid'
  if (px === D || px === T) return 'dark'
  return null
}

/** Determine if a pixel position should use the secondary (pattern) color.
 * Thresholds assume a 32-px sprite (the runtime baseline). For the upscaled
 * 16→32 hardcoded sprites the chest bands and split lines still read clean
 * at this size; pattern reads on 32×32 PNG variants are also tuned here. */
function shouldUseSecondary(row: number, col: number, pattern: string): boolean {
  switch (pattern) {
    case 'striped':
      // Horizontal bands, 4 px wide on the 32 px sprite
      return Math.floor(row / 4) % 2 === 1
    case 'spotted':
      // Scattered spots using pseudo-random hash
      return ((row * 7 + col * 13) % 9) < 2
    case 'bicolor':
      // Left/right split at midline of 32-px sprite
      return col >= 16
    case 'tuxedo':
      // Center chest area (front view appearance) on 32-px sprite
      return col >= 10 && col <= 20 && row >= 8
    default:
      return false
  }
}

/**
 * Combined palette swap + pattern application in a single pass.
 * Handles body colors, eye/nose swap, and pattern overlay.
 */
export function colorPetSprite(
  sprite: SpriteData,
  species: string,
  petColors: { body?: string; eyes?: string; nose?: string; pattern?: string; patternColor?: string },
): SpriteData {
  const hasBody = !!petColors.body
  const hasEyes = !!petColors.eyes
  const hasNose = !!petColors.nose
  const hasPattern = !!petColors.pattern && petColors.pattern !== 'solid' && !!petColors.patternColor

  if (!hasBody && !hasEyes && !hasNose && !hasPattern) return sprite

  const primaryShades = hasBody ? deriveBodyShades(petColors.body!) : null
  const secondaryShades = hasPattern ? deriveBodyShades(petColors.patternColor!) : null
  const isCat = species !== 'dog'
  const eyeSource = isCat ? E : De
  const noseSource = isCat ? P : Dn

  return sprite.map((row, rowIdx) =>
    row.map((px, colIdx) => {
      if (px === '') return px

      // Check body pixel
      const bodyShade = isBodyPixel(px, species)
      if (bodyShade !== null) {
        // Determine if pattern secondary applies
        if (hasPattern && shouldUseSecondary(rowIdx, colIdx, petColors.pattern!)) {
          if (bodyShade === 'light') return secondaryShades!.light
          if (bodyShade === 'dark') return secondaryShades!.dark
          return secondaryShades!.mid
        }
        // Primary body color
        if (primaryShades) {
          if (bodyShade === 'light') return primaryShades.light
          if (bodyShade === 'dark') return primaryShades.dark
          return primaryShades.mid
        }
      }

      // Eye swap
      if (px === eyeSource && hasEyes) return petColors.eyes!

      // Nose swap
      if (px === noseSource && hasNose) return petColors.nose!

      return px
    }),
  )
}

// ── Pet bubble sprites ─────────────────────────────────────

const R = '#ff4060' // red heart
const RD = '#c03050' // dark red
const H = '#60ff90' // happy green
const HD = '#40c070' // dark happy green
const ZC = '#a0c0ff' // zzz blue
const ZD = '#6080c0' // zzz dark blue

/** Small heart bubble (9x9) for cat reaction */
export const PET_HEART_SPRITE: SpriteData = [
  [_, _, _, _, _, _, _, _, _],
  [_, _, R, R, _, R, R, _, _],
  [_, R, R, R, R, R, R, R, _],
  [_, R, R, R, R, R, R, R, _],
  [_, _, R, R, R, R, R, _, _],
  [_, _, _, RD, R, RD, _, _, _],
  [_, _, _, _, RD, _, _, _, _],
  [_, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _],
]

/** Happy/wag bubble (9x9) for dog reaction */
export const PET_HAPPY_SPRITE: SpriteData = [
  [_, _, _, _, _, _, _, _, _],
  [_, _, H, _, _, _, H, _, _],
  [_, H, HD, H, _, H, HD, H, _],
  [_, _, H, _, _, _, H, _, _],
  [_, _, _, _, _, _, _, _, _],
  [_, _, H, H, H, H, H, _, _],
  [_, H, _, _, _, _, _, H, _],
  [_, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _],
]

/** Zzz bubble frame 1 (9x7) */
export const PET_ZZZ_SPRITE_1: SpriteData = [
  [_, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, ZC, ZC, _, _],
  [_, _, _, _, _, _, ZC, _, _],
  [_, _, _, _, _, ZC, _, _, _],
  [_, _, _, ZD, ZD, ZC, ZC, _, _],
  [_, _, _, _, ZD, _, _, _, _],
  [_, _, _, ZD, ZD, _, _, _, _],
]

/** Zzz bubble frame 2 (9x7) — shifted slightly */
export const PET_ZZZ_SPRITE_2: SpriteData = [
  [_, _, _, _, _, _, _, _, _],
  [_, _, _, _, ZC, ZC, _, _, _],
  [_, _, _, _, _, ZC, _, _, _],
  [_, _, _, _, ZC, _, _, _, _],
  [_, _, ZD, ZD, ZC, ZC, _, _, _],
  [_, _, _, ZD, _, _, _, _, _],
  [_, _, ZD, ZD, _, _, _, _, _],
]
