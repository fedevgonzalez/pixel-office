import { useState, useEffect, useRef, useCallback } from 'react'
import { EditTool, TileType } from '../types.js'
import type { TileType as TileTypeVal, FloorColor, MovementBoundary } from '../types.js'
import { getCatalogByCategory, buildDynamicCatalog, getActiveCategories, FURNITURE_CATEGORIES } from '../layout/furnitureCatalog.js'
import type { FurnitureCategory, LoadedAssetData } from '../layout/furnitureCatalog.js'
import { isExteriorTile } from '../layout/tileKinds.js'
import { getExteriorTileSprite } from '../backgrounds/exteriorTiles.js'
import { EDITOR_OUTDOOR_SWATCH_SIZE } from '../../constants.js'

const EDITOR_CATEGORY_STORAGE_KEY = 'pixel-office:editor:activeCategory'
import { getCachedSprite } from '../sprites/spriteCache.js'
import {
  getColorizedFloorSprite,
  getFloorPatternCount,
  hasFloorSprites,
  getFloorThemes,
  getActiveFloorThemeId,
  setActiveFloorTheme,
} from '../floorTiles.js'

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
  /** Current map dimensions (shown next to the resize controls). */
  cols: number
  rows: number
  /** Resize the map by ±1 row/col at the given edge. */
  onResizeEdge: (edge: 'top' | 'bottom' | 'left' | 'right', delta: 1 | -1) => void
  /** Transient resize message (e.g. a shrink-refused warning). */
  resizeMessage: string | null
  /** Which actor mask the Boundary tool edits. */
  activeBoundaryActor: 'character' | 'pet'
  /** Switch the Boundary tool's active actor mask. */
  onBoundaryActorChange: (actor: 'character' | 'pet') => void
  /** Per-actor movement-boundary masks, for the save-time sanity warning. */
  movementBoundary?: MovementBoundary
}

const FLOOR_PREVIEW_SIZE = 56

/** Render a floor pattern preview large enough that the herringbone / accent
 *  features are actually visible, plus a small number label underneath. */
function FloorPatternPreview({ patternIndex, color, themeId, selected, onClick }: {
  patternIndex: number
  color: FloorColor
  themeId: string | null
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

    const sprite = getColorizedFloorSprite(patternIndex, color, themeId)
    // Pick a zoom that gets us close to FLOOR_PREVIEW_SIZE without overshooting.
    // Sprites are 16, 32 or 48 wide (legacy / native / current). For each case
    // the zoom is computed to fit the preview tile exactly.
    const srcSize = sprite.length > 0 ? sprite[0].length : 16
    const tileZoom = Math.max(1, Math.round(FLOOR_PREVIEW_SIZE / srcSize))
    const cached = getCachedSprite(sprite, tileZoom)
    const drawX = Math.floor((FLOOR_PREVIEW_SIZE - cached.width) / 2)
    const drawY = Math.floor((FLOOR_PREVIEW_SIZE - cached.height) / 2)
    ctx.drawImage(cached, drawX, drawY)
  }, [patternIndex, color, themeId])

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

/** Paintable exterior (outdoor) tile types, in palette order. Each reuses the
 *  same sprite the renderer draws (`getExteriorTileSprite`), so the swatch
 *  matches what lands on the grid. WATER/FENCE are non-walkable (furniture can't
 *  be placed on them); the rest are ground cover. */
const OUTDOOR_TILES: Array<{ type: TileTypeVal; label: string }> = [
  { type: TileType.GRASS, label: 'Grass' },
  { type: TileType.GRASS_ALT, label: 'Grass 2' },
  { type: TileType.PATH, label: 'Path' },
  { type: TileType.SIDEWALK, label: 'Sidewalk' },
  { type: TileType.ROAD, label: 'Road' },
  { type: TileType.ROAD_LINE, label: 'Road line' },
  { type: TileType.CURB, label: 'Curb' },
  { type: TileType.DIRT, label: 'Dirt' },
  { type: TileType.WATER, label: 'Water' },
  { type: TileType.FENCE, label: 'Fence' },
]

/** Count `true` cells of a boundary mask. */
function maskCount(mask: Array<boolean | null> | null | undefined): number {
  if (!mask) return 0
  let n = 0
  for (const v of mask) if (v === true) n++
  return n
}

/** Largest 4-connected component size among the mask's `true` cells. Used to
 *  flag a disconnected boundary (the actor would be trapped in one island). */
