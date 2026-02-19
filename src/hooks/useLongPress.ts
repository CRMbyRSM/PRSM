import { useRef, useCallback } from 'react'
import { isNativeMobile, triggerHaptic } from '../lib/platform'

const LONG_PRESS_DURATION = 500 // ms
const MOVE_TOLERANCE = 10 // px

interface LongPressPoint {
  clientX: number
  clientY: number
}

export function useLongPress(
  onLongPress: (point: LongPressPoint) => void
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startPosRef.current = null
  }, [])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isNativeMobile()) return

    const touch = e.touches[0]
    startPosRef.current = { x: touch.clientX, y: touch.clientY }

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      triggerHaptic('medium')
      onLongPress({ clientX: touch.clientX, clientY: touch.clientY })
    }, LONG_PRESS_DURATION)
  }, [onLongPress])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startPosRef.current || !timerRef.current) return

    const touch = e.touches[0]
    const dx = Math.abs(touch.clientX - startPosRef.current.x)
    const dy = Math.abs(touch.clientY - startPosRef.current.y)

    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
      cancel()
    }
  }, [cancel])

  const onTouchEnd = useCallback(() => {
    cancel()
  }, [cancel])

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: onTouchEnd,
  }
}
