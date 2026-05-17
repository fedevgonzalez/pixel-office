import { useState, useCallback, useRef } from 'react'
import { OfficeState } from './office/engine/officeState.js'
import { OfficeCanvas } from './office/components/OfficeCanvas.js'
import { ToolOverlay } from './office/components/ToolOverlay.js'
import { KioskStatusPanel } from './office/components/KioskStatusPanel.js'
import { KioskStatsOverlay } from './office/components/KioskStatsOverlay.js'
import { EditorToolbar } from './office/editor/EditorToolbar.js'
import { EditorState } from './office/editor/editorState.js'
import { EditTool } from './office/types.js'
import type { PlacedPet, PetColors, WorldBackgroundTheme } from './office/types.js'
import { isRotatable } from './office/layout/furnitureCatalog.js'
import { ws } from './wsClient.js'
import { useExtensionMessages } from './hooks/useExtensionMessages.js'
import { PULSE_ANIMATION_DURATION_SEC } from './constants.js'
import { useEditorActions } from './hooks/useEditorActions.js'
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js'
import { ZoomControls } from './components/ZoomControls.js'
import { BottomToolbar } from './components/BottomToolbar.js'
import { DebugView } from './components/DebugView.js'
import { KioskClock } from './components/KioskClock.js'
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
            style={{ ...actionBarBtnStyle, background: 'var(--pixel-danger-bg)', color: '#fff' }}
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
  const editor = useEditorActions(getOfficeState, editorState)

  const isEditDirty = useCallback(() => editor.isEditMode && editor.isDirty, [editor.isEditMode, editor.isDirty])

  const { agents, selectedAgent, agentTools, agentStatuses, subagentTools, subagentCharacters, layoutReady, loadedAssets, petTemplates } = useExtensionMessages(getOfficeState, editor.setLastSavedLayout, isEditDirty)

  const dayNight = useDayNight()

  const [isDebugMode, setIsDebugMode] = useState(false)
  const [petVersion, setPetVersion] = useState(0)

  const handleToggleDebugMode = useCallback(() => setIsDebugMode((prev) => !prev), [])

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

  const handleEditPet = useCallback((uid: string, updates: { name?: string; petColors?: PetColors; personality?: string; variant?: string | null }) => {
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

  if (!layoutReady) {
    return (
      <div role="status" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pixel-text)' }}>
        <span
          className="pixel-agents-pulse"
          style={{
            background: 'var(--pixel-bg)',
            border: '2px solid var(--pixel-border)',
            padding: '12px 24px',
            boxShadow: 'var(--pixel-shadow)',
            borderRadius: 0,
          }}
        >
          Loading...
        </span>
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
        @media (prefers-reduced-motion: reduce) {
          .pixel-permission-pulse { animation: none; }
        }
      `}</style>

      <OfficeCanvas
        officeState={officeState}
        onClick={handleClick}
        isEditMode={editor.isEditMode}
        editorState={editorState}
        onEditorTileAction={editor.handleEditorTileAction}
        onEditorEraseAction={editor.handleEditorEraseAction}
        onEditorSelectionChange={editor.handleEditorSelectionChange}
        onDeleteSelected={editor.handleDeleteSelected}
        onRotateSelected={editor.handleRotateSelected}
        onDragMove={editor.handleDragMove}
        editorTick={editor.editorTick}
        zoom={editor.zoom}
        onZoomChange={editor.handleZoomChange}
        panRef={editor.panRef}
        dayNight={dayNight.state}
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
            color: '#fff',
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
        const selColor = selUid
          ? officeState.getLayout().furniture.find((f) => f.uid === selUid)?.color ?? null
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
          />
        )
      })()}

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

      {!isScreenshotMode && (
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

      {isKioskMode && !isScreenshotMode && (
        <KioskStatusPanel
          officeState={officeState}
          agents={agents}
          agentTools={agentTools}
          subagentTools={subagentTools}
          subagentCharacters={subagentCharacters}
        />
      )}

      {isKioskMode && !isScreenshotMode && (
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

      {isKioskMode && !isScreenshotMode && (
        <KioskClock dayNight={dayNight.state} />
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
    </div>
  )
}

export default App
