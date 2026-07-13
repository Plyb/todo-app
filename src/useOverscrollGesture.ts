import { useEffect, useRef, useState } from 'react'

type UseOverscrollGestureOptions = {
  enabled: boolean
  threshold: number
  onTrigger: () => void
}

export function useOverscrollGesture({ enabled, threshold, onTrigger }: UseOverscrollGestureOptions) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isTouching, setIsTouching] = useState(false)

  const pullDistanceRef = useRef(0)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const onTriggerRef = useRef(onTrigger)
  onTriggerRef.current = onTrigger

  useEffect(() => {
    function handleScroll() {
      // Negative scrollY only occurs during a rubber-band overscroll, which is only
      // reachable in an installed iOS PWA - other platforms don't overscroll at all,
      // so they rely on the view-selector button instead of this gesture.
      const distance = Math.max(0, -window.scrollY)
      // Read synchronously in handleTouchEnd below without needing pullDistance in this
      // effect's dependency array (which would tear down/reattach these listeners on
      // every scroll tick); the state copy exists only to re-render the pie's fill.
      pullDistanceRef.current = distance
      setPullDistance(distance)
    }
    function handleTouchStart() {
      setIsTouching(true)
    }
    function handleTouchEnd() {
      setIsTouching(false)
      if (pullDistanceRef.current >= threshold && enabledRef.current) {
        onTriggerRef.current()
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [threshold])

  return { pullDistance, isTouching }
}
