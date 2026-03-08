import { useState, useEffect, useCallback } from 'react'
import { vscode, isStandaloneMode } from '../vscodeApi.js'

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
}

const GALLERY_REPO_URL = 'https://github.com/fedevgonzalez/pixel-office-layouts'

const menuItemBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '6px 10px',
  fontSize: '24px',
  color: 'rgba(255, 255, 255, 0.8)',
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  cursor: 'pointer',
  textAlign: 'left',
}

export function GalleryModal({ isOpen, onClose }: GalleryModalProps) {
  const [manifest, setManifest] = useState<GalleryManifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [screenshots, setScreenshots] = useState<Map<string, string>>(new Map())
  const [hovered, setHovered] = useState<string | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

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
          <span style={{ fontSize: '24px', color: 'rgba(255, 255, 255, 0.9)' }}>Community Layouts</span>
          <button
            onClick={onClose}
            onMouseEnter={() => setHovered('close')}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: hovered === 'close' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              borderRadius: 0,
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px 8px',
              lineHeight: 1,
            }}
          >
            x
          </button>
        </div>

        {/* Content */}
        <div style={{ overflow: 'auto', flex: 1, padding: '4px 8px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '22px', color: 'rgba(255, 255, 255, 0.6)' }}>
              <span className="pixel-agents-pulse">Loading gallery...</span>
            </div>
          )}

          {error && !loading && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontSize: '22px', color: 'rgba(255, 100, 100, 0.8)', marginBottom: 12 }}>{error}</p>
              <button
                onClick={() => {
                  setLoading(true)
                  setError(null)
                  vscode.postMessage({ type: 'fetchGalleryManifest' })
                }}
                onMouseEnter={() => setHovered('retry')}
                onMouseLeave={() => setHovered(null)}
                style={{
                  ...menuItemBase,
                  width: 'auto',
                  display: 'inline-block',
                  padding: '6px 16px',
                  background: hovered === 'retry' ? 'rgba(255, 255, 255, 0.08)' : 'var(--pixel-btn-bg)',
                  border: '2px solid var(--pixel-border)',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {manifest && !loading && !error && (
            <>
              {manifest.layouts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '22px', color: 'rgba(255, 255, 255, 0.5)' }}>
                  No community layouts yet. Be the first to share!
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
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
          <span style={{ fontSize: '20px', color: 'rgba(255, 255, 255, 0.4)' }}>
            {manifest ? `${manifest.layouts.length} layout${manifest.layouts.length !== 1 ? 's' : ''}` : ''}
          </span>
          <button
            onClick={() => {
              if (isStandaloneMode) {
                window.open(GALLERY_REPO_URL, '_blank')
              } else {
                vscode.postMessage({ type: 'openExternal', url: GALLERY_REPO_URL })
              }
            }}
            onMouseEnter={() => setHovered('share')}
            onMouseLeave={() => setHovered(null)}
            style={{
              ...menuItemBase,
              width: 'auto',
              padding: '4px 12px',
              fontSize: '20px',
              background: hovered === 'share' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: 'rgba(90, 200, 140, 0.8)',
            }}
          >
            Share Your Layout
          </button>
        </div>
      </div>
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
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '2px solid var(--pixel-border)',
        borderRadius: 0,
        padding: 6,
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
            alt={layout.name}
            style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' }}
          />
        ) : (
          <span style={{ fontSize: '20px', color: 'rgba(255, 255, 255, 0.2)' }}>No preview</span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '2px 4px' }}>
        <div style={{ fontSize: '22px', color: 'rgba(255, 255, 255, 0.9)', marginBottom: 2 }}>{layout.name}</div>
        <div style={{ fontSize: '18px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: 4 }}>
          by {layout.author} &middot; {layout.cols}x{layout.rows} &middot; {layout.furnitureCount} items
        </div>
        {layout.description && (
          <div style={{ fontSize: '18px', color: 'rgba(255, 255, 255, 0.4)', marginBottom: 4 }}>{layout.description}</div>
        )}
        {layout.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
            {layout.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: '16px',
                  padding: '1px 6px',
                  background: 'rgba(90, 140, 255, 0.15)',
                  color: 'rgba(90, 140, 255, 0.8)',
                  border: '1px solid rgba(90, 140, 255, 0.3)',
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
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 4px' }}>
          <span style={{ fontSize: '18px', color: 'rgba(255, 200, 80, 0.9)', flex: 1 }}>Replace current layout?</span>
          <button
            onClick={onImport}
            style={{
              padding: '4px 10px',
              fontSize: '20px',
              background: 'rgba(90, 200, 140, 0.3)',
              color: 'rgba(90, 200, 140, 0.9)',
              border: '2px solid rgba(90, 200, 140, 0.5)',
              borderRadius: 0,
              cursor: 'pointer',
            }}
          >
            Yes
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: '4px 10px',
              fontSize: '20px',
              background: 'var(--pixel-btn-bg)',
              color: 'rgba(255, 255, 255, 0.7)',
              border: '2px solid transparent',
              borderRadius: 0,
              cursor: 'pointer',
            }}
          >
            No
          </button>
        </div>
      ) : (
        <button
          onClick={onConfirm}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          disabled={isImporting}
          style={{
            padding: '6px 10px',
            fontSize: '20px',
            background: hovered && !isImporting ? 'rgba(90, 200, 140, 0.2)' : 'var(--pixel-btn-bg)',
            color: isImporting ? 'rgba(255, 255, 255, 0.4)' : 'rgba(90, 200, 140, 0.9)',
            border: '2px solid rgba(90, 200, 140, 0.3)',
            borderRadius: 0,
            cursor: isImporting ? 'default' : 'pointer',
            width: '100%',
          }}
        >
          {isImporting ? 'Importing...' : 'Use This Layout'}
        </button>
      )}
    </div>
  )
}
