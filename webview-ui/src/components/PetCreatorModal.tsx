import { useState, useEffect } from 'react'
import type { PetSpecies, FloorColor, PlacedPet } from '../office/types.js'

interface PetCreatorModalProps {
  isOpen: boolean
  onClose: () => void
  onCreatePet: (pet: Omit<PlacedPet, 'uid' | 'col' | 'row'>) => void
}

const speciesOptions: { value: PetSpecies; label: string }[] = [
  { value: 'cat', label: 'Cat' },
  { value: 'dog', label: 'Dog' },
]

export function PetCreatorModal({ isOpen, onClose, onCreatePet }: PetCreatorModalProps) {
  const [species, setSpecies] = useState<PetSpecies>('cat')
  const [name, setName] = useState('')
  const [hue, setHue] = useState(0)
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setName('')
      setHue(0)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleCreate = () => {
    const color: FloorColor | undefined = hue !== 0
      ? { h: hue, s: 0, b: 0, c: 0 }
      : undefined
    onCreatePet({
      species,
      name: name.trim() || (species === 'cat' ? 'Kitty' : 'Buddy'),
      color,
    })
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
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
          minWidth: 250,
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
          }}
        >
          <span style={{ fontSize: '24px', color: 'rgba(255, 255, 255, 0.9)' }}>Add Pet</span>
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

        {/* Species */}
        <div style={{ padding: '6px 10px' }}>
          <div style={{ fontSize: '20px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4 }}>Species</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {speciesOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSpecies(opt.value)}
                style={{
                  padding: '6px 14px',
                  fontSize: '22px',
                  background: species === opt.value ? 'rgba(90, 140, 255, 0.3)' : 'var(--pixel-btn-bg)',
                  color: species === opt.value ? 'rgba(90, 140, 255, 0.9)' : 'rgba(255, 255, 255, 0.7)',
                  border: species === opt.value ? '2px solid rgba(90, 140, 255, 0.5)' : '2px solid transparent',
                  borderRadius: 0,
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div style={{ padding: '6px 10px' }}>
          <div style={{ fontSize: '20px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4 }}>Name</div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={species === 'cat' ? 'Kitty' : 'Buddy'}
            maxLength={20}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: '22px',
              background: 'rgba(0, 0, 0, 0.3)',
              color: 'rgba(255, 255, 255, 0.9)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Hue shift */}
        <div style={{ padding: '6px 10px' }}>
          <div style={{ fontSize: '20px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4 }}>
            Color Shift: {hue}°
          </div>
          <input
            type="range"
            min={-180}
            max={180}
            value={hue}
            onChange={(e) => setHue(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* Create button */}
        <div style={{ padding: '6px 10px' }}>
          <button
            onClick={handleCreate}
            onMouseEnter={() => setHovered('create')}
            onMouseLeave={() => setHovered(null)}
            style={{
              width: '100%',
              padding: '8px 14px',
              fontSize: '22px',
              background: hovered === 'create' ? 'rgba(90, 200, 140, 0.3)' : 'rgba(90, 200, 140, 0.15)',
              color: 'rgba(90, 200, 140, 0.9)',
              border: '2px solid rgba(90, 200, 140, 0.4)',
              borderRadius: 0,
              cursor: 'pointer',
            }}
          >
            Place in Office
          </button>
          <div style={{ fontSize: '18px', color: 'rgba(255, 255, 255, 0.3)', marginTop: 4, textAlign: 'center' }}>
            Pet will appear on a random walkable tile
          </div>
        </div>
      </div>
    </>
  )
}
