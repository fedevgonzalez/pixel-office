import { useState, useEffect } from 'react'
import type { DayNightState } from '../office/engine/dayNightCycle.js'
import { TimePeriod } from '../office/engine/dayNightCycle.js'
import {
  KIOSK_CLOCK_UPDATE_MS,
  KIOSK_CLOCK_OPACITY,
  KIOSK_CLOCK_MARGIN,
  KIOSK_STATUS_PANEL_WIDTH,
} from '../constants.js'

interface KioskClockProps {
  dayNight: DayNightState
}

const PERIOD_LABELS: Record<string, string> = {
  [TimePeriod.NIGHT]: 'Night',
  [TimePeriod.SUNRISE]: 'Sunrise',
  [TimePeriod.DAY]: 'Day',
  [TimePeriod.SUNSET]: 'Sunset',
  [TimePeriod.EVENING]: 'Evening',
} as const

/** Short weekday names for the pixel aesthetic — tight, no punctuation */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Short month names */
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function formatDate(d: Date): string {
  const day = WEEKDAYS[d.getDay()]
  const num = d.getDate()
  const mon = MONTHS[d.getMonth()]
  return `${day} ${num} ${mon}`
}

export function KioskClock({ dayNight }: KioskClockProps) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), KIOSK_CLOCK_UPDATE_MS)
    return () => clearInterval(id)
  }, [])

  const timeStr = formatTime(now)
  const dateStr = formatDate(now)
  const periodLabel = PERIOD_LABELS[dayNight.period] ?? ''

  return (
    <div
      style={{
        position: 'absolute',
        bottom: KIOSK_CLOCK_MARGIN,
        right: KIOSK_STATUS_PANEL_WIDTH + KIOSK_CLOCK_MARGIN,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 4,
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 50,
        opacity: KIOSK_CLOCK_OPACITY,
      }}
      aria-hidden="true"
    >
      {/* Time — largest, most prominent */}
      <div
        style={{
          fontFamily: 'var(--pixel-font)',
          fontSize: 48,
          fontWeight: 'bold',
          color: 'var(--pixel-text)',
          lineHeight: 1,
          letterSpacing: '0.04em',
          background: 'var(--pixel-kiosk-panel-bg)',
          border: '2px solid var(--pixel-border)',
          boxShadow: 'var(--pixel-shadow)',
          padding: '6px 12px',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {timeStr}
      </div>

      {/* Date + period — secondary row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--pixel-font)',
          fontSize: 22,
          color: 'var(--pixel-text-dim)',
          background: 'var(--pixel-kiosk-panel-bg)',
          border: '2px solid var(--pixel-border)',
          boxShadow: 'var(--pixel-shadow)',
          padding: '4px 10px',
        }}
      >
        <span>{dateStr}</span>
        {periodLabel && (
          <>
            <span style={{ color: 'var(--pixel-border)', fontSize: 14 }}>|</span>
            <span style={{ color: 'var(--pixel-accent-dim)' }}>{periodLabel}</span>
          </>
        )}
      </div>
    </div>
  )
}
