import { TileType, TILE_SIZE, CharacterState } from '../types.js'
import type { TileType as TileTypeVal, FurnitureInstance, Character, SpriteData, Seat, FloorColor, Pet, PlacedFurniture, ZoneType as ZoneTypeVal } from '../types.js'
import { PetState } from '../types.js'
import { getCachedSprite, getOutlineSprite } from '../sprites/spriteCache.js'
import { getCharacterSprites, BUBBLE_PERMISSION_SPRITE, BUBBLE_WAITING_SPRITE } from '../sprites/spriteData.js'
import { getCharacterSprite } from './characters.js'
import { getPetSprite } from './pets.js'
import { PET_HEART_SPRITE, PET_HAPPY_SPRITE, PET_ZZZ_SPRITE_1, PET_ZZZ_SPRITE_2 } from '../sprites/petSprites.js'
import { renderMatrixEffect } from './matrixEffect.js'
import { isKioskMode } from '../../wsClient.js'
import type { DayNightState } from './dayNightCycle.js'
import { renderDayNightOverlay } from './dayNightRenderer.js'
import type { WorldBackgroundTheme } from '../types.js'
import { renderWorldBackground } from '../backgrounds/renderWorldBackground.js'
import { getColorizedFloorSprite, hasFloorSprites, WALL_COLOR } from '../floorTiles.js'
import { hasWallSprites, getWallInstances, wallColorToHex } from '../wallTiles.js'
import {
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_Z_SORT_OFFSET,
  OUTLINE_Z_SORT_OFFSET,
  SELECTED_OUTLINE_ALPHA,
  HOVERED_OUTLINE_ALPHA,
  GHOST_PREVIEW_SPRITE_ALPHA,
  GHOST_PREVIEW_TINT_ALPHA,
  SELECTION_DASH_PATTERN,
  BUTTON_MIN_RADIUS,
  BUTTON_RADIUS_ZOOM_FACTOR,
  BUTTON_ICON_SIZE_FACTOR,
  BUTTON_LINE_WIDTH_MIN,
  BUTTON_LINE_WIDTH_ZOOM_FACTOR,
  BUBBLE_FADE_DURATION_SEC,
  BUBBLE_SITTING_OFFSET_PX,
  BUBBLE_VERTICAL_OFFSET_PX,
  FALLBACK_FLOOR_COLOR,
  SEAT_OWN_COLOR,
  SEAT_AVAILABLE_COLOR,
  SEAT_BUSY_COLOR,
  GRID_LINE_COLOR,
  VOID_TILE_OUTLINE_COLOR,
  VOID_TILE_DASH_PATTERN,
  GHOST_BORDER_HOVER_FILL,
  GHOST_BORDER_HOVER_STROKE,
  GHOST_BORDER_STROKE,
  GHOST_VALID_TINT,
  GHOST_INVALID_TINT,
  SELECTION_HIGHLIGHT_COLOR,
  DELETE_BUTTON_BG,
  ROTATE_BUTTON_BG,
  PET_ZZZ_FRAME_DURATION_SEC,
  PET_NAME_LABEL_Y_OFFSET,
  RESTING_AGENT_SPRITE_ALPHA,
  RESTING_AGENT_LABEL_FONT_SCALE,
  RESTING_AGENT_LABEL_TEXT_ALPHA,
  RESTING_AGENT_LABEL_BG_ALPHA,
  RESTING_AGENT_LABEL_BORDER_ALPHA,
  ZONE_FILL,
  ZONE_BORDER,
} from '../../constants.js'

// ── Render functions ────────────────────────────────────────────

/** Greedy word wrap into at most `maxLines` lines that fit `maxWidthPx`.
 *  Caller must have already set ctx.font. Long words are not broken. */
function wrapTextToLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidthPx: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const candidate = current ? current + ' ' + w : w
    if (ctx.measureText(candidate).width <= maxWidthPx) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    if (lines.length >= maxLines) { lines[maxLines - 1] = (lines[maxLines - 1] || '') + '…'; return lines }
    current = w
  }
  if (current) lines.push(current)
  return lines.slice(0, maxLines)
}

export function renderTileGrid(
  ctx: CanvasRenderingContext2D,
  tileMap: TileTypeVal[][],
  offsetX: number,
  offsetY: number,
  zoom: number,
  tileColors?: Array<FloorColor | null>,
  cols?: number,
  canvasWidth?: number,
  canvasHeight?: number,
): void {
  const s = TILE_SIZE * zoom
  const useSpriteFloors = hasFloorSprites()
  const tmRows = tileMap.length
  const tmCols = tmRows > 0 ? tileMap[0].length : 0
  const layoutCols = cols ?? tmCols

  // Viewport culling: skip rows/cols entirely outside the visible area. Falls
  // back to the full grid when canvas dimensions weren't provided (e.g. tests).
  let minR = 0, maxR = tmRows, minC = 0, maxC = tmCols
  if (canvasWidth !== undefined && canvasHeight !== undefined && s > 0) {
    minC = Math.max(0, Math.floor(-offsetX / s))
    maxC = Math.min(tmCols, Math.ceil((canvasWidth - offsetX) / s))
    minR = Math.max(0, Math.floor(-offsetY / s))
    maxR = Math.min(tmRows, Math.ceil((canvasHeight - offsetY) / s))
  }

  // Floor tiles + wall base color
  for (let r = minR; r < maxR; r++) {
    for (let c = minC; c < maxC; c++) {
      const tile = tileMap[r][c]

      // Skip VOID tiles entirely (transparent)
      if (tile === TileType.VOID) continue

      if (tile === TileType.WALL || !useSpriteFloors) {
        // Wall tiles or fallback: solid color
        if (tile === TileType.WALL) {
          const colorIdx = r * layoutCols + c
          const wallColor = tileColors?.[colorIdx]
          ctx.fillStyle = wallColor ? wallColorToHex(wallColor) : WALL_COLOR
        } else {
          ctx.fillStyle = FALLBACK_FLOOR_COLOR
        }
        ctx.fillRect(offsetX + c * s, offsetY + r * s, s, s)
        continue
      }

      // Floor tile: get colorized sprite
      const colorIdx = r * layoutCols + c
      const color = tileColors?.[colorIdx] ?? { h: 0, s: 0, b: 0, c: 0 }
      const sprite = getColorizedFloorSprite(tile, color)
      const cached = getCachedSprite(sprite, zoom)
      ctx.drawImage(cached, offsetX + c * s, offsetY + r * s)
    }
  }

}

