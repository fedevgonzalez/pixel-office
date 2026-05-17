import { useEffect, useRef } from 'react'

// Tracks how many modals are open so nested modals (ShareModal opened from
// inside GalleryModal) don't release the body lock until both are closed.
let openModalCount = 0

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
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
        )
        if (focusable) focusable.focus()
        else dialog.focus()
      })
    } else if (previousFocusRef.current) {
      // Guard against restoring focus to a node that was unmounted while the modal
      // was open — focusing a detached element silently drops focus to <body>.
      const prev = previousFocusRef.current
      previousFocusRef.current = null
      if (document.contains(prev) && typeof prev.focus === 'function') {
        prev.focus()
      }
    }
  }, [isOpen])

  // Body scroll lock while any modal is open. Refcounted so nested modals
  // share the lock — the body scroll only restores when every modal closes.
  useEffect(() => {
    if (!isOpen) return
    openModalCount += 1
    const previousOverflow = document.body.style.overflow
    if (openModalCount === 1) document.body.style.overflow = 'hidden'
    return () => {
      openModalCount = Math.max(0, openModalCount - 1)
      if (openModalCount === 0) document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  // Focus trap: keep Tab cycling within the dialog. Listener lives on `document`
  // so that even if focus has drifted outside the dialog (e.g. user clicked the
  // backdrop), the next Tab pulls it back in.
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const all = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
      )
      const focusables = Array.from(all).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (!active || !dialog.contains(active)) {
        e.preventDefault()
        first.focus()
        return
      }
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  return dialogRef
}
