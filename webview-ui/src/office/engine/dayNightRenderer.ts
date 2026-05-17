import { TILE_SIZE } from '../../constants.js'
import {
  DN_TINT_NIGHT,
  DN_TINT_SUNRISE,
  DN_TINT_DAY,
  DN_TINT_SUNSET,
  DN_TINT_EVENING,
  DN_GLOW_RADIUS_TILES,
  DN_GLOW_MAX_ALPHA,
  DN_GLOW_WARM,
  DN_GLOW_COOL,
} from '../../constants.js'
import type { DayNightState } from './dayNightCycle.js'
import { TimePeriod } from './dayNightCycle.js'
import type { PlacedFurniture } from '../types.js'

/** Light source type for furniture items */
export type LightType = 'warm' | 'cool'

/** Furniture types that emit light */
const LIGHT_EMITTERS: Record<string, LightType> = {
  lamp: 'warm',
  pc: 'cool',
  coffee_machine: 'warm',
}

/** Get the light type for a furniture type string, or null if it doesn't emit light */
export function getLightType(furnitureType: string): LightType | null {
  return LIGHT_EMITTERS[furnitureType] ?? null
}

/** Get tint color for a time period */
function getTintForPeriod(period: TimePeriod): string {
  switch (period) {
    case TimePeriod.NIGHT: return DN_TINT_NIGHT
    case TimePeriod.SUNRISE: return DN_TINT_SUNRISE
    case TimePeriod.DAY: return DN_TINT_DAY
    case TimePeriod.SUNSET: return DN_TINT_SUNSET
    case TimePeriod.EVENING: return DN_TINT_EVENING
  }
}

/** Render the day/night tint overlay on top of the scene */
export function renderDayNightOverlay(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  state: DayNightState,
  offsetX: number,
  offsetY: number,
  zoom: number,
  furniture: PlacedFurniture[],
): void {
  // During full day, skip entirely
  if (state.period === TimePeriod.DAY && state.blend >= 1) return

  ctx.save()

  // 1. Apply color tint overlay using multiply blend
  const tint = getTintForPeriod(state.period)
  if (tint !== DN_TINT_DAY) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = tint
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)
  }

  // 2. Light source glows (only visible when darkness > 0)
  if (state.darkness > 0.1) {
    renderLightGlows(ctx, state.darkness, offsetX, offsetY, zoom, furniture)
  }

  ctx.restore()
}

/**
 * Glow sprite cache: rendering a radial gradient into the main ctx ran
 * createRadialGradient + 4 addColorStops + a screen-blend fillRect for every
 * emitter every frame. With ~10 emitters that's the dominant night-time render
 * cost. We bake each (lightType × alpha-bucket × radius) glow into an offscreen
 * canvas once, then drawImage it in screen-blend mode per emitter.
 */
const glowCache = new Map<string, HTMLCanvasElement>()
const ALPHA_BUCKETS = 20 // 0.05 steps across [0, 1]

function quantizeAlpha(a: number): number {
  return Math.round(a * ALPHA_BUCKETS) / ALPHA_BUCKETS
}

function getGlowSprite(lightType: LightType, alpha: number, radius: number): HTMLCanvasElement {
  const radiusPx = Math.round(radius)
  const alphaBucket = quantizeAlpha(alpha)
  const key = `${lightType}|${alphaBucket}|${radiusPx}`
  let cached = glowCache.get(key)
  if (cached) return cached

  const size = radiusPx * 2
  const off = document.createElement('canvas')
  off.width = size
  off.height = size
  const offCtx = off.getContext('2d')
  if (!offCtx) return off
  const color = lightType === 'warm' ? DN_GLOW_WARM : DN_GLOW_COOL
  const grad = offCtx.createRadialGradient(radiusPx, radiusPx, 0, radiusPx, radiusPx, radiusPx)
  grad.addColorStop(0, replaceAlpha(color, alphaBucket))
  grad.addColorStop(0.25, replaceAlpha(color, alphaBucket * 0.65))
  grad.addColorStop(0.6, replaceAlpha(color, alphaBucket * 0.2))
  grad.addColorStop(1, replaceAlpha(color, 0))
  offCtx.fillStyle = grad
  offCtx.fillRect(0, 0, size, size)
  // Cap cache growth — if a kiosk hammers many radii/alpha combinations the
  // cache can otherwise grow unbounded. ~120 entries covers all real cases.
  if (glowCache.size >= 200) {
    const firstKey = glowCache.keys().next().value
    if (firstKey !== undefined) glowCache.delete(firstKey)
  }
  glowCache.set(key, off)
  cached = off
  return cached
}

/** Render radial glow around light-emitting furniture */
function renderLightGlows(
  ctx: CanvasRenderingContext2D,
  darkness: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  furniture: PlacedFurniture[],
): void {
  // Use 'screen' blend to add light on top of the darkened scene
  ctx.globalCompositeOperation = 'screen'

  const glowRadius = DN_GLOW_RADIUS_TILES * TILE_SIZE * zoom
  const alpha = DN_GLOW_MAX_ALPHA * darkness

  for (const f of furniture) {
    const lightType = getLightType(f.type)
    if (!lightType) continue

    // Center of the furniture tile
    const cx = offsetX + (f.col + 0.5) * TILE_SIZE * zoom
    const cy = offsetY + (f.row + 0.5) * TILE_SIZE * zoom

    const sprite = getGlowSprite(lightType, alpha, glowRadius)
    ctx.drawImage(sprite, cx - sprite.width / 2, cy - sprite.height / 2)
  }
}

/** Replace the alpha channel of an rgba color string */
function replaceAlpha(rgba: string, newAlpha: number): string {
  // Input format: 'rgba(r, g, b, a)' or 'rgba(r, g, b, 1)'
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return rgba
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${newAlpha})`
}
