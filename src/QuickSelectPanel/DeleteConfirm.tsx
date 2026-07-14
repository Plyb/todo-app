import { useState } from 'react'
import { theme } from '../theme'

type DeleteConfirmProps = {
  taskId: number
  onDelete: (id: number) => void
  onClose: () => void
}

export function DeleteConfirm({ taskId, onDelete, onClose }: DeleteConfirmProps) {
  const [showConfirm, setShowConfirm] = useState(false)

  return showConfirm ? (
    <div style={{ marginTop: 16 }}>
      <p style={{ margin: '0 0 12px' }}>Are you sure?</p>
      <button
        onClick={() => { onDelete(taskId); onClose() }}
        style={{ marginRight: 8, color: '#fff', background: theme.colors.danger, border: 'none', borderRadius: theme.radii.sm, padding: '8px 16px', cursor: 'pointer' }}
      >
        Confirm Delete
      </button>
      <button
        onClick={() => setShowConfirm(false)}
        style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radii.sm, padding: '8px 16px', cursor: 'pointer' }}
      >
        Cancel
      </button>
    </div>
  ) : (
    <button
      onClick={() => setShowConfirm(true)}
      style={{ marginTop: 16, color: '#fff', background: theme.colors.danger, border: 'none', borderRadius: theme.radii.sm, padding: '8px 16px', cursor: 'pointer' }}
    >
      Delete
    </button>
  )
}
