import { useState, useEffect, useCallback } from 'react'
import { getDayNightState, TimeMode, Hemisphere } from '../office/engine/dayNightCycle.js'
import type { DayNightState } from '../office/engine/dayNightCycle.js'

const STORAGE_KEY_MODE = 'pixel-office-dn-mode'
const STORAGE_KEY_HEMISPHERE = 'pixel-office-dn-hemisphere'
const UPDATE_INTERVAL_MS = 30_000 // re-evaluate every 30s

/** Timezone prefixes/patterns for southern hemisphere regions */
const SOUTH_TZ_PATTERNS = [
  'America/Argentina', 'America/Buenos_Aires', 'America/Sao_Paulo',
  'America/Santiago', 'America/Montevideo', 'America/Asuncion',
  'America/Lima', 'America/La_Paz', 'America/Bogota',
  'Australia/', 'Pacific/Auckland', 'Pacific/Fiji',
  'Africa/Johannesburg', 'Africa/Maputo', 'Africa/Harare',
  'Africa/Nairobi', 'Indian/Antananarivo',
]

/** Detect hemisphere from browser timezone (no permissions needed) */
function detectHemisphere(): Hemisphere {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz && SOUTH_TZ_PATTERNS.some((p) => tz.startsWith(p))) {
      return Hemisphere.SOUTH
    }
  } catch { /* ignore */ }
  return Hemisphere.NORTH
}

/** Load persisted setting or return null if not set */
function loadSetting<T extends string>(key: string): T | null {
  try {
    const v = localStorage.getItem(key)
    if (v) return v as T
  } catch { /* ignore */ }
  return null
}

export function useDayNight() {
  const [mode, setModeState] = useState<TimeMode>(() =>
    loadSetting<TimeMode>(STORAGE_KEY_MODE) ?? TimeMode.REAL
  )
  const [hemisphere, setHemisphereState] = useState<Hemisphere>(() =>
    // Use saved preference if exists, otherwise auto-detect from timezone
    loadSetting<Hemisphere>(STORAGE_KEY_HEMISPHERE) ?? detectHemisphere()
  )
  const [state, setState] = useState<DayNightState>(() => getDayNightState(mode, hemisphere))

  const setMode = useCallback((m: TimeMode) => {
    setModeState(m)
    try { localStorage.setItem(STORAGE_KEY_MODE, m) } catch { /* ignore */ }
  }, [])

  const setHemisphere = useCallback((h: Hemisphere) => {
    setHemisphereState(h)
    try { localStorage.setItem(STORAGE_KEY_HEMISPHERE, h) } catch { /* ignore */ }
  }, [])

  // Periodically update state from real clock
  useEffect(() => {
    const update = () => setState(getDayNightState(mode, hemisphere))
    update()
    const id = setInterval(update, UPDATE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [mode, hemisphere])

  return { state, mode, setMode, hemisphere, setHemisphere }
}
