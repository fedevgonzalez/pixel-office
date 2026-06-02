import { useState, useEffect } from 'react'
import type { ToolActivity, AgentContext, UsageSource } from '../types.js'
import type { OfficeState } from '../engine/officeState.js'
import type { SubagentCharacter } from '../../hooks/useExtensionMessages.js'
import {
  KIOSK_STATUS_PANEL_UPDATE_MS,
  KIOSK_STATUS_PANEL_WIDTH,
  RESTING_COUNT_LABEL_FONT_SIZE,
  KIOSK_FINISHED_COLOR,
  KIOSK_AGENT_CONTEXT_BAR_HEIGHT,
  KIOSK_CONTEXT_HEALTH_BANDS,
  KIOSK_USAGE_STALE_MS,
} from '../../constants.js'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** Color for a context-occupancy fraction, per the health bands. */
function contextHealthColor(pct: number): string {
  for (const band of KIOSK_CONTEXT_HEALTH_BANDS) {
    if (pct < band.max) return band.color
  }
  return KIOSK_CONTEXT_HEALTH_BANDS[KIOSK_CONTEXT_HEALTH_BANDS.length - 1].color
}

interface KioskStatusPanelProps {
  officeState: OfficeState
  agents: number[]
  agentTools: Record<number, ToolActivity[]>
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  subagentCharacters: SubagentCharacter[]
  agentFinishedAt: Record<number, number>
  agentContext: Record<number, AgentContext>
  usageSources: UsageSource[]
}

