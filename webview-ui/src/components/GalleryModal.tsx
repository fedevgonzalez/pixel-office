import { useState, useEffect, useCallback, useMemo } from 'react'
import { useModalFocus } from '../hooks/useModalFocus.js'
import { ws } from '../wsClient.js'
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
  issueNumber?: number
  votes?: number
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

interface AuthUser {
  authenticated: boolean
  login?: string
  avatarUrl?: string
}

interface UserLike {
  reactionId: number
}

type SortMode = 'popular' | 'newest' | 'az'

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

// ── Auth helpers ──────────────────────────────────────────────

function useAuth() {
  const [user, setUser] = useState<AuthUser>({ authenticated: false })
  const [checking, setChecking] = useState(true)

  const checkAuth = useCallback(async () => {
    try {
      const resp = await fetch('/auth/user', { credentials: 'same-origin' })
      const data = await resp.json()
      setUser(data)
    } catch {
      setUser({ authenticated: false })
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    checkAuth()
    // Listen for popup auth completion
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'authComplete') checkAuth()
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [checkAuth])

  const login = useCallback(() => {
    window.open('/auth/login', 'github-auth', 'width=600,height=700,popup=yes')
  }, [])

  const logout = useCallback(async () => {
    await fetch('/auth/logout', { credentials: 'same-origin' })
    setUser({ authenticated: false })
  }, [])

  return { user, checking, login, logout }
}

// ── Like helpers ──────────────────────────────────────────────

async function fetchMyLikes(issueNumbers: number[]): Promise<Record<number, UserLike>> {
  if (issueNumbers.length === 0) return {}
  try {
    const resp = await fetch(`/api/votes/mine?issues=${issueNumbers.join(',')}`, { credentials: 'same-origin' })
    if (!resp.ok) return {}
    const data = await resp.json()
    return data.votes || {}
  } catch {
    return {}
  }
}

async function submitLike(issueNumber: number): Promise<{ ok: boolean; reactionId?: number }> {
  try {
    const resp = await fetch('/api/vote', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueNumber }),
    })
    if (!resp.ok) return { ok: false }
    return resp.json()
  } catch {
    return { ok: false }
  }
}

async function removeLike(issueNumber: number, reactionId: number): Promise<{ ok: boolean }> {
  try {
    const resp = await fetch('/api/vote', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueNumber, reactionId }),
    })
    if (!resp.ok) return { ok: false }
    return resp.json()
  } catch {
    return { ok: false }
  }
}

// ── Main component ──────────────────────────────────────────

