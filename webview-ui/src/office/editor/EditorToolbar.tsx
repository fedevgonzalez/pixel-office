import { useState, useEffect, useRef, useCallback } from 'react'
import { EditTool } from '../types.js'
import type { TileType as TileTypeVal, FloorColor } from '../types.js'
import { getCatalogByCategory, buildDynamicCatalog, getActiveCategories, FURNITURE_CATEGORIES } from '../layout/furnitureCatalog.js'
import type { FurnitureCategory, LoadedAssetData } from '../layout/furnitureCatalog.js'

const EDITOR_CATEGORY_STORAGE_KEY = 'pixel-office:editor:activeCategory'
import { getCachedSprite } from '../sprites/spriteCache.js'
import { getColorizedFloorSprite, getFloorPatternCount, hasFloorSprites } from '../floorTiles.js'

const btnStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: '22px',
  background: 'var(--pixel-btn-bg)',
  color: 'var(--pixel-text-dim)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  cursor: 'pointer',
}

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--pixel-active-bg)',
  color: 'rgba(255, 245, 235, 0.9)',
  border: '2px solid var(--pixel-accent)',
}

const tabStyle: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: '20px',
  background: 'transparent',
  color: 'rgba(255, 245, 235, 0.5)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'rgba(255, 245, 235, 0.08)',
  color: 'rgba(255, 245, 235, 0.8)',
  border: '2px solid var(--pixel-accent)',
}

interface EditorToolbarProps {
  activeTool: EditTool
  selectedTileType: TileTypeVal
  selectedFurnitureType: string
  selectedFurnitureUid: string | null
  selectedFurnitureColor: FloorColor | null
  floorColor: FloorColor
  wallColor: FloorColor
  onToolChange: (tool: EditTool) => void
  onTileTypeChange: (type: TileTypeVal) => void
  onFloorColorChange: (color: FloorColor) => void
  onWallColorChange: (color: FloorColor) => void
  onSelectedFurnitureColorChange: (color: FloorColor | null) => void
  onFurnitureTypeChange: (type: string) => void
  loadedAssets?: LoadedAssetData
}

const FLOOR_PREVIEW_SIZE = 56

/** Render a floor pattern preview large enough that the herringbone / accent
 *  features are actually visible, plus a small number label underneath. */
function FloorPatternPreview({ patternIndex, color, selected, onClick }: {
  patternIndex: number
  color: FloorColor
  selected: boolean
  onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = FLOOR_PREVIEW_SIZE
    canvas.height = FLOOR_PREVIEW_SIZE
    ctx.imageSmoothingEnabled = false

    if (!hasFloorSprites()) {
      ctx.fillStyle = '#444'
      ctx.fillRect(0, 0, FLOOR_PREVIEW_SIZE, FLOOR_PREVIEW_SIZE)
      return
    }

    const sprite = getColorizedFloorSprite(patternIndex, color)
    // Pick a zoom that gets us close to FLOOR_PREVIEW_SIZE without overshooting.
    // Sprites are 16, 32 or 48 wide (legacy / native / current). For each case
    // the zoom is computed to fit the preview tile exactly.
    const srcSize = sprite.length > 0 ? sprite[0].length : 16
    const tileZoom = Math.max(1, Math.round(FLOOR_PREVIEW_SIZE / srcSize))
    const cached = getCachedSprite(sprite, tileZoom)
    const drawX = Math.floor((FLOOR_PREVIEW_SIZE - cached.width) / 2)
    const drawY = Math.floor((FLOOR_PREVIEW_SIZE - cached.height) / 2)
    ctx.drawImage(cached, drawX, drawY)
  }, [patternIndex, color])

  return (
    <button
      onClick={onClick}
      title={`Floor ${patternIndex}`}
      style={{
        width: FLOOR_PREVIEW_SIZE,
        height: FLOOR_PREVIEW_SIZE + 18,
        padding: 0,
        border: selected ? '2px solid var(--pixel-accent)' : '2px solid var(--pixel-border)',
        borderRadius: 0,
        cursor: 'pointer',
        overflow: 'hidden',
        flexShrink: 0,
        background: 'var(--pixel-btn-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: FLOOR_PREVIEW_SIZE, height: FLOOR_PREVIEW_SIZE, display: 'block' }}
      />
      <span style={{
        fontSize: 12,
        lineHeight: '16px',
        textAlign: 'center',
        color: selected ? 'var(--pixel-accent)' : 'var(--pixel-text-dim)',
        background: 'rgba(0,0,0,0.4)',
      }}>{patternIndex}</span>
    </button>
  )
}

/** Slider control for a single 1D color parameter (brightness, contrast). */
function ColorSlider({ label, value, min, max, onChange }: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: '18px', color: 'var(--pixel-text-dim)', width: 22, textAlign: 'right', flexShrink: 0 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label === 'B' ? 'Brightness' : 'Contrast'}
        style={{ flex: 1, height: 12, accentColor: 'var(--pixel-accent)' }}
      />
      <span style={{ fontSize: '16px', color: 'var(--pixel-text-dim)', width: 36, textAlign: 'right', flexShrink: 0 }}>{value}</span>
    </div>
  )
}

