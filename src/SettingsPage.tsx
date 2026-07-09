import { useState } from 'react'
import type { Status } from './tasks'

const loadAutoArchiveSetting = (): string => localStorage.getItem('auto-archive-status-slug') ?? 'none'
const saveAutoArchiveSetting = (slug: string): void => { localStorage.setItem('auto-archive-status-slug', slug) }

type SettingsPageProps = {
  onBack: () => void
  statuses: Status[]
}

export default function SettingsPage({ onBack, statuses }: SettingsPageProps) {
  const [autoArchiveSlug, setAutoArchiveSlug] = useState(loadAutoArchiveSetting)

  function handleAutoArchiveChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const slug = e.target.value
    setAutoArchiveSlug(slug)
    saveAutoArchiveSetting(slug)
  }

  return (
    <main style={{ padding: '64px 16px 16px' }}>
      <button onClick={onBack} style={{ position: 'fixed', top: 16, left: 16 }}>←</button>
      <section>
        <label htmlFor="auto-archive-select">Auto-archive done tasks</label>
        <select id="auto-archive-select" value={autoArchiveSlug} onChange={handleAutoArchiveChange} style={{ marginLeft: 8 }}>
          <option value="none">None</option>
          {statuses.map(s => (
            <option key={s.slug} value={s.slug}>{s.name}</option>
          ))}
        </select>
      </section>
    </main>
  )
}
