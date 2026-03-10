import { TILE_SIZE } from '../types.js'
import type { WorldBackgroundTheme } from '../types.js'
import type { DayNightState } from '../engine/dayNightCycle.js'
import { getCachedSprite } from '../sprites/spriteCache.js'
import { getThemeConfig } from './backgroundThemes.js'
import type { ThemeConfig } from './backgroundThemes.js'

/**
 * Determine which zone a tile falls into relative to the office bounds.
 * Returns: 'inside' | 'sidewalk' | 'lawn' | 'curb' | 'road_center' | 'road' | 'grass'
 */
function getZone(
  col: number,
  row: number,
  officeCols: number,
  officeRows: number,
  zones: ThemeConfig['zones'],
): string {
  // Distance from nearest office edge (negative = inside office)
  const dLeft = -col
  const dRight = col - officeCols + 1
  const dTop = -row
  const dBottom = row - officeRows + 1
  const dist = Math.max(dLeft, dRight, dTop, dBottom)

  if (dist <= 0) return 'inside'

  const { sidewalk, lawn, road } = zones
  if (dist <= sidewalk) return 'sidewalk'
  if (dist <= sidewalk + lawn) return 'lawn'
  if (road > 0) {
    const roadStart = sidewalk + lawn + 1 // +1 for curb
    if (dist === sidewalk + lawn + 1) return 'curb'
    const roadMiddle = roadStart + Math.floor(road / 2)
    if (dist === roadMiddle) return 'road_center'
    if (dist <= roadStart + road) return 'road'
  }
  return 'grass'
}

/** Interpolate two hex colors by factor t (0=a, 1=b) */
function lerpColor(a: string, b: string, t: number): string {
  const parseHex = (hex: string) => {
    const h = hex.replace('#', '')
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const ca = parseHex(a)
  const cb = parseHex(b)
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t)
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t)
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t)
  return `rgb(${r},${g},${bl})`
}

/**
 * Render the world background (terrain, zones, decorations) behind the office.
 * Called before renderTileGrid in the frame pipeline.
 */
export function renderWorldBackground(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  theme: WorldBackgroundTheme,
  officeCols: number,
  officeRows: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  dayNight?: DayNightState,
): void {
  if (theme === 'void') return

  const config = getThemeConfig(theme)
  if (!config) return

  const s = TILE_SIZE * zoom
  const darkness = dayNight?.darkness ?? 0

  // Sub-layer A: Sky/ground fill (entire canvas)
  ctx.fillStyle = lerpColor(config.dayFill, config.nightFill, darkness)
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  // Calculate visible tile range (world coords)
  const minCol = Math.floor(-offsetX / s) - 1
  const maxCol = Math.ceil((canvasWidth - offsetX) / s) + 1
  const minRow = Math.floor(-offsetY / s) - 1
  const maxRow = Math.ceil((canvasHeight - offsetY) / s) + 1

  // Clamp to reasonable range to avoid huge loops
  const renderMinCol = Math.max(minCol, -30)
  const renderMaxCol = Math.min(maxCol, officeCols + 30)
  const renderMinRow = Math.max(minRow, -30)
  const renderMaxRow = Math.min(maxRow, officeRows + 30)

  // Sub-layer B: Ground tile pattern (zone-based)
  for (let row = renderMinRow; row <= renderMaxRow; row++) {
    for (let col = renderMinCol; col <= renderMaxCol; col++) {
      const zone = getZone(col, row, officeCols, officeRows, config.zones)
      if (zone === 'inside') continue // office grid handles this

      let sprite
      if (zone === 'sidewalk') {
        sprite = config.sidewalkTile
      } else if (zone === 'curb') {
        sprite = config.curbTile
      } else if (zone === 'road_center') {
        sprite = config.roadCenterLine
      } else if (zone === 'road') {
        sprite = config.roadTile
      } else {
        // grass — alternate between tile variants using position hash
        const hash = ((col * 7 + row * 13) & 0x7fffffff) % config.groundTiles.length
        sprite = config.groundTiles[hash]
      }

      const cached = getCachedSprite(sprite, zoom)
      const px = Math.round(offsetX + col * s)
      const py = Math.round(offsetY + row * s)
      ctx.drawImage(cached, px, py)
    }
  }

  // Sub-layer C: Procedural decorations
  // Trees along the lawn zone edges
  for (const deco of config.decorations) {
    if (deco.spacing <= 0) continue
    const cached = getCachedSprite(deco.sprite, zoom)

    if (deco.zone === 'lawn') {
      // Place along top and bottom lawn strips
      const lawnStart = config.zones.sidewalk + 1
      const lawnMid = lawnStart + Math.floor(config.zones.lawn / 2)

      // Top edge
      for (let col = -lawnMid; col < officeCols + lawnMid; col += deco.spacing) {
        const dCol = col + ((col * 3 + 7) % 3) - 1 // slight randomization
        const dRow = -lawnMid
        if (dCol < renderMinCol || dCol > renderMaxCol || dRow < renderMinRow || dRow > renderMaxRow) continue
        const px = Math.round(offsetX + dCol * s)
        const py = Math.round(offsetY + dRow * s)
        ctx.drawImage(cached, px, py)
      }

      // Bottom edge
      for (let col = -lawnMid; col < officeCols + lawnMid; col += deco.spacing) {
        const dCol = col + ((col * 5 + 3) % 3) - 1
        const dRow = officeRows + lawnMid - deco.footprintH
        if (dCol < renderMinCol || dCol > renderMaxCol || dRow < renderMinRow || dRow > renderMaxRow) continue
        const px = Math.round(offsetX + dCol * s)
        const py = Math.round(offsetY + dRow * s)
        ctx.drawImage(cached, px, py)
      }

      // Left edge
      for (let row = 0; row < officeRows; row += deco.spacing) {
        const dCol = -lawnMid
        const dRow = row + ((row * 7 + 2) % 3) - 1
        if (dCol < renderMinCol || dCol > renderMaxCol || dRow < renderMinRow || dRow > renderMaxRow) continue
        const px = Math.round(offsetX + dCol * s)
        const py = Math.round(offsetY + dRow * s)
        ctx.drawImage(cached, px, py)
      }

      // Right edge
      for (let row = 0; row < officeRows; row += deco.spacing) {
        const dCol = officeCols + lawnMid - deco.footprintW
        const dRow = row + ((row * 11 + 5) % 3) - 1
        if (dCol < renderMinCol || dCol > renderMaxCol || dRow < renderMinRow || dRow > renderMaxRow) continue
        const px = Math.round(offsetX + dCol * s)
        const py = Math.round(offsetY + dRow * s)
        ctx.drawImage(cached, px, py)
      }
    } else if (deco.zone === 'sidewalk') {
      // Place along sidewalk (lampposts on left and right sides)
      for (let row = 0; row < officeRows; row += deco.spacing) {
        const dRow = row + ((row * 3 + 1) % 2)
        // Left side
        const leftCol = -1
        if (leftCol >= renderMinCol && leftCol <= renderMaxCol && dRow >= renderMinRow && dRow <= renderMaxRow) {
          const px = Math.round(offsetX + leftCol * s)
          const py = Math.round(offsetY + dRow * s)
          ctx.drawImage(cached, px, py)
        }
        // Right side
        const rightCol = officeCols
        if (rightCol >= renderMinCol && rightCol <= renderMaxCol && dRow >= renderMinRow && dRow <= renderMaxRow) {
          const px = Math.round(offsetX + rightCol * s)
          const py = Math.round(offsetY + dRow * s)
          ctx.drawImage(cached, px, py)
        }
      }
    }
  }
}
