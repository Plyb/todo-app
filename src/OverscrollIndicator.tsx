import { theme } from './theme'

function OverscrollIndicator({ overscrollPct, overscrollArmed }: { overscrollPct: number; overscrollArmed: boolean }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 28,
        height: 28,
        borderRadius: '50%',
        pointerEvents: 'none',
        color: overscrollArmed ? theme.colors.brand : '#9e9e9e',
        background: `conic-gradient(currentColor ${overscrollPct * 100}%, transparent ${overscrollPct * 100}%)`,
      }}
    />
  )
}

export { OverscrollIndicator }
