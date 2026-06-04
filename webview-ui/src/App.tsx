import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { OfficeState } from './office/engine/officeState.js'
import { OfficeCanvas } from './office/components/OfficeCanvas.js'
import { ToolOverlay } from './office/components/ToolOverlay.js'
import { KioskStatusPanel } from './office/components/KioskStatusPanel.js'
import { KioskStatsOverlay } from './office/components/KioskStatsOverlay.js'
import { EditorToolbar } from './office/editor/EditorToolbar.js'
import { EditorState } from './office/editor/editorState.js'
import { ShareThemeModal } from './components/ShareThemeModal.js'
import { EditTool } from './office/types.js'
import type { PlacedPet, PetColors, WorldBackgroundTheme, CustomThemePreset } from './office/types.js'
import { isRotatable } from './office/layout/furnitureCatalog.js'
import { ws } from './wsClient.js'
import { useExtensionMessages } from './hooks/useExtensionMessages.js'
import { PULSE_ANIMATION_DURATION_SEC, KIOSK_MIN_BOOT_LOADER_MS } from './constants.js'
import { useEditorActions } from './hooks/useEditorActions.js'
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js'
import { useScreenWakeLock } from './hooks/useScreenWakeLock.js'
import { ZoomControls } from './components/ZoomControls.js'
import { BottomToolbar } from './components/BottomToolbar.js'
import { DebugView } from './components/DebugView.js'
import { Toast } from './components/Toast.js'
import { isKioskMode, isScreenshotMode } from './wsClient.js'
import { useDayNight } from './hooks/useDayNight.js'

// Game state lives outside React — updated imperatively by message handlers
const officeStateRef = { current: null as OfficeState | null }
const editorState = new EditorState()

function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState()
  }
  // Debug: expose on window for runtime inspection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).__officeState = officeStateRef.current
  return officeStateRef.current
}

const actionBarBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: '24px',
  background: 'var(--pixel-btn-bg)',
  color: 'var(--pixel-text-dim)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

const actionBarBtnDisabled: React.CSSProperties = {
  ...actionBarBtnStyle,
  opacity: 'var(--pixel-btn-disabled-opacity)',
  cursor: 'default',
}

function EditActionBar({ editor, editorState: es }: { editor: ReturnType<typeof useEditorActions>; editorState: EditorState }) {
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const undoDisabled = es.undoStack.length === 0
  const redoDisabled = es.redoStack.length === 0

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--pixel-controls-z)',
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-border)',
        borderRadius: 0,
        padding: '4px 8px',
        boxShadow: 'var(--pixel-shadow)',
      }}
    >
      <button
        style={undoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={undoDisabled ? undefined : editor.handleUndo}
        disabled={undoDisabled}
        title="Undo (Ctrl+Z)"
      >
        Undo
      </button>
      <button
        style={redoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={redoDisabled ? undefined : editor.handleRedo}
        disabled={redoDisabled}
        title="Redo (Ctrl+Y)"
      >
        Redo
      </button>
      <button
        style={actionBarBtnStyle}
        onClick={editor.handleSave}
        title="Save layout"
      >
        Save
      </button>
      {!showResetConfirm ? (
        <button
          style={actionBarBtnStyle}
          onClick={() => setShowResetConfirm(true)}
          title="Reset to last saved layout"
        >
          Reset
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: '22px', color: 'var(--pixel-reset-text)' }}>Reset?</span>
          <button
            style={{ ...actionBarBtnStyle, background: 'var(--pixel-danger-bg)', color: 'var(--pixel-text)' }}
            onClick={() => { setShowResetConfirm(false); editor.handleReset() }}
          >
            Yes
          </button>
          <button
            style={actionBarBtnStyle}
            onClick={() => setShowResetConfirm(false)}
          >
            No
          </button>
        </div>
      )}
    </div>
  )
}

