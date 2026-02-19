import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Agent } from '../lib/openclaw'

export function AgentDashboard() {
  const {
    agents,
    sessions,
    activeToolCalls,
    isStreaming,
    streamingSessionId,
    closeDetailView,
    selectAgentForDetail,
    fetchAgents,
  } = useStore()

  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await fetchAgents()
    } finally {
      setRefreshing(false)
    }
  }

  // Build per-agent activity data
  const agentActivity = useMemo(() => {
    const map = new Map<string, {
      sessionCount: number
      isStreaming: boolean
      activeTools: string[]
    }>()

    for (const agent of agents) {
      map.set(agent.id, { sessionCount: 0, isStreaming: false, activeTools: [] })
    }

    for (const session of sessions) {
      const agentId = session.agentId
      if (!agentId) continue

      const entry = map.get(agentId)
      if (!entry) continue

      entry.sessionCount++

      const sessionKey = session.key || session.id
      if (isStreaming && streamingSessionId === sessionKey) {
        entry.isStreaming = true
      }
    }

    // Map active tool calls to the current agent
    if (activeToolCalls.length > 0 && streamingSessionId) {
      const currentSession = sessions.find(s => (s.key || s.id) === streamingSessionId)
      if (currentSession?.agentId) {
        const entry = map.get(currentSession.agentId)
        if (entry) {
          for (const tc of activeToolCalls) {
            if (tc.phase === 'start') {
              entry.activeTools.push(tc.name)
            }
          }
        }
      }
    }

    return map
  }, [agents, sessions, isStreaming, streamingSessionId, activeToolCalls])

  const getActivityLabel = (agentId: string, status: Agent['status']) => {
    const activity = agentActivity.get(agentId)
    if (!activity) return status === 'offline' ? 'Offline' : 'Idle'

    if (activity.activeTools.length > 0) {
      return `Running: ${activity.activeTools[0]}`
    }
    if (activity.isStreaming) {
      return 'Streaming...'
    }
    if (status === 'offline') return 'Offline'
    return 'Idle'
  }

  const getEffectiveStatus = (agent: Agent) => {
    const activity = agentActivity.get(agent.id)
    if (activity?.isStreaming || (activity?.activeTools.length ?? 0) > 0) return 'busy'
    return agent.status
  }

  return (
    <div className="detail-view">
      <div className="detail-content">
        <div className="dashboard-container">
          <div className="settings-header">
            <button className="detail-back" onClick={closeDetailView}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Back</span>
            </button>
            <h1 className="settings-title">Agent Dashboard</h1>
            <span className="dashboard-agent-count">{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
            <div style={{ flex: 1 }} />
            <button className={`dashboard-refresh-btn ${refreshing ? 'refreshing' : ''}`} onClick={handleRefresh} title="Refresh agents">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0115.36-6.36L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 01-15.36 6.36L3 16" />
              </svg>
            </button>
          </div>
          <div className="dashboard-grid">
            {agents.map((agent) => {
              const activity = agentActivity.get(agent.id)
              const effectiveStatus = getEffectiveStatus(agent)
              const activityLabel = getActivityLabel(agent.id, agent.status)
              const isActive = effectiveStatus === 'busy' || activity?.isStreaming

              return (
                <div
                  key={agent.id}
                  className={`dashboard-tile ${effectiveStatus} ${isActive ? 'active-pulse' : ''}`}
                  onClick={() => selectAgentForDetail(agent)}
                >
                  <div className="tile-header">
                    <div className="tile-avatar">
                      {agent.emoji ? (
                        <span className="tile-emoji">{agent.emoji}</span>
                      ) : agent.avatar ? (
                        <img src={agent.avatar} alt={agent.name} className="tile-avatar-img" />
                      ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2zm-4 12a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm8 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
                        </svg>
                      )}
                      <span className={`tile-status-dot ${effectiveStatus}`} />
                    </div>
                    <div className="tile-info">
                      <div className="tile-name">{agent.name}</div>
                      <div className="tile-id">{agent.id}</div>
                    </div>
                  </div>

                  {(agent.model || agent.thinkingLevel) && (
                    <div className="tile-meta">
                      {agent.model && <span className="tile-tag">{agent.model}</span>}
                      {agent.thinkingLevel && <span className="tile-tag">thinking: {agent.thinkingLevel}</span>}
                    </div>
                  )}

                  <div className="tile-footer">
                    <div className={`tile-activity ${isActive ? 'active' : ''}`}>
                      {isActive && <span className="tile-activity-dot" />}
                      {activityLabel}
                    </div>
                    <div className="tile-sessions">
                      {activity?.sessionCount || 0} session{(activity?.sessionCount || 0) !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              )
            })}

            {agents.length === 0 && (
              <div className="dashboard-empty">
                <p>No agents found</p>
                <p className="hint">Connect to a server to see agents</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
