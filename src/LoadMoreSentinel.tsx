import { useEffect, useRef } from 'react'
import { theme } from './theme'

type LoadMoreSentinelProps = {
  isLoading: boolean
  onVisible: () => void
}

export function LoadMoreSentinel({ isLoading, onVisible }: LoadMoreSentinelProps) {
  const onVisibleRef = useRef(onVisible)
  onVisibleRef.current = onVisible

  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onVisibleRef.current()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
      {isLoading && (
        <div
          role="status"
          aria-label="Loading more tasks"
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: `2px solid ${theme.colors.divider}`,
            borderTopColor: theme.colors.brand,
            animation: 'load-more-spin 0.6s linear infinite',
          }}
        />
      )}
    </div>
  )
}