function largestComponent(mask: Array<boolean | null> | null | undefined, cols: number, rows: number): number {
  if (!mask) return 0
  const seen = new Uint8Array(cols * rows)
  let best = 0
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== true || seen[start]) continue
    let size = 0
    const stack = [start]
    seen[start] = 1
    while (stack.length > 0) {
      const idx = stack.pop()!
      size++
      const c = idx % cols
      const r = Math.floor(idx / cols)
      const neigh = [
        c > 0 ? idx - 1 : -1,
        c < cols - 1 ? idx + 1 : -1,
        r > 0 ? idx - cols : -1,
        r < rows - 1 ? idx + cols : -1,
      ]
      for (const ni of neigh) {
        if (ni >= 0 && mask[ni] === true && !seen[ni]) {
          seen[ni] = 1
          stack.push(ni)
        }
      }
    }
    if (size > best) best = size
  }
  return best
}

/**
 * Build the save-time sanity warning for movement boundaries (Phase B). Returns
 * an empty string when everything looks fine. Flags, in priority order:
 *  - a painted mask that is tiny (< 4 tiles) → likely a stray click
 *  - a disconnected mask (largest island < total) → actor could be trapped
 *  - pet & character masks that are both painted but fully disjoint (no shared
 *    tile) → pets and characters can never meet
 * Unpainted (absent / all-null) masks are unrestricted and never warn.
 */
function computeBoundaryWarning(boundary: MovementBoundary | undefined, cols: number, rows: number): string {
  if (!boundary) return ''
  const char = boundary.character
  const pet = boundary.pet
  const charN = maskCount(char)
  const petN = maskCount(pet)
  if (charN === 0 && petN === 0) return ''

  const tiny: string[] = []
  if (charN > 0 && charN < 4) tiny.push('character')
  if (petN > 0 && petN < 4) tiny.push('pet')
  if (tiny.length > 0) {
    return `The ${tiny.join(' & ')} boundary is very small (< 4 tiles) — actors may get stuck.`
  }

  if (charN > 0 && largestComponent(char, cols, rows) < charN) {
    return 'The character boundary is split into disconnected islands — characters may get trapped.'
  }
  if (petN > 0 && largestComponent(pet, cols, rows) < petN) {
    return 'The pet boundary is split into disconnected islands — pets may get trapped.'
  }

  // Disjoint pet vs char (both painted, no overlap)
  if (charN > 0 && petN > 0 && char && pet) {
    let shared = false
    for (let i = 0; i < char.length; i++) {
      if (char[i] === true && pet[i] === true) { shared = true; break }
    }
    if (!shared) {
      return 'Pet and character boundaries do not overlap — they can never share a tile.'
    }
  }
  return ''
}

/** Small sprite swatch for an outdoor tile type. Renders the exterior sprite via
 *  `getExteriorTileSprite` (nearest-upscaled, never deformed). */
