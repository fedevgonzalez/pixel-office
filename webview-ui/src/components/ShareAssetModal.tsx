import { useState, useEffect } from 'react'
import { useModalFocus } from '../hooks/useModalFocus.js'
import { showToast } from './Toast.js'

/**
 * Submission modal for sprite/background assets (pets, characters, props,
 * backgrounds). Companion to ShareModal (which only handles layouts and
 * embeds the layout JSON inline in the issue body).
 *
 * Sprite kinds can't embed binary in the issue URL, so the flow is:
 *   1. user fills out metadata (name, description, tags, plus kind-specific
 *      fields like species/category) in this modal
 *   2. we pre-build a GitHub Issue URL with the metadata block + a hint to
 *      drag-and-drop the sprite PNG into the issue body before submitting
 *   3. the issue's submission label is set per-kind so the right CI workflow
 *      (process-sprite-submission.yml) picks it up
 */

export type ShareAssetKind = 'pet' | 'character' | 'prop' | 'background'

interface ShareAssetModalProps {
  isOpen: boolean
  onClose: () => void
  kind: ShareAssetKind
  /** Pre-fill the name input (e.g. "Pumpkin" when sharing an existing pet) */
  defaultName?: string
  /** Pet-only: species (cat/dog) — only used when kind === 'pet' */
  defaultSpecies?: 'cat' | 'dog'
  /** Prop-only: category */
  defaultCategory?: string
}

const GALLERY_REPO = 'fedevgonzalez/pixel-office-community'
const ISSUE_URL_BASE = `https://github.com/${GALLERY_REPO}/issues/new`

const KIND_CONFIG: Record<ShareAssetKind, {
  label: string
  emoji: string
  submissionLabel: string
  dimensionHint: string
  suggestedTags: string[]
}> = {
  pet:        { label: 'Pet',        emoji: '🐾', submissionLabel: 'pet-submission',        dimensionHint: '160 × 96 px sprite sheet (5 cols × 3 rows of 32×32 frames)', suggestedTags: ['cat', 'dog', 'small', 'fluffy', 'short-hair', 'long-hair', 'tabby', 'breed'] },
  character:  { label: 'Character',  emoji: '🧑‍💻', submissionLabel: 'character-submission',  dimensionHint: '112 × 96 px sprite sheet (7 cols × 3 rows of 16×32 frames)', suggestedTags: ['femme', 'masc', 'androgynous', 'casual', 'formal', 'punk', 'cozy'] },
  prop:       { label: 'Prop',       emoji: '🪴', submissionLabel: 'prop-submission',       dimensionHint: 'Variable size — multiple of 16 px per axis (16×16, 16×24, 32×32, …)', suggestedTags: ['plant', 'lamp', 'furniture', 'electronics', 'decor', 'small', 'large'] },
  background: { label: 'Background', emoji: '🌆', submissionLabel: 'background-submission', dimensionHint: '1280 × 800 px backdrop (or any clean 4× multiple)',           suggestedTags: ['indoor', 'outdoor', 'cozy', 'modern', 'cyberpunk', 'forest', 'cafe'] },
}

const labelStyle: React.CSSProperties = {
  fontSize: '20px',
  color: 'var(--pixel-text-dim)',
  marginBottom: 2,
  display: 'block',
}

function buildIssueBody(
  kind: ShareAssetKind,
  name: string,
  author: string,
  description: string,
  tags: string[],
  species?: string,
  category?: string,
): string {
  const lines: string[] = [
    `## ${KIND_CONFIG[kind].label} Submission`,
    '',
    `**Name:** ${name}`,
    `**Author:** ${author || 'anonymous'}`,
  ]
  if (description) lines.push(`**Description:** ${description}`)
  if (tags.length > 0) lines.push(`**Tags:** ${tags.join(', ')}`)
  if (kind === 'pet' && species) lines.push(`**Species:** ${species}`)
  if (kind === 'prop' && category) lines.push(`**Category:** ${category}`)
  lines.push('')
  lines.push('### Sprite')
  lines.push('')
  lines.push(`<!-- Drag-and-drop your ${KIND_CONFIG[kind].label.toLowerCase()} PNG here. -->`)
  lines.push(`<!-- ${KIND_CONFIG[kind].dimensionHint}. -->`)
  lines.push('')
  lines.push('(PNG goes above this line ↑)')
  return lines.join('\n')
}