/** Standard HSL → RGB conversion. Returns each channel in 0..255. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s = Math.max(0, Math.min(1, s))
  l = Math.max(0, Math.min(1, l))
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hp < 1) { r = c; g = x; b = 0 }
  else if (hp < 2) { r = x; g = c; b = 0 }
  else if (hp < 3) { r = 0; g = c; b = x }
  else if (hp < 4) { r = 0; g = x; b = c }
  else if (hp < 5) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  const m = l - c / 2
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

/** 2D color pad: hue along X, saturation along Y, with a draggable marker.
 *
 *  Works in two modes:
 *  - "colorize" (default for floors/walls): hue 0..360, saturation 0..100.
 *    Used to recolor a grayscale sprite to an absolute target hue.
 *  - "adjust" (used for furniture in adjust mode): hue offset -180..180,
 *    saturation shift -100..100. Center of pad = no change.
 *
 *  Either way the rendered backdrop is the same hue × saturation gradient
 *  (mid-lightness), so the user sees what they're picking. The marker shows
 *  the current position.
 */
function HueSatPad({ h, s, onChange, mode }: {
  h: number
  s: number
  onChange: (h: number, s: number) => void
  mode: 'colorize' | 'adjust'
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const padW = 160
  const padH = 80

  // Map (h, s) → (px, py) for the marker, and (px, py) → (h, s) for input.
  const hMin = mode === 'adjust' ? -180 : 0
  const hMax = mode === 'adjust' ? 180 : 360
  const sMin = mode === 'adjust' ? -100 : 0
  const sMax = mode === 'adjust' ? 100 : 100
  const hueToX = (hv: number) => ((hv - hMin) / (hMax - hMin)) * padW
  const satToY = (sv: number) => (1 - (sv - sMin) / (sMax - sMin)) * padH
  const xToHue = (px: number) => Math.round(hMin + (Math.max(0, Math.min(padW, px)) / padW) * (hMax - hMin))
  const yToSat = (py: number) => Math.round(sMin + (1 - Math.max(0, Math.min(padH, py)) / padH) * (sMax - sMin))

  // Draw the backdrop once. Same gradient for both modes: it's a visual aid.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = padW
    canvas.height = padH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(padW, padH)
    for (let y = 0; y < padH; y++) {
      for (let x = 0; x < padW; x++) {
        const hue = hMin + (x / padW) * (hMax - hMin)
        const satFrac = mode === 'adjust'
          ? Math.abs(1 - 2 * (y / padH)) // adjust mode: high sat at top and bottom
          : 1 - y / padH
        const [r, g, b] = hslToRgb(((hue % 360) + 360) % 360, satFrac, 0.5)
        const i = (y * padW + x) * 4
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [hMin, hMax, mode])

  const handlePointer = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = ((clientX - rect.left) / rect.width) * padW
    const py = ((clientY - rect.top) / rect.height) * padH
    onChange(xToHue(px), yToSat(py))
  }, [onChange])

  const draggingRef = useRef(false)
  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    handlePointer(e.clientX, e.clientY)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    handlePointer(e.clientX, e.clientY)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  const markerX = hueToX(h)
  const markerY = satToY(s)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: 'relative',
          width: padW,
          height: padH,
          border: '2px solid var(--pixel-border)',
          cursor: 'crosshair',
          touchAction: 'none',
          flexShrink: 0,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: padW, height: padH, display: 'block', imageRendering: 'pixelated' }}
        />
        <div style={{
          position: 'absolute',
          left: markerX - 6,
          top: markerY - 6,
          width: 12,
          height: 12,
          border: '2px solid white',
          boxShadow: '0 0 0 1px black, inset 0 0 0 1px black',
          borderRadius: '50%',
          pointerEvents: 'none',
        }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14, color: 'var(--pixel-text-dim)' }}>
        <span>H {h}</span>
        <span>S {s}</span>
      </div>
    </div>
  )
}

