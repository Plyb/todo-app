import { useEffect, useState } from 'react'
import type { Task, Status, ScheduledTransition } from './db'
import { loadScheduledTransitions, addScheduledTransition, deleteScheduledTransition } from './db'

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
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 12,
          padding: 20,
          minWidth: 280,
          maxWidth: 360,
          width: '85%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>Scheduled Transitions</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
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
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #eee' }}>
                  <span style={{ fontSize: 14, color: '#555' }}>{t.date}</span>
                  <span style={{ fontSize: 14, color: '#1a73e8', fontWeight: 500 }}>→ {status?.name ?? t.statusSlug}</span>
                  <button
                    onClick={() => handleDelete(t.id)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#d32f2f', fontSize: 16, padding: '0 4px' }}
                    aria-label="Delete"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                style={{ marginTop: 10, padding: '6px 12px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
              >
                + Add
              </button>
            )}
          </div>
        )}

        {(transitions.length === 0 || showForm) && (
          <div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 13, color: '#555', display: 'block', marginBottom: 4 }}>Date</label>
              <input
                type="date"
                value={date}
                min={today}
                onChange={(e) => setDate(e.target.value)}
                style={{ fontSize: 14, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4, width: '100%', boxSizing: 'border-box' }}
              />
              {dateConflict && (
                <span style={{ color: '#d32f2f', fontSize: 12, display: 'block', marginTop: 4 }}>A transition is already scheduled for this date</span>
              )}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, color: '#555', display: 'block', marginBottom: 4 }}>Status</label>
              <select
                value={statusSlug}
                onChange={(e) => setStatusSlug(e.target.value)}
                style={{ fontSize: 14, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4, width: '100%', boxSizing: 'border-box' }}
              >
                {statuses.map((s) => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleAdd}
                disabled={!canSubmit}
                style={{ padding: '7px 16px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 6, cursor: canSubmit ? 'pointer' : 'default', fontSize: 14, opacity: canSubmit ? 1 : 0.5 }}
              >
                Schedule
              </button>
              {showForm && (
                <button
                  onClick={() => { setShowForm(false); setDate('') }}
                  style={{ padding: '7px 14px', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', fontSize: 14, background: 'none' }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
