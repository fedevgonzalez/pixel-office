import { useState, useEffect, useRef, useMemo } from 'react'
import type { ToolActivity } from '../types.js'
import type { OfficeState } from '../engine/officeState.js'
import type { SubagentCharacter } from '../../hooks/useExtensionMessages.js'
import { TILE_SIZE, CharacterState } from '../types.js'
import { TOOL_OVERLAY_VERTICAL_OFFSET, CHARACTER_SITTING_OFFSET_PX, TOOL_OVERLAY_LABEL_Y_OFFSET } from '../../constants.js'
import { isKioskMode } from '../../wsClient.js'

interface ToolOverlayProps {
  officeState: OfficeState
  agents: number[]
  agentTools: Record<number, ToolActivity[]>
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  subagentCharacters: SubagentCharacter[]
  containerRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  panRef: React.RefObject<{ x: number; y: number }>
  onCloseAgent: (id: number) => void
}

/** Derive a short human-readable activity string from tools/status */
function getActivityText(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  isActive: boolean,
): string {
  const tools = agentTools[agentId]
  if (tools && tools.length > 0) {
    // Find the latest non-done tool (excluding active Task tools — those are shown differently)
    const activeTool = [...tools].reverse().find((t) => !t.done && !t.status.startsWith('Subtask:'))
    if (activeTool) {
      if (activeTool.permissionWait) return 'Needs approval'
      return activeTool.status
    }
    // Check if there's an active Task tool (sub-agent running)
    const activeTask = tools.find((t) => !t.done && t.status.startsWith('Subtask:'))
    if (activeTask) return 'Waiting for subtask'
    // All tools done but agent still active (mid-turn) — keep showing last tool status
    if (isActive) {
      const lastTool = tools[tools.length - 1]
      if (lastTool) return lastTool.status
    }
  }

  return 'Idle'
}

/** Derive activity text for a sub-agent character */
function getSubagentActivityText(
  subChar: SubagentCharacter,
  subagentTools: Record<number, Record<string, ToolActivity[]>>,
  hasPermission: boolean,
): string {
  if (hasPermission) return 'Needs approval'
  const agentSubs = subagentTools[subChar.parentAgentId]
  if (agentSubs) {
    const tools = agentSubs[subChar.parentToolId]
    if (tools && tools.length > 0) {
      const activeTool = [...tools].reverse().find((t) => !t.done)
      if (activeTool) return activeTool.status
      // All sub-tools done but sub-agent still alive — thinking
      return 'Thinking...'
    }
  }
  return subChar.label
}

