import { useEffect } from 'react'

// Subset of the WakeLockSentinel surface we actually consume. We type it
// locally so the hook compiles even on TS lib targets that haven't pulled in
// the Screen Wake Lock API yet.
interface WakeLockSentinelLike {
  released: boolean
  release: () => Promise<void>
  addEventListener: (event: 'release', handler: () => void) => void
  removeEventListener: (event: 'release', handler: () => void) => void
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

/**
 * Hold a `screen` Wake Lock while the webview is mounted and visible.
 *
 * Browsers release wake locks the moment the tab becomes hidden (a battery
 * concession even on plugged-in hardware), so this hook reacquires on
 * visibilitychange and on the lock's own `release` event. That lets a kiosk
 * survive a window switch / external focus event without permanently giving
 * up the wake lock.
 *
 * Used to keep the pixel-office kiosk display from going to sleep on idle.
 * Whether the underlying OS honors the request depends on the display
 * manager (X11 / Wayland) and any compositor-side overrides, but Chromium
 * relays it via DBus on Linux, which covers most setups.
 */
export function useScreenWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const nav = navigator as NavigatorWithWakeLock
    if (!nav.wakeLock) return

    let current: WakeLockSentinelLike | null = null
    let cancelled = false

    const handleRelease = () => {
      // Re-acquire when the OS or browser drops the lock — usually after a
      // visibility change. If the tab is hidden right now, visibilitychange
      // will retry later.
      if (cancelled) return
      if (document.visibilityState === 'visible') void acquire()
    }

    const acquire = async () => {
      if (cancelled) return
      if (current && !current.released) return
      try {
        const sentinel = await nav.wakeLock!.request('screen')
        if (cancelled) {
          await sentinel.release().catch(() => {})
          return
        }
        sentinel.addEventListener('release', handleRelease)
        current = sentinel
      } catch (err) {
        // Permission denied, document not focused, etc. — keep quiet so the
        // console stays clean on kiosk. The visibilitychange listener will
        // retry whenever the tab is shown again.
        if (import.meta.env.DEV) {
          console.warn('[useScreenWakeLock] request failed:', err)
        }
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    void acquire()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      const sentinel = current
      current = null
      if (sentinel) {
        sentinel.removeEventListener('release', handleRelease)
        sentinel.release().catch(() => {})
      }
    }
  }, [enabled])
}
