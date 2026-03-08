import type { Session } from './openclaw'

export type MainView =
  | 'chat'
  | 'system'
  | 'workspace'
  | 'skill-detail'
  | 'cron-detail'
  | 'create-cron'
  | 'agent-detail'
  | 'create-agent'
  | 'clawhub-skill-detail'
  | 'server-settings'
  | 'usage'
  | 'pixel-dashboard'

export type SystemSubview = 'overview' | 'architecture'

export type SurfaceView = 'chat' | 'system' | 'workspace'

export function sessionKeyOf(session: Pick<Session, 'id' | 'key'>): string {
  return session.key || session.id
}

export function isSurfaceView(view: MainView): view is SurfaceView {
  return view === 'chat' || view === 'system' || view === 'workspace'
}

export function getPrimarySurface(view: MainView): SurfaceView {
  return isSurfaceView(view) ? view : 'chat'
}

export function isSessionErrored(params: {
  connected: boolean
  currentSessionId: string | null
  sessionKey: string
}): boolean {
  return !params.connected && params.currentSessionId === params.sessionKey
}

export function hasSessionSubagents(params: {
  activeSubagents: Array<{ sessionKey: string }>
  sessionKey: string
}): boolean {
  return params.activeSubagents.some((subagent) => subagent.sessionKey === params.sessionKey)
}

export function getSessionStatusSummary(params: {
  sessionKey: string
  currentSessionId: string | null
  streamingSessionId: string | null
  isStreaming: boolean
  connected: boolean
  unreadCounts: Record<string, number>
  compactingSession: string | null
  activeSubagents: Array<{ sessionKey: string }>
}): {
  isStreaming: boolean
  isErrored: boolean
  hasUnread: boolean
  isCompacting: boolean
  hasSubagents: boolean
  tone: 'streaming' | 'error' | 'unread' | 'compacting' | 'idle'
  label: 'live' | 'offline' | 'unread' | 'compacting' | 'idle'
 } {
  const isStreamingSession = params.isStreaming && params.streamingSessionId === params.sessionKey
  const isErrored = isSessionErrored({
    connected: params.connected,
    currentSessionId: params.currentSessionId,
    sessionKey: params.sessionKey
  })
  const hasUnread = (params.unreadCounts[params.sessionKey] || 0) > 0
  const isCompacting = params.compactingSession === params.sessionKey
  const hasSubagents = hasSessionSubagents({
    activeSubagents: params.activeSubagents,
    sessionKey: params.sessionKey
  })

  if (isStreamingSession) return { isStreaming: true, isErrored, hasUnread, isCompacting, hasSubagents, tone: 'streaming', label: 'live' }
  if (isErrored) return { isStreaming: false, isErrored: true, hasUnread, isCompacting, hasSubagents, tone: 'error', label: 'offline' }
  if (isCompacting) return { isStreaming: false, isErrored, hasUnread, isCompacting: true, hasSubagents, tone: 'compacting', label: 'compacting' }
  if (hasUnread) return { isStreaming: false, isErrored, hasUnread: true, isCompacting, hasSubagents, tone: 'unread', label: 'unread' }
  return { isStreaming: false, isErrored, hasUnread, isCompacting, hasSubagents, tone: 'idle', label: 'idle' }
}