export function ToolOverlay({
  officeState,
  agents,
  agentTools,
  subagentTools,
  subagentCharacters,
  containerRef,
  zoom,
  panRef,
  onCloseAgent,
}: ToolOverlayProps) {
  const [, setTick] = useState(0)
  const rectRef = useRef<DOMRect | null>(null)

  // Cache container rect via ResizeObserver (avoid getBoundingClientRect in render)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    rectRef.current = el.getBoundingClientRect()
    const observer = new ResizeObserver(() => {
      rectRef.current = el.getBoundingClientRect()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef])

  useEffect(() => {
    let rafId = 0
    // In kiosk mode, update overlay at lower rate to save CPU
    const interval = isKioskMode ? 200 : 50
    let lastUpdate = 0
    const tick = (time: number) => {
      if (!interval || time - lastUpdate >= interval) {
        lastUpdate = time
        // Update cached rect in the rAF callback (handles scroll/pan changes)
        const el = containerRef.current
        if (el) rectRef.current = el.getBoundingClientRect()
        setTick((n) => n + 1)
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [containerRef])

  // Memoized static styles — MUST be before any early return (React hook rules)
  const overflowStyle = useMemo(() => ({ overflow: 'hidden' } as const), [])
  const folderNameStyle = useMemo(() => ({
    fontSize: isKioskMode ? '28px' : '16px',
    color: 'var(--pixel-text-dim)',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    display: 'block' as const,
  }), [])
  const closeButtonStyle = useMemo(() => ({
    background: 'none',
    border: 'none',
    color: 'var(--pixel-close-text)',
    cursor: 'pointer' as const,
    padding: '0 2px',
    fontSize: '26px',
    lineHeight: 1,
    marginLeft: 2,
    flexShrink: 0,
  }), [])
  const dotSizeStyle = useMemo(() => ({
    width: isKioskMode ? 12 : 8,
    height: isKioskMode ? 12 : 8,
    borderRadius: '50%',
    flexShrink: 0,
  }), [])
  const labelBoxBase = useMemo(() => ({
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: isKioskMode ? 8 : 5,
    background: 'var(--pixel-bg)',
    borderRadius: 0,
    boxShadow: 'var(--pixel-shadow)',
    whiteSpace: 'nowrap' as const,
    maxWidth: isKioskMode ? 400 : 220,
  }), [])

  const rect = rectRef.current
  if (!rect) return null
  const dpr = window.devicePixelRatio || 1
  const canvasW = Math.round(rect.width * dpr)
  const canvasH = Math.round(rect.height * dpr)
  const layout = officeState.getLayout()
  const mapW = layout.cols * TILE_SIZE * zoom
  const mapH = layout.rows * TILE_SIZE * zoom
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x)
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y)

  const selectedId = officeState.selectedAgentId
  const hoveredId = officeState.hoveredAgentId

  // All character IDs
  const allIds = [...agents, ...subagentCharacters.map((s) => s.id)]

  return (
    <>
      {allIds.map((id) => {
        const ch = officeState.characters.get(id)
        if (!ch) return null

        const isSelected = selectedId === id
        const isHovered = hoveredId === id
        const isSub = ch.isSubagent

        if (!isKioskMode && !isSelected && !isHovered) return null

        // Position above character
        const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr
        const screenY = (deviceOffsetY + (ch.y + sittingOffset - TOOL_OVERLAY_VERTICAL_OFFSET) * zoom) / dpr

        // Get activity text
        const subHasPermission = isSub && ch.bubbleType === 'permission'
        let activityText: string
        if (isSub) {
          const sub = subagentCharacters.find((s) => s.id === id)
          activityText = sub
            ? getSubagentActivityText(sub, subagentTools, subHasPermission)
            : 'Subtask'
        } else {
          activityText = getActivityText(id, agentTools, ch.isActive)
        }

        // Determine dot color
        const tools = agentTools[id]
        const hasPermission = subHasPermission || tools?.some((t) => t.permissionWait && !t.done)
        const hasActiveTools = tools?.some((t) => !t.done)
        const isActive = ch.isActive
        // Agent is "busy" if active with any tools (including between tool calls mid-turn)
        const isBusy = isActive && tools && tools.length > 0
        // Sub-agents are active when they exist and parent Task is still running
        const subIsActive = isSub && !subHasPermission

        // In kiosk mode, hide overlay label for idle agents (sidebar shows them instead)
        if (isKioskMode && activityText === 'Idle' && !isSelected && !isHovered) return null

        let dotColor: string | null = null
        if (hasPermission) {
          dotColor = 'var(--pixel-status-permission)'
        } else if (isBusy || hasActiveTools || subIsActive) {
          dotColor = 'var(--pixel-status-active)'
        }

        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY - TOOL_OVERLAY_LABEL_Y_OFFSET,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: isSelected ? 'auto' : 'none',
              zIndex: isSelected ? 'var(--pixel-overlay-selected-z)' : 'var(--pixel-overlay-z)',
            }}
          >
            <div
              style={{
                ...labelBoxBase,
                border: isSelected
                  ? '2px solid var(--pixel-border-light)'
                  : '2px solid var(--pixel-border)',
                padding: isKioskMode
                  ? '6px 12px'
                  : isSelected ? '3px 6px 3px 8px' : '3px 8px',
              }}
            >
              {dotColor && (
                <span
                  className={isActive && !hasPermission ? 'pixel-agents-pulse' : undefined}
                  style={{ ...dotSizeStyle, background: dotColor }}
                />
              )}
              <div style={overflowStyle}>
                {isKioskMode ? (
                  <>
                    <span
                      style={{
                        fontSize: isSub ? '32px' : '38px',
                        fontStyle: isSub ? 'italic' : undefined,
                        color: 'var(--pixel-text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'block',
                      }}
                    >
                      {ch.folderName || 'Agent'}
                    </span>
                    {activityText === 'Needs approval' && (
                      <span style={folderNameStyle}>
                        {activityText}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span
                      style={{
                        fontSize: isSub ? '20px' : '22px',
                        fontStyle: isSub ? 'italic' : undefined,
                        color: 'var(--pixel-text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'block',
                      }}
                    >
                      {activityText}
                    </span>
                    {ch.folderName && (
                      <span style={folderNameStyle}>
                        {ch.folderName}
                      </span>
                    )}
                  </>
                )}
              </div>
              {isSelected && !isSub && !isKioskMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseAgent(id)
                  }}
                  title="Close agent"
                  aria-label="Close agent"
                  className="pixel-close-btn"
                  style={closeButtonStyle}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}