/** Account quota block: label header + its metrics (5h / 7d) side by side. */
function UsageBlock({ source }: { source: UsageSource }) {
  const stale = Date.now() - source.updatedAt > KIOSK_USAGE_STALE_MS
  const metrics = source.metrics ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: stale ? 0.45 : 1 }}>
      <div
        style={{
          fontSize: 26,
          fontWeight: 'bold',
          color: 'rgba(255,245,235,0.9)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {source.label}
      </div>
      {metrics.length > 0 ? (
        <div style={{ display: 'flex', gap: 18 }}>
          {metrics.map((m) => (
            <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 22, color: 'rgba(255,245,235,0.55)', letterSpacing: '0.02em' }}>{m.label}</span>
                <span
                  style={{
                    fontSize: 26,
                    fontWeight: 'bold',
                    color: m.color || 'rgba(255,245,235,0.95)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {m.primary}
                </span>
              </div>
              {typeof m.percent === 'number' && (
                <div
                  style={{
                    height: 10,
                    background: 'rgba(255,245,235,0.14)',
                    border: '1px solid rgba(255,245,235,0.22)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(1, m.percent)) * 100}%`,
                      height: '100%',
                      background: m.color || 'var(--pixel-accent)',
                      transition: 'width 300ms linear',
                    }}
                  />
                </div>
              )}
              {m.secondary && (
                <span style={{ fontSize: 16, color: 'rgba(255,245,235,0.5)' }}>{m.secondary}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        source.primary && (
          <span style={{ fontSize: 26, fontWeight: 'bold', color: source.color || 'rgba(255,245,235,0.95)' }}>
            {source.primary}
          </span>
        )
      )}
    </div>
  )
}

/** Full-width context-window meter: fills to the occupancy % and is tinted by
 *  the health band (green → red). No text — color + fill are the whole signal. */
function ContextMeter({ ctx }: { ctx: AgentContext }) {
  const pct = Math.max(0, Math.min(1, ctx.pct))
  const color = contextHealthColor(pct)
  return (
    <div
      style={{
        width: '100%',
        height: KIOSK_AGENT_CONTEXT_BAR_HEIGHT,
        background: 'rgba(255, 245, 235, 0.10)',
        border: '1px solid rgba(255, 245, 235, 0.15)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${pct * 100}%`,
          height: '100%',
          background: color,
          transition: 'width 300ms linear, background-color 300ms linear',
        }}
      />
    </div>
  )
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
  agentFinishedAt,
  agentContext,
  usageSources,
}: KioskStatusPanelProps) {
  // Force periodic re-render to pick up officeState mutations (imperative state)
  // Using a longer interval since status changes propagate via props too
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), KIOSK_STATUS_PANEL_UPDATE_MS)
    return () => clearInterval(id)
  }, [])

  // Build entries: main agents first, then sub-agents grouped under parents
  const entries: { id: number; name: string; status: string; hasPermission: boolean; isRunning: boolean; isSub: boolean; justFinished: boolean }[] = []
  let restingCount = 0
  const nowMs = Date.now()

  for (const agentId of agents) {
    const ch = officeState.characters.get(agentId)
    if (!ch) continue

    // Resting agents are hidden from sidebar (shown as canvas labels instead)
    if (ch.isResting) {
      restingCount++
      continue
    }

    const { text, hasPermission, isRunning } = getAgentStatus(agentId, agentTools, ch.isActive)
    const finishedDeadline = agentFinishedAt[agentId] ?? 0
    const justFinished = finishedDeadline > nowMs && !isRunning && !hasPermission
    entries.push({
      id: agentId,
      name: ch.folderName || `Agent ${agentId}`,
      status: text,
      hasPermission,
      isRunning,
      isSub: false,
      justFinished,
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
        justFinished: false,
      })
    }
  }

  // Sort: needs approval first, then running, then just-finished (so the user
  // notices the green flash without scrolling), then plain idle.
  entries.sort((a, b) => {
    const priority = (e: typeof a) => e.hasPermission ? 0 : e.isRunning ? 1 : e.justFinished ? 2 : 3
    return priority(a) - priority(b)
  })

  if (entries.length === 0 && restingCount === 0 && usageSources.length === 0) return null

  // Clock — panel re-renders every KIOSK_STATUS_PANEL_UPDATE_MS, so reading the
  // wall clock at render keeps the minute fresh without a separate timer.
  const clockNow = new Date()
  const timeStr = `${String(clockNow.getHours()).padStart(2, '0')}:${String(clockNow.getMinutes()).padStart(2, '0')}`
  const dateStr = `${WEEKDAYS[clockNow.getDay()]} ${clockNow.getDate()} ${MONTHS[clockNow.getMonth()]}`

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
        borderLeft: '2px solid rgba(90, 74, 106, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '16px 14px',
        overflowY: 'auto',
        // Pointer events are restricted to the panel itself so users can
        // scroll long agent lists, but child elements stay non-interactive.
        pointerEvents: 'auto',
        zIndex: 50,
      }}
    >
      {entries.map((e) => {
        const isIdle = e.status === 'Idle'
        // justFinished was computed alongside entries so the sort order and
        // the rendered styling agree on a single timestamp.
        const justFinished = e.justFinished
        return (
          <div
            key={e.id}
            className={
              e.hasPermission
                ? 'pixel-permission-pulse'
                : justFinished
                  ? 'pixel-just-finished-pulse'
                  : undefined
            }
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 6,
              padding: e.isSub ? '6px 10px 6px 24px' : '10px 10px',
              background: e.hasPermission
                ? 'var(--pixel-status-permission-bg)'
                : justFinished
                  ? 'rgba(125, 211, 166, 0.10)'
                  : e.isRunning
                    ? 'rgba(232, 168, 76, 0.08)'
                    : 'transparent',
              borderLeft: e.hasPermission
                ? '4px solid var(--pixel-status-permission)'
                : justFinished
                  ? `4px solid ${KIOSK_FINISHED_COLOR}`
                  : e.isSub
                    ? '2px solid rgba(255,255,255,0.15)'
                    : 'none',
              opacity: justFinished ? 1 : isIdle ? 0.45 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Status dot */}
            <span
              className={e.isRunning && !e.hasPermission ? 'pixel-agents-pulse' : undefined}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: e.hasPermission
                  ? 'var(--pixel-status-permission)'
                  : justFinished
                    ? KIOSK_FINISHED_COLOR
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
                  color: justFinished
                    ? 'rgba(255,245,235,0.95)'
                    : isIdle
                      ? 'rgba(255,245,235,0.5)'
                      : 'rgba(255,245,235,0.9)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {e.name}
              </div>
              {(justFinished || !isIdle) && (
                <div
                  style={{
                    fontSize: e.isSub ? '26px' : '30px',
                    color: e.hasPermission
                      ? 'var(--pixel-status-permission)'
                      : justFinished
                        ? KIOSK_FINISHED_COLOR
                        : 'rgba(255, 225, 180, 0.85)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontStyle: e.isSub ? 'italic' : 'normal',
                  }}
                >
                  {justFinished ? 'Done' : e.status}
                </div>
              )}
            </div>
            </div>
            {/* Full-width context meter — main agents only (sub-agents share the
                parent's window, so a per-sub bar would mislead). */}
            {!e.isSub && agentContext[e.id] && <ContextMeter ctx={agentContext[e.id]} />}
          </div>
        )
      })}
      {/* Footer pinned to the bottom: on-break count, per-account usage, clock.
          Full panel width — reads as part of the sidebar, not a floating box. */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
        {restingCount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span
              style={{
                fontSize: `${RESTING_COUNT_LABEL_FONT_SIZE}px`,
                color: 'rgba(255, 245, 235, 0.35)',
                background: 'var(--pixel-surface-soft)',
                border: '1px solid var(--pixel-border-soft)',
                padding: '8px 16px',
                borderRadius: 0,
              }}
            >
              {restingCount} on break
            </span>
          </div>
        )}

        {usageSources.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              paddingTop: 14,
              borderTop: '2px solid rgba(90, 74, 106, 0.5)',
            }}
          >
            {usageSources.map((s) => (
              <UsageBlock key={s.id} source={s} />
            ))}
          </div>
        )}

        {/* Clock */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            paddingTop: 12,
            borderTop: '2px solid rgba(90, 74, 106, 0.5)',
          }}
        >
          <span
            style={{
              fontSize: 44,
              fontWeight: 'bold',
              color: 'rgba(255,245,235,0.95)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}
          >
            {timeStr}
          </span>
          <span style={{ fontSize: 22, color: 'rgba(255,245,235,0.5)' }}>{dateStr}</span>
        </div>
      </div>
    </div>
  )
}
