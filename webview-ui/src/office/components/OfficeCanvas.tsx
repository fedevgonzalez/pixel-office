import { useRef, useEffect, useCallback } from 'react'
import type { OfficeState } from '../engine/officeState.js'
import type { EditorState } from '../editor/editorState.js'
import type { EditorRenderState, SelectionRenderState, DeleteButtonBounds, RotateButtonBounds } from '../engine/renderer.js'
import { startGameLoop } from '../engine/gameLoop.js'
import { renderFrame } from '../engine/renderer.js'
import { TILE_SIZE, EditTool } from '../types.js'
import {
  CAMERA_FOLLOW_LERP, CAMERA_FOLLOW_SNAP_THRESHOLD, ZOOM_MIN, ZOOM_MAX, ZOOM_SCROLL_THRESHOLD, PAN_MARGIN_FRACTION,
  KIOSK_CHAR_BBOX_HALF_WIDTH, KIOSK_CHAR_BBOX_TOP, KIOSK_CHAR_BBOX_BOTTOM,
  KIOSK_PAD_SINGLE, KIOSK_PAD_MULTI, KIOSK_PAD_VIEWPORT_FRACTION, KIOSK_BBOX_MIN,
  KIOSK_ZOOM_LERP_FAST_THRESHOLD, KIOSK_ZOOM_LERP_FAST, KIOSK_ZOOM_LERP_MID_THRESHOLD, KIOSK_ZOOM_LERP_MID, KIOSK_ZOOM_LERP_SLOW,
  KIOSK_PAN_LERP_FAST_THRESHOLD, KIOSK_PAN_LERP_FAST, KIOSK_PAN_LERP_MID_THRESHOLD, KIOSK_PAN_LERP_MID, KIOSK_PAN_LERP_SLOW,
  KIOSK_DEADZONE_PX, KIOSK_TARGET_SMOOTHING, KIOSK_SYNC_INTERVAL_MS, KIOSK_SYNC_THRESHOLD, KIOSK_FULL_OFFICE_PAD_TILES,
  KIOSK_STATUS_PANEL_WIDTH,
  SCREENSHOT_PADDING_TILES,
} from '../../constants.js'
import { getCatalogEntry, isRotatable } from '../layout/furnitureCatalog.js'
import { canPlaceFurniture, getWallPlacementRow } from '../editor/editorActions.js'
import { ws, isKioskMode, isScreenshotMode } from '../../wsClient.js'
import { unlockAudio } from '../../notificationSound.js'
import type { DayNightState } from '../engine/dayNightCycle.js'

interface OfficeCanvasProps {
  officeState: OfficeState
  onClick: (agentId: number) => void
  isEditMode: boolean
  editorState: EditorState
  onEditorTileAction: (col: number, row: number) => void
  onEditorEraseAction: (col: number, row: number) => void
  onEditorSelectionChange: () => void
  onDeleteSelected: () => void
  onRotateSelected: () => void
  onDragMove: (uid: string, newCol: number, newRow: number) => void
  editorTick: number
  zoom: number
  onZoomChange: (zoom: number) => void
  panRef: React.MutableRefObject<{ x: number; y: number }>
  dayNight?: DayNightState
}

