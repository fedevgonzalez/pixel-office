import { useState, useEffect, useCallback } from 'react'
import { getDayNightState, TimeMode, Hemisphere } from '../office/engine/dayNightCycle.js'
import type { DayNightState } from '../office/engine/dayNightCycle.js'

const STORAGE_KEY_MODE = 'pixel-office-dn-mode'
const STORAGE_KEY_HEMISPHERE = 'pixel-office-dn-hemisphere'
const UPDATE_INTERVAL_MS = 30_000 // re-evaluate every 30s

/** Load persisted setting or return default */
function loadSetting<T extends string>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    if (v) return v as T
  } catch { /* ignore */ }
  return fallback
}

export function useDayNight() {
  const [mode, setModeState] = useState<TimeMode>(() => loadSetting(STORAGE_KEY_MODE, TimeMode.REAL))
  const [hemisphere, setHemisphereState] = useState<Hemisphere>(() => loadSetting(STORAGE_KEY_HEMISPHERE, Hemisphere.SOUTH))
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