const DEFAULT_FURNITURE_COLOR: FloorColor = { h: 0, s: 0, b: 0, c: 0 }

export function EditorToolbar({
  activeTool,
  selectedTileType,
  selectedFurnitureType,
  selectedFurnitureUid,
  selectedFurnitureColor,
  floorColor,
  wallColor,
  onToolChange,
  onTileTypeChange,
  onFloorColorChange,
  onWallColorChange,
  onSelectedFurnitureColorChange,
  onFurnitureTypeChange,
  loadedAssets,
}: EditorToolbarProps) {
  // Persist the last-selected furniture category across editor open/close
  // cycles. Falls back to 'desks' if nothing is stored or the stored value
  // isn't part of the current active set.
  const [activeCategory, setActiveCategory] = useState<FurnitureCategory>(() => {
    try {
      const stored = window.localStorage.getItem(EDITOR_CATEGORY_STORAGE_KEY)
      if (stored && (FURNITURE_CATEGORIES.some((c) => c.id === stored))) {
        return stored as FurnitureCategory
      }
    } catch { /* localStorage may be unavailable (private mode, kiosk) */ }
    return 'desks'
  })
  const [showColor, setShowColor] = useState(false)
  const [showWallColor, setShowWallColor] = useState(false)
  const [showFurnitureColor, setShowFurnitureColor] = useState(false)

  useEffect(() => {
    try { window.localStorage.setItem(EDITOR_CATEGORY_STORAGE_KEY, activeCategory) } catch { /* ignore */ }
  }, [activeCategory])

  // Build dynamic catalog from loaded assets. Only snaps the active category
  // when the stored preference is no longer valid for the loaded set —
  // otherwise we'd clobber the user's choice every time furniture reloads.
  useEffect(() => {
    if (!loadedAssets) return
    try {
      buildDynamicCatalog(loadedAssets)
      const activeCategories = getActiveCategories()
      if (activeCategories.length === 0) return
      const stillValid = activeCategories.some((c) => c.id === activeCategory)
      if (!stillValid) {
        const firstCat = activeCategories[0]?.id
        if (firstCat) setActiveCategory(firstCat)
      }
    } catch (err) {
      console.error('[EditorToolbar] Error building dynamic catalog:', err)
    }
  }, [loadedAssets, activeCategory])

  const handleColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onFloorColorChange({ ...floorColor, [key]: value })
  }, [floorColor, onFloorColorChange])

  const handleWallColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onWallColorChange({ ...wallColor, [key]: value })
  }, [wallColor, onWallColorChange])

  // For selected furniture: use existing color or default
  const effectiveColor = selectedFurnitureColor ?? DEFAULT_FURNITURE_COLOR
  const handleSelFurnColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onSelectedFurnitureColorChange({ ...effectiveColor, [key]: value })
  }, [effectiveColor, onSelectedFurnitureColorChange])

  const categoryItems = getCatalogByCategory(activeCategory)

  const patternCount = getFloorPatternCount()
  // Wall is TileType 0, floor patterns are 1..patternCount
  const floorPatterns = Array.from({ length: patternCount }, (_, i) => i + 1)

  const thumbSize = 36 // 2x for items

  const isFloorActive = activeTool === EditTool.TILE_PAINT || activeTool === EditTool.EYEDROPPER
  const isWallActive = activeTool === EditTool.WALL_PAINT
  const isEraseActive = activeTool === EditTool.ERASE
  const isFurnitureActive = activeTool === EditTool.FURNITURE_PLACE || activeTool === EditTool.FURNITURE_PICK
  const isZoneActive = activeTool === EditTool.ZONE_PAINT

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 68,
        left: 10,
        zIndex: 50,
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-border)',
        borderRadius: 0,
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 6,
        boxShadow: 'var(--pixel-shadow)',
        maxWidth: 'calc(100vw - 20px)',
      }}
    >
      {/* Tool row — at the bottom */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button
          style={isFloorActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.TILE_PAINT)}
          title="Paint floor tiles"
        >
          Floor
        </button>
        <button
          style={isWallActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.WALL_PAINT)}
          title="Paint walls (click to toggle)"
        >
          Wall
        </button>
        <button
          style={isEraseActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.ERASE)}
          title="Erase tiles to void"
        >
          Erase
        </button>
        <button
          style={isFurnitureActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.FURNITURE_PLACE)}
          title="Place furniture"
        >
          Furniture
        </button>
        <button
          style={isZoneActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.ZONE_PAINT)}
          title="Designate no-wander zones (agents avoid these tiles when idle)"
        >
          Zones
        </button>
      </div>

      {/* Sub-panel: Floor tiles — stacked bottom-to-top via column-reverse */}
      {isFloorActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 6 }}>
          {/* Color toggle + Pick — just above tool row */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={showColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowColor((v) => !v)}
              title="Adjust floor color"
            >
              Color
            </button>
            <button
              style={activeTool === EditTool.EYEDROPPER ? activeBtnStyle : btnStyle}
              onClick={() => onToolChange(EditTool.EYEDROPPER)}
              title="Pick floor pattern + color from existing tile"
            >
              Pick
            </button>
          </div>

          {/* Color controls (collapsible) — above Wall/Color/Pick */}
          {showColor && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              padding: '4px 6px',
              background: 'var(--pixel-surface)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
            }}>
              <HueSatPad
                h={floorColor.h}
                s={floorColor.s}
                mode="colorize"
                onChange={(h, s) => onFloorColorChange({ ...floorColor, h, s })}
              />
              <ColorSlider label="B" value={floorColor.b} min={-100} max={100} onChange={(v) => handleColorChange('b', v)} />
              <ColorSlider label="C" value={floorColor.c} min={-100} max={100} onChange={(v) => handleColorChange('c', v)} />
            </div>
          )}

          {/* Floor pattern horizontal carousel — at the top */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
            {floorPatterns.map((patIdx) => (
              <FloorPatternPreview
                key={patIdx}
                patternIndex={patIdx}
                color={floorColor}
                selected={selectedTileType === patIdx}
                onClick={() => onTileTypeChange(patIdx as TileTypeVal)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sub-panel: Wall — stacked bottom-to-top via column-reverse */}
      {isWallActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 6 }}>
          {/* Color toggle — just above tool row */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={showWallColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowWallColor((v) => !v)}
              title="Adjust wall color"
            >
              Color
            </button>
          </div>

          {/* Color controls (collapsible) */}
          {showWallColor && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              padding: '4px 6px',
              background: 'var(--pixel-surface)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
            }}>
              <HueSatPad
                h={wallColor.h}
                s={wallColor.s}
                mode="colorize"
                onChange={(h, s) => onWallColorChange({ ...wallColor, h, s })}
              />
              <ColorSlider label="B" value={wallColor.b} min={-100} max={100} onChange={(v) => handleWallColorChange('b', v)} />
              <ColorSlider label="C" value={wallColor.c} min={-100} max={100} onChange={(v) => handleWallColorChange('c', v)} />
            </div>
          )}

        </div>
      )}

      {/* Sub-panel: Furniture — stacked bottom-to-top via column-reverse */}
      {isFurnitureActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 4 }}>
          {/* Category tabs + Pick — just above tool row */}
          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {getActiveCategories().map((cat) => (
              <button
                key={cat.id}
                style={activeCategory === cat.id ? activeTabStyle : tabStyle}
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
            <div style={{ width: 1, height: 14, background: 'rgba(255,245,235,0.15)', margin: '0 2px', flexShrink: 0 }} />
            <button
              style={activeTool === EditTool.FURNITURE_PICK ? activeBtnStyle : btnStyle}
              onClick={() => onToolChange(EditTool.FURNITURE_PICK)}
              title="Pick furniture type from placed item"
            >
              Pick
            </button>
          </div>
          {/* Furniture items — single-row horizontal carousel at 2x */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
            {categoryItems.map((entry) => {
              const cached = getCachedSprite(entry.sprite, 2)
              const isSelected = selectedFurnitureType === entry.type
              return (
                <button
                  key={entry.type}
                  onClick={() => onFurnitureTypeChange(entry.type)}
                  title={entry.label}
                  style={{
                    width: thumbSize,
                    height: thumbSize,
                    background: 'var(--pixel-btn-bg)',
                    border: isSelected ? '2px solid var(--pixel-accent)' : '2px solid var(--pixel-border)',
                    borderRadius: 0,
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <canvas
                    ref={(el) => {
                      if (!el) return
                      const ctx = el.getContext('2d')
                      if (!ctx) return
                      const scale = Math.min(thumbSize / cached.width, thumbSize / cached.height) * 0.85
                      el.width = thumbSize
                      el.height = thumbSize
                      ctx.imageSmoothingEnabled = false
                      ctx.clearRect(0, 0, thumbSize, thumbSize)
                      const dw = cached.width * scale
                      const dh = cached.height * scale
                      ctx.drawImage(cached, (thumbSize - dw) / 2, (thumbSize - dh) / 2, dw, dh)
                    }}
                    style={{ width: thumbSize, height: thumbSize }}
                  />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Sub-panel: Zones */}
      {isZoneActive && (
        <div style={{ fontSize: '18px', color: 'var(--pixel-text-dim)', padding: '2px 4px' }}>
          No wander — click tiles to mark. Click again to clear.
        </div>
      )}

      {/* Selected furniture color panel — shows when any placed furniture item is selected */}
      {selectedFurnitureUid && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 3 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={showFurnitureColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowFurnitureColor((v) => !v)}
              title="Adjust selected furniture color"
            >
              Color
            </button>
            {selectedFurnitureColor && (
              <button
                style={{ ...btnStyle, fontSize: '20px', padding: '2px 6px' }}
                onClick={() => onSelectedFurnitureColorChange(null)}
                title="Remove color (restore original)"
              >
                Clear
              </button>
            )}
          </div>
          {showFurnitureColor && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              padding: '4px 6px',
              background: 'var(--pixel-surface)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
            }}>
              <HueSatPad
                h={effectiveColor.h}
                s={effectiveColor.s}
                mode={effectiveColor.colorize ? 'colorize' : 'adjust'}
                onChange={(h, s) => onSelectedFurnitureColorChange({ ...effectiveColor, h, s })}
              />
              <ColorSlider label="B" value={effectiveColor.b} min={-100} max={100} onChange={(v) => handleSelFurnColorChange('b', v)} />
              <ColorSlider label="C" value={effectiveColor.c} min={-100} max={100} onChange={(v) => handleSelFurnColorChange('c', v)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '20px', color: 'var(--pixel-text-dim)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!effectiveColor.colorize}
                  onChange={(e) => onSelectedFurnitureColorChange({ ...effectiveColor, colorize: e.target.checked || undefined })}
                  style={{ accentColor: 'var(--pixel-accent)' }}
                />
                Colorize
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
