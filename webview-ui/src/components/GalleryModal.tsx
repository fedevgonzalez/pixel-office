import { useState, useEffect, useCallback, useMemo } from 'react'
import { useModalFocus } from '../hooks/useModalFocus.js'
import { ws } from '../wsClient.js'
import { GALLERY_CARD_MIN_WIDTH, GALLERY_CARD_GAP, GALLERY_CARD_PADDING } from '../constants.js'
import { ShareModal } from './ShareModal.js'
import { showToast } from './Toast.js'
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

// Shared shape used by CommunityAssetGrid for pets, characters, etc.
// The caller composes the human-readable subtitle (e.g. "cat · by alice")
// and supplies a fallback icon for items without a thumbnail.
interface CommunityAssetItem {
  id: string
  name: string
  author: string
  description?: string
  thumbnailUrl: string | null
  subtitle: string
  fallbackIcon: string
}

interface CommunityAssetGridProps {
  items: CommunityAssetItem[]
  loading: boolean
  error: string | null
  installingId: string | null
  installedIds: Set<string>
  onInstall: (id: string) => void
  /** Used to build the install button label, e.g. 'Pet' → 'Use this Pet'. */
  itemLabel: string
  emptyState: { icon: string; primary: string; hint: string }
  /** Fired from the in-grid Retry button when the fetch failed. */
  onRetry?: () => void
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

// ── Auth helpers ──────────────────────────────────────────────

function useAuth() {
  const [user, setUser] = useState<AuthUser>({ authenticated: false })
  const [checking, setChecking] = useState(true)
  const [signingIn, setSigningIn] = useState(false)

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
      if (e.data?.type === 'authComplete') {
        setSigningIn(false)
        checkAuth()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [checkAuth])

  const login = useCallback(() => {
    setSigningIn(true)
    const popup = window.open('/auth/login', 'github-auth', 'width=600,height=700,popup=yes')
    if (!popup) {
      setSigningIn(false)
      return
    }
    // Clear signing-in state if popup is closed without completing
    const pollInterval = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollInterval)
        setSigningIn(false)
      }
    }, 500)
  }, [])

  const logout = useCallback(async () => {
    await fetch('/auth/logout', { credentials: 'same-origin' })
    setUser({ authenticated: false })
  }, [])

  return { user, checking, login, logout, signingIn }
}

// ── Like helpers ──────────────────────────────────────────────

