import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { formatDistanceToNow } from 'date-fns'
import { safe } from '../lib/safe-render'

function formatNumber(n: number) {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return new Intl.NumberFormat('en-US').format(n)
}

function formatCurrency(n: number) {
  if (!Number.isFinite(n)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export function SystemView() {
  const {
    client,
    connected,
    connecting,
    agents,
    sessions,
    cronJobs,
    currentSessionId,
    isStreaming,
    streamingSessionId,
    agentBusy,
    activeToolCalls,
    activeSubagents,
    unreadCounts,
    setCurrentSession,
    openUsage,
    fetchAgents,
    fetchSessions,
    fetchCronJobs,
    fetchSkills,
    pinnedMessages,
    skills,
    systemSubview,
    setSystemSubview
  } = useStore()

  const [usageStatus, setUsageStatus] = useState<any>(null)
  const [usageCost, setUsageCost] = useState<any>(null)
  const [configSnapshot, setConfigSnapshot] = useState<any>(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadSystemData = async () => {
    if (!client) return
    setRefreshing(true)
    try {
      const [status, cost, config] = await Promise.all([
        client.getUsageStatus().catch(() => null),
        client.getUsageCost().catch(() => null),
        client.getServerConfig().catch(() => null),
        fetchAgents(),
        fetchSessions(),
        fetchCronJobs(),
        fetchSkills()
      ])
      setUsageStatus(status)
      setUsageCost(cost)
      setConfigSnapshot(config?.config || null)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadSystemData()
  }, [client, fetchAgents, fetchSessions, fetchCronJobs, fetchSkills])

  const activeSessions = useMemo(() => {
    return sessions.filter((session) => {
      const key = session.key || session.id
      return key === streamingSessionId || unreadCounts[key] > 0 || key === currentSessionId
    })
  }, [sessions, streamingSessionId, unreadCounts, currentSessionId])

  const recentSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 6)
  }, [sessions])

  const activeAgents = useMemo(() => {
    return agents.filter((agent) => {
      if (agent.status === 'busy') return true
      return sessions.some((session) => session.agentId === agent.id && ((session.key || session.id) === streamingSessionId))
    })
  }, [agents, sessions, streamingSessionId])

  const cronSummary = useMemo(() => {
    const active = cronJobs.filter((job) => job.status === 'active').length
    const paused = cronJobs.filter((job) => job.status === 'paused').length
    return { active, paused, total: cronJobs.length }
  }, [cronJobs])

  const usageSummary = useMemo(() => {
    const daily = usageCost?.daily || []
    const totalTokens = daily.reduce((sum: number, day: any) => sum + (day.totalTokens || 0), 0)
    const totalCost = daily.reduce((sum: number, day: any) => sum + (day.totalCost || 0), 0)
    return { totalTokens, totalCost, days: usageCost?.days || daily.length || 0 }
  }, [usageCost])

  const providerAlerts = useMemo(() => {
    const providers = usageStatus?.providers || []
    return providers.flatMap((provider: any) =>
      (provider.windows || [])
        .filter((win: any) => Number(win.usedPercent) >= 80)
        .map((win: any) => ({
          id: `${provider.provider}-${win.label}`,
          label: `${provider.displayName || provider.provider} ${win.label}`,
          usedPercent: Number(win.usedPercent) || 0
        }))
    )
  }, [usageStatus])

  const alerts = useMemo(() => {
    const items: Array<{ id: string; level: 'critical' | 'warn' | 'info'; title: string; detail: string }> = []

    if (!connected) {
      items.push({ id: 'gateway-disconnected', level: 'critical', title: 'Gateway disconnected', detail: 'PRSM is not currently connected to the OpenClaw gateway.' })
    } else if (connecting) {
      items.push({ id: 'gateway-connecting', level: 'info', title: 'Gateway reconnecting', detail: 'Connection is being re-established.' })
    }

    if (activeSubagents.length > 0) {
      items.push({ id: 'subagents-running', level: 'info', title: 'Subagents active', detail: `${activeSubagents.length} spawned session${activeSubagents.length === 1 ? '' : 's'} currently visible.` })
    }

    if (activeToolCalls.length > 0) {
      items.push({ id: 'tools-running', level: 'info', title: 'Tool calls in progress', detail: `${activeToolCalls.length} tool call${activeToolCalls.length === 1 ? '' : 's'} running in the current conversation.` })
    }

    if (cronSummary.paused > 0) {
      items.push({ id: 'cron-paused', level: 'warn', title: 'Paused cron jobs', detail: `${cronSummary.paused} cron job${cronSummary.paused === 1 ? '' : 's'} paused.` })
    }

    if (providerAlerts.length > 0) {
      items.push({ id: 'provider-limits', level: 'warn', title: 'Usage limits nearing cap', detail: `${providerAlerts.length} provider window${providerAlerts.length === 1 ? '' : 's'} above 80% utilization.` })
    }

    if (!skills.length) {
      items.push({ id: 'skills-empty', level: 'info', title: 'No skills loaded', detail: 'skills.status returned no installed skills.' })
    }

    return items.slice(0, 6)
  }, [connected, connecting, activeSubagents, activeToolCalls, cronSummary, providerAlerts, skills.length])

  const recentEvents = useMemo(() => {
    const events: Array<{ id: string; kind: string; label: string; time: string }> = []

    if (isStreaming && streamingSessionId) {
      const session = sessions.find((s) => (s.key || s.id) === streamingSessionId)
      events.push({ id: 'streaming', kind: 'stream', label: `Streaming in ${session?.title || streamingSessionId}`, time: 'live' })
    }

    activeToolCalls.slice(-3).forEach((tool) => {
      events.push({
        id: tool.toolCallId,
        kind: 'tool',
        label: `${tool.phase === 'start' ? 'Started' : 'Completed'} ${tool.name}`,
        time: formatDistanceToNow(new Date(tool.startedAt), { addSuffix: true })
      })
    })

    activeSubagents.slice(-3).forEach((subagent) => {
      events.push({
        id: subagent.sessionKey,
        kind: 'subagent',
        label: `${subagent.status === 'running' ? 'Spawned' : 'Finished'} ${subagent.label}`,
        time: formatDistanceToNow(new Date(subagent.startedAt), { addSuffix: true })
      })
    })

    recentSessions.slice(0, 3).forEach((session) => {
      events.push({
        id: `session-${session.id}`,
        kind: 'session',
        label: `Session updated: ${session.title || 'New Chat'}`,
        time: formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })
      })
    })

    return events.slice(0, 8)
  }, [isStreaming, streamingSessionId, sessions, activeToolCalls, activeSubagents, recentSessions])

  const modelAssignments = useMemo(() => {
    return agents
      .filter((agent) => agent.model)
      .slice(0, 6)
      .map((agent) => ({ id: agent.id, name: agent.name, model: agent.model, thinking: agent.thinkingLevel }))
  }, [agents])

  const coreFileStatus = useMemo(() => {
    const defaults = configSnapshot?.agents?.defaults || {}
    return [
      { label: 'Agent defaults', value: defaults?.workspace || 'Not configured' },
      { label: 'Tool profile', value: configSnapshot?.tools?.profile || 'Unknown' },
      { label: 'Memory backend', value: configSnapshot?.memory?.backend || 'Unknown' },
      { label: 'Timezone', value: defaults?.userTimezone || 'Unknown' }
    ]
  }, [configSnapshot])

  return (
    <div className="surface-view system-surface">
      <div className="surface-header">
        <div>
          <div className="surface-eyebrow">System</div>
          <h1>Overview</h1>
          <p>Gateway health, live work, cron posture, usage, and configuration signals in one place.</p>
        </div>
        <button className={`surface-refresh-btn ${refreshing ? 'refreshing' : ''}`} onClick={loadSystemData}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0115.36-6.36L21 8" />
            <path d="M3 22v-6h6" />
            <path d="M21 12a9 9 0 01-15.36 6.36L3 16" />
          </svg>
          <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
        </button>
      </div>

      <div className="surface-subnav" role="tablist" aria-label="System subviews">
        <button
          className={`surface-subnav-btn ${systemSubview === 'overview' ? 'active' : ''}`}
          onClick={() => setSystemSubview('overview')}
          role="tab"
          aria-selected={systemSubview === 'overview'}
        >
          Overview
        </button>
        <button
          className={`surface-subnav-btn ${systemSubview === 'architecture' ? 'active' : ''}`}
          onClick={() => setSystemSubview('architecture')}
          role="tab"
          aria-selected={systemSubview === 'architecture'}
        >
          Architecture snapshot
        </button>
      </div>

      <div className="health-strip">
        <StatusPill tone={connected ? (agentBusy ? 'warn' : 'ok') : 'critical'} label={connected ? (agentBusy ? 'Gateway busy' : 'Gateway healthy') : 'Gateway offline'} />
        <StatusPill tone={activeAgents.length > 0 ? 'warn' : 'ok'} label={`${activeAgents.length} active agent${activeAgents.length === 1 ? '' : 's'}`} />
        <StatusPill tone={activeSessions.length > 0 ? 'warn' : 'ok'} label={`${activeSessions.length} hot session${activeSessions.length === 1 ? '' : 's'}`} />
        <StatusPill tone={cronSummary.paused > 0 ? 'warn' : 'ok'} label={`${cronSummary.active}/${cronSummary.total} cron active`} />
        <StatusPill tone={providerAlerts.length > 0 ? 'warn' : 'ok'} label={`${formatNumber(usageSummary.totalTokens)} tokens / ${usageSummary.days || 0}d`} />
      </div>

      {systemSubview === 'overview' ? (
      <div className="surface-grid">
        <section className="surface-card surface-card-span-2">
          <div className="surface-card-header">
            <h2>Gateway & activity</h2>
            <span>{connected ? 'Live' : 'Offline'}</span>
          </div>
          <div className="metric-grid">
            <Metric label="Connection" value={connected ? 'Connected' : 'Disconnected'} tone={connected ? 'ok' : 'critical'} />
            <Metric label="Agent state" value={agentBusy ? 'Working' : 'Idle'} tone={agentBusy ? 'warn' : 'ok'} />
            <Metric label="Streaming" value={isStreaming ? 'In progress' : 'Quiet'} tone={isStreaming ? 'warn' : 'neutral'} />
            <Metric label="Pinned context" value={String(pinnedMessages.length)} tone="neutral" />
          </div>
        </section>

        <section className="surface-card">
          <div className="surface-card-header">
            <h2>Usage summary</h2>
            <button className="surface-link-btn" onClick={openUsage}>Open usage</button>
          </div>
          <div className="metric-stack">
            <Metric label="Total tokens" value={formatNumber(usageSummary.totalTokens)} tone="neutral" />
            <Metric label="Estimated cost" value={formatCurrency(usageSummary.totalCost)} tone="neutral" />
            <Metric label="Provider alerts" value={String(providerAlerts.length)} tone={providerAlerts.length > 0 ? 'warn' : 'ok'} />
          </div>
        </section>

        <section className="surface-card">
          <div className="surface-card-header">
            <h2>Active agents</h2>
            <span>{activeAgents.length || agents.length}</span>
          </div>
          <div className="list-stack">
            {(activeAgents.length > 0 ? activeAgents : agents.slice(0, 4)).map((agent) => (
              <div key={agent.id} className="surface-list-row">
                <div>
                  <div className="surface-list-title">{safe(agent.name)}</div>
                  <div className="surface-list-meta">{safe(agent.model || agent.id)}</div>
                </div>
                <span className={`mini-badge ${agent.status === 'busy' ? 'warn' : agent.status === 'offline' ? 'critical' : 'ok'}`}>{safe(agent.status)}</span>
              </div>
            ))}
            {agents.length === 0 && <div className="surface-empty">No agents loaded.</div>}
          </div>
        </section>

        <section className="surface-card">
          <div className="surface-card-header">
            <h2>Active sessions</h2>
            <span>{activeSessions.length}</span>
          </div>
          <div className="list-stack">
            {(activeSessions.length > 0 ? activeSessions : recentSessions).slice(0, 5).map((session) => {
              const key = session.key || session.id
              return (
                <button key={key} className="surface-list-row clickable" onClick={() => setCurrentSession(key)}>
                  <div>
                    <div className="surface-list-title">{safe(session.title) || 'New Chat'}</div>
                    <div className="surface-list-meta">{formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}</div>
                  </div>
                  <span className={`mini-badge ${key === streamingSessionId ? 'warn' : unreadCounts[key] > 0 ? 'info' : 'neutral'}`}>
                    {key === streamingSessionId ? 'live' : unreadCounts[key] > 0 ? `${unreadCounts[key]} unread` : 'open'}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="surface-card">
          <div className="surface-card-header">
            <h2>Cron health</h2>
            <span>{cronSummary.total}</span>
          </div>
          <div className="metric-grid compact">
            <Metric label="Active" value={String(cronSummary.active)} tone="ok" />
            <Metric label="Paused" value={String(cronSummary.paused)} tone={cronSummary.paused > 0 ? 'warn' : 'neutral'} />
            <Metric label="Total" value={String(cronSummary.total)} tone="neutral" />
          </div>
          <div className="list-stack slim">
            {cronJobs.slice(0, 4).map((job) => (
              <div key={job.id} className="surface-list-row">
                <div>
                  <div className="surface-list-title">{safe(job.name)}</div>
                  <div className="surface-list-meta">{safe(job.schedule)}</div>
                </div>
                <span className={`mini-badge ${job.status === 'paused' ? 'warn' : 'ok'}`}>{safe(job.status)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-card">
          <div className="surface-card-header">
            <h2>Recent events</h2>
            <span>{recentEvents.length}</span>
          </div>
          <div className="timeline-list">
            {recentEvents.length > 0 ? recentEvents.map((event) => (
              <div key={event.id} className="timeline-item">
                <span className={`timeline-dot ${event.kind}`} />
                <div>
                  <div className="surface-list-title">{safe(event.label)}</div>
                  <div className="surface-list-meta">{safe(event.time)}</div>
                </div>
              </div>
            )) : <div className="surface-empty">No recent live events.</div>}
          </div>
        </section>

        <section className="surface-card surface-card-span-2">
          <div className="surface-card-header">
            <h2>Alerts</h2>
            <span>{alerts.length}</span>
          </div>
          <div className="alerts-list">
            {alerts.length > 0 ? alerts.map((alert) => (
              <div key={alert.id} className={`alert-row ${alert.level}`}>
                <div>
                  <div className="surface-list-title">{safe(alert.title)}</div>
                  <div className="surface-list-meta">{safe(alert.detail)}</div>
                </div>
                <span className={`mini-badge ${alert.level === 'critical' ? 'critical' : alert.level === 'warn' ? 'warn' : 'info'}`}>{safe(alert.level)}</span>
              </div>
            )) : <div className="surface-empty">No active alerts.</div>}
          </div>
        </section>

        <section className="surface-card">
          <div className="surface-card-header">
            <h2>Architecture snapshot</h2>
            <span>Quick read</span>
          </div>
          <div className="surface-note">
            This is a v1 snapshot of the current system makeup, not a full architecture explorer yet.
          </div>
          <div className="list-stack slim">
            {modelAssignments.map((assignment) => (
              <div key={assignment.id} className="surface-list-row">
                <div>
                  <div className="surface-list-title">{safe(assignment.name)}</div>
                  <div className="surface-list-meta">{safe(assignment.model || 'Unknown model')}</div>
                </div>
                <span className="mini-badge neutral">{safe(assignment.thinking || 'default')}</span>
              </div>
            ))}
            {modelAssignments.length === 0 && <div className="surface-empty">No model assignments available.</div>}
          </div>
        </section>

        <section className="surface-card">
          <div className="surface-card-header">
            <h2>Core config state</h2>
            <span>Gateway</span>
          </div>
          <div className="list-stack slim">
            {coreFileStatus.map((item) => (
              <div key={item.label} className="surface-list-row">
                <div>
                  <div className="surface-list-title">{item.label}</div>
                  <div className="surface-list-meta">{safe(String(item.value))}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      ) : (
        <div className="surface-grid architecture-grid">
          <section className="surface-card surface-card-span-2">
            <div className="surface-card-header">
              <h2>Architecture snapshot</h2>
              <span>Gateway-first v1</span>
            </div>
            <div className="surface-note">
              PRSM is acting as the client surface. Gateway remains the control plane and source of truth.
            </div>
            <div className="metric-grid compact">
              <Metric label="Agents" value={String(agents.length)} tone="neutral" />
              <Metric label="Skills" value={String(skills.length)} tone="neutral" />
              <Metric label="Sessions" value={String(sessions.length)} tone="neutral" />
            </div>
          </section>

          <section className="surface-card">
            <div className="surface-card-header">
              <h2>Model assignments</h2>
              <span>{modelAssignments.length}</span>
            </div>
            <div className="list-stack slim">
              {modelAssignments.map((assignment) => (
                <div key={assignment.id} className="surface-list-row">
                  <div>
                    <div className="surface-list-title">{safe(assignment.name)}</div>
                    <div className="surface-list-meta">{safe(assignment.model || 'Unknown model')}</div>
                  </div>
                  <span className="mini-badge neutral">{safe(assignment.thinking || 'default')}</span>
                </div>
              ))}
              {modelAssignments.length === 0 && <div className="surface-empty">No model assignments available.</div>}
            </div>
          </section>

          <section className="surface-card">
            <div className="surface-card-header">
              <h2>Core config state</h2>
              <span>Gateway</span>
            </div>
            <div className="list-stack slim">
              {coreFileStatus.map((item) => (
                <div key={item.label} className="surface-list-row">
                  <div>
                    <div className="surface-list-title">{item.label}</div>
                    <div className="surface-list-meta">{safe(String(item.value))}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-card">
            <div className="surface-card-header">
              <h2>Skills map</h2>
              <span>{skills.length}</span>
            </div>
            <div className="list-stack slim">
              {skills.slice(0, 6).map((skill) => (
                <div key={skill.id} className="surface-list-row">
                  <div>
                    <div className="surface-list-title">{safe(skill.name)}</div>
                    <div className="surface-list-meta">{safe(skill.filePath || skill.description || 'Installed skill')}</div>
                  </div>
                  <span className={`mini-badge ${skill.enabled === false ? 'warn' : 'ok'}`}>{skill.enabled === false ? 'disabled' : 'enabled'}</span>
                </div>
              ))}
              {skills.length === 0 && <div className="surface-empty">No skills loaded.</div>}
            </div>
          </section>

          <section className="surface-card surface-card-span-2">
            <div className="surface-card-header">
              <h2>Memory / project footprint</h2>
              <span>Workspace-facing</span>
            </div>
            <div className="surface-note">
              Project files and core docs are managed through Workspace. This snapshot is here to clarify system shape, not replace the editor flow.
            </div>
            <div className="metric-grid compact">
              <Metric label="Pinned context" value={String(pinnedMessages.length)} tone="neutral" />
              <Metric label="Provider alerts" value={String(providerAlerts.length)} tone={providerAlerts.length > 0 ? 'warn' : 'ok'} />
              <Metric label="Paused crons" value={String(cronSummary.paused)} tone={cronSummary.paused > 0 ? 'warn' : 'neutral'} />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function StatusPill({ tone, label }: { tone: 'ok' | 'warn' | 'critical' | 'info'; label: string }) {
  return <div className={`status-pill ${tone}`}><span className="status-pill-dot" />{label}</div>
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'critical' | 'neutral' }) {
  return (
    <div className={`metric-card ${tone}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{safe(value)}</div>
    </div>
  )
}
