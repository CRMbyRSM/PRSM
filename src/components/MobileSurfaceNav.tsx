import { useStore } from '../store'
import { getPrimarySurface } from '../lib/view-state'

const ITEMS = [
  {
    key: 'chat' as const,
    label: 'Chat',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    )
  },
  {
    key: 'system' as const,
    label: 'System',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 12h18" />
        <path d="M12 3v18" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    )
  },
  {
    key: 'workspace' as const,
    label: 'Workspace',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 7h18" />
        <path d="M3 12h18" />
        <path d="M3 17h12" />
      </svg>
    )
  }
]

export function MobileSurfaceNav() {
  const {
    mainView,
    connected,
    agentBusy,
    isStreaming,
    activeSubagents,
    setMainView,
    openSystemView
  } = useStore()

  const activeSurface = getPrimarySurface(mainView)
  const systemTone = !connected ? 'critical' : isStreaming || agentBusy || activeSubagents.length > 0 ? 'warn' : 'ok'

  return (
    <nav className="mobile-surface-nav" aria-label="Primary surfaces">
      {ITEMS.map((item) => {
        const active = activeSurface === item.key
        return (
          <button
            key={item.key}
            className={`mobile-surface-nav-btn ${active ? 'active' : ''}`}
            onClick={() => {
              if (item.key === 'system') {
                openSystemView()
                return
              }
              setMainView(item.key)
            }}
            aria-current={active ? 'page' : undefined}
          >
            <span className="mobile-surface-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.key === 'system' && <span className={`mobile-surface-nav-dot ${systemTone}`} />}
          </button>
        )
      })}
    </nav>
  )
}
