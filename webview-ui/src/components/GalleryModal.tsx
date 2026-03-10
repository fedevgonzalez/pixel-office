import { useState, useEffect, useCallback } from 'react'
import { useModalFocus } from '../hooks/useModalFocus.js'
import { vscode } from '../vscodeApi.js'
import { GALLERY_CARD_MIN_WIDTH, GALLERY_CARD_GAP, GALLERY_CARD_PADDING } from '../constants.js'
import { ShareModal } from './ShareModal.js'
import type { OfficeLayout } from '../office/types.js'

interface GalleryLayout {
  id: string
  name: string
  author: string
  description: string
  tags: string[]
  cols: number
  rows: number
  furnitureCount: number
  screenshot: string
  layout: string
  createdAt: string
}

interface GalleryManifest {
  version: number
  updatedAt: string
  layouts: GalleryLayout[]
}

interface GalleryModalProps {
  isOpen: boolean
  onClose: () => void
  getLayout: () => OfficeLayout
}

const actionBtnBase: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: '20px',
  color: 'var(--pixel-text)',
  background: 'var(--pixel-btn-bg)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  cursor: 'pointer',
  textAlign: 'left',
}

export function GalleryModal({ isOpen, onClose, getLayout }: GalleryModalProps) {
  const dialogRef = useModalFocus(isOpen)
  const [manifest, setManifest] = useState<GalleryManifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [screenshots, setScreenshots] = useState<Map<string, string>>(new Map())
  const [importing, setImporting] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [isShareOpen, setIsShareOpen] = useState(false)

  // Listen for gallery messages from extension/server
  useEffect(() => {
    if (!isOpen) return

    const handler = (e: MessageEvent) => {
      const msg = e.data
      if (msg.type === 'galleryManifest') {
        setLoading(false)
        if (msg.error || !msg.manifest) {
          setError(msg.error || 'Failed to load gallery')
        } else {
          setManifest(msg.manifest)
          setError(null)
          // Request screenshots for each layout
          for (const layout of msg.manifest.layouts) {
            if (layout.screenshot) {
              vscode.postMessage({ type: 'fetchGalleryScreenshot', path: layout.screenshot })
            }
          }
        }
      } else if (msg.type === 'galleryScreenshot') {
        if (msg.dataUrl) {
          setScreenshots((prev) => {
            const next = new Map(prev)
            next.set(msg.path, msg.dataUrl)
            return next
          })
        }
      } else if (msg.type === 'galleryLayout') {
        if (msg.layout) {
          vscode.postMessage({ type: 'importGalleryLayout', layout: msg.layout })
        } else {
          setImporting(null)
          setError('Failed to download layout')
        }
      } else if (msg.type === 'galleryImportResult') {
        setImporting(null)
        setConfirmId(null)
        if (msg.success) {
          onClose()
        }
      } else if (msg.type === 'layoutLoaded' && importing) {
        // Standalone mode: importGalleryLayout directly sends layoutLoaded
        setImporting(null)
        setConfirmId(null)
        onClose()
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [isOpen, importing, onClose])

  // Fetch manifest on open
  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    setError(null)
    vscode.postMessage({ type: 'fetchGalleryManifest' })
  }, [isOpen])

  // Escape to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmId) {
          setConfirmId(null)
        } else {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, confirmId])

  const handleImport = useCallback((layout: GalleryLayout) => {
    setImporting(layout.id)
    vscode.postMessage({ type: 'fetchGalleryLayout', path: layout.layout })
  }, [])

  if (!isOpen) return null

  return (
    <>
      {/* Dark backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.6)',
          zIndex: 49,
        }}
      />
      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-modal-title"
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
          width: '90%',
          maxWidth: 700,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px',
            borderBottom: '1px solid var(--pixel-border)',
            marginBottom: '4px',
            flexShrink: 0,
          }}
        >
          <span id="gallery-modal-title" style={{ fontSize: '24px', color: 'var(--pixel-text)' }}>Community Layouts</span>
          <button
            onClick={onClose}
            aria-label="Close gallery"
            className="pixel-close-btn"
            style={{
              borderRadius: 0,
              fontSize: '24px',
              padding: '4px 8px',
              lineHeight: 1,
            }}
          >
            &#215;
          </button>
        </div>

        {/* Content */}
        <div style={{ overflow: 'auto', flex: 1, padding: '12px 16px' }}>
          {loading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, padding: '4px 0' }}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="pixel-agents-pulse" style={{
                  height: 160,
                  background: 'rgba(255, 245, 235, 0.04)',
                  border: '2px solid rgba(255, 245, 235, 0.06)',
                }} />
              ))}
            </div>
          )}

          {error && !loading && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontSize: '22px', color: 'var(--pixel-error)', marginBottom: 12 }}>{error}</p>
              <button
                onClick={() => {
                  setLoading(true)
                  setError(null)
                  vscode.postMessage({ type: 'fetchGalleryManifest' })
                }}
                className="pixel-btn"
                style={actionBtnBase}
              >
                Retry
              </button>
            </div>
          )}

          {manifest && !loading && !error && (
            <>
              {manifest.layouts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                  <div style={{ fontSize: '28px', marginBottom: 10, opacity: 0.3, userSelect: 'none', color: 'var(--pixel-text-dim)', letterSpacing: '0.15em' }}>
                    [ empty ]
                  </div>
                  <div style={{ fontSize: '22px', color: 'var(--pixel-text)', marginBottom: 6 }}>
                    No community layouts yet
                  </div>
                  <div style={{ fontSize: '16px', color: 'var(--pixel-text-dim)', lineHeight: 1.5, marginBottom: 12 }}>
                    Be the first to share your office design!
                  </div>
                  <button
                    onClick={() => setIsShareOpen(true)}
                    className="pixel-btn pixel-share-btn"
                    style={{ padding: '8px 16px', fontSize: '20px', border: '2px solid var(--pixel-agent-border)' }}
                  >
                    Share Your Layout
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${GALLERY_CARD_MIN_WIDTH}px, 1fr))`, gap: GALLERY_CARD_GAP }}>
                  {manifest.layouts.map((layout) => (
                    <GalleryCard
                      key={layout.id}
                      layout={layout}
                      screenshotUrl={screenshots.get(layout.screenshot) || null}
                      isImporting={importing === layout.id}
                      isConfirming={confirmId === layout.id}
                      onConfirm={() => setConfirmId(layout.id)}
                      onCancel={() => setConfirmId(null)}
                      onImport={() => handleImport(layout)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '6px 10px',
            borderTop: '1px solid var(--pixel-border)',
            marginTop: '4px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '20px', color: 'var(--pixel-text-dim)' }}>
            {manifest ? `${manifest.layouts.length} layout${manifest.layouts.length !== 1 ? 's' : ''}` : ''}
          </span>
          <button
            onClick={() => setIsShareOpen(true)}
            className="pixel-share-btn"
            style={{
              padding: '4px 12px',
              fontSize: '20px',
              background: 'transparent',
              color: 'var(--pixel-green)',
              border: '2px solid transparent',
              borderRadius: 0,
              cursor: 'pointer',
            }}
          >
            Share Your Layout
          </button>
        </div>
      </div>
      <ShareModal isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} getLayout={getLayout} />
    </>
  )
}

interface GalleryCardProps {
  layout: GalleryLayout
  screenshotUrl: string | null
  isImporting: boolean
  isConfirming: boolean
  onConfirm: () => void
  onCancel: () => void
  onImport: () => void
}

function GalleryCard({ layout, screenshotUrl, isImporting, isConfirming, onConfirm, onCancel, onImport }: GalleryCardProps) {
  return (
    <div
      className="gallery-card"
      style={{
        background: 'rgba(255, 245, 235, 0.03)',
        border: '2px solid var(--pixel-border)',
        borderRadius: 0,
        padding: GALLERY_CARD_PADDING,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {/* Screenshot area */}
      <div
        style={{
          width: '100%',
          aspectRatio: '16/9',
          background: 'rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          imageRendering: 'pixelated',
        }}
      >
        {screenshotUrl ? (
          <img
            src={screenshotUrl}
            alt={layout.name || 'Community layout preview'}
            style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' }}
          />
        ) : (
          <span style={{ fontSize: '20px', color: 'rgba(255, 245, 235, 0.4)' }}>No preview</span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '4px 8px' }}>
        <div style={{ fontSize: '22px', color: 'var(--pixel-text)', marginBottom: 2 }}>{layout.name}</div>
        <div style={{ fontSize: '18px', color: 'var(--pixel-text-dim)', marginBottom: 4 }}>
          by {layout.author} &middot; {layout.cols}x{layout.rows} &middot; {layout.furnitureCount} items
        </div>
        {layout.description && (
          <div style={{ fontSize: '18px', color: 'var(--pixel-text-dim)', marginBottom: 4, opacity: 0.8 }}>{layout.description}</div>
        )}
        {layout.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
            {layout.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: '16px',
                  padding: '1px 6px',
                  background: 'var(--pixel-active-bg)',
                  color: 'var(--pixel-accent)',
                  border: '1px solid var(--pixel-accent)',
                  borderRadius: 0,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action */}
      {isConfirming ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 8px' }}>
          <span style={{ fontSize: '18px', color: 'var(--pixel-accent)', flex: 1 }}>Replace furniture and floor? Pets stay.</span>
          <button
            onClick={onImport}
            aria-label="Replace layout and import"
            style={{
              padding: '4px 10px',
              fontSize: '20px',
              background: 'var(--pixel-agent-bg)',
              color: 'var(--pixel-agent-text)',
              border: '2px solid var(--pixel-agent-border)',
              borderRadius: 0,
              cursor: 'pointer',
            }}
          >
            Replace
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: '4px 10px',
              fontSize: '20px',
              background: 'var(--pixel-btn-bg)',
              color: 'var(--pixel-text-dim)',
              border: '2px solid transparent',
              borderRadius: 0,
              cursor: 'pointer',
            }}
          >
            Keep Mine
          </button>
        </div>
      ) : (
        <button
          onClick={onConfirm}
          disabled={isImporting}
          className="pixel-btn"
          style={{
            padding: '6px 10px',
            fontSize: '20px',
            background: 'var(--pixel-btn-bg)',
            color: 'var(--pixel-green)',
            border: '2px solid var(--pixel-agent-border)',
            borderRadius: 0,
            cursor: isImporting ? 'default' : 'pointer',
            opacity: isImporting ? 'var(--pixel-btn-disabled-opacity)' : 1,
            width: '100%',
          }}
        >
          <span aria-live="polite">{isImporting ? 'Importing...' : 'Use This Layout'}</span>
        </button>
      )}
    </div>
  )
}
