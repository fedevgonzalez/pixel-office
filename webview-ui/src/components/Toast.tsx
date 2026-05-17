import { useState, useEffect, useRef } from 'react'

type ToastVariant = 'success' | 'info' | 'error'

interface ToastEntry {
  id: number
  message: string
  variant: ToastVariant
}

// Module-level listener registry so any code path can emit a toast without
// prop-drilling a callback. The <Toast /> component subscribes once at the
// app root and shows everything that comes through.
const listeners = new Set<(t: ToastEntry) => void>()
let nextId = 0

export function showToast(message: string, variant: ToastVariant = 'success'): void {
  const entry: ToastEntry = { id: ++nextId, message, variant }
  for (const fn of listeners) fn(entry)
}

const TOAST_LIFETIME_MS = 2800
// Cap stack size so rapid-fire emitters (e.g. several community-asset installs)
// don't push toasts off the bottom of the viewport.
const MAX_VISIBLE_TOASTS = 5

const variantStyles: Record<ToastVariant, React.CSSProperties> = {
  success: {
    background: 'var(--pixel-agent-bg)',
    color: 'var(--pixel-agent-text)',
    borderColor: 'var(--pixel-agent-border)',
  },
  info: {
    background: 'var(--pixel-active-bg)',
    color: 'var(--pixel-accent)',
    borderColor: 'var(--pixel-accent-dim)',
  },
  error: {
    background: 'rgba(232, 80, 58, 0.18)',
    color: 'rgba(255, 200, 190, 0.95)',
    borderColor: 'var(--pixel-status-permission)',
  },
}

export function Toast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  // Map of toast id → timeout handle. Cleared on unmount so we don't try to
  // setState on an unmounted root during HMR.
  const timeoutsRef = useRef<Map<number, number>>(new Map())

  useEffect(() => {
    const handle = (t: ToastEntry) => {
      setToasts((prev) => {
        const next = [...prev, t]
        // Drop the oldest entries past the cap so the stack stays on-screen.
        if (next.length > MAX_VISIBLE_TOASTS) {
          for (const dropped of next.slice(0, next.length - MAX_VISIBLE_TOASTS)) {
            const handle = timeoutsRef.current.get(dropped.id)
            if (handle !== undefined) {
              window.clearTimeout(handle)
              timeoutsRef.current.delete(dropped.id)
            }
          }
          return next.slice(-MAX_VISIBLE_TOASTS)
        }
        return next
      })
      const timeoutId = window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id))
        timeoutsRef.current.delete(t.id)
      }, TOAST_LIFETIME_MS)
      timeoutsRef.current.set(t.id, timeoutId)
    }
    listeners.add(handle)
    return () => {
      listeners.delete(handle)
      for (const id of timeoutsRef.current.values()) window.clearTimeout(id)
      timeoutsRef.current.clear()
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 'var(--pixel-overlay-selected-z)',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pixel-fade-in"
          style={{
            padding: '8px 14px',
            fontSize: 18,
            border: '2px solid',
            borderRadius: 0,
            boxShadow: 'var(--pixel-shadow)',
            maxWidth: 360,
            ...variantStyles[t.variant],
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
