import { useState, useEffect } from 'react'
import { useModalFocus } from '../hooks/useModalFocus.js'
import { ws } from '../wsClient.js'
import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js'
import { TimeMode, Hemisphere } from '../office/engine/dayNightCycle.js'
import type { DayNightState } from '../office/engine/dayNightCycle.js'
import type { WorldBackgroundTheme } from '../office/types.js'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  isDebugMode: boolean
  onToggleDebugMode: () => void
  dayNight?: {
    state: DayNightState
    mode: TimeMode
    setMode: (m: TimeMode) => void
    hemisphere: Hemisphere
    setHemisphere: (h: Hemisphere) => void
  }
  backgroundTheme?: WorldBackgroundTheme
  onBackgroundThemeChange?: (theme: WorldBackgroundTheme) => void
}

// ── Style constants ──────────────────────────────────────────────────────────

const modal: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 50,
  background: 'var(--pixel-bg)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  boxShadow: 'var(--pixel-shadow)',
  // Constrain width so nothing overflows at small viewports
  width: 'min(360px, calc(100vw - 32px))',
  boxSizing: 'border-box' as const,
}

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 12px',
  borderBottom: '1px solid var(--pixel-border)',
}

// Row used for toggle items
const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '8px 12px',
  fontSize: '22px',
  color: 'var(--pixel-text)',
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  cursor: 'pointer',
  textAlign: 'left',
  boxSizing: 'border-box' as const,
}

// Non-interactive row for select/toggle controls — wraps on narrow viewports
const configRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '8px',
  width: '100%',
  padding: '8px 12px',
  fontSize: '22px',
  color: 'var(--pixel-text)',
  boxSizing: 'border-box' as const,
}

// Section label — sits above a group of items
const sectionLabel: React.CSSProperties = {
  padding: '8px 12px 4px',
  fontSize: '14px',
  color: 'var(--pixel-text-hint)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  borderLeft: '2px solid var(--pixel-accent)',
  marginLeft: '4px',
  marginTop: '8px',
}

// Divider between sections
const divider: React.CSSProperties = {
  borderTop: '1px solid var(--pixel-border)',
  marginTop: '8px',
}

// Checkbox square indicator
const checkbox = (checked: boolean): React.CSSProperties => ({
  width: 18,
  height: 18,
  border: '2px solid var(--pixel-border-light)',
  borderRadius: 0,
  background: checked ? 'var(--pixel-accent)' : 'transparent',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '13px',
  lineHeight: 1,
  color: 'rgba(255, 245, 235, 0.95)',
})

// Styled select — overrides browser chrome with pixel tokens
const selectInput: React.CSSProperties = {
  padding: '4px 24px 4px 8px',
  fontSize: '18px',
  color: 'var(--pixel-text)',
  background: 'var(--pixel-surface)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage:
    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%237a6a8a\'/%3E%3C/svg%3E")',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 6px center',
  // Flexible width — fills available space within the row
  flex: '1 1 auto',
  minWidth: 0,
  maxWidth: '100%',
}

// Hemisphere cycle button
const hemisphereCycleBtn = (active: boolean): React.CSSProperties => ({
  padding: '4px 10px',
  fontSize: '18px',
  color: active ? 'var(--pixel-accent)' : 'var(--pixel-text-dim)',
  background: active ? 'var(--pixel-active-bg)' : 'var(--pixel-surface)',
  border: `2px solid ${active ? 'var(--pixel-accent)' : 'var(--pixel-border)'}`,
  borderRadius: 0,
  cursor: 'pointer',
  flex: '1 1 0',
  textAlign: 'center' as const,
})

// Current state status text (period + time)
const statusText: React.CSSProperties = {
  padding: '2px 12px 10px',
  fontSize: '16px',
  color: 'var(--pixel-text-dim)',
  display: 'flex',
  gap: 6,
  alignItems: 'center',
}

// About section
const aboutSection: React.CSSProperties = {
  marginTop: '8px',
  paddingTop: '10px',
  borderTop: '1px solid var(--pixel-border)',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '10px 12px',
}

// ── Component ────────────────────────────────────────────────────────────────

