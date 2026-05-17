import { useState, useEffect, useRef, useCallback } from 'react'
import { useModalFocus } from '../hooks/useModalFocus.js'
import { showToast } from './Toast.js'
import type { PetSpecies, PlacedPet, PetPersonality, PetColors, PetPattern, SpriteData } from '../office/types.js'
import { PetPersonality as PetPersonalityConst } from '../office/types.js'
import {
  PET_MAX_NAME_LENGTH,
  PET_WALK_FRAME_DURATION_SEC,
  PET_PREVIEW_CANVAS_SIZE,
  PET_PREVIEW_SCALE,
  PET_LIST_PREVIEW_CANVAS_SIZE,
  PET_LIST_PREVIEW_SCALE,
  PET_BODY_PRESETS,
  PET_EYE_PRESETS,
  PET_NOSE_PRESETS,
  PET_PATTERN_OPTIONS,
  PET_PATTERN_COLOR_PRESETS,
  PET_TUXEDO_DEFAULT_COLOR,
} from '../constants.js'
import { getPetSprites, colorPetSprite, listPetVariants, getPetVariantPalette } from '../office/sprites/petSprites.js'
import { ws } from '../wsClient.js'
import type { PetTemplate } from '../hooks/useExtensionMessages.js'
import { ShareAssetModal } from './ShareAssetModal.js'

interface PetManagerModalProps {
  isOpen: boolean
  onClose: () => void
  pets: PlacedPet[]
  onCreatePet: (pet: Omit<PlacedPet, 'uid' | 'col' | 'row'>) => void
  onDeletePet: (uid: string) => void
  onEditPet: (uid: string, updates: { name?: string; petColors?: PetColors; personality?: string; variant?: string | null; variantColors?: Record<string, string> | null; backstory?: string | null; voiceStyle?: string | null }) => void
  templates: PetTemplate[]
}

const NO_VARIANT = '' as const

function prettyVariantName(slug: string): string {
  return slug.split('_').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
}

/** Shared corner tick badge used to mark a selected/customized swatch. */
function SwatchTick() {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: -2,
        right: -2,
        background: 'var(--pixel-accent)',
        color: 'var(--pixel-bg)',
        fontSize: 11,
        lineHeight: 1,
        width: 14,
        height: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      ✓
    </span>
  )
}

/** Arrow-key navigation + roving focus across `role="radio"` children. */
function radioGroupKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (!keys.includes(e.key)) return
  const radios = Array.from(
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  ).filter((r) => !r.disabled)
  if (radios.length === 0) return
  const active = document.activeElement as HTMLButtonElement | null
  const i = active ? radios.indexOf(active) : -1
  let next = i
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = i <= 0 ? radios.length - 1 : i - 1
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = i >= radios.length - 1 ? 0 : i + 1
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = radios.length - 1
  e.preventDefault()
  radios[next].focus()
  radios[next].click()
}

const speciesOptions: { value: PetSpecies; label: string; emoji: string }[] = [
  { value: 'cat', label: 'Cat', emoji: '🐱' },
  { value: 'dog', label: 'Dog', emoji: '🐶' },
]

const personalityOptions: { value: PetPersonality; label: string; desc: string; icon: string }[] = [
  { value: PetPersonalityConst.LAZY, label: 'Lazy', desc: 'Sleeps a lot, barely moves', icon: '💤' },
  { value: PetPersonalityConst.PLAYFUL, label: 'Playful', desc: 'Always running around', icon: '⚡' },
  { value: PetPersonalityConst.CHILL, label: 'Chill', desc: 'Balanced, likes to watch', icon: '😌' },
  { value: PetPersonalityConst.ENERGETIC, label: 'Energetic', desc: 'Never stays still', icon: '🔥' },
]

const speciesLabel = (s: PetSpecies) => s === 'cat' ? 'Cat' : 'Dog'

// ── Styles ────────────────────────────────────────────────────

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '14px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--pixel-text-hint)',
  marginBottom: 6,
  fontWeight: 'bold',
}

const sectionStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid rgba(255, 245, 235, 0.06)',
}

const lastSectionStyle: React.CSSProperties = {
  padding: '10px 12px',
}

// ── Pet sprite canvas helpers ─────────────────────────────────