interface ZDrawable {
  zY: number
  draw: (ctx: CanvasRenderingContext2D) => void
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  furniture: FurnitureInstance[],
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  selectedAgentId: number | null,
  hoveredAgentId: number | null,
  pets?: Pet[],
  selectedPetId?: string | null,
  hoveredPetId?: string | null,
  canvasWidth?: number,
  canvasHeight?: number,
): void {
  const drawables: ZDrawable[] = []

  // Furniture
  for (const f of furniture) {
    const cached = getCachedSprite(f.sprite, zoom)
    const fx = offsetX + f.x * zoom
    const fy = offsetY + f.y * zoom
    drawables.push({
      zY: f.zY,
      draw: (c) => {
        c.drawImage(cached, fx, fy)
      },
    })
  }

  // Characters
  for (const ch of characters) {
    const sprites = getCharacterSprites(ch.palette, ch.hueShift)
    const spriteData = getCharacterSprite(ch, sprites)
    const cached = getCachedSprite(spriteData, zoom)
    // Sitting offset: shift character down when seated so they visually sit in the chair
    const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0
    // Anchor at bottom-center of character — round to integer device pixels
    const drawX = Math.round(offsetX + ch.x * zoom - cached.width / 2)
    const drawY = Math.round(offsetY + (ch.y + sittingOffset) * zoom - cached.height)

    // Sort characters by bottom of their tile (not center) so they render
    // in front of same-row furniture (e.g. chairs) but behind furniture
    // at lower rows (e.g. desks, bookshelves that occlude from below).
    const charZY = ch.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET

    // Matrix spawn/despawn effect — skip outline, use per-pixel rendering.
    // Compute pixelSize from the cached canvas so legacy-upscaled procedurals
    // (cached at zoom × 3) and native-48 chars (cached at zoom × 1) both
    // line up with their rendered visual size.
    if (ch.matrixEffect) {
      const mDrawX = drawX
      const mDrawY = drawY
      const mSpriteData = spriteData
      const mCh = ch
      const mPixelSize = cached.width / (spriteData[0]?.length || 1)
      drawables.push({
        zY: charZY,
        draw: (c) => {
          renderMatrixEffect(c, mCh, mSpriteData, mDrawX, mDrawY, mPixelSize)
        },
      })
      continue
    }

    // White outline: full opacity for selected, 50% for hover
    const isSelected = selectedAgentId !== null && ch.id === selectedAgentId
    const isHovered = hoveredAgentId !== null && ch.id === hoveredAgentId
    if (isSelected || isHovered) {
      const outlineAlpha = isSelected ? SELECTED_OUTLINE_ALPHA : HOVERED_OUTLINE_ALPHA
      const outlineData = getOutlineSprite(spriteData)
      const outlineCached = getCachedSprite(outlineData, zoom)
      const olDrawX = drawX - zoom  // 1 sprite-pixel offset, scaled
      const olDrawY = drawY - zoom  // outline follows sitting offset via drawY
      drawables.push({
        zY: charZY - OUTLINE_Z_SORT_OFFSET, // sort just before character
        draw: (c) => {
          c.save()
          c.globalAlpha = outlineAlpha
          c.drawImage(outlineCached, olDrawX, olDrawY)
          c.restore()
        },
      })
    }

    // Capture resting state for closure
    const chResting = ch.isResting
    const chName = ch.folderName

    drawables.push({
      zY: charZY,
      draw: (c) => {
        if (chResting) {
          c.globalAlpha = RESTING_AGENT_SPRITE_ALPHA
          c.drawImage(cached, drawX, drawY)
          c.globalAlpha = 1

          // Name label (always in kiosk, hover-only otherwise)
          if (isKioskMode || isHovered) {
            const labelText = chName || 'Agent'
            const nameY = drawY - 4 * (zoom * TILE_SIZE / 32)
            const nameX = drawX + cached.width / 2
            const fontSize = Math.max(13, Math.round(RESTING_AGENT_LABEL_FONT_SCALE * zoom * TILE_SIZE / 32))
            c.font = `${fontSize}px "FS Pixel Sans", monospace`
            c.textAlign = 'center'

            const nameMetrics = c.measureText(labelText)
            const padH = Math.round(fontSize * 0.45)
            const padV = Math.round(fontSize * 0.25)
            const bgW = nameMetrics.width + padH * 2
            const bgH = fontSize + padV * 2
            const bgX = nameX - bgW / 2
            const bgY = nameY - bgH / 2

            c.globalAlpha = RESTING_AGENT_LABEL_BG_ALPHA
            c.fillStyle = 'rgba(31, 26, 36, 0.9)'
            c.fillRect(bgX, bgY, bgW, bgH)

            c.globalAlpha = RESTING_AGENT_LABEL_BORDER_ALPHA
            c.strokeStyle = 'rgba(232, 168, 76, 0.6)'
            c.lineWidth = 1
            c.strokeRect(bgX + 0.5, bgY + 0.5, bgW - 1, bgH - 1)

            c.globalAlpha = RESTING_AGENT_LABEL_TEXT_ALPHA
            c.textBaseline = 'middle'
            c.fillStyle = 'rgba(255, 245, 235, 0.95)'
            c.fillText(labelText, nameX, nameY)
            c.textBaseline = 'alphabetic'
            c.globalAlpha = 1
          }
        } else {
          c.drawImage(cached, drawX, drawY)
        }
      },
    })
  }

  // Pets — all sprites are uniformly 16×16 at this point. Variant PNGs are
  // downsampled at load (see setLoadedPetVariants), procedural sprites are
  // authored at 16×16. Render 1:1 against the cached canvas; previous
  // half-scale drawImage trick lost detail across walk frames inconsistently
  // and made the gait look jittery.
  if (pets) {
    for (const pet of pets) {
      const petSpriteData = getPetSprite(pet)
      const petCached = getCachedSprite(petSpriteData, zoom)
      const petDrawX = Math.round(offsetX + pet.x * zoom - petCached.width / 2)
      const petDrawY = Math.round(offsetY + pet.y * zoom - petCached.height)
      const petZY = pet.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET

      drawables.push({
        zY: petZY,
        draw: (c) => {
          // Selection/hover outline
          const isSelected = selectedPetId === pet.uid
          const isHovered = hoveredPetId === pet.uid
          if (isSelected || isHovered) {
            const outlineData = getOutlineSprite(petSpriteData)
            const outlineCached = getCachedSprite(outlineData, zoom)
            c.globalAlpha = isSelected ? SELECTED_OUTLINE_ALPHA : HOVERED_OUTLINE_ALPHA
            c.drawImage(outlineCached, petDrawX - zoom, petDrawY - zoom)
            c.globalAlpha = 1
          }

          // Sleeping pets are slightly transparent
          if (pet.state === PetState.SLEEP) {
            c.globalAlpha = 0.85
            c.drawImage(petCached, petDrawX, petDrawY)
            c.globalAlpha = 1
          } else {
            c.drawImage(petCached, petDrawX, petDrawY)
          }

          // Zzz bubble for sleeping pets
          if (pet.state === PetState.SLEEP) {
            const zzzFrame = Math.floor(pet.frameTimer / PET_ZZZ_FRAME_DURATION_SEC) % 2 === 0
              ? PET_ZZZ_SPRITE_1 : PET_ZZZ_SPRITE_2
            const zzzCached = getCachedSprite(zzzFrame, zoom)
            const zzzX = Math.round(petDrawX + petCached.width / 2)
            const zzzY = Math.round(petDrawY - zzzCached.height + 2 * zoom)
            c.globalAlpha = 0.8
            c.drawImage(zzzCached, zzzX, zzzY)
            c.globalAlpha = 1
          }

          // Reaction bubble
          if (pet.reactionBubble) {
            const bubbleSprite = pet.reactionBubble === 'heart' ? PET_HEART_SPRITE : PET_HAPPY_SPRITE
            const bubbleCached = getCachedSprite(bubbleSprite, zoom)
            const bx = Math.round(petDrawX + petCached.width / 2 - bubbleCached.width / 2)
            const by = Math.round(petDrawY - bubbleCached.height)
            // Fade out in last 0.5s
            const alpha = pet.reactionTimer < 0.5 ? pet.reactionTimer / 0.5 : 1
            c.globalAlpha = alpha
            c.drawImage(bubbleCached, bx, by)
            c.globalAlpha = 1
          }

          // Speech bubble for pets is rendered in a separate pass at the end
          // of the frame (see below) so it always sits on top of agent name
          // labels regardless of z-order.

          // Name label when selected, hovered, or always in kiosk mode
          if (isSelected || isHovered || isKioskMode) {
            const nameY = petDrawY - PET_NAME_LABEL_Y_OFFSET * (zoom * TILE_SIZE / 32)
            const nameX = petDrawX + petCached.width / 2
            const fontSize = Math.max(13, Math.round(16 * zoom * TILE_SIZE / 32))
            c.font = `${fontSize}px "FS Pixel Sans", monospace`
            c.textAlign = 'center'

            const nameMetrics = c.measureText(pet.name)
            const padH = Math.round(fontSize * 0.45)
            const padV = Math.round(fontSize * 0.25)

            const bgW = nameMetrics.width + padH * 2
            const bgH = fontSize + padV * 2
            let bgX = nameX - bgW / 2
            const bgY = nameY - bgH / 2
            // Clamp inside the viewport so labels at the edges stay readable
            const EDGE = 8
            if (canvasWidth !== undefined) {
              bgX = Math.max(EDGE, Math.min(canvasWidth - bgW - EDGE, bgX))
            }
            const textX = bgX + bgW / 2

            // Warm dark background
            c.globalAlpha = 0.85
            c.fillStyle = 'rgba(31, 26, 36, 0.9)'
            c.fillRect(bgX, bgY, bgW, bgH)

            // 1px amber-tinted border
            c.globalAlpha = 0.5
            c.strokeStyle = 'rgba(232, 168, 76, 0.6)'
            c.lineWidth = 1
            c.strokeRect(bgX + 0.5, bgY + 0.5, bgW - 1, bgH - 1)
            c.globalAlpha = 1

            // Name text centered in warm cream
            c.textBaseline = 'middle'
            c.fillStyle = 'rgba(255, 245, 235, 0.95)'
            c.fillText(pet.name, textX, nameY)
            c.textBaseline = 'alphabetic'
          }
        },
      })
    }
  }

  // Sort by Y (lower = in front = drawn later)
  drawables.sort((a, b) => a.zY - b.zY)

  for (const d of drawables) {
    d.draw(ctx)
  }

  // Pet speech bubbles — drawn in a separate pass at the END so they always
  // sit above the agent name labels (which would otherwise win z-sort when an
  // agent is in a row below the pet). Sleeping pets don't speak.
  if (pets) {
    for (const pet of pets) {
      if (!pet.speechText) continue
      if (pet.state === PetState.SLEEP) continue
      const petSpriteData = getPetSprite(pet)
      const petCached = getCachedSprite(petSpriteData, zoom)
      const petDrawX = Math.round(offsetX + pet.x * zoom - petCached.width / 2)
      const petDrawY = Math.round(offsetY + pet.y * zoom - petCached.height)

      const lineFontSize = Math.max(13, Math.round(15 * zoom * TILE_SIZE / 32))
      ctx.font = `${lineFontSize}px "FS Pixel Sans", monospace`
      ctx.textAlign = 'center'
      const maxWidthPx = Math.max(120, Math.round(160 * zoom * TILE_SIZE / 32))
      const lines = wrapTextToLines(ctx, pet.speechText, maxWidthPx, 3)
      const lineHeight = Math.round(lineFontSize * 1.25)
      const padH = Math.round(lineFontSize * 0.55)
      const padV = Math.round(lineFontSize * 0.4)
      let widest = 0
      for (const ln of lines) {
        const w = ctx.measureText(ln).width
        if (w > widest) widest = w
      }
      const bgW = Math.round(widest + padH * 2)
      const bgH = Math.round(lineHeight * lines.length + padV * 2)
      const cx = petDrawX + petCached.width / 2
      const baseY = petDrawY - PET_NAME_LABEL_Y_OFFSET * (zoom * TILE_SIZE / 32)
      let bgX = Math.round(cx - bgW / 2)
      let bgY = Math.round(baseY - bgH - lineFontSize * 0.6)
      // Keep the bubble inside the viewport: clamp horizontally with 8 px
      // padding, and if there's no room above the pet, flip it below.
      const EDGE = 8
      if (canvasWidth !== undefined) {
        bgX = Math.max(EDGE, Math.min(canvasWidth - bgW - EDGE, bgX))
      }
      if (bgY < EDGE) {
        bgY = Math.round(petDrawY + petCached.height + lineFontSize * 0.4)
      }
      if (canvasHeight !== undefined) {
        bgY = Math.min(canvasHeight - bgH - EDGE, bgY)
      }
      // Re-center text on the (possibly clamped) bubble
      const textX = bgX + bgW / 2

      // Fade in 0.25 s, out in last 0.5 s
      const t = pet.speechTimer
      const total = pet.speechFullDuration
      const fadeIn = Math.min(1, (total - t) / 0.25)
      const fadeOut = t < 0.5 ? t / 0.5 : 1
      const alpha = Math.min(fadeIn, fadeOut)

      ctx.globalAlpha = 0.85 * alpha
      ctx.fillStyle = 'rgba(31, 26, 36, 0.9)'
      ctx.fillRect(bgX, bgY, bgW, bgH)
      ctx.globalAlpha = 0.5 * alpha
      ctx.strokeStyle = 'rgba(232, 168, 76, 0.6)'
      ctx.lineWidth = 1
      ctx.strokeRect(bgX + 0.5, bgY + 0.5, bgW - 1, bgH - 1)

      ctx.globalAlpha = alpha
      ctx.fillStyle = 'rgba(255, 245, 235, 0.95)'
      ctx.textBaseline = 'middle'
      for (let i = 0; i < lines.length; i++) {
        const ly = bgY + padV + lineHeight * i + Math.round(lineHeight / 2)
        ctx.fillText(lines[i], textX, ly)
      }
      ctx.textBaseline = 'alphabetic'
      ctx.globalAlpha = 1
    }
  }
}

