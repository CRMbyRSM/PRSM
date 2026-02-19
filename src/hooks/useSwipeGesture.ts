import { useEffect, useRef } from 'react'

export type SwipeDirection = 'left' | 'right'

export interface SwipeCallbacks {
  onSwipeStart?: (direction: SwipeDirection) => void
  onSwipeMove?: (direction: SwipeDirection, progress: number) => void
  onSwipeEnd?: (direction: SwipeDirection, completed: boolean) => void
}

interface TouchState {
  startX: number
  startY: number
  startTime: number
  direction: SwipeDirection | null
  locked: boolean
  cancelled: boolean
}

const EDGE_THRESHOLD = 20 // px from screen edge to trigger
const DIRECTION_LOCK_DISTANCE = 10 // px before locking direction

export function useSwipeGesture(callbacks: SwipeCallbacks) {
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  const touchState = useRef<TouchState | null>(null)

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // Ignore multi-touch
      if (e.touches.length > 1) {
        touchState.current = null
        return
      }

      // Disabled when keyboard is visible
      if (document.body.classList.contains('keyboard-visible')) return

      const touch = e.touches[0]
      const screenWidth = window.innerWidth
      const x = touch.clientX

      // Only activate for edge swipes
      const isLeftEdge = x <= EDGE_THRESHOLD
      const isRightEdge = x >= screenWidth - EDGE_THRESHOLD

      if (!isLeftEdge && !isRightEdge) return

      touchState.current = {
        startX: x,
        startY: touch.clientY,
        startTime: Date.now(),
        direction: null,
        locked: false,
        cancelled: false,
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      const state = touchState.current
      if (!state || state.cancelled) return

      // Cancel on multi-touch
      if (e.touches.length > 1) {
        state.cancelled = true
        callbacksRef.current.onSwipeEnd?.(state.direction || 'right', false)
        touchState.current = null
        return
      }

      const touch = e.touches[0]
      const dx = touch.clientX - state.startX
      const dy = touch.clientY - state.startY
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)

      // Before locking direction, check if vertical movement dominates
      if (!state.locked) {
        const totalMove = absDx + absDy
        if (totalMove >= DIRECTION_LOCK_DISTANCE) {
          if (absDy > absDx) {
            // Vertical scroll — cancel gesture
            state.cancelled = true
            touchState.current = null
            return
          }
          // Lock horizontal direction
          state.direction = dx > 0 ? 'right' : 'left'
          state.locked = true
          callbacksRef.current.onSwipeStart?.(state.direction)
        }
        return
      }

      // Calculate progress (0 to 1) based on screen width
      const progress = Math.min(absDx / window.innerWidth, 1)
      callbacksRef.current.onSwipeMove?.(state.direction!, progress)
    }

    const handleTouchEnd = () => {
      const state = touchState.current
      if (!state || state.cancelled || !state.locked || !state.direction) {
        touchState.current = null
        return
      }

      touchState.current = null
      callbacksRef.current.onSwipeEnd?.(state.direction, true)
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
      document.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [])
}
