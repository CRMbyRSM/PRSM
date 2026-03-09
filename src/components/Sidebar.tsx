import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useStore } from '../store'
import { formatDistanceToNow } from 'date-fns'
import { Agent, Session } from '../lib/openclaw'
import { groupSessionsByDate } from '../utils/dateGrouping'
import { useLongPress } from '../hooks/useLongPress'
import { SessionContextMenu } from './SessionContextMenu'
import { isNativeMobile } from '../lib/platform'
import { safe } from '../lib/safe-render'
import { getSessionStatusSummary, sessionKeyOf } from '../lib/view-state'
import logoUrl from '../../build/icon.png'

export function Sidebar() {
  const {
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarOpen,
    setSidebarOpen,
    sessions,
    currentSessionId,
    setCurrentSession,
    createNewSession,
    deleteSession,
    updateSessionLabel,
    setPendingSessionLabel,
    agents,
    currentAgentId,
    setCurrentAgent,
    selectAgentForDetail,
    showCreateAgent,
    openSystemView,
    openWorkspaceView,
    openDashboard,
    openUsage,
    mainView,
    connected,
    isStreaming,
    agentBusy,
    activeSubagents,
    unreadCounts,
    collapsedSessionGroups,
    toggleSessionGroup,
    fetchSessions
  } = useStore()

  const currentAgent = agents.find((a) => a.id === currentAgentId)

  // New chat naming
  const [showNewChatModal, setShowNewChatModal] = useState(false)

  const handleNewChat = (label?: string) => {
    if (label?.trim()) {
      setPendingSessionLabel(label.trim())
    }
    createNewSession()
    setShowNewChatModal(false)
    setSidebarOpen(false)
  }

  // Refresh sessions state
  const [refreshing, setRefreshing] = useState(false)
  const handleRefreshSessions = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await fetchSessions()
    } finally {
      setRefreshing(false)
    }
  }

  // Search state with debounce
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => setDebouncedQuery(value), 300)
  }, [])

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [])

  // Check for Updates state
  const [updateChecking, setUpdateChecking] = useState(false)
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI

  const handleCheckForUpdates = async () => {
    if (updateChecking) return
    setUpdateChecking(true)
    try {
      await (window as any).electronAPI?.invoke('update:checkNow')
    } catch {
      // silently ignore
    } finally {
      setTimeout(() => setUpdateChecking(false), 3000)
    }
  }

  // Filter out spawned subagent sessions, system sessions, and deduplicate by key.
  const visibleSessions = useMemo(() => {
    const systemSessionRe = /^agent:[^:]+:(cron|heartbeat)(:|$)/
    const seen = new Set<string>()
    return sessions.filter(s => {
      const key = sessionKeyOf(s)
      if (seen.has(key)) return false
      seen.add(key)
      if (key === currentSessionId) return true
      if (systemSessionRe.test(key)) return false
      if (key.includes(':subagent:')) return false
      return !s.spawned && !s.parentSessionId && !s.cron
    })
  }, [sessions, currentSessionId])

  // Apply search filter
  const filteredSessions = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim()
    if (!q) return visibleSessions
    return visibleSessions.filter(s =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.lastMessage && s.lastMessage.toLowerCase().includes(q))
    )
  }, [visibleSessions, debouncedQuery])

  // Group filtered sessions by date
  const sessionGroups = useMemo(() => groupSessionsByDate(filteredSessions), [filteredSessions])

  // Build agent lookup for emoji badges
  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>()
    for (const agent of agents) {
      map.set(agent.id, agent)
    }
    return map
  }, [agents])

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, sessionId: string } | null>(null)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [sessionToRename, setSessionToRename] = useState<{ id: string, title: string } | null>(null)

  // Close context menu on click elsewhere (desktop only)
  useEffect(() => {
    if (isNativeMobile()) return
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const handleContextMenu = (e: React.MouseEvent, sessionId: string, currentTitle: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId })
    setSessionToRename({ id: sessionId, title: currentTitle })
  }

  const handleLongPress = useCallback((sessionId: string, title: string, point: { clientX: number; clientY: number }) => {
    setContextMenu({ x: point.clientX, y: point.clientY, sessionId })
    setSessionToRename({ id: sessionId, title })
  }, [])

  const handleRename = async (newLabel: string) => {
    if (sessionToRename) {
      await updateSessionLabel(sessionToRename.id, newLabel)
      setShowRenameModal(false)
      setSessionToRename(null)
    }
  }

  return (
    <>
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarOpen ? 'visible' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <img className="logo-icon" src={logoUrl} alt="PRSM logo" />
            <span className="logo-text"><span style={{color: 'var(--text-primary)'}}>P</span><span style={{color: 'var(--accent-cyan)'}}>RSM</span></span>
            <span className="logo-version">v{__APP_VERSION__}</span>
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label="Toggle sidebar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        <button className="new-chat-btn" onClick={() => setShowNewChatModal(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>New Chat</span>
        </button>

        <div className="sidebar-surface-nav">
          <button
            className={`dashboard-link-btn ${mainView === 'chat' ? 'active' : ''}`}
            onClick={() => currentSessionId ? setCurrentSession(currentSessionId) : useStore.getState().setMainView('chat')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <span>Chat</span>
          </button>

          <button
            className={`dashboard-link-btn ${mainView === 'system' ? 'active' : ''}`}
            onClick={openSystemView}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18" />
              <path d="M12 3v18" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            <span>System</span>
            <span className={`nav-micro-indicator ${!connected ? 'critical' : isStreaming || agentBusy || activeSubagents.length > 0 ? 'warn' : 'ok'}`} />
          </button>

          <button
            className={`dashboard-link-btn ${mainView === 'workspace' ? 'active' : ''}`}
            onClick={openWorkspaceView}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7h18" />
              <path d="M3 12h18" />
              <path d="M3 17h12" />
            </svg>
            <span>Workspace</span>
          </button>
        </div>

        <button
          className={`dashboard-link-btn ${mainView === 'pixel-dashboard' ? 'active' : ''}`}
          onClick={openDashboard}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span>Dashboard</span>
        </button>

        <button
          className={`dashboard-link-btn ${mainView === 'usage' ? 'active' : ''}`}
          onClick={openUsage}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span>Server Usage</span>
        </button>

        <div className="sessions-section">
          <div className="sessions-section-header">
            <h3 className="section-title">Sessions</h3>
            <button
              className={`sessions-refresh-btn ${refreshing ? 'refreshing' : ''}`}
              onClick={handleRefreshSessions}
              aria-label="Refresh sessions"
              title="Refresh sessions"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0115.36-6.36L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 01-15.36 6.36L3 16" />
              </svg>
            </button>
          </div>

          {/* Search input */}
          <div className="sidebar-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button
                className="sidebar-search-clear"
                onClick={() => { setSearchQuery(''); setDebouncedQuery('') }}
                aria-label="Clear search"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="sessions-list">
            {sessionGroups.map((group) => {
              const isCollapsed = collapsedSessionGroups.includes(group.label)
              return (
                <div key={group.label} className={`session-group ${isCollapsed ? 'collapsed' : ''}`}>
                  <div
                    className="session-group-header"
                    onClick={() => toggleSessionGroup(group.label)}
                  >
                    <svg
                      className="session-group-chevron"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                    <span className="session-group-label">{group.label}</span>
                    <span className="session-group-count">{group.sessions.length}</span>
                  </div>
                  {!isCollapsed && (
                    <div className="session-group-items">
                      {group.sessions.map((session) => (
                        <SessionItem
                          key={sessionKeyOf(session)}
                          session={session}
                          isActive={sessionKeyOf(session) === currentSessionId}
                          currentAgentId={currentAgentId}
                          agentMap={agentMap}
                          unreadCount={unreadCounts[sessionKeyOf(session)] || 0}
                          onSelect={setCurrentSession}
                          onContextMenu={handleContextMenu}
                          onLongPress={handleLongPress}
                          onDelete={deleteSession}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {filteredSessions.length === 0 && (
              <div className="empty-sessions">
                {debouncedQuery ? (
                  <p>No matching sessions</p>
                ) : (
                  <>
                    <p>No sessions yet</p>
                    <p className="hint">Start a new chat to begin</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="agent-section">
          <h3 className="section-title">Agent</h3>
          <AgentSelector
            agents={agents}
            currentAgent={currentAgent}
            onSelect={setCurrentAgent}
            onOpenDetail={(agent) => selectAgentForDetail(agent)}
            onCreateNew={showCreateAgent}
          />
        </div>

        {/* Check for Updates — Electron only */}
        {isElectron && (
          <button
            className="check-updates-btn"
            onClick={handleCheckForUpdates}
            disabled={updateChecking}
          >
            <svg
              className={updateChecking ? 'spin' : ''}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m0 0a9 9 0 019-9m-9 9a9 9 0 009 9" />
              <path d="M12 3v3m0 12v3" />
            </svg>
            <span>{updateChecking ? 'Checking…' : 'Check for Updates'}</span>
          </button>
        )}

        {/* Mobile close button */}
        <button
          className="sidebar-close-mobile"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </aside>

      {/* Context Menu */}
      {contextMenu && (
        isNativeMobile() ? (
          <SessionContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            sessionId={contextMenu.sessionId}
            isSystemSession={/^agent:[^:]+:(cron|heartbeat)(:|$)/.test(contextMenu.sessionId)}
            onRename={() => setShowRenameModal(true)}
            onDelete={() => {
              deleteSession(contextMenu.sessionId)
              setContextMenu(null)
            }}
            onClose={() => setContextMenu(null)}
          />
        ) : (
          <div
            className="context-menu"
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              zIndex: 1000
            }}
          >
            <div
              className="context-menu-item"
              onClick={() => {
                setShowRenameModal(true)
                setContextMenu(null)
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span>Rename Session</span>
            </div>
          </div>
        )
      )}

      {/* Rename Modal */}
      {showRenameModal && sessionToRename && (
        <RenameModal
          currentTitle={sessionToRename.title}
          onSave={handleRename}
          onClose={() => {
            setShowRenameModal(false)
            setSessionToRename(null)
          }}
        />
      )}

      {/* New Chat Modal */}
      {showNewChatModal && (
        <NewChatModal
          onStart={handleNewChat}
          onClose={() => setShowNewChatModal(false)}
        />
      )}
    </>
  )
}

function SessionItem({
  session,
  isActive,
  currentAgentId,
  agentMap,
  unreadCount,
  onSelect,
  onContextMenu,
  onLongPress,
  onDelete,
}: {
  session: Session
  isActive: boolean
  currentAgentId: string | null
  agentMap: Map<string, Agent>
  unreadCount: number
  onSelect: (id: string) => void
  onContextMenu: (e: React.MouseEvent, sessionId: string, title: string) => void
  onLongPress: (sessionId: string, title: string, point: { clientX: number; clientY: number }) => void
  onDelete: (id: string) => void
}) {
  const sessionKey = sessionKeyOf(session)
  const {
    streamingSessionId,
    isStreaming,
    unreadCounts,
    currentSessionId,
    activeSubagents,
    connected,
    compactingSession
  } = useStore()

  const sessionAgent = session.agentId && session.agentId !== currentAgentId
    ? agentMap.get(session.agentId)
    : undefined

  const status = getSessionStatusSummary({
    sessionKey,
    currentSessionId,
    streamingSessionId,
    isStreaming,
    connected,
    unreadCounts,
    compactingSession,
    activeSubagents
  })

  const longPressHandlers = useLongPress(
    useCallback((point: { clientX: number; clientY: number }) => {
      onLongPress(sessionKey, session.title, point)
    }, [sessionKey, session.title, onLongPress])
  )

  return (
    <div
      className={`session-item ${isActive ? 'active' : ''}`}
      onClick={() => onSelect(sessionKey)}
      onContextMenu={isNativeMobile() ? undefined : (e) => onContextMenu(e, sessionKey, session.title)}
      {...longPressHandlers}
    >
      <div className={`session-indicator ${status.tone === 'idle' ? '' : status.tone}`} />
      {session.spawned && (
        <span className="session-spawned-badge" title="Spawned subagent session">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 3v12" />
            <path d="M18 9a3 3 0 100-6 3 3 0 000 6z" />
            <path d="M6 21a3 3 0 100-6 3 3 0 000 6z" />
            <path d="M15 6h-4a2 2 0 00-2 2v7" />
          </svg>
        </span>
      )}
      <div className="session-content">
        <div className="session-title-row">
          {sessionAgent?.emoji && (
            <span className="session-agent-badge" title={safe(sessionAgent.name)}>
              {safe(sessionAgent.emoji)}
            </span>
          )}
          <div className="session-title">{safe(session.title) || 'New Chat'}</div>
        </div>
        {session.lastMessage && (
          <div className="session-preview">{safe(session.lastMessage)}</div>
        )}
        <div className="session-time-row">
          <div className="session-time">
            {safe(formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true }))}
          </div>
          <div className="session-status-badges">
            {status.isStreaming && <span className="session-state-badge streaming">live</span>}
            {status.isCompacting && <span className="session-state-badge compacting">compact</span>}
            {status.hasSubagents && <span className="session-state-badge info">subagents</span>}
            {status.isErrored && <span className="session-state-badge error">offline</span>}
          </div>
        </div>
      </div>
      {unreadCount > 0 && (
        <span className="session-badge">{unreadCount}</span>
      )}
      {!/^agent:[^:]+:(cron|heartbeat)(:|$)/.test(sessionKey) && (
        <button
          className="session-delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(sessionKey)
          }}
          aria-label="Delete session"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

function RenameModal({ currentTitle, onSave, onClose }: { 
  currentTitle: string
  onSave: (newLabel: string) => void 
  onClose: () => void 
}) {
  const [label, setLabel] = useState(currentTitle)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Rename Session</h2>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <form onSubmit={(e) => {
            e.preventDefault()
            onSave(label)
          }}>
            <div className="form-group">
              <label>Session Label</label>
              <input
                ref={inputRef}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Enter a new label..."
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function NewChatModal({ onStart, onClose }: {
  onStart: (label?: string) => void
  onClose: () => void
}) {
  const [label, setLabel] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Chat</h2>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <form onSubmit={(e) => {
            e.preventDefault()
            onStart(label)
          }}>
            <div className="form-group">
              <label>Session Name (optional)</label>
              <input
                ref={inputRef}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Website redesign, Bug fix…"
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => onStart()}>
                Skip
              </button>
              <button type="submit" className="btn btn-primary">
                Start Chat
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function AgentSelector({
  agents,
  currentAgent,
  onSelect,
  onOpenDetail,
  onCreateNew
}: {
  agents: Agent[]
  currentAgent?: Agent
  onSelect: (id: string) => void
  onOpenDetail: (agent: Agent) => void
  onCreateNew: () => void
}) {
  const [open, setOpen] = useState(false)

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (currentAgent) {
      onOpenDetail(currentAgent)
    }
  }

  return (
    <div className={`agent-selector ${open ? 'open' : ''}`}>
      <div className="agent-selected" onClick={() => setOpen(!open)}>
        <div className="agent-avatar">
          {currentAgent?.emoji ? (
            <span className="agent-emoji-small">{safe(currentAgent.emoji)}</span>
          ) : currentAgent?.avatar ? (
            <img src={currentAgent.avatar} alt={safe(currentAgent.name)} className="agent-avatar-img-small" />
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2zm-4 12a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm8 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
            </svg>
          )}
        </div>
        <div className="agent-info">
          <div className="agent-name">{safe(currentAgent?.name) || 'Select Agent'}</div>
          <div className={`agent-status ${safe(currentAgent?.status) || ''}`}>
            {safe(currentAgent?.status) || 'Unknown'}
          </div>
        </div>
        <button
          className="agent-settings-btn"
          onClick={handleSettingsClick}
          title="Agent Settings"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
        <svg className="dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      <div className="agent-dropdown">
        <div
          className="agent-option create-new-agent-option"
          onClick={() => {
            onCreateNew()
            setOpen(false)
          }}
        >
          <div className="agent-avatar small">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <span>Create New Agent</span>
        </div>
        {agents.map((agent, index) => (
          <div
            key={agent.id || index}
            className={`agent-option ${agent.id === currentAgent?.id ? 'selected' : ''}`}
            onClick={() => {
              onSelect(agent.id)
              setOpen(false)
            }}
          >
            <div className="agent-avatar small">
              {agent.emoji ? (
                <span className="agent-emoji-small">{safe(agent.emoji)}</span>
              ) : agent.avatar ? (
                <img src={agent.avatar} alt={safe(agent.name)} className="agent-avatar-img-small" />
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2zm-4 12a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm8 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
                </svg>
              )}
            </div>
            <span>{safe(agent.name)}</span>
            {agent.id === currentAgent?.id && (
              <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
