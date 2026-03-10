import { useState, useEffect, useRef, useMemo } from 'react'
import { SettingsModal } from './SettingsModal.js'
import { GalleryModal } from './GalleryModal.js'
import { PetManagerModal } from './PetCreatorModal.js'
import type { WorkspaceFolder } from '../hooks/useExtensionMessages.js'
import type { PlacedPet, PetColors, OfficeLayout } from '../office/types.js'
import { vscode, isStandaloneMode } from '../vscodeApi.js'
import { useServerConfig } from '../context/ServerConfigContext.js'
import { PET_MAX_FREE } from '../constants.js'

interface BottomToolbarProps {
  isEditMode: boolean
  onOpenClaude: () => void
  onToggleEditMode: () => void
  isDebugMode: boolean
  onToggleDebugMode: () => void
  workspaceFolders: WorkspaceFolder[]
  pets: PlacedPet[]
  onAddPet?: (pet: Omit<PlacedPet, 'uid' | 'col' | 'row'>) => void
  onDeletePet?: (uid: string) => void
  onEditPet?: (uid: string, updates: { name?: string; petColors?: PetColors; personality?: string }) => void
  getLayout: () => OfficeLayout
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
  onOpenClaude,
  onToggleEditMode,
  isDebugMode,
  onToggleDebugMode,
  workspaceFolders,
  pets,
  onAddPet,
  onDeletePet,
  onEditPet,
  getLayout,
}: BottomToolbarProps) {
  const { featureFlag } = useServerConfig()
  const atPetLimit = !featureFlag && pets.length >= PET_MAX_FREE
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const [isPetCreatorOpen, setIsPetCreatorOpen] = useState(false)
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false)
  const folderPickerRef = useRef<HTMLDivElement>(null)

  // Close folder picker on outside click
  useEffect(() => {
    if (!isFolderPickerOpen) return
    const handleClick = (e: MouseEvent) => {
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node)) {
        setIsFolderPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isFolderPickerOpen])

  const hasMultipleFolders = workspaceFolders.length > 1

  const handleAgentClick = () => {
    if (hasMultipleFolders) {
      setIsFolderPickerOpen((v) => !v)
    } else {
      onOpenClaude()
    }
  }

  const handleFolderSelect = (folder: WorkspaceFolder) => {
    setIsFolderPickerOpen(false)
    vscode.postMessage({ type: 'openClaude', folderPath: folder.path })
  }

  const agentBtnStyle = useMemo<React.CSSProperties>(() => ({
    ...btnBase,
    padding: '8px 14px',
    background: isFolderPickerOpen ? 'var(--pixel-agent-hover-bg)' : 'var(--pixel-agent-bg)',
    border: '2px solid var(--pixel-agent-border)',
    color: 'var(--pixel-agent-text)',
  }), [isFolderPickerOpen])

  return (
    <div style={panelStyle}>
      <div ref={folderPickerRef} style={{ position: 'relative' }}>
        {!isStandaloneMode && (
        <button
          onClick={handleAgentClick}
          className="pixel-btn pixel-btn-primary"
          style={agentBtnStyle}
        >
          + Agent
        </button>
        )}
        {isFolderPickerOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 4,
              background: 'var(--pixel-bg)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
              boxShadow: 'var(--pixel-shadow)',
              minWidth: 160,
              zIndex: 'var(--pixel-controls-z)',
            }}
          >
            {workspaceFolders.map((folder) => (
              <button
                key={folder.path}
                onClick={() => handleFolderSelect(folder)}
                className="pixel-menu-item"
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  fontSize: '22px',
                  color: 'var(--pixel-text)',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 0,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {folder.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Separator between agent button and other toolbar buttons */}
      {!isStandaloneMode && (
        <div style={{
          width: 1,
          height: 20,
          background: 'var(--pixel-border)',
          margin: '0 4px',
        }} />
      )}
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
        Pets{atPetLimit ? ` ${pets.length}/${PET_MAX_FREE}` : ''}
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
        />
      </div>
    </div>
  )
}
