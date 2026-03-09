import { useState, useEffect, useCallback, useRef } from 'react'
import { useModalFocus } from '../hooks/useModalFocus.js'
import { vscode, isStandaloneMode } from '../vscodeApi.js'
import type { OfficeLayout } from '../office/types.js'

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  getLayout: () => OfficeLayout
}

const GALLERY_REPO = 'fedevgonzalez/pixel-office-layouts'
const ISSUE_URL_BASE = `https://github.com/${GALLERY_REPO}/issues/new`
const SUGGESTED_TAGS = ['small', 'large', 'cozy', 'modern', 'starter', 'team', 'solo', 'focus', 'creative', 'plants', 'books', 'meeting']
const URL_BODY_LIMIT = 7500

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: '20px',
  color: 'var(--pixel-text)',
  background: 'rgba(0, 0, 0, 0.3)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: '20px',
  color: 'var(--pixel-text-dim)',
  marginBottom: 2,
  display: 'block',
}

function captureCanvasPreview(): string | null {
  const canvas = document.querySelector('canvas')
  if (!canvas) return null
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function buildIssueBody(name: string, author: string, description: string, tags: string[], layoutJson: string): string {
  const meta = [
    `**Name:** ${name}`,
    `**Author:** ${author || 'anonymous'}`,
    description ? `**Description:** ${description}` : '',
    tags.length > 0 ? `**Tags:** ${tags.join(', ')}` : '',
  ].filter(Boolean).join('\n')

  return `## Layout Submission\n\n${meta}\n\n### Layout JSON\n\n\`\`\`json\n${layoutJson}\n\`\`\`\n`
}

export function ShareModal({ isOpen, onClose, getLayout }: ShareModalProps) {
  const dialogRef = useModalFocus(isOpen)
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [needsManualPaste, setNeedsManualPaste] = useState(false)
  const [copied, setCopied] = useState(false)
  const layoutJsonRef = useRef<string>('')

  // Capture preview when modal opens
  useEffect(() => {
    if (!isOpen) return
    setNeedsManualPaste(false)
    setCopied(false)
    const url = captureCanvasPreview()
    setPreviewUrl(url)
  }, [isOpen])

  // Escape to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const addTag = useCallback((tag: string) => {
    const t = tag.toLowerCase().trim()
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t])
    setTagInput('')
  }, [tags])

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag))
  }, [])

  const handleTagKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInput)
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1))
    }
  }, [tagInput, tags, addTag])

  const handleOpenIssue = useCallback(() => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    const layout = getLayout()
    // Strip pets from shared layout
    const { pets: _pets, ...sharedLayout } = layout
    void _pets

    // Compact JSON (no indentation) to save space
    const layoutJson = JSON.stringify(sharedLayout)
    layoutJsonRef.current = layoutJson

    const authorName = author.trim() || 'anonymous'
    const body = buildIssueBody(trimmedName, authorName, description.trim(), tags, layoutJson)
    const title = `Layout: ${trimmedName}`

    const encodedBody = encodeURIComponent(body)
    const tooLarge = encodedBody.length > URL_BODY_LIMIT

    let issueUrl: string
    if (tooLarge) {
      // Body too large — open issue without layout JSON, user pastes manually
      const fallbackBody = buildIssueBody(
        trimmedName, authorName, description.trim(), tags,
        '<!-- PASTE YOUR LAYOUT JSON HERE -->'
      )
      issueUrl = `${ISSUE_URL_BASE}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(fallbackBody)}&labels=layout-submission`
      setNeedsManualPaste(true)
    } else {
      issueUrl = `${ISSUE_URL_BASE}?title=${encodeURIComponent(title)}&body=${encodedBody}&labels=layout-submission`
      // Close modal after opening (user will be on GitHub)
      setTimeout(onClose, 400)
    }

    if (isStandaloneMode) {
      window.open(issueUrl, '_blank')
    } else {
      vscode.postMessage({ type: 'openExternal', url: issueUrl })
    }
  }, [name, author, description, tags, getLayout, onClose])

  const handleCopyLayout = useCallback(() => {
    navigator.clipboard.writeText(layoutJsonRef.current).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  const isValid = name.trim().length > 0

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0, 0, 0, 0.6)',
          zIndex: 51,
        }}
      />
      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 52,
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          borderRadius: 0,
          padding: '4px',
          boxShadow: 'var(--pixel-shadow)',
          width: '90%',
          maxWidth: 480,
          maxHeight: '85vh',
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
          <span id="share-modal-title" style={{ fontSize: '24px', color: 'var(--pixel-text)' }}>Share Your Layout</span>
          <button
            onClick={onClose}
            aria-label="Close share dialog"
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
        <div style={{ overflow: 'auto', flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Preview */}
          <div
            style={{
              width: '100%',
              aspectRatio: '16/9',
              background: 'var(--pixel-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              border: '2px solid var(--pixel-border)',
            }}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Layout preview"
                style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' }}
              />
            ) : (
              <span style={{ fontSize: '20px', color: 'var(--pixel-text-dim)' }}>No preview</span>
            )}
          </div>

          {/* Name */}
          <div>
            <label htmlFor="share-name" style={labelStyle}>Layout Name *</label>
            <input
              id="share-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Cozy Office"
              maxLength={50}
              style={inputStyle}
            />
          </div>

          {/* Author */}
          <div>
            <label htmlFor="share-author" style={labelStyle}>GitHub Username</label>
            <input
              id="share-author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="your-username"
              maxLength={40}
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="share-desc" style={labelStyle}>Description</label>
            <textarea
              id="share-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A warm little office for 4 agents with a break room"
              maxLength={200}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 48 }}
            />
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="share-tags" style={labelStyle}>Tags</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
              {tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                  style={{
                    fontSize: '16px',
                    padding: '1px 6px',
                    background: 'var(--pixel-active-bg)',
                    color: 'var(--pixel-accent)',
                    border: '1px solid var(--pixel-accent)',
                    borderRadius: 0,
                    cursor: 'pointer',
                  }}
                >
                  {tag} &#215;
                </button>
              ))}
            </div>
            <input
              id="share-tags"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="Type a tag and press Enter"
              style={inputStyle}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).slice(0, 8).map((tag) => (
                <button
                  key={tag}
                  onClick={() => addTag(tag)}
                  style={{
                    fontSize: '16px',
                    padding: '1px 6px',
                    background: 'transparent',
                    color: 'var(--pixel-text-dim)',
                    border: '1px solid var(--pixel-border)',
                    borderRadius: 0,
                    cursor: 'pointer',
                  }}
                >
                  + {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Manual paste fallback for large layouts */}
          {needsManualPaste && (
            <div style={{
              padding: '8px 10px',
              background: 'rgba(232, 168, 76, 0.1)',
              border: '2px solid rgba(232, 168, 76, 0.3)',
              fontSize: '20px',
              color: 'rgba(232, 168, 76, 1)',
            }}>
              Layout too large for URL. Paste it manually into the GitHub Issue.
              <button
                onClick={handleCopyLayout}
                style={{
                  display: 'block',
                  marginTop: 6,
                  padding: '4px 12px',
                  fontSize: '20px',
                  background: 'var(--pixel-btn-bg)',
                  color: 'var(--pixel-text)',
                  border: '2px solid var(--pixel-border)',
                  borderRadius: 0,
                  cursor: 'pointer',
                }}
              >
                {copied ? 'Copied!' : 'Copy Layout JSON'}
              </button>
            </div>
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
          <span style={{ fontSize: '16px', color: 'var(--pixel-text-hint)' }}>
            Opens a GitHub Issue. A bot will create the PR.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              className="pixel-btn"
              style={{
                padding: '6px 14px',
                fontSize: '20px',
                background: 'var(--pixel-btn-bg)',
                color: 'var(--pixel-text-dim)',
                border: '2px solid transparent',
                borderRadius: 0,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleOpenIssue}
              disabled={!isValid}
              className="pixel-btn"
              style={{
                padding: '6px 14px',
                fontSize: '20px',
                background: !isValid ? 'var(--pixel-btn-bg)' : 'var(--pixel-agent-bg)',
                color: !isValid ? 'var(--pixel-text-dim)' : 'var(--pixel-agent-text)',
                border: `2px solid ${!isValid ? 'transparent' : 'var(--pixel-agent-border)'}`,
                borderRadius: 0,
                cursor: !isValid ? 'default' : 'pointer',
                opacity: !isValid ? 'var(--pixel-btn-disabled-opacity)' : 1,
              }}
            >
              Open GitHub Issue
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
