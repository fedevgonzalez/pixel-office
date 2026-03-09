import { useEffect, useRef } from 'react'

export function useModalFocus(isOpen: boolean) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement
      // Focus the first focusable element inside the dialog
      requestAnimationFrame(() => {
        const dialog = dialogRef.current
        if (!dialog) return
        const focusable = dialog.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable) focusable.focus()
        else dialog.focus()
      })
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus()
      previousFocusRef.current = null
    }
  }, [isOpen])

  // Focus trap: keep Tab cycling within the dialog
  useEffect(() => {
    if (!isOpen) return
    const dialog = dialogRef.current
    if (!dialog) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    dialog.addEventListener('keydown', handleKeyDown)
    return () => dialog.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  return dialogRef
}