export function OfficeCanvas({ officeState, onClick, isEditMode, editorState, onEditorTileAction, onEditorEraseAction, onEditorSelectionChange, onDeleteSelected, onRotateSelected, onDragMove, editorTick: _editorTick, zoom, onZoomChange, panRef, dayNight }: OfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef({ x: 0, y: 0 })
  // Middle-mouse pan state (imperative, no re-renders)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })
  // Delete/rotate button bounds (updated each frame by renderer)
  const deleteButtonBoundsRef = useRef<DeleteButtonBounds | null>(null)
  const rotateButtonBoundsRef = useRef<RotateButtonBounds | null>(null)
  // Right-click erase dragging
  const isEraseDraggingRef = useRef(false)
  // Zoom scroll accumulator for trackpad pinch sensitivity
  const zoomAccumulatorRef = useRef(0)
  // Zoom ref: keeps game loop stable (no restart on zoom changes)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  // Day/night ref: read in render callback without restarting game loop
  const dayNightRef = useRef(dayNight)
  dayNightRef.current = dayNight
  // Kiosk smooth zoom (float, lerped each frame)
  const kioskZoomRef = useRef(zoom)
  const kioskLastSyncRef = useRef(0)
  // Kiosk smoothed target bbox (for gradual transitions between active/idle sets)
  const kioskTargetBboxRef = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null)
  // Mouse move throttle (avoid expensive hit-testing on every pixel)
  const lastMouseMoveRef = useRef(0)
  // Clamp pan so the map edge can't go past a margin inside the viewport
  const clampPan = useCallback((px: number, py: number): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: px, y: py }
    const layout = officeState.getLayout()
    const mapW = layout.cols * TILE_SIZE * zoom
    const mapH = layout.rows * TILE_SIZE * zoom
    const marginX = canvas.width * PAN_MARGIN_FRACTION
    const marginY = canvas.height * PAN_MARGIN_FRACTION
    const maxPanX = (mapW / 2) + canvas.width / 2 - marginX
    const maxPanY = (mapH / 2) + canvas.height / 2 - marginY
    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, px)),
      y: Math.max(-maxPanY, Math.min(maxPanY, py)),
    }
  }, [officeState, zoom])

  // Resize canvas backing store to device pixels (no DPR transform on ctx)
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    // No ctx.scale(dpr) — we render directly in device pixels
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    resizeCanvas()

    const observer = new ResizeObserver(() => resizeCanvas())
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    const stop = startGameLoop(canvas, {
      update: (dt) => {
        officeState.update(dt)
      },
      render: (ctx) => {
        // Canvas dimensions are in device pixels
        const w = canvas.width
        const h = canvas.height

        // Build editor render state
        let editorRender: EditorRenderState | undefined
        if (isEditMode) {
          const showGhostBorder = editorState.activeTool === EditTool.TILE_PAINT || editorState.activeTool === EditTool.WALL_PAINT || editorState.activeTool === EditTool.ERASE
          editorRender = {
            showGrid: true,
            ghostSprite: null,
            ghostCol: editorState.ghostCol,
            ghostRow: editorState.ghostRow,
            ghostValid: editorState.ghostValid,
            selectedCol: 0,
            selectedRow: 0,
            selectedW: 0,
            selectedH: 0,
            hasSelection: false,
            isRotatable: false,
            deleteButtonBounds: null,
            rotateButtonBounds: null,
            showGhostBorder,
            ghostBorderHoverCol: showGhostBorder ? editorState.ghostCol : -999,
            ghostBorderHoverRow: showGhostBorder ? editorState.ghostRow : -999,
          }

          // Ghost preview for furniture placement
          if (editorState.activeTool === EditTool.FURNITURE_PLACE && editorState.ghostCol >= 0) {
            const entry = getCatalogEntry(editorState.selectedFurnitureType)
            if (entry) {
              const placementRow = getWallPlacementRow(editorState.selectedFurnitureType, editorState.ghostRow)
              editorRender.ghostSprite = entry.sprite
              editorRender.ghostRow = placementRow
              editorRender.ghostValid = canPlaceFurniture(
                officeState.getLayout(),
                editorState.selectedFurnitureType,
                editorState.ghostCol,
                placementRow,
              )
            }
          }

          // Ghost preview for drag-to-move
          if (editorState.isDragMoving && editorState.dragUid && editorState.ghostCol >= 0) {
            const draggedItem = officeState.getLayout().furniture.find((f) => f.uid === editorState.dragUid)
            if (draggedItem) {
              const entry = getCatalogEntry(draggedItem.type)
              if (entry) {
                const ghostCol = editorState.ghostCol - editorState.dragOffsetCol
                const ghostRow = editorState.ghostRow - editorState.dragOffsetRow
                editorRender.ghostSprite = entry.sprite
                editorRender.ghostCol = ghostCol
                editorRender.ghostRow = ghostRow
                editorRender.ghostValid = canPlaceFurniture(
                  officeState.getLayout(),
                  draggedItem.type,
                  ghostCol,
                  ghostRow,
                  editorState.dragUid,
                )
              }
            }
          }

          // Selection highlight
          if (editorState.selectedFurnitureUid && !editorState.isDragMoving) {
            const item = officeState.getLayout().furniture.find((f) => f.uid === editorState.selectedFurnitureUid)
            if (item) {
              const entry = getCatalogEntry(item.type)
              if (entry) {
                editorRender.hasSelection = true
                editorRender.selectedCol = item.col
                editorRender.selectedRow = item.row
                editorRender.selectedW = entry.footprintW
                editorRender.selectedH = entry.footprintH
                editorRender.isRotatable = isRotatable(item.type)
              }
            }
          }
        }

        // Camera follow: smoothly center on followed agent (disabled in kiosk — auto-frame handles it)
        const curZoom = zoomRef.current
        if (!isKioskMode && officeState.cameraFollowId !== null) {
          const followCh = officeState.characters.get(officeState.cameraFollowId)
          if (followCh) {
            const layout = officeState.getLayout()
            const mapW = layout.cols * TILE_SIZE * curZoom
            const mapH = layout.rows * TILE_SIZE * curZoom
            const targetX = mapW / 2 - followCh.x * curZoom
            const targetY = mapH / 2 - followCh.y * curZoom
            const dx = targetX - panRef.current.x
            const dy = targetY - panRef.current.y
            if (Math.abs(dx) < CAMERA_FOLLOW_SNAP_THRESHOLD && Math.abs(dy) < CAMERA_FOLLOW_SNAP_THRESHOLD) {
              panRef.current = { x: targetX, y: targetY }
            } else {
              panRef.current = {
                x: panRef.current.x + dx * CAMERA_FOLLOW_LERP,
                y: panRef.current.y + dy * CAMERA_FOLLOW_LERP,
              }
            }
          }
        }

        // Kiosk auto-frame: smooth zoom and pan to keep characters visible
        // When 1+ agents are active → frame on active agents only.
        // When ALL agents are idle → show the full office map (zoom out to fit).
        // The existing lerp/smoothing handles transitions automatically — only the target changes.
        let effectiveZoom = curZoom
        if (isKioskMode && officeState.characters.size > 0) {
          const allChars = Array.from(officeState.characters.values())
          const activeChars = allChars.filter(ch => ch.isActive)

          let rawMinX: number, rawMinY: number, rawMaxX: number, rawMaxY: number

          if (activeChars.length > 0) {
            // Frame on active agents only
            rawMinX = Infinity; rawMinY = Infinity; rawMaxX = -Infinity; rawMaxY = -Infinity
            for (const ch of activeChars) {
              rawMinX = Math.min(rawMinX, ch.x - KIOSK_CHAR_BBOX_HALF_WIDTH)
              rawMinY = Math.min(rawMinY, ch.y - KIOSK_CHAR_BBOX_TOP)
              rawMaxX = Math.max(rawMaxX, ch.x + KIOSK_CHAR_BBOX_HALF_WIDTH)
              rawMaxY = Math.max(rawMaxY, ch.y + KIOSK_CHAR_BBOX_BOTTOM)
            }

            // Padding: fixed base + viewport-proportional (adapts to large screens)
            const basePad = activeChars.length === 1 ? KIOSK_PAD_SINGLE : KIOSK_PAD_MULTI
            const viewportPad = Math.min(w, h) * KIOSK_PAD_VIEWPORT_FRACTION / (kioskZoomRef.current || 1)
            const pad = basePad + viewportPad
            rawMinX -= pad; rawMinY -= pad; rawMaxX += pad; rawMaxY += pad
          } else {
            // All agents idle → show the full office map with a small tile padding
            const layout = officeState.getLayout()
            const padPx = KIOSK_FULL_OFFICE_PAD_TILES * TILE_SIZE
            rawMinX = -padPx
            rawMinY = -padPx
            rawMaxX = layout.cols * TILE_SIZE + padPx
            rawMaxY = layout.rows * TILE_SIZE + padPx
          }

          // Smooth target transitions (prevents bbox jump when active set changes)
          const prev = kioskTargetBboxRef.current
          let tMinX: number, tMinY: number, tMaxX: number, tMaxY: number
          if (prev) {
            // Deadzone: only update target if raw moved beyond threshold
            const maxDelta = Math.max(
              Math.abs(rawMinX - prev.minX), Math.abs(rawMinY - prev.minY),
              Math.abs(rawMaxX - prev.maxX), Math.abs(rawMaxY - prev.maxY),
            )
            if (maxDelta < KIOSK_DEADZONE_PX) {
              // Within deadzone — keep previous target
              tMinX = prev.minX; tMinY = prev.minY; tMaxX = prev.maxX; tMaxY = prev.maxY
            } else {
              // Lerp toward raw target for smooth transitions
              tMinX = prev.minX + (rawMinX - prev.minX) * KIOSK_TARGET_SMOOTHING
              tMinY = prev.minY + (rawMinY - prev.minY) * KIOSK_TARGET_SMOOTHING
              tMaxX = prev.maxX + (rawMaxX - prev.maxX) * KIOSK_TARGET_SMOOTHING
              tMaxY = prev.maxY + (rawMaxY - prev.maxY) * KIOSK_TARGET_SMOOTHING
            }
          } else {
            // First frame — snap to raw
            tMinX = rawMinX; tMinY = rawMinY; tMaxX = rawMaxX; tMaxY = rawMaxY
          }
          kioskTargetBboxRef.current = { minX: tMinX, minY: tMinY, maxX: tMaxX, maxY: tMaxY }

          const bboxW = Math.max(tMaxX - tMinX, KIOSK_BBOX_MIN)
          const bboxH = Math.max(tMaxY - tMinY, KIOSK_BBOX_MIN)

          // Available canvas area (subtract status panel width in device pixels)
          const dpr = window.devicePixelRatio || 1
          const availW = w - KIOSK_STATUS_PANEL_WIDTH * dpr
          const availH = h

          // Target zoom: fit bbox in available area, use restrictive axis
          const fitZoomX = availW / bboxW
          const fitZoomY = availH / bboxH
          const targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(fitZoomX, fitZoomY)))

          // Adaptive zoom lerp (fast approach, slow settle)
          const zoomDiff = Math.abs(targetZoom - kioskZoomRef.current)
          const zoomLerp = zoomDiff > KIOSK_ZOOM_LERP_FAST_THRESHOLD ? KIOSK_ZOOM_LERP_FAST
            : zoomDiff > KIOSK_ZOOM_LERP_MID_THRESHOLD ? KIOSK_ZOOM_LERP_MID
            : KIOSK_ZOOM_LERP_SLOW
          kioskZoomRef.current += (targetZoom - kioskZoomRef.current) * zoomLerp

          // Quantize to 0.5 steps — each unique zoom float creates a WeakMap in spriteCache.
          // Integer steps (Math.round) caused visible jumps; 0.5 steps give smooth transitions
          // with at most ~13 cache entries across the zoom range (2-8).
          effectiveZoom = Math.round(kioskZoomRef.current * 2) / 2

          // Target pan: center on smoothed bbox midpoint within available area (left of panel)
          const layout = officeState.getLayout()
          const mapW = layout.cols * TILE_SIZE * effectiveZoom
          const mapH = layout.rows * TILE_SIZE * effectiveZoom
          const centerX = (tMinX + tMaxX) / 2
          const centerY = (tMinY + tMaxY) / 2
          // Offset by half panel width so center of visible area excludes the panel
          const panelOffsetX = (KIOSK_STATUS_PANEL_WIDTH * dpr) / 2
          const targetPanX = mapW / 2 - centerX * effectiveZoom - panelOffsetX
          const targetPanY = mapH / 2 - centerY * effectiveZoom

          // Adaptive pan lerp (fast for large distances, slow for settling)
          const panDist = Math.sqrt(
            (targetPanX - panRef.current.x) ** 2 +
            (targetPanY - panRef.current.y) ** 2,
          )
          const panLerp = panDist > KIOSK_PAN_LERP_FAST_THRESHOLD ? KIOSK_PAN_LERP_FAST
            : panDist > KIOSK_PAN_LERP_MID_THRESHOLD ? KIOSK_PAN_LERP_MID
            : KIOSK_PAN_LERP_SLOW
          panRef.current = {
            x: panRef.current.x + (targetPanX - panRef.current.x) * panLerp,
            y: panRef.current.y + (targetPanY - panRef.current.y) * panLerp,
          }

          // Sync zoom to React state periodically (for ToolOverlay positioning)
          const now = performance.now()
          if (now - kioskLastSyncRef.current > KIOSK_SYNC_INTERVAL_MS) {
            kioskLastSyncRef.current = now
            const rounded = Math.round(effectiveZoom * 10) / 10
            if (Math.abs(rounded - curZoom) > KIOSK_SYNC_THRESHOLD) {
              onZoomChange(rounded)
            }
          }
        }

        // Screenshot mode: auto-fit office in viewport with padding, no pan
        if (isScreenshotMode) {
          const layout = officeState.getLayout()
          const padTiles = SCREENSHOT_PADDING_TILES * 2 // both sides
          const fitW = w / ((layout.cols + padTiles) * TILE_SIZE)
          // +1 row for wall tops that extend above the grid
          const fitH = h / ((layout.rows + 1 + padTiles) * TILE_SIZE)
          // Integer zoom for pixel-perfect rendering, clamped to [2, 8]
          effectiveZoom = Math.min(8, Math.max(2, Math.round(Math.min(fitW, fitH))))
          // Shift pan up slightly to account for wall tops extending above grid
          panRef.current = { x: 0, y: -TILE_SIZE * effectiveZoom / 2 }
        }

        // Build selection render state
        const selectionRender: SelectionRenderState = {
          selectedAgentId: officeState.selectedAgentId,
          hoveredAgentId: officeState.hoveredAgentId,
          hoveredTile: officeState.hoveredTile,
          seats: officeState.seats,
          characters: officeState.characters,
          selectedPetId: officeState.selectedPetId,
          hoveredPetId: officeState.hoveredPetId,
        }

        const { offsetX, offsetY } = renderFrame(
          ctx,
          w,
          h,
          officeState.tileMap,
          officeState.furniture,
          officeState.getCharacters(),
          effectiveZoom,
          panRef.current.x,
          panRef.current.y,
          isScreenshotMode ? undefined : selectionRender,
          isScreenshotMode ? undefined : editorRender,
          officeState.getLayout().tileColors,
          officeState.getLayout().cols,
          officeState.getLayout().rows,
          [...officeState.pets.values()],
          isScreenshotMode,
          isScreenshotMode ? undefined : dayNightRef.current,
          isScreenshotMode ? undefined : officeState.getLayout().furniture,
          officeState.getLayout().background?.theme,
          isEditMode ? officeState.getLayout().zones : undefined,
        )
        offsetRef.current = { x: offsetX, y: offsetY }

        // Store delete/rotate button bounds for hit-testing
        deleteButtonBoundsRef.current = editorRender?.deleteButtonBounds ?? null
        rotateButtonBoundsRef.current = editorRender?.rotateButtonBounds ?? null
      },
    })

    return () => {
      stop()
      observer.disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- zoom read via zoomRef to avoid game loop restart
  }, [officeState, resizeCanvas, isEditMode, editorState, _editorTick, panRef])

  // Convert CSS mouse coords to world (sprite pixel) coords
  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      // CSS coords relative to canvas
      const cssX = clientX - rect.left
      const cssY = clientY - rect.top
      // Convert to device pixels
      const deviceX = cssX * dpr
      const deviceY = cssY * dpr
      // Convert to world (sprite pixel) coords
      const worldX = (deviceX - offsetRef.current.x) / zoom
      const worldY = (deviceY - offsetRef.current.y) / zoom
      return { worldX, worldY, screenX: cssX, screenY: cssY, deviceX, deviceY }
    },
    [zoom],
  )

  const screenToTile = useCallback(
    (clientX: number, clientY: number): { col: number; row: number } | null => {
      const pos = screenToWorld(clientX, clientY)
      if (!pos) return null
      const col = Math.floor(pos.worldX / TILE_SIZE)
      const row = Math.floor(pos.worldY / TILE_SIZE)
      const layout = officeState.getLayout()
      // In edit mode with floor/wall/erase tool, extend valid range by 1 for ghost border
      if (isEditMode && (editorState.activeTool === EditTool.TILE_PAINT || editorState.activeTool === EditTool.WALL_PAINT || editorState.activeTool === EditTool.ERASE)) {
        if (col < -1 || col > layout.cols || row < -1 || row > layout.rows) return null
        return { col, row }
      }
      if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) return null
      return { col, row }
    },
    [screenToWorld, officeState, isEditMode, editorState],
  )

  // Check if device-pixel coords hit the delete button
  const hitTestDeleteButton = useCallback((deviceX: number, deviceY: number): boolean => {
    const bounds = deleteButtonBoundsRef.current
    if (!bounds) return false
    const dx = deviceX - bounds.cx
    const dy = deviceY - bounds.cy
    return (dx * dx + dy * dy) <= (bounds.radius + 2) * (bounds.radius + 2) // small padding
  }, [])

  // Check if device-pixel coords hit the rotate button
  const hitTestRotateButton = useCallback((deviceX: number, deviceY: number): boolean => {
    const bounds = rotateButtonBoundsRef.current
    if (!bounds) return false
    const dx = deviceX - bounds.cx
    const dy = deviceY - bounds.cy
    return (dx * dx + dy * dy) <= (bounds.radius + 2) * (bounds.radius + 2)
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Handle middle-mouse panning (must stay unthrottled for smooth feel)
      if (isPanningRef.current) {
        const dpr = window.devicePixelRatio || 1
        const dx = (e.clientX - panStartRef.current.mouseX) * dpr
        const dy = (e.clientY - panStartRef.current.mouseY) * dpr
        panRef.current = clampPan(
          panStartRef.current.panX + dx,
          panStartRef.current.panY + dy,
        )
        return
      }

      // Kiosk mode: no mouse interaction (hover, cursor changes, hit-testing)
      if (isKioskMode) return

      // Throttle non-panning mouse moves (~30fps) to reduce furniture hit-testing cost
      const now = performance.now()
      if (now - lastMouseMoveRef.current < 32) return
      lastMouseMoveRef.current = now

      if (isEditMode) {
        const tile = screenToTile(e.clientX, e.clientY)
        if (tile) {
          editorState.ghostCol = tile.col
          editorState.ghostRow = tile.row

          // Drag-to-move: check if cursor moved to different tile
          if (editorState.dragUid && !editorState.isDragMoving) {
            if (tile.col !== editorState.dragStartCol || tile.row !== editorState.dragStartRow) {
              editorState.isDragMoving = true
            }
          }

          // Paint on drag (tile/wall/erase paint tool only, not during furniture drag)
          if (editorState.isDragging && (editorState.activeTool === EditTool.TILE_PAINT || editorState.activeTool === EditTool.WALL_PAINT || editorState.activeTool === EditTool.ERASE || editorState.activeTool === EditTool.ZONE_PAINT) && !editorState.dragUid) {
            onEditorTileAction(tile.col, tile.row)
          }
          // Right-click erase drag
          if (isEraseDraggingRef.current && (editorState.activeTool === EditTool.TILE_PAINT || editorState.activeTool === EditTool.WALL_PAINT || editorState.activeTool === EditTool.ERASE)) {
            const layout = officeState.getLayout()
            if (tile.col >= 0 && tile.col < layout.cols && tile.row >= 0 && tile.row < layout.rows) {
              onEditorEraseAction(tile.col, tile.row)
            }
          }
        } else {
          editorState.ghostCol = -1
          editorState.ghostRow = -1
        }

        // Cursor: show grab during drag, pointer over delete button, crosshair otherwise
        const canvas = canvasRef.current
        if (canvas) {
          if (editorState.isDragMoving) {
            canvas.style.cursor = 'grabbing'
          } else {
            const pos = screenToWorld(e.clientX, e.clientY)
            if (pos && (hitTestDeleteButton(pos.deviceX, pos.deviceY) || hitTestRotateButton(pos.deviceX, pos.deviceY))) {
              canvas.style.cursor = 'pointer'
            } else if (editorState.activeTool === EditTool.FURNITURE_PICK && tile) {
              // Pick mode: show pointer over furniture, crosshair elsewhere
              const layout = officeState.getLayout()
              const hitFurniture = layout.furniture.find((f) => {
                const entry = getCatalogEntry(f.type)
                if (!entry) return false
                return tile.col >= f.col && tile.col < f.col + entry.footprintW && tile.row >= f.row && tile.row < f.row + entry.footprintH
              })
              canvas.style.cursor = hitFurniture ? 'pointer' : 'crosshair'
            } else if ((editorState.activeTool === EditTool.SELECT || (editorState.activeTool === EditTool.FURNITURE_PLACE && editorState.selectedFurnitureType === '')) && tile) {
              // Check if hovering over furniture
              const layout = officeState.getLayout()
              const hitFurniture = layout.furniture.find((f) => {
                const entry = getCatalogEntry(f.type)
                if (!entry) return false
                return tile.col >= f.col && tile.col < f.col + entry.footprintW && tile.row >= f.row && tile.row < f.row + entry.footprintH
              })
              canvas.style.cursor = hitFurniture ? 'grab' : 'crosshair'
            } else {
              canvas.style.cursor = 'crosshair'
            }
          }
        }
        return
      }

      const pos = screenToWorld(e.clientX, e.clientY)
      if (!pos) return
      const hitId = officeState.getCharacterAt(pos.worldX, pos.worldY)
      const tile = screenToTile(e.clientX, e.clientY)
      officeState.hoveredTile = tile
      const canvas = canvasRef.current
      // Pet hover
      const petHitId = pos ? officeState.getPetAt(pos.worldX, pos.worldY) : null
      officeState.hoveredPetId = petHitId

      if (canvas) {
        let cursor = 'default'
        if (hitId !== null || petHitId !== null) {
          cursor = 'pointer'
        } else if (officeState.selectedAgentId !== null && tile) {
          // Check if hovering over a clickable seat (available or own)
          const seatId = officeState.getSeatAtTile(tile.col, tile.row)
          if (seatId) {
            const seat = officeState.seats.get(seatId)
            if (seat) {
              const selectedCh = officeState.characters.get(officeState.selectedAgentId)
              if (!seat.assigned || (selectedCh && selectedCh.seatId === seatId)) {
                cursor = 'pointer'
              }
            }
          }
        }
        canvas.style.cursor = cursor
      }
      officeState.hoveredAgentId = hitId
    },
    [officeState, screenToWorld, screenToTile, isEditMode, editorState, onEditorTileAction, onEditorEraseAction, panRef, hitTestDeleteButton, hitTestRotateButton, clampPan],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      unlockAudio()
      // Middle mouse button (button 1) starts panning
      if (e.button === 1) {
        e.preventDefault()
        // Break camera follow on manual pan
        officeState.cameraFollowId = null
        isPanningRef.current = true
        panStartRef.current = {
          mouseX: e.clientX,
          mouseY: e.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        }
        const canvas = canvasRef.current
        if (canvas) canvas.style.cursor = 'grabbing'
        return
      }

      // Right-click in edit mode for erasing
      if (e.button === 2 && isEditMode) {
        const tile = screenToTile(e.clientX, e.clientY)
        if (tile && (editorState.activeTool === EditTool.TILE_PAINT || editorState.activeTool === EditTool.WALL_PAINT || editorState.activeTool === EditTool.ERASE)) {
          const layout = officeState.getLayout()
          if (tile.col >= 0 && tile.col < layout.cols && tile.row >= 0 && tile.row < layout.rows) {
            isEraseDraggingRef.current = true
            onEditorEraseAction(tile.col, tile.row)
          }
        }
        return
      }

      if (!isEditMode) return

      // Check rotate/delete button hit first
      const pos = screenToWorld(e.clientX, e.clientY)
      if (pos && hitTestRotateButton(pos.deviceX, pos.deviceY)) {
        onRotateSelected()
        return
      }
      if (pos && hitTestDeleteButton(pos.deviceX, pos.deviceY)) {
        onDeleteSelected()
        return
      }

      const tile = screenToTile(e.clientX, e.clientY)

      // SELECT tool (or furniture tool with nothing selected): check for furniture hit to start drag
      const actAsSelect = editorState.activeTool === EditTool.SELECT ||
        (editorState.activeTool === EditTool.FURNITURE_PLACE && editorState.selectedFurnitureType === '')
      if (actAsSelect && tile) {
        const layout = officeState.getLayout()
        // Find all furniture at clicked tile, prefer surface items (on top of desks)
        let hitFurniture = null as typeof layout.furniture[0] | null
        for (const f of layout.furniture) {
          const entry = getCatalogEntry(f.type)
          if (!entry) continue
          if (tile.col >= f.col && tile.col < f.col + entry.footprintW && tile.row >= f.row && tile.row < f.row + entry.footprintH) {
            if (!hitFurniture || entry.canPlaceOnSurfaces) hitFurniture = f
          }
        }
        if (hitFurniture) {
          // Start drag — record offset from furniture's top-left
          editorState.startDrag(
            hitFurniture.uid,
            tile.col,
            tile.row,
            tile.col - hitFurniture.col,
            tile.row - hitFurniture.row,
          )
          return
        } else {
          // Clicked empty space — deselect
          editorState.clearSelection()
          onEditorSelectionChange()
        }
      }

      // Non-select tools: start paint drag
      editorState.isDragging = true
      if (tile) {
        onEditorTileAction(tile.col, tile.row)
      }
    },
    [officeState, isEditMode, editorState, screenToTile, screenToWorld, onEditorTileAction, onEditorEraseAction, onEditorSelectionChange, onDeleteSelected, onRotateSelected, hitTestDeleteButton, hitTestRotateButton, panRef],
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        isPanningRef.current = false
        const canvas = canvasRef.current
        if (canvas) canvas.style.cursor = isEditMode ? 'crosshair' : 'default'
        return
      }
      if (e.button === 2) {
        isEraseDraggingRef.current = false
        return
      }

      // Handle drag-to-move completion
      if (editorState.dragUid) {
        if (editorState.isDragMoving) {
          // Compute target position
          const ghostCol = editorState.ghostCol - editorState.dragOffsetCol
          const ghostRow = editorState.ghostRow - editorState.dragOffsetRow
          const draggedItem = officeState.getLayout().furniture.find((f) => f.uid === editorState.dragUid)
          if (draggedItem) {
            const valid = canPlaceFurniture(
              officeState.getLayout(),
              draggedItem.type,
              ghostCol,
              ghostRow,
              editorState.dragUid,
            )
            if (valid) {
              onDragMove(editorState.dragUid, ghostCol, ghostRow)
            }
          }
          editorState.clearSelection()
        } else {
          // Click (no movement) — toggle selection
          if (editorState.selectedFurnitureUid === editorState.dragUid) {
            editorState.clearSelection()
          } else {
            editorState.selectedFurnitureUid = editorState.dragUid
          }
        }
        editorState.clearDrag()
        onEditorSelectionChange()
        const canvas = canvasRef.current
        if (canvas) canvas.style.cursor = 'crosshair'
        return
      }

      editorState.isDragging = false
      editorState.wallDragAdding = null
      editorState.zoneDragAdding = null
      editorState.zoneDragUndoPushed = false
      editorState.zoneDragLastCol = -1
      editorState.zoneDragLastRow = -1
    },
    [editorState, isEditMode, officeState, onDragMove, onEditorSelectionChange],
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isKioskMode) return // no interaction in kiosk
      if (isEditMode) return // handled by mouseDown/mouseUp
      const pos = screenToWorld(e.clientX, e.clientY)
      if (!pos) return

      const hitId = officeState.getCharacterAt(pos.worldX, pos.worldY)
      if (hitId !== null) {
        // Dismiss any active bubble on click
        officeState.dismissBubble(hitId)
        // Toggle selection: click same agent deselects, different agent selects
        if (officeState.selectedAgentId === hitId) {
          officeState.selectedAgentId = null
          officeState.cameraFollowId = null
        } else {
          officeState.selectedAgentId = hitId
          officeState.cameraFollowId = hitId
        }
        officeState.selectedPetId = null // deselect pet when clicking agent
        onClick(hitId) // still focus terminal
        return
      }

      // Check pet hit
      const hitPetId = officeState.getPetAt(pos.worldX, pos.worldY)
      if (hitPetId !== null) {
        officeState.selectedAgentId = null // deselect agent
        officeState.cameraFollowId = null
        if (officeState.selectedPetId === hitPetId) {
          officeState.selectedPetId = null
        } else {
          officeState.selectedPetId = hitPetId
          officeState.triggerPetReaction(hitPetId) // reaction on click
        }
        return
      }

      // No agent or pet hit — check seat click while agent is selected
      if (officeState.selectedAgentId !== null) {
        const selectedCh = officeState.characters.get(officeState.selectedAgentId)
        // Skip seat reassignment for sub-agents
        if (selectedCh && !selectedCh.isSubagent) {
          const tile = screenToTile(e.clientX, e.clientY)
          if (tile) {
            const seatId = officeState.getSeatAtTile(tile.col, tile.row)
            if (seatId) {
              const seat = officeState.seats.get(seatId)
              if (seat && selectedCh) {
                if (selectedCh.seatId === seatId) {
                  // Clicked own seat — send agent back to it
                  officeState.sendToSeat(officeState.selectedAgentId)
                  officeState.selectedAgentId = null
                  officeState.cameraFollowId = null
                  return
                } else if (!seat.assigned) {
                  // Clicked available seat — reassign
                  officeState.reassignSeat(officeState.selectedAgentId, seatId)
                  officeState.selectedAgentId = null
                  officeState.cameraFollowId = null
                  // Persist seat assignments (exclude sub-agents)
                  const seats: Record<number, { palette: number; seatId: string | null }> = {}
                  for (const ch of officeState.characters.values()) {
                    if (ch.isSubagent) continue
                    seats[ch.id] = { palette: ch.palette, seatId: ch.seatId }
                  }
                  ws.postMessage({ type: 'saveAgentSeats', seats })
                  return
                }
              }
            }
          }
        }
        // Clicked empty space — deselect
        officeState.selectedAgentId = null
        officeState.cameraFollowId = null
      }
      // Also deselect pet if clicking empty space
      if (officeState.selectedPetId !== null && hitPetId === null) {
        // If pet is selected and user clicks walkable tile, send pet there
        const tile = screenToTile(e.clientX, e.clientY)
        if (tile) {
          officeState.walkPetToTile(officeState.selectedPetId, tile.col, tile.row)
        }
        officeState.selectedPetId = null
      }
    },
    [officeState, onClick, screenToWorld, screenToTile, isEditMode],
  )

  const handleMouseLeave = useCallback(() => {
    isPanningRef.current = false
    isEraseDraggingRef.current = false
    editorState.isDragging = false
    editorState.wallDragAdding = null
    editorState.zoneDragAdding = null
    editorState.zoneDragUndoPushed = false
    editorState.zoneDragLastCol = -1
    editorState.zoneDragLastRow = -1
    editorState.clearDrag()
    editorState.ghostCol = -1
    editorState.ghostRow = -1
    officeState.hoveredAgentId = null
    officeState.hoveredTile = null
  }, [officeState, editorState])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (isEditMode) return
    // Right-click to walk selected agent to tile
    if (officeState.selectedAgentId !== null) {
      const tile = screenToTile(e.clientX, e.clientY)
      if (tile) {
        officeState.walkToTile(officeState.selectedAgentId, tile.col, tile.row)
      }
    }
  }, [isEditMode, officeState, screenToTile])

  // Wheel: Ctrl+wheel to zoom, plain wheel/trackpad to pan
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        // Accumulate scroll delta, step zoom when threshold crossed
        zoomAccumulatorRef.current += e.deltaY
        if (Math.abs(zoomAccumulatorRef.current) >= ZOOM_SCROLL_THRESHOLD) {
          const delta = zoomAccumulatorRef.current < 0 ? 1 : -1
          zoomAccumulatorRef.current = 0
          const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom + delta))
          if (newZoom !== zoom) {
            onZoomChange(newZoom)
          }
        }
      } else {
        // Pan via trackpad two-finger scroll or mouse wheel
        const dpr = window.devicePixelRatio || 1
        officeState.cameraFollowId = null
        panRef.current = clampPan(
          panRef.current.x - e.deltaX * dpr,
          panRef.current.y - e.deltaY * dpr,
        )
      }
    },
    [zoom, onZoomChange, officeState, panRef, clampPan],
  )

  // Prevent default middle-click browser behavior (auto-scroll)
  const handleAuxClick = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) e.preventDefault()
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--pixel-bg)',
      }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Pixel art office visualization"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onAuxClick={handleAuxClick}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        style={{ display: 'block' }}
      />
    </div>
  )
}