// ── Seat indicators ─────────────────────────────────────────────

export function renderSeatIndicators(
  ctx: CanvasRenderingContext2D,
  seats: Map<string, Seat>,
  characters: Map<number, Character>,
  selectedAgentId: number | null,
  hoveredTile: { col: number; row: number } | null,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  if (selectedAgentId === null || !hoveredTile) return
  const selectedChar = characters.get(selectedAgentId)
  if (!selectedChar) return

  // Only show indicator for the hovered seat tile
  for (const [uid, seat] of seats) {
    if (seat.seatCol !== hoveredTile.col || seat.seatRow !== hoveredTile.row) continue

    const s = TILE_SIZE * zoom
    const x = offsetX + seat.seatCol * s
    const y = offsetY + seat.seatRow * s

    if (selectedChar.seatId === uid) {
      // Selected agent's own seat — blue
      ctx.fillStyle = SEAT_OWN_COLOR
    } else if (!seat.assigned) {
      // Available seat — green
      ctx.fillStyle = SEAT_AVAILABLE_COLOR
    } else {
      // Busy (assigned to another agent) — red
      ctx.fillStyle = SEAT_BUSY_COLOR
    }
    ctx.fillRect(x, y, s, s)
    break
  }
}

// ── Edit mode overlays ──────────────────────────────────────────

