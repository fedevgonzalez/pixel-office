import { useEffect, useState } from 'react'
import type { ToolActivity } from '../types.js'
import type { OfficeState } from '../engine/officeState.js'
import type { SubagentCharacter } from '../../hooks/useExtensionMessages.js'
import {
  KIOSK_STATS_UPDATE_MS,
  KIOSK_STATS_FONT_SIZE,
  KIOSK_STATS_LABEL_FONT_SIZE,
  KIOSK_STATS_GAP_PX,
  KIOSK_STATS_OFFSET_PX,
} from '../../constants.js'

interface KioskStatsOverlayProps {
  officeState: OfficeState
  agents: number[]
  agentTools: Record<number, ToolActivity[]>
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  subagentCharacters: SubagentCharacter[]
}

function countStates(
  officeState: OfficeState,
  agents: number[],
  agentTools: Record<number, ToolActivity[]>,
  subagentTools: Record<number, Record<string, ToolActivity[]>>,
  subagentCharacters: SubagentCharacter[],
): { coding: number; waiting: number; idle: number; resting: number } {
  let coding = 0, waiting = 0, idle = 0, resting = 0

  for (const agentId of agents) {
    const ch = officeState.characters.get(agentId)
    if (!ch) continue
    if (ch.isResting) { resting++; continue }

    const tools = agentTools[agentId]
    const activeTool = tools?.slice().reverse().find((t) => !t.done && !t.status.startsWith('Subtask:'))
    if (activeTool?.permissionWait) { waiting++; continue }
    if (activeTool) { coding++; continue }
    if (tools?.some((t) => !t.done && t.status.startsWith('Subtask:'))) { coding++; continue }
    if (ch.isActive) { coding++; continue }
    idle++
  }

  for (const sub of subagentCharacters) {
    const subCh = officeState.characters.get(sub.id)
    if (!subCh) continue
    if (subCh.bubbleType === 'permission') { waiting++; continue }
    const tools = subagentTools[sub.parentAgentId]?.[sub.parentToolId]
    if (tools?.some((t) => !t.done)) coding++
  }

  return { coding, waiting, idle, resting }
}

export function KioskStatsOverlay({
  officeState,
  agents,
  agentTools,
  subagentTools,
  subagentCharacters,
}: KioskStatsOverlayProps) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), KIOSK_STATS_UPDATE_MS)
    return () => clearInterval(id)
  }, [])

  const { coding, waiting, idle, resting } = countStates(
    officeState, agents, agentTools, subagentTools, subagentCharacters,
  )

  const total = coding + waiting + idle + resting
  if (total === 0) return null

  const cells: Array<{ count: number; label: string; color: string; pulse: boolean }> = [
    { count: coding, label: coding === 1 ? 'coding' : 'coding', color: 'var(--pixel-status-active)', pulse: false },
    { count: waiting, label: waiting === 1 ? 'waiting' : 'waiting', color: 'var(--pixel-status-permission)', pulse: waiting > 0 },
    { count: idle, label: 'idle', color: 'rgba(255, 245, 235, 0.45)', pulse: false },
  ]
  if (resting > 0) {
    cells.push({ count: resting, label: 'on break', color: 'rgba(255, 245, 235, 0.35)', pulse: false })
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: KIOSK_STATS_OFFSET_PX,
        left: KIOSK_STATS_OFFSET_PX,
        display: 'flex',
        gap: KIOSK_STATS_GAP_PX,
        padding: '14px 22px',
        background: 'var(--pixel-kiosk-panel-bg)',
        backdropFilter: 'var(--pixel-kiosk-blur)',
        border: '2px solid rgba(90, 74, 106, 0.55)',
        pointerEvents: 'none',
        zIndex: 50,
        fontFamily: 'var(--pixel-font)',
        alignItems: 'baseline',
      }}
    >
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            borderLeft: i === 0 ? 'none' : '1px solid rgba(255, 245, 235, 0.12)',
            paddingLeft: i === 0 ? 0 : KIOSK_STATS_GAP_PX,
          }}
        >
          <span
            className={cell.pulse ? 'pixel-agents-pulse' : undefined}
            style={{
              fontSize: KIOSK_STATS_FONT_SIZE,
              fontWeight: 'bold',
              color: cell.count > 0 ? cell.color : 'rgba(255, 245, 235, 0.25)',
              lineHeight: 1,
            }}
          >
            {cell.count}
          </span>
          <span
            style={{
              fontSize: KIOSK_STATS_LABEL_FONT_SIZE,
              color: cell.count > 0 ? 'rgba(255, 245, 235, 0.75)' : 'rgba(255, 245, 235, 0.3)',
              lineHeight: 1,
            }}
          >
            {cell.label}
          </span>
        </div>
      ))}
    </div>
  )
}
