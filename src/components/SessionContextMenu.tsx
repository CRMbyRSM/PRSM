import { useEffect, useRef } from 'react'

interface Props {
  x: number
  y: number
  sessionId?: string
  isSystemSession: boolean
  onRename: () => void
  onDelete: () => void
  onClose: () => void
}

export function SessionContextMenu({ x, y, isSystemSession, onRename, onDelete, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Clamp position to viewport
  useEffect(() => {
    const el = menuRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let adjustedX = x
    let adjustedY = y

    if (x + rect.width > vw - 8) {
      adjustedX = vw - rect.width - 8
    }
    if (adjustedX < 8) adjustedX = 8

    if (y + rect.height > vh - 8) {
      adjustedY = y - rect.height
    }
    if (adjustedY < 8) adjustedY = 8

    el.style.left = `${adjustedX}px`
    el.style.top = `${adjustedY}px`
  }, [x, y])

  // Close on touch outside
  useEffect(() => {
    const handleTouch = (e: TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleClick = () => onClose()

    // Use a small delay to prevent the triggering touch from immediately closing
    const timer = setTimeout(() => {
      document.addEventListener('touchstart', handleTouch, { passive: true })
      document.addEventListener('click', handleClick)
    }, 50)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('touchstart', handleTouch)
      document.removeEventListener('click', handleClick)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        top: y,
        left: x,
        zIndex: 1000,
      }}
    >
      <div
        className="context-menu-item"
        onClick={(e) => {
          e.stopPropagation()
          onRename()
          onClose()
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        <span>Rename</span>
      </div>
      {!isSystemSession && (
        <>
          <div className="context-menu-divider" />
          <div
            className="context-menu-item destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
              onClose()
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            <span>Delete</span>
          </div>
        </>
      )}
    </div>
  )
}