function drawPetToCanvas(
  canvas: HTMLCanvasElement,
  species: PetSpecies,
  petColors: PetColors,
  frame: number,
  canvasSize: number,
  scale: number,
  variant?: string,
  variantColors?: Record<string, string> | null,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const sprites = getPetSprites(species, variant, variantColors)
  let sprite: SpriteData = sprites.frames[0][frame % 2]
  // Variants come pre-colored — skip palette swap.
  if (!variant) sprite = colorPetSprite(sprite, species, petColors)

  ctx.clearRect(0, 0, canvasSize, canvasSize)
  ctx.imageSmoothingEnabled = false

  // Sprite dimensions are read from the data so 16×16 procedural sprites and
  // 32×32 PNG variants both render correctly in the preview.
  const spriteH = sprite.length
  const spriteW = sprite[0]?.length ?? 0
  const offsetX = Math.floor((canvasSize - spriteW * scale) / 2)
  const offsetY = Math.floor((canvasSize - spriteH * scale) / 2)

  for (let row = 0; row < sprite.length; row++) {
    for (let col = 0; col < sprite[row].length; col++) {
      const px = sprite[row][col]
      if (px === '') continue
      ctx.fillStyle = px
      ctx.fillRect(
        offsetX + col * scale,
        offsetY + row * scale,
        scale,
        scale,
      )
    }
  }
}

/** Large animated pet preview canvas for the form */
function PetPreview({ species, petColors, variant, variantColors }: { species: PetSpecies; petColors: PetColors; variant?: string; variantColors?: Record<string, string> | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(0)
  const timerRef = useRef(0)
  const rafRef = useRef(0)
  const lastTimeRef = useRef(0)

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawPetToCanvas(canvas, species, petColors, frameRef.current, PET_PREVIEW_CANVAS_SIZE, PET_PREVIEW_SCALE, variant, variantColors)
  }, [species, petColors, variant, variantColors])

  useEffect(() => {
    lastTimeRef.current = performance.now()
    timerRef.current = 0
    frameRef.current = 0

    const animate = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000
      lastTimeRef.current = now
      timerRef.current += dt

      if (timerRef.current >= PET_WALK_FRAME_DURATION_SEC) {
        timerRef.current -= PET_WALK_FRAME_DURATION_SEC
        frameRef.current = (frameRef.current + 1) % 2
      }

      drawFrame()
      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [drawFrame])

  useEffect(() => {
    drawFrame()
  }, [drawFrame])

  return (
    <canvas
      ref={canvasRef}
      width={PET_PREVIEW_CANVAS_SIZE}
      height={PET_PREVIEW_CANVAS_SIZE}
      aria-label={`${species} preview`}
      style={{
        width: PET_PREVIEW_CANVAS_SIZE,
        height: PET_PREVIEW_CANVAS_SIZE,
        imageRendering: 'pixelated',
        border: '2px solid var(--pixel-border)',
        background: 'var(--pixel-surface)',
        flexShrink: 0,
      }}
    />
  )
}

/** Small static pet sprite for the list view */
function PetListSprite({ species, petColors, variant, variantColors }: { species: PetSpecies; petColors?: PetColors; variant?: string; variantColors?: Record<string, string> | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawPetToCanvas(canvas, species, petColors ?? {}, 0, PET_LIST_PREVIEW_CANVAS_SIZE, PET_LIST_PREVIEW_SCALE, variant, variantColors)
  }, [species, petColors, variant, variantColors])

  return (
    <canvas
      ref={canvasRef}
      width={PET_LIST_PREVIEW_CANVAS_SIZE}
      height={PET_LIST_PREVIEW_CANVAS_SIZE}
      aria-hidden="true"
      style={{
        width: PET_LIST_PREVIEW_CANVAS_SIZE,
        height: PET_LIST_PREVIEW_CANVAS_SIZE,
        imageRendering: 'pixelated',
        flexShrink: 0,
      }}
    />
  )
}