export function renderGridOverlay(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  zoom: number,
  cols: number,
  rows: number,
  tileMap?: TileTypeVal[][],
): void {
  const s = TILE_SIZE * zoom
  ctx.strokeStyle = GRID_LINE_COLOR
  ctx.lineWidth = 1
  ctx.beginPath()
  // Vertical lines — offset by 0.5 for crisp 1px lines
  for (let c = 0; c <= cols; c++) {
    const x = offsetX + c * s + 0.5
    ctx.moveTo(x, offsetY)
    ctx.lineTo(x, offsetY + rows * s)
  }
  // Horizontal lines
  for (let r = 0; r <= rows; r++) {
    const y = offsetY + r * s + 0.5
    ctx.moveTo(offsetX, y)
    ctx.lineTo(offsetX + cols * s, y)
  }
  ctx.stroke()

  // Draw faint dashed outlines on VOID tiles
  if (tileMap) {
    ctx.save()
    ctx.strokeStyle = VOID_TILE_OUTLINE_COLOR
    ctx.lineWidth = 1
    ctx.setLineDash(VOID_TILE_DASH_PATTERN)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (tileMap[r]?.[c] === TileType.VOID) {
          ctx.strokeRect(offsetX + c * s + 0.5, offsetY + r * s + 0.5, s - 1, s - 1)
        }
      }
    }
    ctx.restore()
  }
}

