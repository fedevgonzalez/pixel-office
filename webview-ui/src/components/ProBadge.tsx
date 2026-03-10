export function ProBadge() {
  return (
    <span
      aria-label="Pro feature"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        fontSize: '11px',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        fontWeight: 'bold',
        color: 'var(--pixel-pro-text)',
        background: 'var(--pixel-pro-bg)',
        border: '1px solid var(--pixel-pro-border)',
        lineHeight: '16px',
        flexShrink: 0,
      }}
    >
      PRO
    </span>
  )
}
