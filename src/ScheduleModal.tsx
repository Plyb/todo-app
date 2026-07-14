import { useEffect, useState } from 'react'
import type { Task, Status, ScheduledTransition } from './types'
import { loadScheduledTransitions, addScheduledTransition, deleteScheduledTransition } from './db'
import { theme } from './theme'
import { Modal } from './ui/Modal'
import { PrimaryButton, SecondaryButton } from './ui/Button'

type ScheduleModalProps = {
  task: Task
  statuses: Status[]
  onClose: () => void
  onTransitionsChanged: () => void
}

export function ScheduleModal({ task, statuses, onClose, onTransitionsChanged }: ScheduleModalProps) {
  const [transitions, setTransitions] = useState<ScheduledTransition[]>([])
  const [showForm, setShowForm] = useState(false)
  const [date, setDate] = useState('')
  const [statusSlug, setStatusSlug] = useState(statuses[0]?.slug ?? '')

  useEffect(() => {
    loadScheduledTransitions(task.id).then(setTransitions)
  }, [task.id])

  const takenDates = new Set(transitions.map((t) => t.date))
  const dateConflict = date !== '' && takenDates.has(date)
  const canSubmit = date !== '' && statusSlug !== '' && !dateConflict

  async function handleAdd() {
    if (!canSubmit) return
    const added = await addScheduledTransition(task.id, date, statusSlug)
    const next = [...transitions, added].sort((a, b) => (a.date < b.date ? -1 : 1))
    setTransitions(next)
    setShowForm(false)
    setDate('')
    onTransitionsChanged()
  }

  async function handleDelete(id: number) {
    await deleteScheduledTransition(id)
    setTransitions((prev) => prev.filter((t) => t.id !== id))
    onTransitionsChanged()
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <Modal onClose={onClose} cardStyle={{ padding: 20, minWidth: 280, maxWidth: 360, width: '85%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontWeight: 600, fontSize: theme.fontSizes.xl }}>Scheduled Transitions</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: theme.fontSizes.xxl, lineHeight: 1, padding: 4 }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {transitions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {transitions.map((t) => {
            const status = statuses.find((s) => s.slug === t.statusSlug)
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm, padding: '6px 0', borderBottom: `1px solid ${theme.colors.divider}` }}>
                <span style={{ fontSize: theme.fontSizes.md, color: '#555' }}>{t.date}</span>
                <span style={{ fontSize: theme.fontSizes.md, color: theme.colors.brand, fontWeight: 500 }}>→ {status?.name ?? t.statusSlug}</span>
                <button
                  onClick={() => handleDelete(t.id)}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.danger, fontSize: theme.fontSizes.xl, padding: '0 4px' }}
                  aria-label="Delete"
                >
                  ✕
                </button>
              </div>
            )
          })}
          {!showForm && (
            <PrimaryButton
              onClick={() => setShowForm(true)}
              style={{ marginTop: 10, padding: '6px 12px', fontSize: theme.fontSizes.md }}
            >
              + Add
            </PrimaryButton>
          )}
        </div>
      )}

      {(transitions.length === 0 || showForm) && (
        <div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: theme.fontSizes.sm, color: '#555', display: 'block', marginBottom: 4 }}>Date</label>
            <input
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
              style={{ fontSize: theme.fontSizes.md, padding: '4px 8px', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radii.sm, width: '100%', boxSizing: 'border-box' }}
            />
            {dateConflict && (
              <span style={{ color: theme.colors.danger, fontSize: theme.fontSizes.xs, display: 'block', marginTop: 4 }}>A transition is already scheduled for this date</span>
            )}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: theme.fontSizes.sm, color: '#555', display: 'block', marginBottom: 4 }}>Status</label>
            <select
              value={statusSlug}
              onChange={(e) => setStatusSlug(e.target.value)}
              style={{ fontSize: theme.fontSizes.md, padding: '4px 8px', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radii.sm, width: '100%', boxSizing: 'border-box' }}
            >
              {statuses.map((s) => (
                <option key={s.slug} value={s.slug}>{s.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: theme.space.sm }}>
            <PrimaryButton
              onClick={handleAdd}
              disabled={!canSubmit}
              style={{ padding: '7px 16px', fontSize: theme.fontSizes.md }}
            >
              Schedule
            </PrimaryButton>
            {showForm && (
              <SecondaryButton
                onClick={() => { setShowForm(false); setDate('') }}
                style={{ padding: '7px 14px', fontSize: theme.fontSizes.md }}
              >
                Cancel
              </SecondaryButton>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
