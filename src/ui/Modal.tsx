import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { theme } from '../theme'

function useScrollLock() {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
}

type ModalVariant = 'modal' | 'editorModal'

type ModalProps = {
  onClose: () => void
  children: ReactNode
  cardStyle?: CSSProperties
  variant?: ModalVariant
}

export function Modal({ onClose, children, cardStyle, variant = 'modal' }: ModalProps) {
  useScrollLock()

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: theme.colors.overlay,
        zIndex: theme.zIndex[variant],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: theme.radii.xl,
          boxShadow: theme.shadows.modal,
          ...cardStyle,
        }}
      >
        {children}
      </div>
    </div>
  )
}

type BottomSheetProps = {
  onClose: () => void
  children: ReactNode
}

export function BottomSheet({ onClose, children }: BottomSheetProps) {
  useScrollLock()

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: theme.colors.overlay,
        zIndex: theme.zIndex.modal,
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: 'white',
          borderRadius: '12px 12px 0 0',
          padding: theme.space.md,
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  )
}