// ── Zone overlays (edit mode only) ──────────────────────────────

export function renderZoneOverlay(
  ctx: CanvasRenderingContext2D,
  zones: Array<ZoneTypeVal | null>,
  cols: number,
  rows: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const s = TILE_SIZE * zoom
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const zone = zones[r * cols + c]
      if (!zone) continue
      const x = offsetX + c * s
      const y = offsetY + r * s
      // Fill
      ctx.fillStyle = ZONE_FILL
      ctx.fillRect(x, y, s, s)
      // Border on edges where adjacent tile has different/no zone
      ctx.strokeStyle = ZONE_BORDER
      ctx.lineWidth = Math.max(1, zoom)
      const left = c === 0 || zones[r * cols + (c - 1)] !== zone
      const right = c === cols - 1 || zones[r * cols + (c + 1)] !== zone
      const top = r === 0 || zones[(r - 1) * cols + c] !== zone
      const bottom = r === rows - 1 || zones[(r + 1) * cols + c] !== zone
      ctx.beginPath()
      if (left) { ctx.moveTo(x, y); ctx.lineTo(x, y + s) }
      if (right) { ctx.moveTo(x + s, y); ctx.lineTo(x + s, y + s) }
      if (top) { ctx.moveTo(x, y); ctx.lineTo(x + s, y) }
      if (bottom) { ctx.moveTo(x, y + s); ctx.lineTo(x + s, y + s) }
      ctx.stroke()
    }
  }
}

/** Draw faint expansion placeholders 1 tile outside grid bounds (ghost border). */
export function renderGhostBorder(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  zoom: number,
  cols: number,
  rows: number,
  ghostHoverCol: number,
  ghostHoverRow: number,
): void {
  const s = TILE_SIZE * zoom
  ctx.save()

  // Collect ghost border tiles: one ring around the grid
  const ghostTiles: Array<{ c: number; r: number }> = []
  // Top and bottom rows
  for (let c = -1; c <= cols; c++) {
    ghostTiles.push({ c, r: -1 })
    ghostTiles.push({ c, r: rows })
  }
  // Left and right columns (excluding corners already added)
  for (let r = 0; r < rows; r++) {
    ghostTiles.push({ c: -1, r })
    ghostTiles.push({ c: cols, r })
  }

  for (const { c, r } of ghostTiles) {
    const x = offsetX + c * s
    const y = offsetY + r * s
    const isHovered = c === ghostHoverCol && r === ghostHoverRow
    if (isHovered) {
      ctx.fillStyle = GHOST_BORDER_HOVER_FILL
      ctx.fillRect(x, y, s, s)
    }
    ctx.strokeStyle = isHovered ? GHOST_BORDER_HOVER_STROKE : GHOST_BORDER_STROKE
    ctx.lineWidth = 1
    ctx.setLineDash(VOID_TILE_DASH_PATTERN)
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1)
  }

  ctx.restore()
}

export function renderGhostPreview(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteData,
  col: number,
  row: number,
  valid: boolean,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const cached = getCachedSprite(sprite, zoom)
  const x = offsetX + col * TILE_SIZE * zoom
  const y = offsetY + row * TILE_SIZE * zoom
  ctx.save()
  ctx.globalAlpha = GHOST_PREVIEW_SPRITE_ALPHA
  ctx.drawImage(cached, x, y)
  // Tint overlay
  ctx.globalAlpha = GHOST_PREVIEW_TINT_ALPHA
  ctx.fillStyle = valid ? GHOST_VALID_TINT : GHOST_INVALID_TINT
  ctx.fillRect(x, y, cached.width, cached.height)
  ctx.restore()
}