export function GalleryModal({ isOpen, onClose, getLayout }: GalleryModalProps) {
  const dialogRef = useModalFocus(isOpen)
  const [manifest, setManifest] = useState<GalleryManifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [screenshots, setScreenshots] = useState<Map<string, string>>(new Map())
  const [importing, setImporting] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('popular')
  const [userLikes, setUserLikes] = useState<Record<number, UserLike>>({})

  const { user, login, logout } = useAuth()

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
              ws.postMessage({ type: 'fetchGalleryScreenshot', path: layout.screenshot })
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
          ws.postMessage({ type: 'importGalleryLayout', layout: msg.layout })
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
    ws.postMessage({ type: 'fetchGalleryManifest' })
  }, [isOpen])

  // Fetch user likes when manifest loads and user is authenticated
  useEffect(() => {
    if (!manifest || !user.authenticated) return
    const issueNumbers = manifest.layouts.map(l => l.issueNumber).filter((n): n is number => n != null)
    if (issueNumbers.length === 0) return
    fetchMyLikes(issueNumbers).then(setUserLikes)
  }, [manifest, user.authenticated])

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
    ws.postMessage({ type: 'fetchGalleryLayout', path: layout.layout })
  }, [])

  const handleLike = useCallback(async (layout: GalleryLayout) => {
    if (!layout.issueNumber) return
    const existing = userLikes[layout.issueNumber]

    if (existing) {
      // Unlike: remove the reaction
      const removed = await removeLike(layout.issueNumber, existing.reactionId)
      if (!removed.ok) return
      setManifest(prev => {
        if (!prev) return prev
        return {
          ...prev,
          layouts: prev.layouts.map(l =>
            l.id === layout.id ? { ...l, votes: Math.max(0, (l.votes ?? 0) - 1) } : l
          ),
        }
      })
      setUserLikes(prev => {
        const next = { ...prev }
        delete next[layout.issueNumber!]
        return next
      })
      return
    }

    // Like: add +1 reaction
    const result = await submitLike(layout.issueNumber)
    if (!result.ok) return
    setUserLikes(prev => ({
      ...prev,
      [layout.issueNumber!]: { reactionId: result.reactionId! },
    }))
    setManifest(prev => {
      if (!prev) return prev
      return {
        ...prev,
        layouts: prev.layouts.map(l =>
          l.id === layout.id ? { ...l, votes: (l.votes ?? 0) + 1 } : l
        ),
      }
    })
  }, [userLikes])

  // Sorted layouts
  const sortedLayouts = useMemo(() => {
    if (!manifest) return []
    const layouts = [...manifest.layouts]
    switch (sortMode) {
      case 'popular':
        return layouts.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
      case 'newest':
        return layouts.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      case 'az':
        return layouts.sort((a, b) => a.name.localeCompare(b.name))
    }
  }, [manifest, sortMode])

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
          background: 'rgba(0, 0, 0, 0.65)',
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
            padding: '6px 12px',
            borderBottom: '1px solid var(--pixel-border)',
            flexShrink: 0,
          }}
        >
          <span id="gallery-modal-title" style={{ fontSize: '24px', color: 'var(--pixel-text)' }}>Community Layouts</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {user.authenticated ? (
              <button
                onClick={logout}
                className="pixel-btn"
                style={{ padding: '4px 8px', fontSize: '16px', background: 'transparent', color: 'var(--pixel-text-dim)', border: '2px solid transparent', borderRadius: 0, cursor: 'pointer' }}
                title={`Signed in as ${user.login}`}
              >
                {user.login}
              </button>
            ) : (
              GITHUB_APP_CLIENT_ID_EXISTS && (
                <button
                  onClick={login}
                  className="pixel-btn"
                  style={{ padding: '4px 8px', fontSize: '16px', background: 'var(--pixel-active-bg)', color: 'var(--pixel-accent)', border: '2px solid var(--pixel-accent-dim)', borderRadius: 0, cursor: 'pointer' }}
                >
                  Sign in to vote
                </button>
              )
            )}
            <button
              onClick={onClose}
              aria-label="Close gallery"
              className="pixel-close-btn"
              style={{ borderRadius: 0, fontSize: '24px', padding: '4px 8px', lineHeight: 1 }}
            >
              &#215;
            </button>
          </div>
        </div>

        {/* Sort bar */}
        {manifest && manifest.layouts.length > 0 && (
          <div style={{ padding: '8px 16px 0', flexShrink: 0, display: 'flex', gap: 16, alignItems: 'center' }}>
            <span style={{ fontSize: '16px', color: 'var(--pixel-text-hint)' }}>Sort:</span>
            {(['popular', 'newest', 'az'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                style={{
                  padding: '4px 0',
                  fontSize: '16px',
                  background: 'transparent',
                  color: sortMode === mode ? 'var(--pixel-accent)' : 'var(--pixel-text-dim)',
                  border: 'none',
                  borderBottom: sortMode === mode ? '2px solid var(--pixel-accent)' : '2px solid transparent',
                  borderRadius: 0,
                  cursor: 'pointer',
                }}
              >
                {mode === 'popular' ? 'Popular' : mode === 'newest' ? 'Newest' : 'A\u2013Z'}
              </button>
            ))}
          </div>
        )}

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
                  ws.postMessage({ type: 'fetchGalleryManifest' })
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
              {sortedLayouts.length === 0 ? (
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
                  {sortedLayouts.map((layout) => (
                    <GalleryCard
                      key={layout.id}
                      layout={layout}
                      screenshotUrl={screenshots.get(layout.screenshot) || null}
                      isImporting={importing === layout.id}
                      isConfirming={confirmId === layout.id}
                      onConfirm={() => setConfirmId(layout.id)}
                      onCancel={() => setConfirmId(null)}
                      onImport={() => handleImport(layout)}
                      liked={layout.issueNumber != null && userLikes[layout.issueNumber] != null}
                      isAuthed={user.authenticated}
                      onLike={() => handleLike(layout)}
                      onSignIn={login}
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
            padding: '6px 12px',
            borderTop: '1px solid var(--pixel-border)',
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

// Check if voting is configured (server exposes this via a meta tag or we detect from /auth/user)
// For simplicity, we always show vote UI — if server has no GitHub App configured, /auth/login returns 500 and that's fine
const GITHUB_APP_CLIENT_ID_EXISTS = true

// ── Card component ──────────────────────────────────────────

interface GalleryCardProps {
  layout: GalleryLayout
  screenshotUrl: string | null
  isImporting: boolean
  isConfirming: boolean
  onConfirm: () => void
  onCancel: () => void
  onImport: () => void
  liked: boolean
  isAuthed: boolean
  onLike: () => void
  onSignIn: () => void
}

function GalleryCard({ layout, screenshotUrl, isImporting, isConfirming, onConfirm, onCancel, onImport, liked, isAuthed, onLike, onSignIn }: GalleryCardProps) {
  const likes = layout.votes ?? 0
  const hasIssue = layout.issueNumber != null

  const handleStarClick = () => {
    if (!hasIssue || !isAuthed) {
      onSignIn()
      return
    }
    onLike()
  }

  // Pixel art star: filled when liked, outline when not
  const starChar = liked ? '\u2605' : '\u2606'

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
        gap: 8,
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

      {/* Action row: like + import */}
      {isConfirming ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 8px 4px' }}>
          <span style={{ fontSize: '16px', color: 'var(--pixel-accent)', flex: 1, lineHeight: 1.4 }}>Replace furniture and floor? Pets stay.</span>
          <button
            onClick={onImport}
            aria-label="Replace layout and import"
            className="pixel-btn pixel-btn-primary"
            style={{
              padding: '4px 10px',
              fontSize: '20px',
              minHeight: 44,
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
            className="pixel-btn"
            style={{
              padding: '4px 10px',
              fontSize: '20px',
              minHeight: 44,
              background: 'var(--pixel-btn-bg)',
              color: 'var(--pixel-text-dim)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
              cursor: 'pointer',
            }}
          >
            Keep Mine
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 8px 4px' }}>
          {/* Star like button */}
          <button
            onClick={handleStarClick}
            aria-label={liked ? `Unstar ${layout.name}` : `Star ${layout.name}`}
            aria-pressed={liked}
            title={!hasIssue ? 'Rating coming soon' : !isAuthed ? 'Sign in to rate' : liked ? 'Remove star' : 'Star this layout'}
            className="pixel-btn"
            style={{
              padding: '4px 8px',
              fontSize: '20px',
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: liked ? 'var(--pixel-active-bg)' : 'var(--pixel-btn-bg)',
              color: liked ? 'var(--pixel-accent)' : 'var(--pixel-text-hint)',
              border: liked ? '2px solid var(--pixel-accent-dim)' : '2px solid var(--pixel-border)',
              borderRadius: 0,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '18px', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px' }}>{starChar}</span>
            {likes > 0 && (
              <span aria-live="polite" style={{ fontSize: '16px', fontVariantNumeric: 'tabular-nums' }}>{likes}</span>
            )}
          </button>

          {/* Import button */}
          <button
            onClick={onConfirm}
            disabled={isImporting}
            className="pixel-btn pixel-btn-primary"
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '20px',
              minHeight: 44,
              background: 'var(--pixel-agent-bg)',
              color: 'var(--pixel-green)',
              border: '2px solid var(--pixel-agent-border)',
              borderRadius: 0,
              cursor: isImporting ? 'default' : 'pointer',
              opacity: isImporting ? 'var(--pixel-btn-disabled-opacity)' : 1,
            }}
          >
            <span aria-live="polite">{isImporting ? 'Importing...' : 'Use This Layout'}</span>
          </button>
        </div>
      )}
    </div>
  )
}