function App() {
  // Keep the display awake whenever the webview is mounted (in any mode
  // except CI screenshots). Critical for the kiosk display, which would
  // otherwise let X11/Wayland sleep the monitor after the OS idle timeout
  // even though pixel-office itself is still running.
  useScreenWakeLock(!isScreenshotMode)

  const editor = useEditorActions(getOfficeState, editorState)

  const isEditDirty = useCallback(() => editor.isEditMode && editor.isDirty, [editor.isEditMode, editor.isDirty])

  const { agents, selectedAgent, agentTools, agentStatuses, subagentTools, subagentCharacters, layoutReady, loadedAssets, petTemplates, customThemes, dailySummaryActive, agentContext, agentFinishedAt, usageSources } = useExtensionMessages(getOfficeState, editor.setLastSavedLayout, isEditDirty)

  const dayNight = useDayNight()

  // Kiosk boot: hold the loader on screen for a minimum time so the wall
  // display never flashes a half-loaded office while assets/agents settle.
  const [kioskBootDelayDone, setKioskBootDelayDone] = useState(!isKioskMode)
  useEffect(() => {
    if (!isKioskMode) return undefined
    const t = setTimeout(() => setKioskBootDelayDone(true), KIOSK_MIN_BOOT_LOADER_MS)
    return () => clearTimeout(t)
  }, [])

  // Kiosk camera focus: only zoom in on agents that need user attention
  // (pending permission). Otherwise the camera shows the full office so pets,
  // props, and idle agents stay visible — the sidepanel narrates activity.
  const kioskFocusAgentIds = useMemo<number[] | undefined>(() => {
    if (!isKioskMode) return undefined
    const ids: number[] = []
    for (const key of Object.keys(agentTools)) {
      const id = Number(key)
      const tools = agentTools[id]
      if (tools && tools.some((t) => t.permissionWait && !t.done)) {
        ids.push(id)
      }
    }
    return ids
  }, [agentTools])

  const [isDebugMode, setIsDebugMode] = useState(false)
  const [petVersion, setPetVersion] = useState(0)
  // The custom theme being shared to the gallery (null = modal closed).
  const [shareTheme, setShareTheme] = useState<CustomThemePreset | null>(null)

  const handleToggleDebugMode = useCallback(() => setIsDebugMode((prev) => !prev), [])

  const handleShareTheme = useCallback((preset: CustomThemePreset) => {
    setShareTheme(preset)
  }, [])

  const handleSelectAgent = useCallback((id: number) => {
    ws.postMessage({ type: 'focusAgent', id })
  }, [])

  const containerRef = useRef<HTMLDivElement>(null)

  const [editorTickForKeyboard, setEditorTickForKeyboard] = useState(0)
  useEditorKeyboard(
    editor.isEditMode,
    editorState,
    editor.handleDeleteSelected,
    editor.handleRotateSelected,
    editor.handleToggleState,
    editor.handleUndo,
    editor.handleRedo,
    useCallback(() => setEditorTickForKeyboard((n) => n + 1), []),
    editor.handleToggleEditMode,
  )

  const handleCloseAgent = useCallback((id: number) => {
    ws.postMessage({ type: 'closeAgent', id })
  }, [])

  const handleAddPet = useCallback((petData: Omit<PlacedPet, 'uid' | 'col' | 'row'>) => {
    const os = getOfficeState()
    const walkable = os.walkableTiles
    if (walkable.length === 0) return
    // Pick a random walkable tile
    const tile = walkable[Math.floor(Math.random() * walkable.length)]
    const uid = `pet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const pet: PlacedPet = {
      uid,
      species: petData.species,
      name: petData.name,
      col: tile.col,
      row: tile.row,
      petColors: petData.petColors,
      personality: petData.personality,
      variant: petData.variant,
      variantColors: petData.variantColors,
      backstory: petData.backstory,
      voiceStyle: petData.voiceStyle,
    }
    // Add to layout
    const layout = os.getLayout()
    const pets = [...(layout.pets || []), pet]
    const newLayout = { ...layout, pets }
    os.rebuildFromLayout(newLayout)
    // Save
    ws.postMessage({ type: 'saveLayout', layout: newLayout })
    setPetVersion(v => v + 1)
  }, [])

  const handleDeletePet = useCallback((uid: string) => {
    const os = getOfficeState()
    const newLayout = os.deletePet(uid)
    if (newLayout) {
      ws.postMessage({ type: 'saveLayout', layout: newLayout })
      setPetVersion(v => v + 1)
    }
  }, [])

  const handleEditPet = useCallback((uid: string, updates: { name?: string; petColors?: PetColors; personality?: string; variant?: string | null; variantColors?: Record<string, string> | null; backstory?: string | null; voiceStyle?: string | null }) => {
    const os = getOfficeState()
    const newLayout = os.editPet(uid, updates)
    if (newLayout) {
      ws.postMessage({ type: 'saveLayout', layout: newLayout })
      setPetVersion(v => v + 1)
    }
  }, [])

  const handleBackgroundThemeChange = useCallback((theme: WorldBackgroundTheme) => {
    const os = getOfficeState()
    const layout = os.getLayout()
    const newLayout = { ...layout, background: { ...(layout.background || {}), theme } }
    os.rebuildFromLayout(newLayout)
    ws.postMessage({ type: 'saveLayout', layout: newLayout })
  }, [])

  const handleClick = useCallback((agentId: number) => {
    // If clicked agent is a sub-agent, focus the parent's terminal instead
    const os = getOfficeState()
    const meta = os.subagentMeta.get(agentId)
    const focusId = meta ? meta.parentAgentId : agentId
    ws.postMessage({ type: 'focusAgent', id: focusId })
  }, [])

  const officeState = getOfficeState()

  // Force dependency on editorTickForKeyboard to propagate keyboard-triggered re-renders
  void editorTickForKeyboard
  // Force dependency on petVersion so modal re-renders after add/delete/edit
  void petVersion

  // Show "Press R to rotate" hint when a rotatable item is selected or being placed
  const showRotateHint = editor.isEditMode && (() => {
    if (editorState.selectedFurnitureUid) {
      const item = officeState.getLayout().furniture.find((f) => f.uid === editorState.selectedFurnitureUid)
      if (item && isRotatable(item.type)) return true
    }
    if (editorState.activeTool === EditTool.FURNITURE_PLACE && isRotatable(editorState.selectedFurnitureType)) {
      return true
    }
    return false
  })()

  if (!layoutReady || !kioskBootDelayDone) {
    // Screenshot mode: render a bare dark stage so CI tooling that waits on
    // data-screenshot-ready never captures the loading placeholder.
    if (isScreenshotMode) {
      return <div style={{ width: '100%', height: '100%', background: 'var(--pixel-bg)' }} />
    }
    // Boot loader: pixel-art coffee mug filling up (styles in index.css).
    return (
      <div
        role="status"
        aria-label="Loading"
        style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--pixel-bg)' }}
      >
        <div className="pixel-loader-coffee" />
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }} {...(isScreenshotMode ? { 'data-screenshot-ready': 'true' } : {})}>
      <style>{`
        @keyframes pixel-agents-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .pixel-agents-pulse { animation: pixel-agents-pulse ${PULSE_ANIMATION_DURATION_SEC}s ease-in-out infinite; }
        @keyframes pixel-permission-pulse {
          0%, 100% { background-color: rgba(232, 80, 58, 0.08); box-shadow: inset 0 0 0 0 rgba(232, 80, 58, 0); }
          50%      { background-color: rgba(232, 80, 58, 0.28); box-shadow: inset 0 0 22px 0 rgba(232, 80, 58, 0.35); }
        }
        .pixel-permission-pulse { animation: pixel-permission-pulse 1.1s ease-in-out infinite; }
        @keyframes pixel-just-finished-pulse {
          0%, 100% { background-color: rgba(125, 211, 166, 0.10); box-shadow: inset 0 0 0 0 rgba(125, 211, 166, 0); }
          50%      { background-color: rgba(125, 211, 166, 0.28); box-shadow: inset 0 0 22px 0 rgba(125, 211, 166, 0.35); }
        }
        .pixel-just-finished-pulse { animation: pixel-just-finished-pulse 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .pixel-permission-pulse { animation: none; }
          .pixel-just-finished-pulse { animation: none; }
        }
      `}</style>

      <OfficeCanvas
        officeState={officeState}
        onClick={handleClick}
        isEditMode={editor.isEditMode}
        editorState={editorState}
        onEditorTileAction={editor.handleEditorTileAction}
        onEditorEraseAction={editor.handleEditorEraseAction}
        onEditorBoundaryClear={editor.handleEditorBoundaryClear}
        onEditorInteractionRemove={editor.handleEditorInteractionRemove}
        onEditorSelectionChange={editor.handleEditorSelectionChange}
        onDeleteSelected={editor.handleDeleteSelected}
        onRotateSelected={editor.handleRotateSelected}
        onDragMove={editor.handleDragMove}
        editorTick={editor.editorTick}
        zoom={editor.zoom}
        onZoomChange={editor.handleZoomChange}
        panRef={editor.panRef}
        dayNight={dayNight.state}
        kioskFocusAgentIds={kioskFocusAgentIds}
      />

      {!isKioskMode && !isScreenshotMode && <ZoomControls zoom={editor.zoom} onZoomChange={editor.handleZoomChange} />}

      {/* Vignette overlay */}
      {!isScreenshotMode && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--pixel-vignette)',
            pointerEvents: 'none',
            zIndex: 40,
          }}
        />
      )}

      {!isKioskMode && !isScreenshotMode && (
        <BottomToolbar
          isEditMode={editor.isEditMode}
          onToggleEditMode={editor.handleToggleEditMode}
          isDebugMode={isDebugMode}
          onToggleDebugMode={handleToggleDebugMode}
          pets={officeState.getLayout().pets || []}
          onAddPet={handleAddPet}
          onDeletePet={handleDeletePet}
          onEditPet={handleEditPet}
          petTemplates={petTemplates}
          getLayout={() => getOfficeState().getLayout()}
          dayNight={dayNight}
          backgroundTheme={getOfficeState().getLayout().background?.theme}
          onBackgroundThemeChange={handleBackgroundThemeChange}
          onUseGalleryTheme={editor.handleApplyGalleryTheme}
        />
      )}

      {!isKioskMode && editor.isEditMode && editor.isDirty && (
        <EditActionBar editor={editor} editorState={editorState} />
      )}

      {!isKioskMode && showRotateHint && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: editor.isDirty ? 'translateX(calc(-50% + 100px))' : 'translateX(-50%)',
            zIndex: 49,
            background: 'var(--pixel-hint-bg)',
            color: 'var(--pixel-text)',
            fontSize: '20px',
            padding: '3px 8px',
            borderRadius: 0,
            border: '2px solid var(--pixel-accent)',
            boxShadow: 'var(--pixel-shadow)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Press <b>R</b> to rotate
        </div>
      )}

      {!isKioskMode && editor.isEditMode && (() => {
        // Compute selected furniture color from current layout
        const selUid = editorState.selectedFurnitureUid
        const layout = officeState.getLayout()
        const selColor = selUid
          ? layout.furniture.find((f) => f.uid === selUid)?.color ?? null
          : null
        return (
          <EditorToolbar
            activeTool={editorState.activeTool}
            selectedTileType={editorState.selectedTileType}
            selectedFurnitureType={editorState.selectedFurnitureType}
            selectedFurnitureUid={selUid}
            selectedFurnitureColor={selColor}
            floorColor={editorState.floorColor}
            wallColor={editorState.wallColor}
            onToolChange={editor.handleToolChange}
            onTileTypeChange={editor.handleTileTypeChange}
            onFloorColorChange={editor.handleFloorColorChange}
            onWallColorChange={editor.handleWallColorChange}
            onSelectedFurnitureColorChange={editor.handleSelectedFurnitureColorChange}
            onFurnitureTypeChange={editor.handleFurnitureTypeChange}
            loadedAssets={loadedAssets}
            cols={layout.cols}
            rows={layout.rows}
            onResizeEdge={editor.handleResizeEdge}
            resizeMessage={editor.resizeMessage}
            activeBoundaryActor={editorState.activeBoundaryActor}
            onBoundaryActorChange={editor.handleBoundaryActorChange}
            movementBoundary={layout.movementBoundary}
            selectedZoneType={editorState.selectedZoneType}
            onZoneTypeChange={editor.handleZoneTypeChange}
            selectedInteractionType={editorState.selectedInteractionType}
            onInteractionTypeChange={editor.handleInteractionTypeChange}
            customThemes={customThemes}
            activeThemeId={layout.background?.themeId ?? layout.background?.theme}
            onApplyTheme={editor.handleApplyTheme}
            onSaveCustomTheme={editor.handleSaveCustomTheme}
            onImportCustomTheme={editor.handleImportCustomTheme}
            onDeleteCustomTheme={editor.handleDeleteCustomTheme}
            onShareTheme={handleShareTheme}
          />
        )
      })()}

      {!isKioskMode && (
        <ShareThemeModal
          isOpen={shareTheme !== null}
          onClose={() => setShareTheme(null)}
          theme={shareTheme}
        />
      )}

      {!isKioskMode && !isScreenshotMode && agents.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 45,
            opacity: 0.6,
          }}
        >
          <div style={{ fontSize: '28px', color: 'rgba(255, 245, 235, 0.85)', marginBottom: 8 }}>
            Waiting for agents...
          </div>
          <div style={{ fontSize: '18px', color: 'rgba(255, 245, 235, 0.55)' }}>
            Start a Claude Code session to see your agents here
          </div>
        </div>
      )}

      {!isScreenshotMode && !dailySummaryActive && (
        <ToolOverlay
          officeState={officeState}
          agents={agents}
          agentTools={agentTools}
          subagentTools={subagentTools}
          subagentCharacters={subagentCharacters}
          containerRef={containerRef}
          zoom={editor.zoom}
          panRef={editor.panRef}
          onCloseAgent={handleCloseAgent}
        />
      )}

      {isKioskMode && !isScreenshotMode && !dailySummaryActive && (
        <KioskStatusPanel
          officeState={officeState}
          agents={agents}
          agentTools={agentTools}
          subagentTools={subagentTools}
          subagentCharacters={subagentCharacters}
          agentFinishedAt={agentFinishedAt}
          agentContext={agentContext}
          usageSources={usageSources}
        />
      )}

      {isKioskMode && !isScreenshotMode && !dailySummaryActive && (
        <KioskStatsOverlay
          officeState={officeState}
          agents={agents}
          agentTools={agentTools}
          subagentTools={subagentTools}
          subagentCharacters={subagentCharacters}
        />
      )}

      {isKioskMode && !isScreenshotMode && agents.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 45,
          }}
        >
          <div
            className="pixel-agents-pulse"
            style={{
              fontSize: '56px',
              color: 'rgba(255, 245, 235, 0.85)',
              marginBottom: 14,
              textShadow: '0 2px 0 rgba(0,0,0,0.6)',
              letterSpacing: '2px',
            }}
          >
            Waiting for agents...
          </div>
          <div style={{ fontSize: '24px', color: 'rgba(255, 245, 235, 0.5)', textShadow: '0 1px 0 rgba(0,0,0,0.6)' }}>
            The office is quiet. Start a Claude Code session to see characters arrive.
          </div>
        </div>
      )}


      {!isKioskMode && isDebugMode && (
        <DebugView
          agents={agents}
          selectedAgent={selectedAgent}
          agentTools={agentTools}
          agentStatuses={agentStatuses}
          subagentTools={subagentTools}
          onSelectAgent={handleSelectAgent}
        />
      )}

      {/* Transient confirmations (import success, share submitted, pet saved…) */}
      {!isScreenshotMode && <Toast />}
    </div>
  )
}

export default App
