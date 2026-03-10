import { ProBadge } from './ProBadge.js'

interface ProUnlockHintProps {
  message: string
  currentCount: number
  maxCount: number
}

export function ProUnlockHint({ message, currentCount, maxCount }: ProUnlockHintProps) {
  return (
    <div
      role="status"
      aria-label={`${currentCount} of ${maxCount} used. ${message}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        background: 'var(--pixel-pro-bg)',
        border: '1px solid var(--pixel-pro-border)',
        gap: 8,
      }}
    >
      <div>
        <div style={{
          fontSize: '15px',
          color: 'var(--pixel-pro-text)',
          fontWeight: 'bold',
          marginBottom: 2,
        }}>
          {currentCount}/{maxCount} pets
        </div>
        <div style={{
          fontSize: '13px',
          color: 'rgba(255, 245, 235, 0.5)',
          lineHeight: 1.4,
        }}>
          {message}
        </div>
      </div>
      <ProBadge />
    </div>
  )
}