async function fetchMyLikes(issueNumbers: number[]): Promise<{ votes: Record<number, UserLike>; counts: Record<number, number> }> {
  if (issueNumbers.length === 0) return { votes: {}, counts: {} }
  try {
    const resp = await fetch(`/api/votes/mine?issues=${issueNumbers.join(',')}`, { credentials: 'same-origin' })
    if (!resp.ok) return { votes: {}, counts: {} }
    const data = await resp.json()
    return { votes: data.votes || {}, counts: data.counts || {} }
  } catch {
    return { votes: {}, counts: {} }
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
  const [activeKind, setActiveKind] = useState<'layouts' | 'pets' | 'characters' | 'props' | 'backgrounds'>('layouts')
  const [userLikes, setUserLikes] = useState<Record<number, UserLike>>({})

  // Community pets manifest — fetched directly from raw.githubusercontent
  // when the user opens the Pets tab. No server proxy needed since the
  // community repo is public.
  interface CommunityPet {
    id: string
    name: string
    species: 'cat' | 'dog'
    author: string
    description: string
    tags: string[]
    sprite: string
    thumbnail: string | null
    createdAt?: string | null
    votes?: number
  }
  const [petsManifest, setPetsManifest] = useState<CommunityPet[] | null>(null)
  const [petsLoading, setPetsLoading] = useState(false)
  const [petsError, setPetsError] = useState<string | null>(null)
  const [installingPetId, setInstallingPetId] = useState<string | null>(null)
  const [installedPetIds, setInstalledPetIds] = useState<Set<string>>(new Set())

  // Community characters manifest — same lazy-fetch pattern as pets. The
  // server installs each sprite into ~/.pixel-office/community-assets/characters/
  // and reloads the chars array, broadcasting `characterSpritesLoaded` to all
  // webviews so the picker refreshes without a rebuild.
  interface CommunityCharacter {
    id: string
    name: string
    author: string
    description: string
    tags: string[]
    sprite: string
    thumbnail: string | null
    createdAt?: string | null
    votes?: number
  }
  const [charsManifest, setCharsManifest] = useState<CommunityCharacter[] | null>(null)
  const [charsLoading, setCharsLoading] = useState(false)
  const [charsError, setCharsError] = useState<string | null>(null)
  const [installingCharId, setInstallingCharId] = useState<string | null>(null)
  const [installedCharIds, setInstalledCharIds] = useState<Set<string>>(new Set())

  // Community props manifest. The server installs each sprite into
  // ~/.pixel-office/community-assets/props/ and re-broadcasts
  // `furnitureAssetsLoaded` (catalog + sprites) so the editor toolbar picks
  // them up alongside the bundled hardcoded set.
  interface CommunityProp {
    id: string
    name: string
    author: string
    description: string
    tags: string[]
    category?: string
    sprite: string
    thumbnail: string | null
    createdAt?: string | null
    votes?: number
  }
  const [propsManifest, setPropsManifest] = useState<CommunityProp[] | null>(null)
  const [propsLoading, setPropsLoading] = useState(false)
  const [propsError, setPropsError] = useState<string | null>(null)
  const [installingPropId, setInstallingPropId] = useState<string | null>(null)
  const [installedPropIds, setInstalledPropIds] = useState<Set<string>>(new Set())

  const { user, login, logout, signingIn } = useAuth()
  const [votingId, setVotingId] = useState<string | null>(null)

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
      } else if (msg.type === 'communityAssetInstalled') {
        // Server finished installing an asset; mark its card "Installed".
        if (msg.id) {
          const kindLabel = msg.kind === 'pet' ? 'Pet' : msg.kind === 'character' ? 'Character' : msg.kind === 'prop' ? 'Prop' : 'Asset'
          if (msg.kind === 'pet') {
            setInstalledPetIds((prev) => {
              const next = new Set(prev)
              next.add(msg.id as string)
              return next
            })
            setInstallingPetId(null)
          } else if (msg.kind === 'character') {
            setInstalledCharIds((prev) => {
              const next = new Set(prev)
              next.add(msg.id as string)
              return next
            })
            setInstallingCharId(null)
          } else if (msg.kind === 'prop') {
            setInstalledPropIds((prev) => {
              const next = new Set(prev)
              next.add(msg.id as string)
              return next
            })
            setInstallingPropId(null)
          }
          showToast(`✓ ${kindLabel} installed`)
        }
      } else if (msg.type === 'communityAssetError') {
        // Route the error to whichever kind is currently installing.
        if (msg.kind === 'character') {
          setInstallingCharId(null)
          setCharsError(msg.error || 'Failed to install asset')
        } else if (msg.kind === 'prop') {
          setInstallingPropId(null)
          setPropsError(msg.error || 'Failed to install asset')
        } else {
          setInstallingPetId(null)
          setPetsError(msg.error || 'Failed to install asset')
        }
      } else if (msg.type === 'galleryImportResult') {
        setImporting(null)
        setConfirmId(null)
        if (msg.success) {
          showToast('✓ Layout imported — pets and background kept')
          onClose()
        }
      } else if (msg.type === 'layoutLoaded' && importing) {
        // Standalone mode: importGalleryLayout directly sends layoutLoaded
        setImporting(null)
        setConfirmId(null)
        showToast('✓ Layout imported — pets and background kept')
        onClose()
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [isOpen, importing, onClose])

  // Fetch the layouts manifest the first time the Layouts tab is opened.
  // Same lazy pattern used by pets/chars/props below — re-opening the modal
  // reuses the cached `manifest` instead of paying the round-trip again. The
  // server keeps its own short-lived cache, so a manual Retry is the only
  // path that forces a refetch.
  useEffect(() => {
    if (!isOpen || activeKind !== 'layouts' || manifest !== null || loading) return
    setLoading(true)
    setError(null)
    setLiveCountsFetched(false)
    ws.postMessage({ type: 'fetchGalleryManifest' })
  }, [isOpen, activeKind, manifest, loading])

  // Fetch the community pets manifest the first time the Pets tab is opened.
  // Public repo → fetch directly from raw.githubusercontent so we don't need
  // a server proxy. Thumbnails load via plain <img src=…> for the same reason.
  useEffect(() => {
    if (!isOpen || activeKind !== 'pets' || petsManifest !== null || petsLoading) return
    setPetsLoading(true)
    setPetsError(null)
    fetch('https://raw.githubusercontent.com/fedevgonzalez/pixel-office-community/main/sprites/pets.json', { cache: 'no-cache' })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then((data: { pets?: CommunityPet[] }) => {
        setPetsManifest(data.pets || [])
        setPetsLoading(false)
      })
      .catch((err) => {
        setPetsError(err.message || 'Failed to fetch pet gallery')
        setPetsManifest([])
        setPetsLoading(false)
      })
  }, [isOpen, activeKind, petsManifest, petsLoading])

  const handleInstallPet = useCallback((pet: CommunityPet) => {
    setInstallingPetId(pet.id)
    setPetsError(null)
    ws.postMessage({ type: 'installCommunityAsset', kind: 'pet', id: pet.id, species: pet.species })
  }, [])

  // Lazy-fetch characters manifest the first time the Characters tab opens.
  useEffect(() => {
    if (!isOpen || activeKind !== 'characters' || charsManifest !== null || charsLoading) return
    setCharsLoading(true)
    setCharsError(null)
    fetch('https://raw.githubusercontent.com/fedevgonzalez/pixel-office-community/main/sprites/characters.json', { cache: 'no-cache' })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then((data: { characters?: CommunityCharacter[] }) => {
        setCharsManifest(data.characters || [])
        setCharsLoading(false)
      })
      .catch((err) => {
        setCharsError(err.message || 'Failed to fetch character gallery')
        setCharsManifest([])
        setCharsLoading(false)
      })
  }, [isOpen, activeKind, charsManifest, charsLoading])

  const handleInstallCharacter = useCallback((id: string) => {
    setInstallingCharId(id)
    setCharsError(null)
    ws.postMessage({ type: 'installCommunityAsset', kind: 'character', id })
  }, [])

  // Lazy-fetch props manifest the first time the Props tab opens.
  useEffect(() => {
    if (!isOpen || activeKind !== 'props' || propsManifest !== null || propsLoading) return
    setPropsLoading(true)
    setPropsError(null)
    fetch('https://raw.githubusercontent.com/fedevgonzalez/pixel-office-community/main/sprites/props.json', { cache: 'no-cache' })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then((data: { props?: CommunityProp[] }) => {
        setPropsManifest(data.props || [])
        setPropsLoading(false)
      })
      .catch((err) => {
        setPropsError(err.message || 'Failed to fetch prop gallery')
        setPropsManifest([])
        setPropsLoading(false)
      })
  }, [isOpen, activeKind, propsManifest, propsLoading])

  const handleInstallProp = useCallback((id: string) => {
    setInstallingPropId(id)
    setPropsError(null)
    ws.postMessage({ type: 'installCommunityAsset', kind: 'prop', id })
  }, [])

  // Fetch user likes and live vote counts when manifest loads and user is authenticated
  const [liveCountsFetched, setLiveCountsFetched] = useState(false)
  useEffect(() => {
    if (!manifest || !user.authenticated || liveCountsFetched) return
    const issueNumbers = manifest.layouts.map(l => l.issueNumber).filter((n): n is number => n != null)
    if (issueNumbers.length === 0) return
    setLiveCountsFetched(true)
    fetchMyLikes(issueNumbers).then(({ votes, counts }) => {
      setUserLikes(votes)
      // Apply live vote counts from GitHub (overrides stale gallery.json values)
      if (Object.keys(counts).length > 0) {
        setManifest(prev => {
          if (!prev) return prev
          return {
            ...prev,
            layouts: prev.layouts.map(l =>
              l.issueNumber != null && counts[l.issueNumber] != null
                ? { ...l, votes: counts[l.issueNumber] }
                : l
            ),
          }
        })
      }
    })
  }, [manifest, user.authenticated, liveCountsFetched])

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
    if (votingId === layout.id) return
    const existing = userLikes[layout.issueNumber]

    setVotingId(layout.id)
    try {
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
    } finally {
      setVotingId(null)
    }
  }, [userLikes, votingId])

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
        className="pixel-fade-in"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'var(--pixel-modal-backdrop)',
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
        className="pixel-modal-rise"
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
        <div className="modal-header">
          <span id="gallery-modal-title" className="modal-header__title">Community Gallery</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {user.authenticated ? (
              <button
                onClick={logout}
                className="pixel-btn"
                style={{ padding: '4px 8px', fontSize: '16px', background: 'transparent', color: 'var(--pixel-text-dim)', border: '2px solid transparent', borderRadius: 0 }}
                title={`Signed in as ${user.login}`}
              >
                {user.login}
              </button>
            ) : (
              GITHUB_APP_CLIENT_ID_EXISTS && (
                <button
                  onClick={login}
                  disabled={signingIn}
                  aria-busy={signingIn}
                  className="pixel-btn"
                  style={{ padding: '4px 8px', fontSize: '16px', background: 'var(--pixel-active-bg)', color: signingIn ? 'var(--pixel-text-dim)' : 'var(--pixel-accent)', border: '2px solid var(--pixel-accent-dim)', borderRadius: 0 }}
                >
                  <span className={signingIn ? 'pixel-agents-pulse' : undefined}>
                    {signingIn ? 'Waiting for GitHub...' : 'Sign in to vote'}
                  </span>
                </button>
              )
            )}
            <button
              onClick={onClose}
              aria-label="Close gallery"
              className="pixel-close-btn"
            >
              &#215;
            </button>
          </div>
        </div>

        {/* Kind tabs — each maps to a different community asset type. Today only
            "layouts" is fully wired; other kinds show a "coming soon" placeholder
            with a Share button so contributors can seed the gallery. */}
        <div
          role="tablist"
          aria-label="Asset kind"
          style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--pixel-border)', flexShrink: 0 }}
        >
          {(
            [
              { id: 'layouts',     label: '🏢 Layouts' },
              { id: 'pets',        label: '🐾 Pets' },
              { id: 'characters',  label: '🧑‍💻 Characters' },
              { id: 'props',       label: '🪴 Props' },
              { id: 'backgrounds', label: '🌆 Backgrounds' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              id={`gallery-tab-${tab.id}`}
              role="tab"
              aria-selected={activeKind === tab.id}
              aria-controls={`gallery-panel-${tab.id}`}
              tabIndex={activeKind === tab.id ? 0 : -1}
              onClick={() => setActiveKind(tab.id)}
              style={{
                flex: 1,
                padding: '8px 4px',
                fontSize: '16px',
                background: activeKind === tab.id ? 'var(--pixel-active-bg)' : 'transparent',
                color: activeKind === tab.id ? 'var(--pixel-accent)' : 'var(--pixel-text-dim)',
                border: 'none',
                borderBottom: activeKind === tab.id ? '2px solid var(--pixel-accent)' : '2px solid transparent',
                borderRadius: 0,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sort bar — layouts only for now */}
        {activeKind === 'layouts' && manifest && manifest.layouts.length > 0 && (
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

        {/* Content — only the active tab's panel is rendered, so the same
            element doubles as the tabpanel for whichever tab is selected. */}
        <div
          role="tabpanel"
          id={`gallery-panel-${activeKind}`}
          aria-labelledby={`gallery-tab-${activeKind}`}
          style={{ overflow: 'auto', flex: 1, padding: '12px 16px' }}
        >
          {activeKind === 'pets' && (
            <CommunityAssetGrid
              items={(petsManifest ?? []).map((pet) => ({
                id: pet.id,
                name: pet.name,
                author: pet.author,
                description: pet.description,
                thumbnailUrl: pet.thumbnail
                  ? `https://raw.githubusercontent.com/fedevgonzalez/pixel-office-community/main/${pet.thumbnail}`
                  : null,
                subtitle: `${pet.species} · by ${pet.author}`,
                fallbackIcon: pet.species === 'cat' ? '🐱' : '🐶',
              }))}
              loading={petsLoading}
              error={petsError}
              installingId={installingPetId}
              installedIds={installedPetIds}
              onInstall={(id) => {
                const pet = petsManifest?.find((p) => p.id === id)
                if (pet) handleInstallPet(pet)
              }}
              itemLabel="Pet"
              emptyState={{
                icon: '🐾',
                primary: 'No community pets yet — be the first.',
                hint: 'Use the 🌐 Share button in the Pets editor to submit yours.',
              }}
              onRetry={() => { setPetsError(null); setPetsManifest(null) }}
            />
          )}
          {activeKind === 'characters' && (
            <CommunityAssetGrid
              items={(charsManifest ?? []).map((c) => ({
                id: c.id,
                name: c.name,
                author: c.author,
                description: c.description,
                thumbnailUrl: c.thumbnail
                  ? `https://raw.githubusercontent.com/fedevgonzalez/pixel-office-community/main/${c.thumbnail}`
                  : null,
                subtitle: `by ${c.author}`,
                fallbackIcon: '🧑‍💻',
              }))}
              loading={charsLoading}
              error={charsError}
              installingId={installingCharId}
              installedIds={installedCharIds}
              onInstall={handleInstallCharacter}
              itemLabel="Character"
              emptyState={{
                icon: '🧑‍💻',
                primary: 'No community characters yet — be the first.',
                hint: 'Drop a 168×96 sprite sheet into the community repo and open a PR.',
              }}
              onRetry={() => { setCharsError(null); setCharsManifest(null) }}
            />
          )}
          {activeKind === 'props' && (
            <CommunityAssetGrid
              items={(propsManifest ?? []).map((p) => ({
                id: p.id,
                name: p.name,
                author: p.author,
                description: p.description,
                thumbnailUrl: p.thumbnail
                  ? `https://raw.githubusercontent.com/fedevgonzalez/pixel-office-community/main/${p.thumbnail}`
                  : null,
                subtitle: `${p.category || 'decor'} · by ${p.author}`,
                fallbackIcon: '🪴',
              }))}
              loading={propsLoading}
              error={propsError}
              installingId={installingPropId}
              installedIds={installedPropIds}
              onInstall={handleInstallProp}
              itemLabel="Prop"
              emptyState={{
                icon: '🪴',
                primary: 'No community props yet — be the first.',
                hint: 'Drop a sprite + metadata.json into sprites/props/ in the community repo.',
              }}
              onRetry={() => { setPropsError(null); setPropsManifest(null) }}
            />
          )}
          {activeKind === 'backgrounds' && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--pixel-text-dim)' }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>🌆</div>
              <div style={{ fontSize: '20px', color: 'var(--pixel-text)', marginBottom: 6 }}>
                Image-based backgrounds are on the roadmap.
              </div>
              <div style={{ fontSize: '16px', color: 'var(--pixel-text-hint)', marginBottom: 20, lineHeight: 1.4 }}>
                Today the world background is a procedural theme generated in code (grass, sidewalk, road, decorations). Installing a community .png needs a new image-tile renderer that also interacts with day/night — coming in a follow-up.
              </div>
              <a
                href="https://github.com/fedevgonzalez/pixel-office-community/tree/main/backgrounds"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-block', padding: '8px 14px', fontSize: 16,
                  background: 'var(--pixel-btn-bg)', color: 'var(--pixel-text)',
                  border: '2px solid var(--pixel-border)', borderRadius: 0, textDecoration: 'none',
                }}
              >
                Browse contributions on GitHub →
              </a>
            </div>
          )}
          {activeKind === 'layouts' && loading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, padding: '4px 0' }}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="pixel-agents-pulse" style={{
                  height: 160,
                  background: 'rgba(255, 245, 235, 0.08)',
                  border: '2px solid var(--pixel-border-soft)',
                }} />
              ))}
            </div>
          )}

          {activeKind === 'layouts' && error && !loading && (
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

          {activeKind === 'layouts' && manifest && !loading && !error && (
            <>
              {sortedLayouts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--pixel-text-dim)' }}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>🏢</div>
                  <div style={{ fontSize: 20, color: 'var(--pixel-text)', marginBottom: 6 }}>No community layouts yet — be the first.</div>
                  <div style={{ fontSize: 16, color: 'var(--pixel-text-hint)', marginBottom: 16 }}>
                    Share your office design and it'll appear here after a quick PR review.
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
                      isVoting={votingId === layout.id}
                      signingIn={signingIn}
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
  isVoting: boolean
  signingIn: boolean
  onLike: () => void
  onSignIn: () => void
}

function GalleryCard({ layout, screenshotUrl, isImporting, isConfirming, onConfirm, onCancel, onImport, liked, isAuthed, isVoting, signingIn, onLike, onSignIn }: GalleryCardProps) {
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
        ) : layout.screenshot ? (
          <div className="pixel-agents-pulse" style={{ width: '100%', height: '100%', background: 'rgba(232, 168, 76, 0.06)' }} />
        ) : (
          <span style={{ fontSize: '16px', color: 'rgba(255, 245, 235, 0.25)' }}>No preview</span>
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
            disabled={isVoting || signingIn}
            aria-busy={isVoting}
            aria-label={isVoting ? 'Saving...' : liked ? `Unstar ${layout.name}` : `Star ${layout.name}`}
            aria-pressed={liked}
            title={!hasIssue ? 'Rating coming soon' : !isAuthed ? 'Sign in to rate' : isVoting ? 'Saving...' : liked ? 'Remove star' : 'Star this layout'}
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
              cursor: isVoting ? 'default' : 'pointer',
              opacity: isVoting ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            <span className={isVoting ? 'pixel-agents-pulse' : undefined} style={{ fontSize: '18px', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px' }}>{starChar}</span>
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
            }}
          >
            <span className={isImporting ? 'pixel-agents-pulse' : undefined} aria-live="polite">{isImporting ? 'Importing…' : 'Use this Layout'}</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ── Shared community-asset grid (pets, characters) ────────────

function CommunityAssetGrid({
  items,
  loading,
  error,
  installingId,
  installedIds,
  onInstall,
  itemLabel,
  emptyState,
  onRetry,
}: CommunityAssetGridProps) {
  if (loading) {
    // Skeleton cards mirror the real card footprint so the layout doesn't
    // jump when the manifest arrives. Pulse comes from the global animation.
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, padding: '4px 0' }} aria-busy="true" aria-live="polite">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="pixel-agents-pulse"
            style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              padding: 10, background: 'var(--pixel-surface)',
              border: '2px solid var(--pixel-border)', borderRadius: 0,
              minHeight: 132,
            }}
          >
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 64, height: 64, background: 'rgba(255,245,235,0.08)', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
                <div style={{ height: 16, background: 'rgba(255,245,235,0.08)', width: '70%' }} />
                <div style={{ height: 12, background: 'rgba(255,245,235,0.06)', width: '50%' }} />
              </div>
            </div>
            <div style={{ height: 32, background: 'rgba(255,245,235,0.06)', marginTop: 'auto' }} />
          </div>
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 24, color: 'var(--pixel-error)', fontSize: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div>{error}</div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="pixel-btn"
            style={{ padding: '6px 14px', fontSize: 16, border: '2px solid var(--pixel-border)' }}
          >
            Retry
          </button>
        )}
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--pixel-text-dim)' }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>{emptyState.icon}</div>
        <div style={{ fontSize: 20, color: 'var(--pixel-text)', marginBottom: 6 }}>{emptyState.primary}</div>
        <div style={{ fontSize: 16, color: 'var(--pixel-text-hint)' }}>{emptyState.hint}</div>
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, padding: '4px 0' }}>
      {items.map((item) => {
        const installed = installedIds.has(item.id)
        const installing = installingId === item.id
        return (
          <div key={item.id} style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            padding: 10, background: 'var(--pixel-surface)',
            border: '2px solid var(--pixel-border)', borderRadius: 0,
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  width={64} height={64}
                  alt={`${item.name} — ${item.subtitle}`}
                  style={{ imageRendering: 'pixelated', background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}
                />
              ) : (
                <div
                  role="img"
                  aria-label={`${item.name} (no thumbnail)`}
                  style={{ width: 64, height: 64, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}
                >
                  <span aria-hidden="true">{item.fallbackIcon}</span>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, color: 'var(--pixel-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ fontSize: 14, color: 'var(--pixel-text-hint)' }}>{item.subtitle}</div>
              </div>
            </div>
            {item.description && (
              <div style={{ fontSize: 14, color: 'var(--pixel-text-dim)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                {item.description}
              </div>
            )}
            <button
              onClick={() => !installed && !installing && onInstall(item.id)}
              disabled={installed || installing}
              style={{
                padding: '8px 12px', fontSize: 16,
                background: installed ? 'transparent' : 'var(--pixel-agent-bg)',
                color: installed ? 'var(--pixel-text-hint)' : 'var(--pixel-agent-text)',
                border: `2px solid ${installed ? 'var(--pixel-border)' : 'var(--pixel-agent-border)'}`,
                borderRadius: 0,
                cursor: installed || installing ? 'default' : 'pointer',
              }}
            >
              {installed ? '✓ Installed' : installing ? 'Installing…' : `Use this ${itemLabel}`}
            </button>
          </div>
        )
      })}
    </div>
  )
}
