import { useRef, useCallback, type ReactNode } from 'react'
import { useStore } from '../store'
import { useSwipeGesture, type SwipeDirection } from '../hooks/useSwipeGesture'

interface Props {
  children: ReactNode
}

/**
 * Orchestrates swipe gestures on mobile. Wraps the app content and translates
 * edge swipes into sidebar/right-panel open/close or detail-view navigation.
 */
export function MobileGestureLayer({ children }: Props) {
  const sidebarRef = useRef<HTMLElement | null>(null)
  const rightPanelRef = useRef<HTMLElement | null>(null)
  const overlayRef = useRef<HTMLElement | null>(null)

  const gestureAction = useRef<string | null>(null)

  const acquireRefs = useCallback(() => {
    if (!sidebarRef.current) {
      sidebarRef.current = document.querySelector('.sidebar')
    }
    if (!rightPanelRef.current) {
      rightPanelRef.current = document.querySelector('.right-panel')
    }
    if (!overlayRef.current) {
      overlayRef.current = document.querySelector('.overlay')
    }
  }, [])

  const addSwipingClass = useCallback((el: HTMLElement | null) => {
    el?.classList.add('swiping')
  }, [])

  const removeSwipingClass = useCallback((el: HTMLElement | null) => {
    el?.classList.remove('swiping')
  }, [])

  const resolveAction = useCallback((direction: SwipeDirection): string | null => {
    const state = useStore.getState()

    if (direction === 'right') {
      if (state.rightPanelOpen) return 'close-right-panel'
      if (state.mainView !== 'chat') return 'navigate-back'
      if (!state.sidebarOpen) return 'open-sidebar'
    } else {
      if (state.sidebarOpen) return 'close-sidebar'
      if (!state.rightPanelOpen) return 'open-right-panel'
    }
    return null
  }, [])

  const onSwipeStart = useCallback((direction: SwipeDirection) => {
    acquireRefs()
    const action = resolveAction(direction)
    gestureAction.current = action

    if (!action) return

    if (action === 'open-sidebar' || action === 'close-sidebar') {
      addSwipingClass(sidebarRef.current)
      addSwipingClass(overlayRef.current)
    } else if (action === 'open-right-panel' || action === 'close-right-panel') {
      addSwipingClass(rightPanelRef.current)
      addSwipingClass(overlayRef.current)
    }
  }, [acquireRefs, resolveAction, addSwipingClass])

  const onSwipeMove = useCallback((_direction: SwipeDirection, progress: number) => {
    const action = gestureAction.current
    if (!action) return

    const clampedProgress = Math.max(0, Math.min(1, progress))

    requestAnimationFrame(() => {
      const sidebar = sidebarRef.current
      const rightPanel = rightPanelRef.current
      const overlay = overlayRef.current
      const sidebarWidth = sidebar?.offsetWidth || 280

      switch (action) {
        case 'open-sidebar': {
          const offset = -sidebarWidth + (sidebarWidth * clampedProgress)
          if (sidebar) sidebar.style.transform = `translateX(${offset}px)`
          if (overlay) {
            overlay.style.opacity = `${clampedProgress * 0.5}`
            overlay.style.visibility = 'visible'
            overlay.style.pointerEvents = 'auto'
          }
          break
        }
        case 'close-sidebar': {
          const offset = -(sidebarWidth * clampedProgress)
          if (sidebar) sidebar.style.transform = `translateX(${offset}px)`
          if (overlay) {
            overlay.style.opacity = `${(1 - clampedProgress) * 0.5}`
          }
          break
        }
        case 'open-right-panel': {
          const panelWidth = rightPanel?.offsetWidth || 320
          const offset = panelWidth - (panelWidth * clampedProgress)
          if (rightPanel) rightPanel.style.transform = `translateX(${offset}px)`
          if (overlay) {
            overlay.style.opacity = `${clampedProgress * 0.5}`
            overlay.style.visibility = 'visible'
            overlay.style.pointerEvents = 'auto'
          }
          break
        }
        case 'close-right-panel': {
          const panelWidth = rightPanel?.offsetWidth || 320
          const offset = panelWidth * clampedProgress
          if (rightPanel) rightPanel.style.transform = `translateX(${offset}px)`
          if (overlay) {
            overlay.style.opacity = `${(1 - clampedProgress) * 0.5}`
          }
          break
        }
      }
    })
  }, [])

  const onSwipeEnd = useCallback((_direction: SwipeDirection, _completed: boolean) => {
    const action = gestureAction.current
    if (!action) return

    const sidebar = sidebarRef.current
    const rightPanel = rightPanelRef.current
    const overlay = overlayRef.current

    switch (action) {
      case 'open-sidebar':
        sidebar?.classList.add('visible')
        overlay?.classList.add('active')
        break
      case 'close-sidebar':
        sidebar?.classList.remove('visible')
        overlay?.classList.remove('active')
        break
      case 'open-right-panel':
        rightPanel?.classList.remove('hidden')
        rightPanel?.classList.add('visible')
        overlay?.classList.add('active')
        break
      case 'close-right-panel':
        rightPanel?.classList.remove('visible')
        rightPanel?.classList.add('hidden')
        overlay?.classList.remove('active')
        break
    }

    removeSwipingClass(sidebar)
    removeSwipingClass(rightPanel)
    removeSwipingClass(overlay)

    const clearInlineStyles = (el: HTMLElement | null) => {
      if (!el) return
      el.style.transform = ''
      el.style.opacity = ''
      el.style.visibility = ''
      el.style.pointerEvents = ''
    }

    clearInlineStyles(sidebar)
    clearInlineStyles(rightPanel)
    clearInlineStyles(overlay)

    const store = useStore.getState()
    switch (action) {
      case 'open-sidebar':
        store.setSidebarOpen(true)
        break
      case 'close-sidebar':
        store.setSidebarOpen(false)
        break
      case 'open-right-panel':
        store.setRightPanelOpen(true)
        break
      case 'close-right-panel':
        store.setRightPanelOpen(false)
        break
      case 'navigate-back':
        store.closeDetailView()
        break
    }

    gestureAction.current = null
  }, [removeSwipingClass])

  useSwipeGesture({
    onSwipeStart,
    onSwipeMove,
    onSwipeEnd,
  })

  return <>{children}</>
}
