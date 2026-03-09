import { useState, useEffect } from 'react'
import { useModalFocus } from '../hooks/useModalFocus.js'
import { vscode } from '../vscodeApi.js'
import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  isDebugMode: boolean
  onToggleDebugMode: () => void
}

const menuItemBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '6px 10px',
  fontSize: '24px',
  color: 'var(--pixel-text)',
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  cursor: 'pointer',
  textAlign: 'left',
}

export function SettingsModal({ isOpen, onClose, isDebugMode, onToggleDebugMode }: SettingsModalProps) {
  const dialogRef = useModalFocus(isOpen)
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

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
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 49,
        }}
      />
      {/* Centered modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          borderRadius: 0,
          padding: '4px',
          boxShadow: 'var(--pixel-shadow)',
          minWidth: 200,
        }}
      >
        {/* Header with title and X button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px',
            borderBottom: '1px solid var(--pixel-border)',
            marginBottom: '4px',
          }}
        >
          <span id="settings-modal-title" style={{ fontSize: '24px', color: 'var(--pixel-text)' }}>Settings</span>
          <button
            onClick={onClose}
            className="pixel-close-btn"
            style={{
              borderRadius: 0,
              fontSize: '24px',
              padding: '4px 8px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        {/* Menu items */}
        <button
          onClick={() => {
            vscode.postMessage({ type: 'openSessionsFolder' })
            onClose()
          }}
          className="pixel-menu-item"
          style={menuItemBase}
        >
          Open Sessions Folder
        </button>
        <button
          onClick={() => {
            vscode.postMessage({ type: 'exportLayout' })
            onClose()
          }}
          className="pixel-menu-item"
          style={menuItemBase}
        >
          Export Layout
        </button>
        <button
          onClick={() => {
            vscode.postMessage({ type: 'importLayout' })
            onClose()
          }}
          className="pixel-menu-item"
          style={menuItemBase}
        >
          Import Layout
        </button>
        <button
          role="checkbox"
          aria-checked={soundLocal}
          onClick={() => {
            const newVal = !isSoundEnabled()
            setSoundEnabled(newVal)
            setSoundLocal(newVal)
            vscode.postMessage({ type: 'setSoundEnabled', enabled: newVal })
          }}
          className="pixel-menu-item"
          style={menuItemBase}
        >
          <span>Sound Notifications</span>
          <span
            aria-hidden="true"
            style={{
              width: 16,
              height: 16,
              border: '2px solid var(--pixel-border-light)',
              borderRadius: 0,
              background: soundLocal ? 'var(--pixel-accent)' : 'transparent',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              lineHeight: 1,
              color: 'rgba(255, 245, 235, 0.95)',
            }}
          >
            {soundLocal ? '✓' : ''}
          </span>
        </button>
        <button
          role="checkbox"
          aria-checked={isDebugMode}
          onClick={onToggleDebugMode}
          className="pixel-menu-item"
          style={menuItemBase}
        >
          <span>Debug View</span>
          <span
            aria-hidden="true"
            style={{
              width: 16,
              height: 16,
              border: '2px solid var(--pixel-border-light)',
              borderRadius: 0,
              background: isDebugMode ? 'var(--pixel-accent)' : 'transparent',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              lineHeight: 1,
              color: 'rgba(255, 245, 235, 0.95)',
            }}
          >
            {isDebugMode ? '✓' : ''}
          </span>
        </button>
        {/* About */}
        <div style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: '1px solid var(--pixel-border)',
          textAlign: 'center' as const,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          paddingBottom: 4,
        }}>
          <span style={{
            fontFamily: 'var(--pixel-font)',
            fontSize: '18px',
            color: 'var(--pixel-text)',
          }}>
            Pixel Office v0.2.0
          </span>
          <span style={{
            fontFamily: 'var(--pixel-font)',
            fontSize: '16px',
            color: 'var(--pixel-text-dim)',
          }}>
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
          <span style={{
            fontFamily: 'var(--pixel-font)',
            fontSize: '14px',
            color: 'var(--pixel-text-dim)',
            opacity: 0.7,
          }}>
            MIT License
          </span>
        </div>
      </div>
    </>
  )
}