export function renderSelectionHighlight(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  w: number,
  h: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const s = TILE_SIZE * zoom
  const x = offsetX + col * s
  const y = offsetY + row * s
  ctx.save()
  ctx.strokeStyle = SELECTION_HIGHLIGHT_COLOR
  ctx.lineWidth = 2
  ctx.setLineDash(SELECTION_DASH_PATTERN)
  ctx.strokeRect(x + 1, y + 1, w * s - 2, h * s - 2)
  ctx.restore()
}

export function renderDeleteButton(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  w: number,
  _h: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): DeleteButtonBounds {
  const s = TILE_SIZE * zoom
  // Position at top-right corner of selected furniture
  const cx = offsetX + (col + w) * s + 1
  const cy = offsetY + row * s - 1
  const radius = Math.max(BUTTON_MIN_RADIUS, zoom * BUTTON_RADIUS_ZOOM_FACTOR)

  // Circle background
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = DELETE_BUTTON_BG
  ctx.fill()

  // X mark
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = Math.max(BUTTON_LINE_WIDTH_MIN, zoom * BUTTON_LINE_WIDTH_ZOOM_FACTOR)
  ctx.lineCap = 'round'
  const xSize = radius * BUTTON_ICON_SIZE_FACTOR
  ctx.beginPath()
  ctx.moveTo(cx - xSize, cy - xSize)
  ctx.lineTo(cx + xSize, cy + xSize)
  ctx.moveTo(cx + xSize, cy - xSize)
  ctx.lineTo(cx - xSize, cy + xSize)
  ctx.stroke()
  ctx.restore()

  return { cx, cy, radius }
}

export function renderRotateButton(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  _w: number,
  _h: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): RotateButtonBounds {
  const s = TILE_SIZE * zoom
  // Position to the left of the delete button (which is at top-right corner)
  const radius = Math.max(BUTTON_MIN_RADIUS, zoom * BUTTON_RADIUS_ZOOM_FACTOR)
  const cx = offsetX + col * s - 1
  const cy = offsetY + row * s - 1

  // Circle background
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = ROTATE_BUTTON_BG
  ctx.fill()

  // Circular arrow icon
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = Math.max(BUTTON_LINE_WIDTH_MIN, zoom * BUTTON_LINE_WIDTH_ZOOM_FACTOR)
  ctx.lineCap = 'round'
  const arcR = radius * BUTTON_ICON_SIZE_FACTOR
  ctx.beginPath()
  // Draw a 270-degree arc
  ctx.arc(cx, cy, arcR, -Math.PI * 0.8, Math.PI * 0.7)
  ctx.stroke()
  // Draw arrowhead at the end of the arc
  const endAngle = Math.PI * 0.7
  const endX = cx + arcR * Math.cos(endAngle)
  const endY = cy + arcR * Math.sin(endAngle)
  const arrowSize = radius * 0.35
  ctx.beginPath()
  ctx.moveTo(endX + arrowSize * 0.6, endY - arrowSize * 0.3)
  ctx.lineTo(endX, endY)
  ctx.lineTo(endX + arrowSize * 0.7, endY + arrowSize * 0.5)
  ctx.stroke()
  ctx.restore()

  return { cx, cy, radius }
}

// ── Speech bubbles ──────────────────────────────────────────────

export function renderBubbles(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  for (const ch of characters) {
    const sittingOff = ch.state === CharacterState.TYPE ? BUBBLE_SITTING_OFFSET_PX : 0

    if (ch.bubbleType) {
      const sprite = ch.bubbleType === 'permission'
        ? BUBBLE_PERMISSION_SPRITE
        : BUBBLE_WAITING_SPRITE

      // Compute opacity: permission = full, waiting = fade in last 0.5s
      let alpha = 1.0
      if (ch.bubbleType === 'waiting' && ch.bubbleTimer < BUBBLE_FADE_DURATION_SEC) {
        alpha = ch.bubbleTimer / BUBBLE_FADE_DURATION_SEC
      }

      const cached = getCachedSprite(sprite, zoom)
      // Position: centered above the character's head
      // Character is anchored bottom-center at (ch.x, ch.y), sprite is 16x24
      // Place bubble above head with a small gap; follow sitting offset
      const bubbleX = Math.round(offsetX + ch.x * zoom - cached.width / 2)
      const bubbleY = Math.round(offsetY + (ch.y + sittingOff - BUBBLE_VERTICAL_OFFSET_PX) * zoom - cached.height - 1 * zoom)

      ctx.save()
      if (alpha < 1.0) ctx.globalAlpha = alpha
      ctx.drawImage(cached, bubbleX, bubbleY)
      ctx.restore()
    }

    // Free-text speech bubble (LLM-generated dialog). Drawn above any
    // permission/waiting sprite so it never collides.
    if (ch.speechText) {
      const lineFontSize = Math.max(13, Math.round(15 * zoom * TILE_SIZE / 32))
      ctx.font = `${lineFontSize}px "FS Pixel Sans", monospace`
      ctx.textAlign = 'center'
      const maxWidthPx = Math.max(140, Math.round(180 * zoom * TILE_SIZE / 32))
      const lines = wrapTextToLines(ctx, ch.speechText, maxWidthPx, 3)
      const lineHeight = Math.round(lineFontSize * 1.25)
      const padH = Math.round(lineFontSize * 0.55)
      const padV = Math.round(lineFontSize * 0.4)
      let widest = 0
      for (const ln of lines) {
        const w = ctx.measureText(ln).width
        if (w > widest) widest = w
      }
      const bgW = Math.round(widest + padH * 2)
      const bgH = Math.round(lineHeight * lines.length + padV * 2)
      const cx = offsetX + ch.x * zoom
      // Stack the speech bubble above the sprite bubble area, with extra
      // headroom so it never overlaps the character itself.
      const headY = offsetY + (ch.y + sittingOff - BUBBLE_VERTICAL_OFFSET_PX) * zoom
      const bgX = Math.round(cx - bgW / 2)
      const bgY = Math.round(headY - bgH - 28 * zoom * TILE_SIZE / 32)

      const t = ch.speechTimer
      const total = ch.speechFullDuration
      const fadeIn = Math.min(1, (total - t) / 0.25)
      const fadeOut = t < 0.5 ? t / 0.5 : 1
      const alpha = Math.min(fadeIn, fadeOut)

      ctx.globalAlpha = 0.85 * alpha
      ctx.fillStyle = 'rgba(31, 26, 36, 0.9)'
      ctx.fillRect(bgX, bgY, bgW, bgH)
      ctx.globalAlpha = 0.5 * alpha
      ctx.strokeStyle = 'rgba(232, 168, 76, 0.6)'
      ctx.lineWidth = 1
      ctx.strokeRect(bgX + 0.5, bgY + 0.5, bgW - 1, bgH - 1)

      ctx.globalAlpha = alpha
      ctx.fillStyle = 'rgba(255, 245, 235, 0.95)'
      ctx.textBaseline = 'middle'
      for (let i = 0; i < lines.length; i++) {
        const ly = bgY + padV + lineHeight * i + Math.round(lineHeight / 2)
        ctx.fillText(lines[i], cx, ly)
      }
      ctx.textBaseline = 'alphabetic'
      ctx.globalAlpha = 1
    }
  }
}

