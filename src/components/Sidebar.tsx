import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { formatDistanceToNow } from 'date-fns'
import { Agent } from '../lib/openclaw-client'
import { safe } from '../lib/safe-render'
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
    unreadCounts
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

  // Session search filter
  const [sessionFilter, setSessionFilter] = useState('')

  // Check for Updates state
  const [updateChecking, setUpdateChecking] = useState(false)
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI

  const handleCheckForUpdates = async () => {
    if (updateChecking) return
    setUpdateChecking(true)
    try {
      await (window as any).electronAPI?.invoke('update:checkNow')
    } catch {
      // silently ignore — update:error event will fire if needed
    } finally {
      setTimeout(() => setUpdateChecking(false), 3000)
    }
  }

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, sessionId: string } | null>(null)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [sessionToRename, setSessionToRename] = useState<{ id: string, title: string } | null>(null)

  // Close context menu on click elsewhere
  useEffect(() => {
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

        <div className="session-search">
          <svg className="session-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="session-search-input"
            placeholder="Search sessions…"
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
          />
          {sessionFilter && (
            <button
              className="session-search-clear"
              onClick={() => setSessionFilter('')}
              aria-label="Clear search"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="sessions-section">
          <h3 className="section-title">Sessions</h3>
          <div className="sessions-list">
            {sessions.filter((s) =>
              !sessionFilter || (s.title || '').toLowerCase().includes(sessionFilter.toLowerCase())
            ).map((session) => (
              <div
                key={session.id}
                className={`session-item ${session.id === currentSessionId ? 'active' : ''}`}
                onClick={() => setCurrentSession(session.id)}
                onContextMenu={(e) => handleContextMenu(e, session.id, session.title)}
              >
                <div className="session-indicator" />
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
                  <div className="session-title">{safe(session.title) || 'New Chat'}</div>
                  {session.lastMessage && (
                    <div className="session-preview">{safe(session.lastMessage)}</div>
                  )}
                  <div className="session-time">
                    {safe(formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true }))}
                  </div>
                </div>
                {unreadCounts[session.id] > 0 && (
                  <span className="session-badge">{unreadCounts[session.id]}</span>
                )}
                <button
                  className="session-delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteSession(session.id)
                  }}
                  aria-label="Delete session"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            {sessions.length === 0 && (
              <div className="empty-sessions">
                <p>No sessions yet</p>
                <p className="hint">Start a new chat to begin</p>
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
  onOpenDetail
}: {
  agents: Agent[]
  currentAgent?: Agent
  onSelect: (id: string) => void
  onOpenDetail: (agent: Agent) => void
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
