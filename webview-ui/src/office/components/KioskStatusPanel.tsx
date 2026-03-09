import { useState, useEffect } from 'react'
import type { ToolActivity } from '../types.js'
import type { OfficeState } from '../engine/officeState.js'
import type { SubagentCharacter } from '../../hooks/useExtensionMessages.js'
import { KIOSK_STATUS_PANEL_UPDATE_MS, KIOSK_STATUS_PANEL_WIDTH } from '../../constants.js'

interface KioskStatusPanelProps {
  officeState: OfficeState
  agents: number[]
  agentTools: Record<number, ToolActivity[]>
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  subagentCharacters: SubagentCharacter[]
}

function getAgentStatus(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  isActive: boolean,
): { text: string; hasPermission: boolean; isRunning: boolean } {
  const tools = agentTools[agentId]
  if (tools && tools.length > 0) {
    const activeTool = [...tools].reverse().find((t) => !t.done && !t.status.startsWith('Subtask:'))
    if (activeTool) {
      if (activeTool.permissionWait) return { text: 'Needs approval', hasPermission: true, isRunning: false }
      return { text: activeTool.status, hasPermission: false, isRunning: true }
    }
    const activeTask = tools.find((t) => !t.done && t.status.startsWith('Subtask:'))
    if (activeTask) return { text: 'Waiting for subtask', hasPermission: false, isRunning: true }
    if (isActive) {
      const lastTool = tools[tools.length - 1]
      if (lastTool) return { text: lastTool.status, hasPermission: false, isRunning: true }
    }
  }
  return { text: 'Idle', hasPermission: false, isRunning: false }
}

function getSubStatus(
  sub: SubagentCharacter,
  subagentTools: Record<number, Record<string, ToolActivity[]>>,
  hasPermission: boolean,
): { text: string; hasPermission: boolean; isRunning: boolean } {
  if (hasPermission) return { text: 'Needs approval', hasPermission: true, isRunning: false }
  const agentSubs = subagentTools[sub.parentAgentId]
  if (agentSubs) {
    const tools = agentSubs[sub.parentToolId]
    if (tools && tools.length > 0) {
      const activeTool = [...tools].reverse().find((t) => !t.done)
      if (activeTool) return { text: activeTool.status, hasPermission: false, isRunning: true }
      return { text: 'Thinking...', hasPermission: false, isRunning: true }
    }
  }
  return { text: sub.label, hasPermission: false, isRunning: true }
}

export function KioskStatusPanel({
  officeState,
  agents,
  agentTools,
  subagentTools,
  subagentCharacters,
}: KioskStatusPanelProps) {
  // Force periodic re-render to pick up officeState mutations (imperative state)
  // Using a longer interval since status changes propagate via props too
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), KIOSK_STATUS_PANEL_UPDATE_MS)
    return () => clearInterval(id)
  }, [])

  // Build entries: main agents first, then sub-agents grouped under parents
  const entries: { id: number; name: string; status: string; hasPermission: boolean; isRunning: boolean; isSub: boolean }[] = []

  for (const agentId of agents) {
    const ch = officeState.characters.get(agentId)
    if (!ch) continue
    const { text, hasPermission, isRunning } = getAgentStatus(agentId, agentTools, ch.isActive)
    entries.push({
      id: agentId,
      name: ch.folderName || `Agent ${agentId}`,
      status: text,
      hasPermission,
      isRunning,
      isSub: false,
    })

    // Sub-agents under this parent
    for (const sub of subagentCharacters) {
      if (sub.parentAgentId !== agentId) continue
      const subCh = officeState.characters.get(sub.id)
      if (!subCh) continue
      const subHasPerm = subCh.bubbleType === 'permission'
      const subInfo = getSubStatus(sub, subagentTools, subHasPerm)
      entries.push({
        id: sub.id,
        name: sub.label.replace('Subtask: ', ''),
        status: subInfo.text,
        hasPermission: subInfo.hasPermission,
        isRunning: subInfo.isRunning,
        isSub: true,
      })
    }
  }

  if (entries.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: KIOSK_STATUS_PANEL_WIDTH,
        background: 'var(--pixel-kiosk-panel-bg)',
        backdropFilter: 'var(--pixel-kiosk-blur)',
        borderLeft: '2px solid rgba(74, 74, 106, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '16px 14px',
        overflowY: 'auto',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      {entries.map((e) => {
        const isIdle = e.status === 'Idle'
        return (
          <div
            key={e.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: e.isSub ? '6px 10px 6px 24px' : '10px 10px',
              background: e.hasPermission
                ? 'var(--pixel-status-permission-bg)'
                : e.isRunning
                  ? 'rgba(232, 168, 76, 0.08)'
                  : 'transparent',
              borderLeft: e.isSub ? '2px solid rgba(255,255,255,0.15)' : 'none',
              opacity: isIdle ? 0.45 : 1,
            }}
          >
            {/* Status dot */}
            <span
              className={e.isRunning && !e.hasPermission ? 'pixel-agents-pulse' : undefined}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: e.hasPermission
                  ? 'var(--pixel-status-permission)'
                  : e.isRunning
                    ? 'var(--pixel-status-active)'
                    : 'rgba(255,245,235,0.2)',
                flexShrink: 0,
              }}
            />
            <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: e.isSub ? '30px' : '38px',
                  fontWeight: e.isSub ? 'normal' : 'bold',
                  color: isIdle ? 'rgba(255,245,235,0.5)' : 'rgba(255,245,235,0.9)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {e.name}
              </div>
              {!isIdle && (
                <div
                  style={{
                    fontSize: e.isSub ? '26px' : '30px',
                    color: e.hasPermission
                      ? 'var(--pixel-status-permission)'
                      : 'rgba(255, 225, 180, 0.85)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontStyle: e.isSub ? 'italic' : 'normal',
                  }}
                >
                  {e.status}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