function OutdoorTilePreview({ tileType, label, selected, onClick }: {
  tileType: TileTypeVal
  label: string
  selected: boolean
  onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = EDITOR_OUTDOOR_SWATCH_SIZE
    canvas.height = EDITOR_OUTDOOR_SWATCH_SIZE
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, EDITOR_OUTDOOR_SWATCH_SIZE, EDITOR_OUTDOOR_SWATCH_SIZE)
    // FENCE has transparent gaps — draw a grass backdrop so it reads as a fence
    // over grass (matching the in-game look) instead of floating pickets.
    if (tileType === TileType.FENCE) {
      const grass = getExteriorTileSprite(TileType.GRASS, 0, 0)
      if (grass) {
        const gz = Math.max(1, Math.round(EDITOR_OUTDOOR_SWATCH_SIZE / grass[0].length))
        ctx.drawImage(getCachedSprite(grass, gz), 0, 0)
      }
    }
    const sprite = getExteriorTileSprite(tileType, 0, 0)
    if (!sprite) return
    const srcSize = sprite.length > 0 ? sprite[0].length : 16
    const zoom = Math.max(1, Math.round(EDITOR_OUTDOOR_SWATCH_SIZE / srcSize))
    const cached = getCachedSprite(sprite, zoom)
    const dx = Math.floor((EDITOR_OUTDOOR_SWATCH_SIZE - cached.width) / 2)
    const dy = Math.floor((EDITOR_OUTDOOR_SWATCH_SIZE - cached.height) / 2)
    ctx.drawImage(cached, dx, dy)
  }, [tileType])

  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: EDITOR_OUTDOOR_SWATCH_SIZE,
        height: EDITOR_OUTDOOR_SWATCH_SIZE + 16,
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
      <canvas ref={canvasRef} style={{ width: EDITOR_OUTDOOR_SWATCH_SIZE, height: EDITOR_OUTDOOR_SWATCH_SIZE, display: 'block' }} />
      <span style={{
        fontSize: 11,
        lineHeight: '16px',
        textAlign: 'center',
        color: selected ? 'var(--pixel-accent)' : 'var(--pixel-text-dim)',
        background: 'rgba(0,0,0,0.4)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>{label}</span>
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
  cols,
  rows,
  onResizeEdge,
  resizeMessage,
  activeBoundaryActor,
  onBoundaryActorChange,
  movementBoundary,
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
  // Local mirror of the active floor theme id. Module-global state is the
  // source of truth; this just gives React something to re-render on.
  const [activeFloorTheme, setActiveFloorThemeLocal] = useState<string | null>(getActiveFloorThemeId())
  const floorThemes = getFloorThemes()
  const handleFloorThemeChange = useCallback((id: string) => {
    setActiveFloorTheme(id)
    setActiveFloorThemeLocal(id)
  }, [])

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

  // TILE_PAINT drives both the interior floor palette and the outdoor palette —
  // they differ only by which TileType is selected. Split the sub-panels on the
  // selected type so each shows its own swatches.
  const tilePaintActive = activeTool === EditTool.TILE_PAINT || activeTool === EditTool.EYEDROPPER
  const outdoorSelected = isExteriorTile(selectedTileType)
  const isFloorActive = tilePaintActive && !outdoorSelected
  const isOutdoorActive = tilePaintActive && outdoorSelected
  const isWallActive = activeTool === EditTool.WALL_PAINT
  const isEraseActive = activeTool === EditTool.ERASE
  const isFurnitureActive = activeTool === EditTool.FURNITURE_PLACE || activeTool === EditTool.FURNITURE_PICK
  const isZoneActive = activeTool === EditTool.ZONE_PAINT
  const isBoundaryActive = activeTool === EditTool.BOUNDARY_PAINT

  // Save-time sanity warning for the active actor's boundary mask. Computed from
  // the in-flight layout's masks. Empty string when nothing's wrong.
  const boundaryWarning = computeBoundaryWarning(movementBoundary, cols, rows)

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
          onClick={() => {
            // If an exterior tile is selected, switch the selection back to an
            // interior floor so the Floor sub-panel (not the Outdoor one) shows.
            // When already on Outdoor (also TILE_PAINT) just swap the selected
            // type — don't re-toggle the tool (that would drop to SELECT).
            if (outdoorSelected) {
              onTileTypeChange(TileType.FLOOR_1)
              if (activeTool !== EditTool.TILE_PAINT) onToolChange(EditTool.TILE_PAINT)
            } else {
              onToolChange(EditTool.TILE_PAINT)
            }
          }}
          title="Paint floor tiles"
        >
          Floor
        </button>
        <button
          style={isOutdoorActive ? activeBtnStyle : btnStyle}
          onClick={() => {
            // Selecting Outdoor picks an exterior tile (defaulting to Grass) so
            // the outdoor palette opens; painting reuses the TILE_PAINT flow.
            if (!outdoorSelected) onTileTypeChange(TileType.GRASS)
            if (activeTool !== EditTool.TILE_PAINT) onToolChange(EditTool.TILE_PAINT)
          }}
          title="Paint outdoor / exterior tiles (grass, path, road…)"
        >
          Outdoor
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
        <button
          style={isBoundaryActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.BOUNDARY_PAINT)}
          title="Paint where characters / pets may roam (drag to add, right-click to clear)"
        >
          Roam
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
                key={`${activeFloorTheme}-${patIdx}`}
                patternIndex={patIdx}
                color={floorColor}
                themeId={activeFloorTheme}
                selected={selectedTileType === patIdx}
                onClick={() => onTileTypeChange(patIdx as TileTypeVal)}
              />
            ))}
          </div>

          {/* Paint theme dropdown — selects the theme used by the next paint
              stroke; does NOT change already-painted tiles. */}
          {floorThemes.length >= 2 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 16, color: 'var(--pixel-text-dim)' }}>
              <span style={{ flexShrink: 0 }}>Paint theme:</span>
              <select
                aria-label="Floor theme"
                value={activeFloorTheme || ''}
                onChange={(e) => handleFloorThemeChange(e.target.value)}
                style={{
                  flex: 1,
                  fontFamily: 'var(--pixel-font)',
                  fontSize: 16,
                  background: 'var(--pixel-btn-bg)',
                  color: 'var(--pixel-text)',
                  border: '2px solid var(--pixel-border)',
                  borderRadius: 0,
                  padding: '3px 6px',
                  cursor: 'pointer',
                }}
              >
                {floorThemes.map((t) => (
                  <option key={t.id} value={t.id}>{t.id}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Sub-panel: Outdoor / exterior tiles */}
      {isOutdoorActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 6 }}>
          {/* Color toggle + Pick — just above tool row (shared with Floor) */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={showColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowColor((v) => !v)}
              title="Adjust outdoor tile color"
            >
              Color
            </button>
            <button
              style={activeTool === EditTool.EYEDROPPER ? activeBtnStyle : btnStyle}
              onClick={() => onToolChange(EditTool.EYEDROPPER)}
              title="Pick tile + color from existing tile"
            >
              Pick
            </button>
          </div>

          {/* Color controls (collapsible) — reuse floorColor as the paint color */}
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

          {/* Exterior tile swatches — horizontal carousel */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
            {OUTDOOR_TILES.map(({ type, label }) => (
              <OutdoorTilePreview
                key={type}
                tileType={type}
                label={label}
                selected={selectedTileType === type}
                onClick={() => onTileTypeChange(type)}
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

      {/* Sub-panel: Roam / movement boundary */}
      {isBoundaryActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 6 }}>
          {/* Actor toggle — just above the tool row */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={{
                ...(activeBoundaryActor === 'character' ? activeBtnStyle : btnStyle),
                fontSize: '18px',
                padding: '3px 8px',
                // Tint the active actor button to match its overlay color.
                ...(activeBoundaryActor === 'character'
                  ? { borderColor: 'rgba(80,150,255,0.9)' }
                  : {}),
              }}
              onClick={() => onBoundaryActorChange('character')}
              title="Paint where characters may roam (blue)"
            >
              Characters
            </button>
            <button
              style={{
                ...(activeBoundaryActor === 'pet' ? activeBtnStyle : btnStyle),
                fontSize: '18px',
                padding: '3px 8px',
                ...(activeBoundaryActor === 'pet'
                  ? { borderColor: 'rgba(80,220,120,0.9)' }
                  : {}),
              }}
              onClick={() => onBoundaryActorChange('pet')}
              title="Paint where pets may roam (green)"
            >
              Pets
            </button>
          </div>

          <div style={{ fontSize: '16px', color: 'var(--pixel-text-dim)', padding: '2px 4px', maxWidth: 260 }}>
            Drag to allow the {activeBoundaryActor === 'pet' ? 'pet' : 'character'}; right-click to clear.
            Blue = chars, green = pets, teal = both. Unpainted = roam anywhere.
          </div>

          {/* Save-time sanity warning */}
          {boundaryWarning && (
            <div style={{
              fontSize: '15px',
              color: '#ffcc66',
              background: 'rgba(120,80,0,0.25)',
              border: '2px solid rgba(255,200,100,0.4)',
              borderRadius: 0,
              padding: '3px 6px',
              maxWidth: 260,
            }}>
              ⚠ {boundaryWarning}
            </div>
          )}
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

      {/* Resize controls — per-edge +/− (always visible in edit mode). Appears at
          the top of the toolbar (container is column-reverse). Expanding an edge
          auto-fills the new margin with the current theme preset. */}
      <ResizePanel cols={cols} rows={rows} onResizeEdge={onResizeEdge} resizeMessage={resizeMessage} />
    </div>
  )
}

/** Per-edge resize controls: 4 edges × (+/−), with the live cols×rows readout
 *  and any transient refusal message. Wired to the layout-resize action. */
function ResizePanel({ cols, rows, onResizeEdge, resizeMessage }: {
  cols: number
  rows: number
  onResizeEdge: (edge: 'top' | 'bottom' | 'left' | 'right', delta: 1 | -1) => void
  resizeMessage: string | null
}) {
  const edgeRow = (edge: 'top' | 'bottom' | 'left' | 'right', label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 16, color: 'var(--pixel-text-dim)', width: 54, flexShrink: 0 }}>{label}</span>
      <button
        style={{ ...btnStyle, fontSize: '18px', padding: '1px 8px' }}
        onClick={() => onResizeEdge(edge, -1)}
        title={`Remove a ${edge === 'left' || edge === 'right' ? 'column' : 'row'} from the ${edge}`}
        aria-label={`Shrink ${edge}`}
      >
        −
      </button>
      <button
        style={{ ...btnStyle, fontSize: '18px', padding: '1px 8px' }}
        onClick={() => onResizeEdge(edge, 1)}
        title={`Add a ${edge === 'left' || edge === 'right' ? 'column' : 'row'} at the ${edge} (auto-filled with the theme exterior)`}
        aria-label={`Expand ${edge}`}
      >
        +
      </button>
    </div>
  )

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      padding: '4px 6px',
      background: 'var(--pixel-surface)',
      border: '2px solid var(--pixel-border)',
      borderRadius: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 16, color: 'var(--pixel-text)' }}>
        <span style={{ fontWeight: 'bold' }}>Map size</span>
        <span style={{ color: 'var(--pixel-text-dim)' }}>{cols}×{rows}</span>
      </div>
      {edgeRow('top', 'Top')}
      {edgeRow('bottom', 'Bottom')}
      {edgeRow('left', 'Left')}
      {edgeRow('right', 'Right')}
      {resizeMessage && (
        <div style={{ fontSize: 14, color: 'var(--pixel-reset-text)', maxWidth: 240, lineHeight: '16px' }}>
          {resizeMessage}
        </div>
      )}
    </div>
  )
}