export interface ButtonBounds {
  /** Center X in device pixels */
  cx: number
  /** Center Y in device pixels */
  cy: number
  /** Radius in device pixels */
  radius: number
}

export type DeleteButtonBounds = ButtonBounds
export type RotateButtonBounds = ButtonBounds

export interface EditorRenderState {
  showGrid: boolean
  ghostSprite: SpriteData | null
  ghostCol: number
  ghostRow: number
  ghostValid: boolean
  selectedCol: number
  selectedRow: number
  selectedW: number
  selectedH: number
  hasSelection: boolean
  isRotatable: boolean
  /** Updated each frame by renderDeleteButton */
  deleteButtonBounds: DeleteButtonBounds | null
  /** Updated each frame by renderRotateButton */
  rotateButtonBounds: RotateButtonBounds | null
  /** Whether to show ghost border (expansion tiles outside grid) */
  showGhostBorder: boolean
  /** Hovered ghost border tile col (-1 to cols) */
  ghostBorderHoverCol: number
  /** Hovered ghost border tile row (-1 to rows) */
  ghostBorderHoverRow: number
}

export interface SelectionRenderState {
  selectedAgentId: number | null
  hoveredAgentId: number | null
  hoveredTile: { col: number; row: number } | null
  seats: Map<string, Seat>
  characters: Map<number, Character>
  selectedPetId?: string | null
  hoveredPetId?: string | null
}