export function ShareAssetModal({
  isOpen,
  onClose,
  kind,
  defaultName = '',
  defaultSpecies,
  defaultCategory,
}: ShareAssetModalProps) {
  const dialogRef = useModalFocus(isOpen)
  const cfg = KIND_CONFIG[kind]
  const [name, setName] = useState(defaultName)
  const [author, setAuthor] = useState('')
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [species, setSpecies] = useState<'cat' | 'dog'>(defaultSpecies || 'cat')
  const [category, setCategory] = useState(defaultCategory || 'decor')

  useEffect(() => {
    if (isOpen) {
      setName(defaultName)
      setAuthor('')
      setDescription('')
      setTagsInput('')
      setSpecies(defaultSpecies || 'cat')
      setCategory(defaultCategory || 'decor')
    }
  }, [isOpen, defaultName, defaultSpecies, defaultCategory])

  useEffect(() => {
    if (!isOpen) return
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const canSubmit = name.trim().length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    const tags = tagsInput.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    const body = buildIssueBody(kind, name.trim(), author.trim(), description.trim(), tags, species, category)
    const title = `Add ${cfg.label.toLowerCase()}: ${name.trim()}`
    const url = `${ISSUE_URL_BASE}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${cfg.submissionLabel}`
    window.open(url, '_blank')
    showToast('✓ Submission opened in a new tab')
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--pixel-modal-nested-z)',
        background: 'var(--pixel-modal-backdrop)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-asset-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 92vw)',
          maxHeight: '90vh',
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          boxShadow: 'var(--pixel-shadow)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--pixel-font)',
        }}
      >
        <div className="modal-header">
          <h2 id="share-asset-title" className="modal-header__title">
            {cfg.emoji} Share your {cfg.label.toLowerCase()}
          </h2>
          <button onClick={onClose} aria-label={`Close share ${cfg.label.toLowerCase()} dialog`} className="pixel-close-btn">×</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>

        <p style={{ fontSize: 16, color: 'var(--pixel-text-hint)', marginTop: 0, marginBottom: 14 }}>
          Submitting opens a pre-filled GitHub Issue. <strong>Drag-and-drop your {cfg.dimensionHint.split(' (')[0]} PNG</strong> into the issue body before submitting — CI validates dimensions and creates the PR.
        </p>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle} htmlFor="share-asset-name">Name *</label>
          <input id="share-asset-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="pixel-input" maxLength={40} autoFocus />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle} htmlFor="share-asset-author">Author (your GitHub handle)</label>
          <input id="share-asset-author" type="text" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="anonymous" className="pixel-input" maxLength={40} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle} htmlFor="share-asset-desc">Description</label>
          <input id="share-asset-desc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="pixel-input" maxLength={200} />
        </div>

        {kind === 'pet' && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Species</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['cat', 'dog'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSpecies(s)}
                  style={{
                    flex: 1, padding: '8px 12px', fontSize: 18,
                    background: species === s ? 'var(--pixel-active-bg)' : 'transparent',
                    color: species === s ? 'var(--pixel-accent)' : 'var(--pixel-text-dim)',
                    border: species === s ? '2px solid var(--pixel-accent-dim)' : '2px solid var(--pixel-border)',
                    cursor: 'pointer',
                  }}
                >{s === 'cat' ? '🐱 Cat' : '🐶 Dog'}</button>
              ))}
            </div>
          </div>
        )}

        {kind === 'prop' && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle} htmlFor="share-asset-cat">Category</label>
            <select id="share-asset-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="pixel-input" style={{ cursor: 'pointer' }}>
              {['plant', 'lamp', 'furniture', 'electronics', 'decor'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle} htmlFor="share-asset-tags">Tags (comma-separated)</label>
          <input id="share-asset-tags" type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="pixel-input" maxLength={200} placeholder="cat, calico, warm" />
          <div style={{ fontSize: 14, color: 'var(--pixel-text-hint)', marginTop: 4 }}>
            Suggested: {cfg.suggestedTags.join(', ')}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="pixel-btn" style={{ padding: '8px 14px', fontSize: 18 }}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              padding: '8px 14px', fontSize: 18,
              background: canSubmit ? 'var(--pixel-agent-bg)' : 'var(--pixel-btn-bg)',
              color: canSubmit ? 'var(--pixel-agent-text)' : 'var(--pixel-text-hint)',
              border: `2px solid ${canSubmit ? 'var(--pixel-agent-border)' : 'var(--pixel-border)'}`,
              cursor: canSubmit ? 'pointer' : 'not-allowed', borderRadius: 0,
            }}
          >
            Open GitHub Issue →
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}
