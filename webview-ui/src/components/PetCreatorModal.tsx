import { useState, useEffect, useRef, useCallback } from 'react'
import { useModalFocus } from '../hooks/useModalFocus.js'
import type { PetSpecies, PlacedPet, PetPersonality, PetColors, PetPattern, SpriteData } from '../office/types.js'
import { PetPersonality as PetPersonalityConst } from '../office/types.js'
import {
  PET_MAX_FREE,
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
import { getPetSprites, colorPetSprite } from '../office/sprites/petSprites.js'

interface PetManagerModalProps {
  isOpen: boolean
  onClose: () => void
  pets: PlacedPet[]
  onCreatePet: (pet: Omit<PlacedPet, 'uid' | 'col' | 'row'>) => void
  onDeletePet: (uid: string) => void
  onEditPet: (uid: string, updates: { name?: string; petColors?: PetColors; personality?: string }) => void
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
  color: 'rgba(255, 245, 235, 0.35)',
  marginBottom: 6,
  fontWeight: 'bold',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: '20px',
  background: 'rgba(0, 0, 0, 0.35)',
  color: 'rgba(255, 245, 235, 0.9)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  outline: 'none',
  boxSizing: 'border-box',
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
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const sprites = getPetSprites(species)
  let sprite: SpriteData = sprites.frames[0][frame % 2]
  sprite = colorPetSprite(sprite, species, petColors)

  ctx.clearRect(0, 0, canvasSize, canvasSize)
  ctx.imageSmoothingEnabled = false

  const spriteSize = 16
  const offsetX = Math.floor((canvasSize - spriteSize * scale) / 2)
  const offsetY = Math.floor((canvasSize - spriteSize * scale) / 2)

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
function PetPreview({ species, petColors }: { species: PetSpecies; petColors: PetColors }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(0)
  const timerRef = useRef(0)
  const rafRef = useRef(0)
  const lastTimeRef = useRef(0)

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawPetToCanvas(canvas, species, petColors, frameRef.current, PET_PREVIEW_CANVAS_SIZE, PET_PREVIEW_SCALE)
  }, [species, petColors])

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
function PetListSprite({ species, petColors }: { species: PetSpecies; petColors?: PetColors }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawPetToCanvas(canvas, species, petColors ?? {}, 0, PET_LIST_PREVIEW_CANVAS_SIZE, PET_LIST_PREVIEW_SCALE)
  }, [species, petColors])

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
                  : '2px solid rgba(255, 245, 235, 0.12)',
                borderRadius: 0,
                cursor: 'pointer',

                position: 'relative',
              }}
            >
              {isDefault ? 'Default' : ''}
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
            onClick={() => onPersonalityChange(opt.value)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '7px 9px',
              background: isSelected
                ? 'var(--pixel-active-bg)'
                : 'rgba(255, 245, 235, 0.05)',
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
        style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}
      >
        {PET_PATTERN_OPTIONS.map((opt) => {
          const isSelected = (petColors.pattern || 'solid') === opt.value
          return (
            <button
              key={opt.value}
              role="radio"
              aria-checked={isSelected}
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
                  : 'rgba(255, 245, 235, 0.05)',
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
  showSpeciesSelector: boolean
}) {
  return (
    <>
      {/* Preview + Species selector row */}
      <div style={{ ...sectionStyle, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Large animated preview */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <PetPreview species={species} petColors={petColors} />
          {showSpeciesSelector && (
            <div
              role="radiogroup"
              aria-label="Species"
              style={{ display: 'flex', gap: 4 }}
            >
              {speciesOptions.map((opt) => (
                <button
                  key={opt.value}
                  role="radio"
                  aria-checked={species === opt.value}
                  onClick={() => setSpecies(opt.value)}
                  title={opt.label}
                  style={{
                    width: 44,
                    height: 44,
                    fontSize: '16px',
                    background: species === opt.value ? 'var(--pixel-active-bg)' : 'rgba(255, 245, 235, 0.05)',
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
              style={inputStyle}
            />
          </div>

          <div>
            <div style={sectionLabelStyle}>Personality</div>
            <PersonalityPicker
              personality={personality}
              onPersonalityChange={setPersonality}
            />
          </div>
        </div>
      </div>

      {/* Body colors */}
      <div style={sectionStyle}>
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

      {/* Coat pattern */}
      <div style={lastSectionStyle}>
        <div style={sectionLabelStyle}>Coat Pattern</div>
        <PatternPicker petColors={petColors} setPetColors={setPetColors} />
      </div>
    </>
  )
}

const emptyPetColors: PetColors = {}

export function PetManagerModal({ isOpen, onClose, pets, onCreatePet, onDeletePet, onEditPet }: PetManagerModalProps) {
  const dialogRef = useModalFocus(isOpen)
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list')
  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [deletingUid, setDeletingUid] = useState<string | null>(null)
  const [species, setSpecies] = useState<PetSpecies>('cat')
  const [name, setName] = useState('')
  const [petColors, setPetColors] = useState<PetColors>(emptyPetColors)
  const [personality, setPersonality] = useState<PetPersonality>(PetPersonalityConst.CHILL)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view !== 'list') {
          setView('list')
        } else {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, view])

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
    }
  }, [isOpen])

  if (!isOpen) return null

  const canAddMore = pets.length < PET_MAX_FREE

  const hasPetColors = petColors.body || petColors.eyes || petColors.nose || (petColors.pattern && petColors.pattern !== 'solid')

  const handleCreate = () => {
    onCreatePet({
      species,
      name: name.trim() || (species === 'cat' ? 'Kitty' : 'Buddy'),
      petColors: hasPetColors ? petColors : undefined,
      personality,
    })
    setView('list')
    setName('')
    setPetColors(emptyPetColors)
    setPersonality(PetPersonalityConst.CHILL)
  }

  const handleStartEdit = (pet: PlacedPet) => {
    setEditingUid(pet.uid)
    setName(pet.name)
    setPetColors(pet.petColors || emptyPetColors)
    setSpecies(pet.species)
    setPersonality((pet.personality as PetPersonality) || PetPersonalityConst.CHILL)
    setView('edit')
  }

  const handleSaveEdit = () => {
    if (!editingUid) return
    const editedPet = pets.find((p) => p.uid === editingUid)
    const finalName = name.trim() || (editedPet?.species === 'cat' ? 'Kitty' : 'Buddy')
    onEditPet(editingUid, {
      name: finalName,
      petColors: hasPetColors ? petColors : undefined,
      personality,
    })
    setView('list')
    setEditingUid(null)
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

  const headerTitle = view === 'create' ? 'New Pet' : view === 'edit' ? 'Edit Pet' : 'Your Pets'

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.55)',
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderBottom: '2px solid var(--pixel-border)',
            background: 'rgba(0, 0, 0, 0.2)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {view !== 'list' && (
              <button
                onClick={() => setView('list')}
                aria-label="Back to pet list"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 0,
                  color: 'rgba(255, 245, 235, 0.5)',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '2px 8px 2px 4px',
                  lineHeight: 1,
                }}
              >
                &#8592;
              </button>
            )}
            <span id="pet-modal-title" style={{ fontSize: '22px', color: 'var(--pixel-text)', fontWeight: 'bold' }}>
              {headerTitle}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: 0,
              color: 'rgba(255, 245, 235, 0.45)',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px 6px',
              lineHeight: 1,
            }}
          >
            &#215;
          </button>
        </div>

        {/* List view */}
        {view === 'list' && (
          <>
            {pets.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                {/* Empty state */}
                <div style={{
                  fontSize: '28px',
                  marginBottom: 12,
                  opacity: 0.3,
                  userSelect: 'none',
                  color: 'var(--pixel-text-dim)',
                  letterSpacing: '0.15em',
                }}>
                  [ no pets ]
                </div>
                <div style={{ fontSize: '20px', color: 'rgba(255, 245, 235, 0.6)', marginBottom: 6 }}>
                  No pets yet
                </div>
                <div style={{ fontSize: '15px', color: 'rgba(255, 245, 235, 0.3)', lineHeight: 1.5 }}>
                  Add a cat or dog to keep<br />your agents company!
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
                      borderBottom: '1px solid rgba(255, 245, 235, 0.05)',
                      gap: 8,
                    }}
                  >
                    {/* Sprite + info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <PetListSprite species={pet.species} petColors={pet.petColors} />
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
                            background: 'rgba(255, 245, 235, 0.05)',
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
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '10px 12px',
                  fontSize: '15px',
                  color: 'rgba(255, 245, 235, 0.55)',
                  border: '2px solid rgba(255, 245, 235, 0.07)',
                  background: 'rgba(255,245,235,0.02)',
                  lineHeight: 1.5,
                }}>
                  <div>Pet limit reached ({pets.length}/{PET_MAX_FREE})</div>
                  <div style={{ fontSize: '13px', color: 'rgba(255, 245, 235, 0.45)', marginTop: 4 }}>
                    Remove a pet to make room
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Create view */}
        {view === 'create' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <PetForm
                species={species} setSpecies={setSpecies}
                name={name} setName={setName}
                petColors={petColors} setPetColors={setPetColors}
                personality={personality} setPersonality={setPersonality}
                showSpeciesSelector={true}
              />
            </div>
            <div style={{
              padding: '10px 12px',
              borderTop: '2px solid var(--pixel-border)',
              background: 'rgba(0,0,0,0.15)',
              flexShrink: 0,
            }}>
              <button
                onClick={handleCreate}
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
                Place in Office
              </button>
              <div style={{ fontSize: '13px', color: 'var(--pixel-text-hint)', marginTop: 5, textAlign: 'center' }}>
                Pet will appear on a random walkable tile
              </div>
            </div>
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