function renderDailySummaryBanner(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  ds: { text: string; timer: number; fullDuration: number },
): void {
  const fadeIn = Math.min(1, (ds.fullDuration - ds.timer) / 0.6)
  const fadeOut = ds.timer < 1.0 ? ds.timer / 1.0 : 1
  const alpha = Math.min(fadeIn, fadeOut)
  if (alpha <= 0) return

  // Pick a font size that scales with viewport but caps so it stays legible
  // on small kiosks and doesn't dominate giant screens.
  const fontSize = Math.max(20, Math.min(32, Math.round(canvasHeight * 0.035)))
  ctx.font = `${fontSize}px "FS Pixel Sans", monospace`
  ctx.textAlign = 'center'

  const maxWidthPx = Math.round(canvasWidth * 0.7)
  const lines = wrapTextToLines(ctx, ds.text, maxWidthPx, 6)
  const lineHeight = Math.round(fontSize * 1.4)
  const padH = Math.round(fontSize * 1.2)
  const padV = Math.round(fontSize * 0.9)
  let widest = 0
  for (const ln of lines) {
    const w = ctx.measureText(ln).width
    if (w > widest) widest = w
  }
  const bgW = Math.round(widest + padH * 2)
  const bgH = Math.round(lineHeight * lines.length + padV * 2)
  const bgX = Math.round((canvasWidth - bgW) / 2)
  const bgY = Math.round((canvasHeight - bgH) / 2)

  // Dim the rest of the canvas so the banner reads as the focus.
  ctx.globalAlpha = 0.5 * alpha
  ctx.fillStyle = '#0d0a12'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  ctx.globalAlpha = 0.92 * alpha
  ctx.fillStyle = 'rgba(31, 26, 36, 0.95)'
  ctx.fillRect(bgX, bgY, bgW, bgH)
  ctx.globalAlpha = 0.7 * alpha
  ctx.strokeStyle = 'rgba(232, 168, 76, 0.75)'
  ctx.lineWidth = 2
  ctx.strokeRect(bgX + 1, bgY + 1, bgW - 2, bgH - 2)

  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(255, 245, 235, 0.97)'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < lines.length; i++) {
    const ly = bgY + padV + lineHeight * i + Math.round(lineHeight / 2)
    ctx.fillText(lines[i], canvasWidth / 2, ly)
  }
  ctx.textBaseline = 'alphabetic'
  ctx.globalAlpha = 1
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  tileMap: TileTypeVal[][],
  furniture: FurnitureInstance[],
  characters: Character[],
  zoom: number,
  panX: number,
  panY: number,
  selection?: SelectionRenderState,
  editor?: EditorRenderState,
  tileColors?: Array<FloorColor | null>,
  layoutCols?: number,
  layoutRows?: number,
  pets?: Pet[],
  hideBubbles?: boolean,
  dayNight?: DayNightState,
  placedFurniture?: PlacedFurniture[],
  backgroundTheme?: WorldBackgroundTheme,
  zones?: Array<ZoneTypeVal | null>,
  dailySummary?: { text: string; timer: number; fullDuration: number },
): { offsetX: number; offsetY: number } {
  // Clear (screenshot mode fills with dark bg to avoid white halo on GitHub)
  if (hideBubbles) {
    ctx.fillStyle = '#1e1e2e'
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)
  } else {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
  }

  // Use layout dimensions (fallback to tileMap size)
  const cols = layoutCols ?? (tileMap.length > 0 ? tileMap[0].length : 0)
  const rows = layoutRows ?? tileMap.length

  // Center map in viewport + pan offset (integer device pixels)
  const mapW = cols * TILE_SIZE * zoom
  const mapH = rows * TILE_SIZE * zoom
  const offsetX = Math.floor((canvasWidth - mapW) / 2) + Math.round(panX)
  const offsetY = Math.floor((canvasHeight - mapH) / 2) + Math.round(panY)

  // World background (terrain, zones, decorations) — drawn behind the office
  if (backgroundTheme && backgroundTheme !== 'void') {
    renderWorldBackground(ctx, canvasWidth, canvasHeight, backgroundTheme, cols, rows, offsetX, offsetY, zoom, dayNight)
  }

  // Draw tiles (floor + wall base color) — pass canvas dims for viewport culling.
  renderTileGrid(ctx, tileMap, offsetX, offsetY, zoom, tileColors, layoutCols, canvasWidth, canvasHeight)

  // Seat indicators (below furniture/characters, on top of floor)
  if (selection) {
    renderSeatIndicators(ctx, selection.seats, selection.characters, selection.selectedAgentId, selection.hoveredTile, offsetX, offsetY, zoom)
  }

  // Build wall instances for z-sorting with furniture and characters
  const wallInstances = hasWallSprites()
    ? getWallInstances(tileMap, tileColors, layoutCols)
    : []
  const allFurniture = wallInstances.length > 0
    ? [...wallInstances, ...furniture]
    : furniture

  // Draw walls + furniture + characters (z-sorted)
  const selectedId = selection?.selectedAgentId ?? null
  const hoveredId = selection?.hoveredAgentId ?? null
  renderScene(ctx, allFurniture, characters, offsetX, offsetY, zoom, selectedId, hoveredId, pets, selection?.selectedPetId, selection?.hoveredPetId, canvasWidth, canvasHeight)

  // Speech bubbles (always on top of characters) — hidden in screenshot mode
  if (!hideBubbles) {
    renderBubbles(ctx, characters, offsetX, offsetY, zoom)
  }

  // Day/night cycle overlay (after scene + bubbles, before editor UI)
  if (dayNight && !hideBubbles) {
    renderDayNightOverlay(ctx, canvasWidth, canvasHeight, dayNight, offsetX, offsetY, zoom, placedFurniture ?? [])
  }

  // Editor overlays
  if (editor) {
    if (editor.showGrid) {
      renderGridOverlay(ctx, offsetX, offsetY, zoom, cols, rows, tileMap)
    }
    // Zone overlays — always visible in edit mode
    if (zones) {
      renderZoneOverlay(ctx, zones, cols, rows, offsetX, offsetY, zoom)
    }
    if (editor.showGhostBorder) {
      renderGhostBorder(ctx, offsetX, offsetY, zoom, cols, rows, editor.ghostBorderHoverCol, editor.ghostBorderHoverRow)
    }
    if (editor.ghostSprite && editor.ghostCol >= 0) {
      renderGhostPreview(ctx, editor.ghostSprite, editor.ghostCol, editor.ghostRow, editor.ghostValid, offsetX, offsetY, zoom)
    }
    if (editor.hasSelection) {
      renderSelectionHighlight(ctx, editor.selectedCol, editor.selectedRow, editor.selectedW, editor.selectedH, offsetX, offsetY, zoom)
      editor.deleteButtonBounds = renderDeleteButton(ctx, editor.selectedCol, editor.selectedRow, editor.selectedW, editor.selectedH, offsetX, offsetY, zoom)
      if (editor.isRotatable) {
        editor.rotateButtonBounds = renderRotateButton(ctx, editor.selectedCol, editor.selectedRow, editor.selectedW, editor.selectedH, offsetX, offsetY, zoom)
      } else {
        editor.rotateButtonBounds = null
      }
    } else {
      editor.deleteButtonBounds = null
      editor.rotateButtonBounds = null
    }
  }

  // End-of-day banner — top z, never hidden by anything else (except in
  // screenshot mode where we suppress all overlays).
  if (dailySummary && dailySummary.text && !hideBubbles) {
    renderDailySummaryBanner(ctx, canvasWidth, canvasHeight, dailySummary)
  }

  return { offsetX, offsetY }
}
