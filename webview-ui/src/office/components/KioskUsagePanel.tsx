import { useEffect, useState } from 'react'
import type { UsageSource } from '../types.js'
import {
  KIOSK_USAGE_MARGIN,
  KIOSK_USAGE_OPACITY,
  KIOSK_USAGE_GAP_PX,
  KIOSK_USAGE_LABEL_FONT_SIZE,
  KIOSK_USAGE_PRIMARY_FONT_SIZE,
  KIOSK_USAGE_SECONDARY_FONT_SIZE,
  KIOSK_USAGE_BAR_WIDTH,
  KIOSK_USAGE_BAR_HEIGHT,
  KIOSK_USAGE_STALE_MS,
} from '../../constants.js'

interface KioskUsagePanelProps {
  sources: UsageSource[]
}

const STALE_TICK_MS = 5_000

export function KioskUsagePanel({ sources }: KioskUsagePanelProps) {
  // Re-render periodically so the "stale" marker updates without server pushes.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), STALE_TICK_MS)
    return () => clearInterval(id)
  }, [])

  if (sources.length === 0) return null
  const now = Date.now()

  return (
    <div
      style={{
        position: 'absolute',
        bottom: KIOSK_USAGE_MARGIN,
        right: KIOSK_USAGE_MARGIN,
        display: 'flex',
        flexDirection: 'column',
        gap: KIOSK_USAGE_GAP_PX,
        padding: '10px 14px',
        background: 'var(--pixel-kiosk-panel-bg)',
        backdropFilter: 'var(--pixel-kiosk-blur)',
        border: '2px solid var(--pixel-border)',
        boxShadow: 'var(--pixel-shadow)',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 50,
        opacity: KIOSK_USAGE_OPACITY,
        fontFamily: 'var(--pixel-font)',
        minWidth: KIOSK_USAGE_BAR_WIDTH + 28,
      }}
      aria-hidden="true"
    >
      {sources.map((s) => {
        const stale = now - s.updatedAt > KIOSK_USAGE_STALE_MS
        const barColor = s.color || 'var(--pixel-accent)'
        const pct = typeof s.percent === 'number' ? Math.max(0, Math.min(1, s.percent)) : null
        return (
          <div key={s.id} style={{ opacity: stale ? 0.45 : 1 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 10,
              }}
            >
              <span
                style={{
                  fontSize: KIOSK_USAGE_LABEL_FONT_SIZE,
                  color: 'var(--pixel-text-dim)',
                  lineHeight: 1.1,
                  letterSpacing: '0.02em',
                }}
              >
                {s.label}
              </span>
              <span
                style={{
                  fontSize: KIOSK_USAGE_PRIMARY_FONT_SIZE,
                  color: 'var(--pixel-text)',
                  lineHeight: 1.1,
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 'bold',
                }}
              >
                {s.primary}
              </span>
            </div>
            {pct !== null && (
              <div
                style={{
                  width: KIOSK_USAGE_BAR_WIDTH,
                  height: KIOSK_USAGE_BAR_HEIGHT,
                  marginTop: 4,
                  background: 'rgba(255, 245, 235, 0.12)',
                  border: '1px solid rgba(255, 245, 235, 0.18)',
                }}
              >
                <div
                  style={{
                    width: `${pct * 100}%`,
                    height: '100%',
                    background: barColor,
                  }}
                />
              </div>
            )}
            {s.secondary && (
              <div
                style={{
                  marginTop: 2,
                  fontSize: KIOSK_USAGE_SECONDARY_FONT_SIZE,
                  color: 'var(--pixel-text-dim)',
                  opacity: 0.75,
                  lineHeight: 1.2,
                }}
              >
                {stale ? `${s.secondary} (stale)` : s.secondary}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
