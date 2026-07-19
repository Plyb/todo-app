import { theme } from '../theme'

type ArchiveToggleProps = {
  archived: boolean
  onChange: (archived: boolean) => void
}

export function ArchiveToggle({ archived, onChange }: ArchiveToggleProps) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm, marginTop: 12, cursor: 'pointer' }}>
      <input type="checkbox" checked={archived} onChange={(e) => onChange(e.target.checked)} />
      <span style={{ color: '#666', fontSize: theme.fontSizes.md }}>Archived</span>
    </label>
  )
}
