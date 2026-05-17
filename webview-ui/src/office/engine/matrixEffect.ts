import type { Character, SpriteData } from '../types.js'
import { MATRIX_EFFECT_DURATION } from '../types.js'
import {
  MATRIX_TRAIL_LENGTH,
  MATRIX_SPRITE_COLS,
  MATRIX_FLICKER_FPS,
  MATRIX_FLICKER_VISIBILITY_THRESHOLD,
  MATRIX_COLUMN_STAGGER_RANGE,
  MATRIX_HEAD_COLOR,
  MATRIX_TRAIL_OVERLAY_ALPHA,
  MATRIX_TRAIL_EMPTY_ALPHA,
  MATRIX_TRAIL_MID_THRESHOLD,
  MATRIX_TRAIL_DIM_THRESHOLD,
} from '../../constants.js'

/** Hash-based flicker: ~70% visible for shimmer effect */
function flickerVisible(col: number, row: number, time: number): boolean {
  const t = Math.floor(time * MATRIX_FLICKER_FPS)
  const hash = ((col * 7 + row * 13 + t * 31) & 0xff)
  return hash < MATRIX_FLICKER_VISIBILITY_THRESHOLD
}

function generateSeeds(): number[] {
  const seeds: number[] = []
  for (let i = 0; i < MATRIX_SPRITE_COLS; i++) {
    seeds.push(Math.random())
  }
  return seeds
}

export { generateSeeds as matrixEffectSeeds }

/**
 * Render a character with a Matrix-style digital rain spawn/despawn effect.
 * Per-pixel rendering: each column sweeps top-to-bottom with a bright head and fading green trail.
 */
export function renderMatrixEffect(
  ctx: CanvasRenderingContext2D,
  ch: Character,
  spriteData: SpriteData,
  drawX: number,
  drawY: number,
  pixelSize: number,
): void {
  const progress = ch.matrixEffectTimer / MATRIX_EFFECT_DURATION
  const isSpawn = ch.matrixEffect === 'spawn'
  const time = ch.matrixEffectTimer
  // Use the sprite's actual dimensions so the effect aligns with whatever
  // cell size the character was authored at (16×24 legacy, 24×32 native,
  // 48×96 high-res). Falls back to MATRIX_SPRITE_COLS if sprite is empty.
  const cols = spriteData[0]?.length ?? MATRIX_SPRITE_COLS
  const rows = spriteData.length
  const totalSweep = rows + MATRIX_TRAIL_LENGTH
  const seedCount = Math.max(1, ch.matrixEffectSeeds.length)

  for (let col = 0; col < cols; col++) {
    // Stagger: each column starts at a slightly different time. Cycle through
    // seeds if the sprite is wider than the pre-generated seed array.
    const stagger = (ch.matrixEffectSeeds[col % seedCount] ?? 0) * MATRIX_COLUMN_STAGGER_RANGE
    const colProgress = Math.max(0, Math.min(1, (progress - stagger) / (1 - MATRIX_COLUMN_STAGGER_RANGE)))
    const headRow = colProgress * totalSweep

    for (let row = 0; row < rows; row++) {
      const pixel = spriteData[row]?.[col]
      const hasPixel = pixel && pixel !== ''
      const distFromHead = headRow - row
      const px = drawX + col * pixelSize
      const py = drawY + row * pixelSize

      if (isSpawn) {
        // Spawn: head sweeps down revealing character pixels
        if (distFromHead < 0) {
          // Above head: invisible
          continue
        } else if (distFromHead < 1) {
          // Head pixel: bright white-green
          ctx.fillStyle = MATRIX_HEAD_COLOR
          ctx.fillRect(px, py, pixelSize, pixelSize)
        } else if (distFromHead < MATRIX_TRAIL_LENGTH) {
          // Trail zone: show character pixel with green overlay, or just green if no pixel
          const trailPos = distFromHead / MATRIX_TRAIL_LENGTH
          if (hasPixel) {
            // Draw original pixel
            ctx.fillStyle = pixel
            ctx.fillRect(px, py, pixelSize, pixelSize)
            // Green overlay that fades as trail progresses
            const greenAlpha = (1 - trailPos) * MATRIX_TRAIL_OVERLAY_ALPHA
            if (flickerVisible(col, row, time)) {
              ctx.fillStyle = `rgba(0, 255, 65, ${greenAlpha})`
              ctx.fillRect(px, py, pixelSize, pixelSize)
            }
          } else {
            // No character pixel: fading green trail
            if (flickerVisible(col, row, time)) {
              const alpha = (1 - trailPos) * MATRIX_TRAIL_EMPTY_ALPHA
              ctx.fillStyle = trailPos < MATRIX_TRAIL_MID_THRESHOLD ? `rgba(0, 255, 65, ${alpha})`
                : trailPos < MATRIX_TRAIL_DIM_THRESHOLD ? `rgba(0, 170, 40, ${alpha})`
                  : `rgba(0, 85, 20, ${alpha})`
              ctx.fillRect(px, py, pixelSize, pixelSize)
            }
          }
        } else {
          // Below trail: normal character pixel
          if (hasPixel) {
            ctx.fillStyle = pixel
            ctx.fillRect(px, py, pixelSize, pixelSize)
          }
        }
      } else {
        // Despawn: head sweeps down consuming character pixels
        if (distFromHead < 0) {
          // Above head: normal character pixel (not yet consumed)
          if (hasPixel) {
            ctx.fillStyle = pixel
            ctx.fillRect(px, py, pixelSize, pixelSize)
          }
        } else if (distFromHead < 1) {
          // Head pixel: bright white-green
          ctx.fillStyle = MATRIX_HEAD_COLOR
          ctx.fillRect(px, py, pixelSize, pixelSize)
        } else if (distFromHead < MATRIX_TRAIL_LENGTH) {
          // Trail zone: fading green
          if (flickerVisible(col, row, time)) {
            const trailPos = distFromHead / MATRIX_TRAIL_LENGTH
            const alpha = (1 - trailPos) * MATRIX_TRAIL_EMPTY_ALPHA
            ctx.fillStyle = trailPos < MATRIX_TRAIL_MID_THRESHOLD ? `rgba(0, 255, 65, ${alpha})`
              : trailPos < MATRIX_TRAIL_DIM_THRESHOLD ? `rgba(0, 170, 40, ${alpha})`
                : `rgba(0, 85, 20, ${alpha})`
            ctx.fillRect(px, py, pixelSize, pixelSize)
          }
        }
        // Below trail: nothing (consumed)
      }
    }
  }
}