export function SettingsModal({ isOpen, onClose, isDebugMode, onToggleDebugMode, dayNight, backgroundTheme, onBackgroundThemeChange }: SettingsModalProps) {
  const dialogRef = useModalFocus(isOpen)
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const formatTime = (hour: number) =>
    `${Math.floor(hour)}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`

  return (
    <>
      {/* Dark backdrop — click to close */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.65)',
          zIndex: 49,
        }}
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        style={modal}
      >
        {/* Header */}
        <div style={header}>
          <span id="settings-modal-title" style={{ fontSize: '24px', color: 'var(--pixel-text)' }}>
            Settings
          </span>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="pixel-close-btn"
            style={{ borderRadius: 0, fontSize: '24px', padding: '4px 8px', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* ── Section: Preferences ──────────────────────── */}
        <div style={sectionLabel} aria-hidden="true">Preferences</div>
        <button
          role="checkbox"
          aria-checked={soundLocal}
          onClick={() => {
            const newVal = !isSoundEnabled()
            setSoundEnabled(newVal)
            setSoundLocal(newVal)
            ws.postMessage({ type: 'saveSettings', settings: { soundEnabled: newVal } })
          }}
          className="pixel-menu-item"
          style={row}
        >
          <span>Sound Notifications</span>
          <span aria-hidden="true" style={checkbox(soundLocal)}>
            {soundLocal ? '✓' : ''}
          </span>
        </button>
        <button
          role="checkbox"
          aria-checked={isDebugMode}
          onClick={onToggleDebugMode}
          className="pixel-menu-item"
          style={row}
        >
          <span>Debug View</span>
          <span aria-hidden="true" style={checkbox(isDebugMode)}>
            {isDebugMode ? '✓' : ''}
          </span>
        </button>

        {/* ── Section: Appearance ───────────────────────── */}
        {dayNight && (
          <>
            <div style={divider} />
            <div style={sectionLabel} aria-hidden="true">Appearance</div>

            {/* Time Mode — native select, pixel-styled */}
            <div style={configRow}>
              <label
                htmlFor="settings-time-mode"
                style={{ fontSize: '22px', color: 'var(--pixel-text)', cursor: 'default', flexShrink: 0 }}
              >
                Time Mode
              </label>
              <select
                id="settings-time-mode"
                value={dayNight.mode}
                onChange={(e) => dayNight.setMode(e.target.value as TimeMode)}
                className="pixel-settings-select"
                style={selectInput}
              >
                <option value={TimeMode.REAL}>Real Clock</option>
                <option value={TimeMode.FIXED_DAY}>Always Day</option>
                <option value={TimeMode.FIXED_NIGHT}>Always Night</option>
                <option value={TimeMode.FIXED_SUNSET}>Always Sunset</option>
                <option value={TimeMode.FIXED_SUNRISE}>Always Sunrise</option>
              </select>
            </div>

            {/* Hemisphere — two pixel buttons side by side */}
            <div style={configRow}>
              <span style={{ fontSize: '22px', color: 'var(--pixel-text)', flexShrink: 0 }}>Hemisphere</span>
              <div style={{ display: 'flex', gap: 4, flex: '1 1 auto', maxWidth: 200 }} role="group" aria-label="Hemisphere">
                <button
                  onClick={() => dayNight.setHemisphere(Hemisphere.NORTH)}
                  aria-pressed={dayNight.hemisphere === Hemisphere.NORTH}
                  className="pixel-hemisphere-btn"
                  style={hemisphereCycleBtn(dayNight.hemisphere === Hemisphere.NORTH)}
                >
                  North
                </button>
                <button
                  onClick={() => dayNight.setHemisphere(Hemisphere.SOUTH)}
                  aria-pressed={dayNight.hemisphere === Hemisphere.SOUTH}
                  className="pixel-hemisphere-btn"
                  style={hemisphereCycleBtn(dayNight.hemisphere === Hemisphere.SOUTH)}
                >
                  South
                </button>
              </div>
            </div>

            {/* Current state — period + clock */}
            {dayNight.mode === TimeMode.REAL && (
              <div style={statusText}>
                <span style={{ color: 'var(--pixel-text-hint)', fontSize: '14px' }}>NOW</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {dayNight.state.period} · {formatTime(dayNight.state.hour)}
                </span>
              </div>
            )}
          </>
        )}

        {/* ── Section: World Background ──────────────────── */}
        {onBackgroundThemeChange && (
          <>
            <div style={divider} />
            <div style={sectionLabel} aria-hidden="true">World Background</div>
            <div style={configRow}>
              <label
                htmlFor="settings-bg-theme"
                style={{ fontSize: '22px', color: 'var(--pixel-text)', cursor: 'default', flexShrink: 0 }}
              >
                Theme
              </label>
              <select
                id="settings-bg-theme"
                value={backgroundTheme ?? 'void'}
                onChange={(e) => onBackgroundThemeChange(e.target.value as WorldBackgroundTheme)}
                className="pixel-settings-select"
                style={selectInput}
              >
                <option value="void">None</option>
                <option value="suburban">Suburban</option>
                <option value="urban">Urban (coming soon)</option>
                <option value="park">Park (coming soon)</option>
                <option value="rooftop">Rooftop (coming soon)</option>
              </select>
            </div>
          </>
        )}

        {/* ── About ─────────────────────────────────────── */}
        <div style={aboutSection}>
          <span style={{ fontFamily: 'var(--pixel-font)', fontSize: '18px', color: 'var(--pixel-text)' }}>
            Pixel Office v0.2.0
          </span>
          <span style={{ fontFamily: 'var(--pixel-font)', fontSize: '15px', color: 'var(--pixel-text-dim)' }}>
            Inspired by{' '}
            <a
              href="https://github.com/pablodelucca/pixel-agents"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--pixel-accent)', textDecoration: 'none' }}
            >
              Pixel Agents
            </a>
            {' '}by{' '}
            <a
              href="https://github.com/pablodelucca"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--pixel-accent)', textDecoration: 'none' }}
            >
              Pablo De Lucca
            </a>
          </span>
        </div>
      </div>
    </>
  )
}
