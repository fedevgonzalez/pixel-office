import type { SpriteData } from '../types.js'
import { TILE_SIZE } from '../../constants.js'

const zoomCaches = new Map<number, WeakMap<SpriteData, HTMLCanvasElement>>()

// Legacy sprites authored when TILE_SIZE was 16 (procedural characters 24x32,
// furniture 16x24/32x32, hand-coded pets 16x16). Anything where BOTH dims are
// <= LEGACY_MAX_DIM is treated as legacy and nearest-neighbor upscaled by an
// integer factor so it visually fills the current TILE_SIZE. Sprites authored
// at the new TILE_SIZE (variant pets, future regenerated assets) skip this.
const LEGACY_MAX_DIM = 32
const LEGACY_SCALE = Math.max(1, Math.floor(TILE_SIZE / 16))

function isLegacySprite(rows: number, cols: number): boolean {
  return LEGACY_SCALE > 1 && rows <= LEGACY_MAX_DIM && cols <= LEGACY_MAX_DIM
}

// ── Outline sprite generation ─────────────────────────────────

const outlineCache = new WeakMap<SpriteData, SpriteData>()

/** Generate a 1px white outline SpriteData (2px larger in each dimension) */
export function getOutlineSprite(sprite: SpriteData): SpriteData {
  const cached = outlineCache.get(sprite)
  if (cached) return cached

  const rows = sprite.length
  const cols = sprite[0].length
  // Expanded grid: +2 in each dimension for 1px border
  const outline: string[][] = []
  for (let r = 0; r < rows + 2; r++) {
    outline.push(new Array<string>(cols + 2).fill(''))
  }

  // For each opaque pixel, mark its 4 cardinal neighbors as white
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (sprite[r][c] === '') continue
      const er = r + 1
      const ec = c + 1
      if (outline[er - 1][ec] === '') outline[er - 1][ec] = '#FFFFFF'
      if (outline[er + 1][ec] === '') outline[er + 1][ec] = '#FFFFFF'
      if (outline[er][ec - 1] === '') outline[er][ec - 1] = '#FFFFFF'
      if (outline[er][ec + 1] === '') outline[er][ec + 1] = '#FFFFFF'
    }
  }

  // Clear pixels that overlap with original opaque pixels
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (sprite[r][c] !== '') {
        outline[r + 1][c + 1] = ''
      }
    }
  }

  outlineCache.set(sprite, outline)
  return outline
}

export function getCachedSprite(sprite: SpriteData, zoom: number): HTMLCanvasElement {
  let cache = zoomCaches.get(zoom)
  if (!cache) {
    cache = new WeakMap()
    zoomCaches.set(zoom, cache)
  }

  const cached = cache.get(sprite)
  if (cached) return cached

  const rows = sprite.length
  const cols = sprite[0].length
  // Auto-upscale legacy 16-cell sprites so they visually fill TILE_SIZE.
  const scale = isLegacySprite(rows, cols) ? LEGACY_SCALE : 1
  const pixelSize = zoom * scale
  const canvas = document.createElement('canvas')
  canvas.width = cols * pixelSize
  canvas.height = rows * pixelSize
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = sprite[r][c]
      if (color === '') continue
      ctx.fillStyle = color
      ctx.fillRect(c * pixelSize, r * pixelSize, pixelSize, pixelSize)
    }
  }

  cache.set(sprite, canvas)
  return canvas
}