/** Color swatch grid for a single body part */
function SwatchPicker({
  label,
  presets,
  value,
  onChange,
}: {
  label: string
  presets: Array<{ label: string; hex: string }>
  value: string
  onChange: (hex: string) => void
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={sectionLabelStyle}>{label}</div>
      <div
        role="radiogroup"
        aria-label={label}
        onKeyDown={radioGroupKeyDown}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}
      >
        {presets.map((preset, i) => {
          const isDefault = preset.hex === ''
          const selected = value === preset.hex
          return (
            <button
              key={i}
              role="radio"
              aria-checked={selected}
              aria-label={preset.label}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(preset.hex)}
              title={preset.label}
              style={{
                width: isDefault ? undefined : 28,
                height: 28,
                padding: isDefault ? '0 8px' : 0,
                background: isDefault ? 'rgba(255, 245, 235, 0.07)' : preset.hex,
                color: isDefault ? 'rgba(255, 245, 235, 0.5)' : 'transparent',
                fontSize: '13px',
                border: selected
                  ? '2px solid var(--pixel-accent)'
                  : '2px solid var(--pixel-border-soft)',
                borderRadius: 0,
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              {isDefault ? 'Default' : ''}
              {selected && !isDefault && <SwatchTick />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** 2x2 grid personality selector */
function PersonalityPicker({
  personality,
  onPersonalityChange,
}: {
  personality: PetPersonality
  onPersonalityChange: (p: PetPersonality) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Personality"
      onKeyDown={radioGroupKeyDown}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 4,
      }}
    >
      {personalityOptions.map((opt) => {
        const isSelected = personality === opt.value
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onPersonalityChange(opt.value)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '7px 9px',
              background: isSelected
                ? 'var(--pixel-active-bg)'
                : 'var(--pixel-surface-soft)',
              color: isSelected ? 'var(--pixel-accent)' : 'rgba(255, 245, 235, 0.7)',
              border: isSelected
                ? '2px solid var(--pixel-accent-dim)'
                : '2px solid rgba(255, 245, 235, 0.08)',
              borderRadius: 0,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: '16px', marginBottom: 2 }}>
              {opt.icon} <span style={{ fontWeight: 'bold', fontSize: '18px' }}>{opt.label}</span>
            </span>
            <span style={{
              fontSize: '13px',
              color: isSelected ? 'var(--pixel-accent-dim)' : 'rgba(255, 245, 235, 0.55)',
              lineHeight: 1.3,
            }}>
              {opt.desc}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Pattern buttons with visual hint dots */
function PatternPicker({
  petColors,
  setPetColors,
}: {
  petColors: PetColors
  setPetColors: (c: PetColors) => void
}) {
  return (
    <>
      <div
        role="radiogroup"
        aria-label="Coat Pattern"
        onKeyDown={radioGroupKeyDown}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}
      >
        {PET_PATTERN_OPTIONS.map((opt) => {
          const isSelected = (petColors.pattern || 'solid') === opt.value
          return (
            <button
              key={opt.value}
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => {
                const newPattern = opt.value === 'solid' ? undefined : opt.value as PetPattern
                const defaultColor = opt.value === 'tuxedo' ? PET_TUXEDO_DEFAULT_COLOR : PET_PATTERN_COLOR_PRESETS[0].hex
                const newPatternColor = newPattern
                  ? (petColors.patternColor || defaultColor)
                  : undefined
                setPetColors({ ...petColors, pattern: newPattern, patternColor: newPatternColor })
              }}
              title={opt.desc}
              style={{
                padding: '5px 10px',
                fontSize: '16px',
                background: isSelected
                  ? 'var(--pixel-active-bg)'
                  : 'var(--pixel-surface-soft)',
                color: isSelected ? 'var(--pixel-accent)' : 'rgba(255, 245, 235, 0.6)',
                border: isSelected
                  ? '2px solid var(--pixel-accent-dim)'
                  : '2px solid rgba(255, 245, 235, 0.08)',
                borderRadius: 0,
                cursor: 'pointer',

              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {petColors.pattern && petColors.pattern !== 'solid' && (
        <SwatchPicker
          label="Pattern Color"
          presets={PET_PATTERN_COLOR_PRESETS}
          value={petColors.patternColor || ''}
          onChange={(hex) => setPetColors({ ...petColors, patternColor: hex || undefined })}
        />
      )}
    </>
  )
}

function PetForm({
  species,
  setSpecies,
  name,
  setName,
  petColors,
  setPetColors,
  personality,
  setPersonality,
  variant,
  setVariant,
  variantColors,
  setVariantColors,
  backstory,
  setBackstory,
  voiceStyle,
  setVoiceStyle,
  showSpeciesSelector,
}: {
  species: PetSpecies
  setSpecies: (s: PetSpecies) => void
  name: string
  setName: (n: string) => void
  petColors: PetColors
  setPetColors: (c: PetColors) => void
  personality: PetPersonality
  setPersonality: (p: PetPersonality) => void
  variant: string
  setVariant: (v: string) => void
  variantColors: Record<string, string>
  setVariantColors: (c: Record<string, string>) => void
  backstory: string
  setBackstory: (s: string) => void
  voiceStyle: string
  setVoiceStyle: (s: string) => void
  showSpeciesSelector: boolean
}) {
  const availableVariants = listPetVariants(species)
  const hasVariants = availableVariants.length > 0
  const variantPalette = variant ? getPetVariantPalette(species, variant) : []
  return (
    <>
      {/* Preview + Species selector row */}
      <div style={{ ...sectionStyle, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Large animated preview */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <PetPreview species={species} petColors={petColors} variant={variant || undefined} variantColors={variantColors} />
          {showSpeciesSelector && (
            <div
              role="radiogroup"
              aria-label="Species"
              onKeyDown={radioGroupKeyDown}
              style={{ display: 'flex', gap: 4 }}
            >
              {speciesOptions.map((opt) => (
                <button
                  key={opt.value}
                  role="radio"
                  aria-checked={species === opt.value}
                  tabIndex={species === opt.value ? 0 : -1}
                  onClick={() => setSpecies(opt.value)}
                  title={opt.label}
                  style={{
                    width: 44,
                    height: 44,
                    fontSize: '16px',
                    background: species === opt.value ? 'var(--pixel-active-bg)' : 'var(--pixel-surface-soft)',
                    color: species === opt.value ? 'var(--pixel-accent)' : 'rgba(255, 245, 235, 0.6)',
                    border: species === opt.value
                      ? '2px solid var(--pixel-accent-dim)'
                      : '2px solid rgba(255, 245, 235, 0.08)',
                    borderRadius: 0,
                    cursor: 'pointer',
                  }}
                >
                  {opt.emoji}
                </button>
              ))}
            </div>
          )}
          {!showSpeciesSelector && (
            <div style={{ fontSize: '16px', color: 'rgba(255, 245, 235, 0.4)' }}>
              {speciesLabel(species)}
            </div>
          )}
        </div>

        {/* Name + Personality stacked beside preview */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label
              htmlFor="pet-name-input"
              style={sectionLabelStyle}
            >
              Name
            </label>
            <input
              id="pet-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={species === 'cat' ? 'Kitty' : 'Buddy'}
              maxLength={PET_MAX_NAME_LENGTH}
              className="pixel-input"
            />
          </div>

          <div>
            <div style={sectionLabelStyle}>Personality</div>
            <PersonalityPicker
              personality={personality}
              onPersonalityChange={setPersonality}
            />
          </div>

          {hasVariants && (
            <div>
              <div style={sectionLabelStyle}>Breed</div>
              <select
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                className="pixel-input"
                style={{ cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <option value={NO_VARIANT}>Default (customizable colors)</option>
                {availableVariants.map((v) => (
                  <option key={v} value={v}>{prettyVariantName(v)}</option>
                ))}
              </select>
              {variant && (
                <div style={{ fontSize: '13px', color: 'var(--pixel-text-hint)', marginTop: 4 }}>
                  Tweak any zone color below to recolor this breed.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Zone recoloring — appears when a breed variant is selected */}
      {variant && variantPalette.length > 0 && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={sectionLabelStyle}>Recolor Zones</div>
            {Object.keys(variantColors).length > 0 && (
              <button
                type="button"
                onClick={() => setVariantColors({})}
                style={{
                  fontSize: '12px',
                  padding: '3px 8px',
                  background: 'transparent',
                  color: 'var(--pixel-text-hint)',
                  border: '1px solid var(--pixel-border)',
                  borderRadius: 0,
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase' as const,
                }}
              >
                Reset
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {variantPalette.map((srcHex) => {
              const current = variantColors[srcHex] || srcHex
              return (
                <label
                  key={srcHex}
                  style={{
                    position: 'relative',
                    width: 36,
                    height: 36,
                    background: current,
                    border: variantColors[srcHex] ? '2px solid var(--pixel-accent)' : '2px solid var(--pixel-border-soft)',
                    cursor: 'pointer',
                    display: 'block',
                  }}
                  title={`Original: ${srcHex} → ${current}`}
                >
                  <input
                    type="color"
                    value={current}
                    onChange={(e) => {
                      const dst = e.target.value
                      if (dst.toLowerCase() === srcHex.toLowerCase()) {
                        const next = { ...variantColors }
                        delete next[srcHex]
                        setVariantColors(next)
                      } else {
                        setVariantColors({ ...variantColors, [srcHex]: dst })
                      }
                    }}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                    aria-label={`Recolor ${srcHex}`}
                  />
                  {variantColors[srcHex] && <SwatchTick />}
                </label>
              )
            })}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--pixel-text-hint)', marginTop: 6 }}>
            Click a swatch to pick a new color for that zone. Highlights stay accented when remapped.
          </div>
        </div>
      )}

      {/* Voice — optional narration hints used by external bridges */}
      <div style={sectionStyle}>
        <label htmlFor="pet-voice-style" style={sectionLabelStyle}>Voice style (optional)</label>
        <input
          id="pet-voice-style"
          type="text"
          value={voiceStyle}
          onChange={(e) => setVoiceStyle(e.target.value)}
          placeholder="e.g. snobby, gossipy, deadpan"
          maxLength={60}
          className="pixel-input"
        />
        <label htmlFor="pet-backstory" style={{ ...sectionLabelStyle, marginTop: 8 }}>Backstory (optional)</label>
        <textarea
          id="pet-backstory"
          value={backstory}
          onChange={(e) => setBackstory(e.target.value)}
          placeholder="A line or two about who this pet is — coloured the narrator's voice."
          maxLength={400}
          rows={2}
          className="pixel-input"
          style={{ fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>

      {/* Body colors — only the default (no-variant) sprite respects these. */}
      <div style={{ ...sectionStyle, display: variant ? 'none' : 'block' }}>
        <SwatchPicker
          label="Body"
          presets={PET_BODY_PRESETS}
          value={petColors.body || ''}
          onChange={(hex) => setPetColors({ ...petColors, body: hex || undefined })}
        />
        <SwatchPicker
          label="Eyes"
          presets={PET_EYE_PRESETS}
          value={petColors.eyes || ''}
          onChange={(hex) => setPetColors({ ...petColors, eyes: hex || undefined })}
        />
        <SwatchPicker
          label="Nose"
          presets={PET_NOSE_PRESETS}
          value={petColors.nose || ''}
          onChange={(hex) => setPetColors({ ...petColors, nose: hex || undefined })}
        />
      </div>

      {/* Coat pattern — default sprite only */}
      <div style={{ ...lastSectionStyle, display: variant ? 'none' : 'block' }}>
        <div style={sectionLabelStyle}>Coat Pattern</div>
        <PatternPicker petColors={petColors} setPetColors={setPetColors} />
      </div>
    </>
  )
}

const emptyPetColors: PetColors = {}

const DIRTY_DISCARD_PROMPT = 'You have unsaved changes. Discard them?'

export function PetManagerModal({ isOpen, onClose, pets, onCreatePet, onDeletePet, onEditPet, templates }: PetManagerModalProps) {
  const dialogRef = useModalFocus(isOpen)
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list')
  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [deletingUid, setDeletingUid] = useState<string | null>(null)
  const [species, setSpecies] = useState<PetSpecies>('cat')
  const [name, setName] = useState('')
  const [petColors, setPetColors] = useState<PetColors>(emptyPetColors)
  const [personality, setPersonality] = useState<PetPersonality>(PetPersonalityConst.CHILL)
  const [variant, setVariant] = useState<string>(NO_VARIANT)
  const [variantColors, setVariantColors] = useState<Record<string, string>>({})
  const [backstory, setBackstory] = useState<string>('')
  const [voiceStyle, setVoiceStyle] = useState<string>('')

  // Dirty tracking: snapshot the form when entering create/edit view, then
  // compare against the current values to decide whether to warn on back/close.
  // The snapshot resets to null when we leave the editor (returns to list).
  const initialFormRef = useRef<string | null>(null)
  const formKey = JSON.stringify({ name, species, personality, variant, variantColors, petColors, backstory, voiceStyle })
  const isDirty = initialFormRef.current !== null && initialFormRef.current !== formKey
  useEffect(() => {
    if (view === 'create' || view === 'edit') {
      // Snapshot the just-applied initial state. Subsequent edits become dirty.
      initialFormRef.current = formKey
    } else {
      initialFormRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- formKey is intentionally not in deps
  }, [view])
  const confirmDiscard = useCallback(() => {
    if (!isDirty) return true
    return window.confirm(DIRTY_DISCARD_PROMPT)
  }, [isDirty])
  // Template UI state
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateNameInput, setTemplateNameInput] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view !== 'list') {
          if (!confirmDiscard()) return
          setView('list')
        } else {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, view, confirmDiscard])

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setView('list')
      setEditingUid(null)
      setDeletingUid(null)
      setName('')
      setPetColors(emptyPetColors)
      setSpecies('cat')
      setPersonality(PetPersonalityConst.CHILL)
      setVariant(NO_VARIANT)
      setVariantColors({})
      setSavingTemplate(false)
      setTemplateNameInput('')
      setSelectedTemplateId('')
    }
  }, [isOpen])

  // Reset variant when species changes — a dog variant doesn't apply to a cat.
  useEffect(() => {
    setVariant(NO_VARIANT)
    setVariantColors({})
  }, [species])

  // User-driven variant change must clear stale zone remaps. We use a wrapped
  // setter (not a useEffect on `variant`) so programmatic loads of variant +
  // variantColors together (template apply, edit-start) don't trigger a reset.
  const handleVariantChange = (v: string) => {
    setVariant(v)
    setVariantColors({})
  }

  const templatesForSpecies = templates.filter((t) => t.species === species)

  const handleApplyTemplate = (id: string) => {
    setSelectedTemplateId(id)
    const tpl = templates.find((t) => t.id === id)
    if (!tpl) return
    setSpecies(tpl.species)
    setVariant(tpl.variant || NO_VARIANT)
    setVariantColors((tpl.variantColors as Record<string, string>) || {})
    setPetColors((tpl.petColors as PetColors) || {})
    setPersonality(((tpl.personality as PetPersonality) || PetPersonalityConst.CHILL))
  }

  const handleSaveCurrentAsTemplate = () => {
    const trimmed = templateNameInput.trim()
    if (!trimmed) return
    const colorsSet = !!(petColors.body || petColors.eyes || petColors.nose || (petColors.pattern && petColors.pattern !== 'solid'))
    const hasVariantRemaps = Object.keys(variantColors).length > 0
    const id = `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    ws.postMessage({
      type: 'savePetTemplate',
      template: {
        id, name: trimmed, species, variant: variant || undefined,
        petColors: !variant && colorsSet ? petColors : undefined,
        variantColors: variant && hasVariantRemaps ? variantColors : undefined,
        personality,
      },
    })
    setSavingTemplate(false)
    setTemplateNameInput('')
  }

  const handleDeleteSelectedTemplate = () => {
    if (!selectedTemplateId) return
    ws.postMessage({ type: 'deletePetTemplate', id: selectedTemplateId })
    setSelectedTemplateId('')
  }

  if (!isOpen) return null

  const canAddMore = true // no pet limit — fully open source

  const hasPetColors = petColors.body || petColors.eyes || petColors.nose || (petColors.pattern && petColors.pattern !== 'solid')

  const hasVariantColors = variant && Object.keys(variantColors).length > 0

  const handleCreate = () => {
    const finalName = name.trim() || (species === 'cat' ? 'Kitty' : 'Buddy')
    onCreatePet({
      species,
      name: finalName,
      // When a breed variant is picked we drop the legacy color overrides — they
      // only apply to the default sprite. Zone recoloring lives on `variantColors`.
      petColors: !variant && hasPetColors ? petColors : undefined,
      variantColors: hasVariantColors ? variantColors : undefined,
      personality,
      variant: variant || undefined,
      backstory: backstory.trim() || undefined,
      voiceStyle: voiceStyle.trim() || undefined,
    })
    setView('list')
    setName('')
    setPetColors(emptyPetColors)
    setPersonality(PetPersonalityConst.CHILL)
    setVariant(NO_VARIANT)
    setVariantColors({})
    setBackstory('')
    setVoiceStyle('')
    showToast(`✓ ${finalName} joined the office`)
  }

  const handleStartEdit = (pet: PlacedPet) => {
    setEditingUid(pet.uid)
    setName(pet.name)
    setPetColors(pet.petColors || emptyPetColors)
    setSpecies(pet.species)
    setPersonality((pet.personality as PetPersonality) || PetPersonalityConst.CHILL)
    setVariant(pet.variant || NO_VARIANT)
    setVariantColors(pet.variantColors || {})
    setBackstory(pet.backstory || '')
    setVoiceStyle(pet.voiceStyle || '')
    setView('edit')
  }

  const handleSaveEdit = () => {
    if (!editingUid) return
    const editedPet = pets.find((p) => p.uid === editingUid)
    const finalName = name.trim() || (editedPet?.species === 'cat' ? 'Kitty' : 'Buddy')
    onEditPet(editingUid, {
      name: finalName,
      petColors: !variant && hasPetColors ? petColors : undefined,
      personality,
      // null sentinel = clear variant (default sprite); undefined = leave as-is.
      // We always intend to overwrite, so use null when empty.
      variant: variant || null,
      variantColors: hasVariantColors ? variantColors : null,
      backstory: backstory.trim() || null,
      voiceStyle: voiceStyle.trim() || null,
    })
    setView('list')
    setEditingUid(null)
    showToast(`✓ ${finalName} saved`)
  }

  const handleDelete = (uid: string) => {
    onDeletePet(uid)
    setDeletingUid(null)
  }

  const personalityLabel = (p?: PetPersonality) => {
    const opt = personalityOptions.find((o) => o.value === p)
    return opt ? opt.label : 'Chill'
  }

  const personalityIcon = (p?: PetPersonality) => {
    const opt = personalityOptions.find((o) => o.value === p)
    return opt ? opt.icon : '😌'
  }

  const editingPet = editingUid ? pets.find((p) => p.uid === editingUid) : null
  const headerTitle = view === 'create'
    ? `New ${species === 'cat' ? 'cat' : 'dog'}${isDirty ? ' •' : ''}`
    : view === 'edit'
      ? `Editing: ${editingPet?.name || 'pet'}${isDirty ? ' •' : ''}`
      : 'Your Pets'

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => { if (confirmDiscard()) onClose() }}
        aria-hidden="true"
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
        aria-labelledby="pet-modal-title"
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
          padding: 0,
          boxShadow: 'var(--pixel-shadow)',
          minWidth: 320,
          maxWidth: 420,
          width: '95vw',
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
            {view !== 'list' && (
              <button
                onClick={() => { if (confirmDiscard()) setView('list') }}
                aria-label="Back to pet list"
                className="pixel-close-btn"
                style={{ fontSize: '20px' }}
              >
                &#8592;
              </button>
            )}
            <span id="pet-modal-title" className="modal-header__title">
              {headerTitle}
            </span>
          </div>
          <button
            onClick={() => { if (confirmDiscard()) onClose() }}
            aria-label="Close pet manager"
            className="pixel-close-btn"
          >
            &#215;
          </button>
        </div>

        {/* List view */}
        {view === 'list' && (
          <>
            {pets.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--pixel-text-dim)' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>🐾</div>
                <div style={{ fontSize: 20, color: 'var(--pixel-text)', marginBottom: 6 }}>No pets yet</div>
                <div style={{ fontSize: 16, color: 'var(--pixel-text-hint)', lineHeight: 1.4 }}>
                  Add a cat or dog to keep your agents company.
                </div>
              </div>
            ) : (
              <div style={{ padding: '4px 0' }}>
                {pets.map((pet) => (
                  <div
                    key={pet.uid}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--pixel-surface-soft)',
                      gap: 8,
                    }}
                  >
                    {/* Sprite + info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <PetListSprite species={pet.species} petColors={pet.petColors} variant={pet.variant} variantColors={pet.variantColors} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: '20px',
                          color: 'rgba(255, 245, 235, 0.9)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: 'bold',
                        }}>
                          {pet.name}
                        </div>
                        <div style={{ fontSize: '14px', color: 'rgba(255, 245, 235, 0.55)', marginTop: 1 }}>
                          {speciesLabel(pet.species)} &middot; {personalityIcon(pet.personality as PetPersonality)} {personalityLabel(pet.personality as PetPersonality)}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {deletingUid === pet.uid ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '14px', color: 'rgba(255, 100, 100, 0.85)', marginRight: 2 }}>
                          Remove?
                        </span>
                        <button
                          onClick={() => handleDelete(pet.uid)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '16px',
                            background: 'rgba(200, 50, 50, 0.25)',
                            color: '#ff6060',
                            border: '2px solid rgba(200, 50, 50, 0.5)',
                            borderRadius: 0,
                            cursor: 'pointer',
            
                          }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeletingUid(null)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '16px',
                            background: 'var(--pixel-surface-soft)',
                            color: 'rgba(255, 245, 235, 0.55)',
                            border: '2px solid rgba(255, 245, 235, 0.1)',
                            borderRadius: 0,
                            cursor: 'pointer',
            
                          }}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={() => handleStartEdit(pet)}
                          aria-label={`Edit ${pet.name}`}
                          style={{
                            padding: '4px 10px',
                            fontSize: '16px',
                            background: 'rgba(232, 168, 76, 0.08)',
                            color: 'rgba(232, 168, 76, 0.8)',
                            border: '2px solid rgba(232, 168, 76, 0.2)',
                            borderRadius: 0,
                            cursor: 'pointer',
            
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletingUid(pet.uid)}
                          aria-label={`Remove ${pet.name}`}
                          style={{
                            padding: '4px 10px',
                            fontSize: '16px',
                            background: 'rgba(200, 50, 50, 0.06)',
                            color: 'rgba(220, 80, 80, 0.7)',
                            border: '2px solid rgba(200, 50, 50, 0.15)',
                            borderRadius: 0,
                            cursor: 'pointer',
            
                          }}
                        >
                          &#215;
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add pet button or limit message */}
            <div style={{ padding: '10px 12px', borderTop: pets.length > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              {canAddMore ? (
                <button
                  onClick={() => {
                    setView('create')
                    setName('')
                    setPetColors(emptyPetColors)
                    setSpecies('cat')
                    setPersonality(PetPersonalityConst.CHILL)
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: '20px',
                    background: 'var(--pixel-agent-bg)',
                    color: 'var(--pixel-agent-text)',
                    border: '2px solid var(--pixel-agent-border)',
                    borderRadius: 0,
                    cursor: 'pointer',
    
                    fontWeight: 'bold',
                  }}
                >
                  + Add Pet
                </button>
              ) : null}
            </div>
          </>
        )}

        {/* Create view */}
        {view === 'create' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {/* Templates row — load preset / save current */}
              <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={sectionLabelStyle}>Templates</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => {
                      const id = e.target.value
                      if (id) handleApplyTemplate(id)
                      else setSelectedTemplateId('')
                    }}
                    className="pixel-input"
                    style={{ flex: 1, cursor: 'pointer' }}
                    disabled={templatesForSpecies.length === 0}
                  >
                    <option value="">
                      {templatesForSpecies.length === 0
                        ? `No saved ${species} templates yet`
                        : 'Load a saved template…'}
                    </option>
                    {templatesForSpecies.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  {selectedTemplateId && (
                    <button
                      onClick={handleDeleteSelectedTemplate}
                      aria-label="Delete selected template"
                      title="Delete this template"
                      style={{
                        padding: '8px 12px',
                        fontSize: '20px',
                        background: 'rgba(200, 50, 50, 0.08)',
                        color: 'rgba(220, 80, 80, 0.8)',
                        border: '2px solid rgba(200, 50, 50, 0.2)',
                        borderRadius: 0,
                        cursor: 'pointer',
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                {savingTemplate ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Template name (e.g. Pepe — orange tabby)"
                      value={templateNameInput}
                      onChange={(e) => setTemplateNameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCurrentAsTemplate() }}
                      maxLength={40}
                      className="pixel-input"
                      style={{ flex: 1 }}
                    />
                    <button
                      onClick={handleSaveCurrentAsTemplate}
                      disabled={!templateNameInput.trim()}
                      style={{
                        padding: '8px 14px',
                        fontSize: '18px',
                        background: 'var(--pixel-agent-bg)',
                        color: 'var(--pixel-agent-text)',
                        border: '2px solid var(--pixel-agent-border)',
                        borderRadius: 0,
                        cursor: templateNameInput.trim() ? 'pointer' : 'not-allowed',
                        opacity: templateNameInput.trim() ? 1 : 0.5,
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setSavingTemplate(false); setTemplateNameInput('') }}
                      style={{
                        padding: '8px 14px',
                        fontSize: '18px',
                        background: 'transparent',
                        color: 'var(--pixel-text-hint)',
                        border: '2px solid var(--pixel-border)',
                        borderRadius: 0,
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSavingTemplate(true)}
                    style={{
                      padding: '8px 12px',
                      fontSize: '16px',
                      background: 'rgba(255, 245, 235, 0.04)',
                      color: 'var(--pixel-text-hint)',
                      border: '2px solid var(--pixel-border-soft)',
                      borderRadius: 0,
                      cursor: 'pointer',
                      alignSelf: 'flex-start',
                    }}
                  >
                    + Save current as template
                  </button>
                )}
              </div>
              <PetForm
                species={species} setSpecies={setSpecies}
                name={name} setName={setName}
                petColors={petColors} setPetColors={setPetColors}
                personality={personality} setPersonality={setPersonality}
                variant={variant} setVariant={handleVariantChange}
                variantColors={variantColors} setVariantColors={setVariantColors}
                backstory={backstory} setBackstory={setBackstory}
                voiceStyle={voiceStyle} setVoiceStyle={setVoiceStyle}
                showSpeciesSelector={true}
              />
            </div>
            <div style={{
              padding: '10px 12px',
              borderTop: '2px solid var(--pixel-border)',
              background: 'rgba(0,0,0,0.15)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleCreate}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    fontSize: '20px',
                    background: 'var(--pixel-agent-bg)',
                    color: 'var(--pixel-agent-text)',
                    border: '2px solid var(--pixel-agent-border)',
                    borderRadius: 0,
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  Place in Office
                </button>
                <button
                  onClick={() => setShareOpen(true)}
                  title="Share this pet design to the community gallery"
                  style={{
                    padding: '10px 14px',
                    fontSize: '20px',
                    background: 'transparent',
                    color: 'var(--pixel-text-dim)',
                    border: '2px solid var(--pixel-border)',
                    borderRadius: 0,
                    cursor: 'pointer',
                  }}
                >
                  🌐 Share
                </button>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--pixel-text-hint)', marginTop: 5, textAlign: 'center' }}>
                Pet will appear on a random walkable tile
              </div>
            </div>
            <ShareAssetModal
              isOpen={shareOpen}
              onClose={() => setShareOpen(false)}
              kind="pet"
              defaultName={name}
              defaultSpecies={species}
            />
          </>
        )}

        {/* Edit view */}
        {view === 'edit' && editingUid && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <PetForm
                species={species} setSpecies={setSpecies}
                name={name} setName={setName}
                petColors={petColors} setPetColors={setPetColors}
                personality={personality} setPersonality={setPersonality}
                variant={variant} setVariant={handleVariantChange}
                variantColors={variantColors} setVariantColors={setVariantColors}
                backstory={backstory} setBackstory={setBackstory}
                voiceStyle={voiceStyle} setVoiceStyle={setVoiceStyle}
                showSpeciesSelector={false}
              />
            </div>
            <div style={{
              padding: '10px 12px',
              borderTop: '2px solid var(--pixel-border)',
              background: 'rgba(0,0,0,0.15)',
              flexShrink: 0,
            }}>
              <button
                onClick={handleSaveEdit}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  fontSize: '20px',
                  background: 'var(--pixel-active-bg)',
                  color: 'var(--pixel-accent)',
                  border: '2px solid var(--pixel-accent-dim)',
                  borderRadius: 0,
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                Save Changes
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
