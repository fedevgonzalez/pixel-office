import { useState } from 'react'
import { SettingsModal } from './SettingsModal.js'
import { GalleryModal } from './GalleryModal.js'
import { PetManagerModal } from './PetCreatorModal.js'
import type { PlacedPet, PetColors, OfficeLayout, WorldBackgroundTheme } from '../office/types.js'
import type { TimeMode, Hemisphere, DayNightState } from '../office/engine/dayNightCycle.js'

interface BottomToolbarProps {
  isEditMode: boolean
  onToggleEditMode: () => void
  isDebugMode: boolean
  onToggleDebugMode: () => void
  pets: PlacedPet[]
  onAddPet?: (pet: Omit<PlacedPet, 'uid' | 'col' | 'row'>) => void
  onDeletePet?: (uid: string) => void
  onEditPet?: (uid: string, updates: { name?: string; petColors?: PetColors; personality?: string }) => void
  getLayout: () => OfficeLayout
  dayNight?: {
    state: DayNightState
    mode: TimeMode
    setMode: (m: TimeMode) => void
    hemisphere: Hemisphere
    setHemisphere: (h: Hemisphere) => void
  }
  backgroundTheme?: WorldBackgroundTheme
  onBackgroundThemeChange?: (theme: WorldBackgroundTheme) => void
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 'max(10px, env(safe-area-inset-bottom))',
  left: 10,
  zIndex: 'var(--pixel-controls-z)',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'var(--pixel-bg)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  padding: '4px 6px',
  boxShadow: 'var(--pixel-shadow)',
}

const btnBase: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: '24px',
  color: 'var(--pixel-text)',
  background: 'var(--pixel-btn-bg)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}


export function BottomToolbar({
  isEditMode,
  onToggleEditMode,
  isDebugMode,
  onToggleDebugMode,
  pets,
  onAddPet,
  onDeletePet,
  onEditPet,
  getLayout,
  dayNight,
  backgroundTheme,
  onBackgroundThemeChange,
}: BottomToolbarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const [isPetCreatorOpen, setIsPetCreatorOpen] = useState(false)

  return (
    <div style={panelStyle}>
      <button
        onClick={onToggleEditMode}
        className={`pixel-btn ${isEditMode ? 'active' : ''}`}
        style={isEditMode
          ? { ...btnBase, background: 'var(--pixel-active-bg)', border: '2px solid var(--pixel-accent)' }
          : btnBase
        }
        title="Edit office layout"
      >
        Layout
      </button>
      <button
        onClick={() => setIsGalleryOpen((v) => !v)}
        className={`pixel-btn ${isGalleryOpen ? 'active' : ''}`}
        style={isGalleryOpen
          ? { ...btnBase, background: 'var(--pixel-active-bg)', border: '2px solid var(--pixel-accent)' }
          : btnBase
        }
        title="Browse community layouts"
      >
        Community
      </button>
      <GalleryModal isOpen={isGalleryOpen} onClose={() => setIsGalleryOpen(false)} getLayout={getLayout} />
      <button
        onClick={() => setIsPetCreatorOpen((v) => !v)}
        className={`pixel-btn ${isPetCreatorOpen ? 'active' : ''}`}
        style={isPetCreatorOpen
          ? { ...btnBase, background: 'var(--pixel-active-bg)', border: '2px solid var(--pixel-accent)' }
          : btnBase
        }
        title="Add a pet to your office"
      >
        Pets
      </button>
      {isPetCreatorOpen && onAddPet && onDeletePet && onEditPet && (
        <PetManagerModal
          isOpen={isPetCreatorOpen}
          onClose={() => setIsPetCreatorOpen(false)}
          pets={pets}
          onCreatePet={(pet) => {
            onAddPet(pet)
          }}
          onDeletePet={onDeletePet}
          onEditPet={onEditPet}
        />
      )}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setIsSettingsOpen((v) => !v)}
          className={`pixel-btn ${isSettingsOpen ? 'active' : ''}`}
          style={isSettingsOpen
            ? { ...btnBase, background: 'var(--pixel-active-bg)', border: '2px solid var(--pixel-accent)' }
            : btnBase
          }
          title="Settings"
        >
          Settings
        </button>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isDebugMode={isDebugMode}
          onToggleDebugMode={onToggleDebugMode}
          dayNight={dayNight}
          backgroundTheme={backgroundTheme}
          onBackgroundThemeChange={onBackgroundThemeChange}
        />
      </div>
    </div>
  )
}
