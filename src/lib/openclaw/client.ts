// OpenClaw Client - Bridge HTTP Transport

import type {
  Session, Agent, Skill, CronJob, EventHandler, Message
} from './types'
import type { ChatHistoryResult, ChatAttachmentInput } from './chat'
import { stripAnsi, stripSystemNotifications, parseMediaTokens, stripConversationMetadata } from './utils'
import type { CreateAgentParams, CreateAgentResult, DeleteAgentResult } from './agents'

/** Maximum polling duration after sending a message (5 minutes). */
const MAX_POLL_DURATION_MS = 5 * 60 * 1000
/** Interval between message polls while waiting for assistant response. */
const POLL_INTERVAL_MS = 2000
/** Number of consecutive identical polls before declaring stream complete. */
const STABLE_POLL_THRESHOLD = 3

export class OpenClawClient {
  private bridgeUrl: string
  private bridgeToken: string
  private eventHandlers = new Map<string, Set<EventHandler>>()
  private pollTimers = new Set<ReturnType<typeof setTimeout>>()
  private activePollAbort: AbortController | null = null

  // Session tracking (kept for store compatibility)
  private defaultSessionKey: string | null = null
  private parentSessionKeys = new Set<string>()

  constructor(bridgeUrl: string, bridgeToken: string) {
    this.bridgeUrl = bridgeUrl.replace(/\/+$/, '')
    this.bridgeToken = bridgeToken
  }

  // ── Event emitter ──────────────────────────────────────────────

  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)!.add(handler)
  }

  off(event: string, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler)
  }

  private emit(event: string, ...args: unknown[]): void {
    this.eventHandlers.get(event)?.forEach((handler) => {
      try { handler(...args) } catch { /* ignore */ }
    })
  }

  // ── HTTP helper ────────────────────────────────────────────────

  private async bridgeFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.bridgeUrl}${path}`
    const headers: Record<string, string> = {
      ...(options?.headers as Record<string, string> || {}),
    }
    if (this.bridgeToken) {
      headers['Authorization'] = `Bearer ${this.bridgeToken}`
    }
    if (options?.body && typeof options.body === 'string') {
      headers['Content-Type'] = 'application/json'
    }

    const res = await fetch(url, { ...options, headers })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Bridge ${res.status}: ${text || res.statusText}`)
    }
    return res.json()
  }

  // ── Connection ─────────────────────────────────────────────────

  async connect(): Promise<void> {
    // 1. Health check (no auth required)
    try {
      await fetch(`${this.bridgeUrl}/health`, { signal: AbortSignal.timeout(10000) })
    } catch (err) {
      throw new Error(`Bridge unreachable at ${this.bridgeUrl}`)
    }

    // 2. Validate auth by listing sessions
    try {
      await this.bridgeFetch('/sessions?limit=1')
    } catch (err) {
      throw new Error(`Bridge auth failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    }

    this.emit('connected', {})
  }

  disconnect(): void {
    // Stop all polling
    for (const timer of this.pollTimers) {
      clearTimeout(timer)
    }
    this.pollTimers.clear()
    if (this.activePollAbort) {
      this.activePollAbort.abort()
      this.activePollAbort = null
    }
    this.parentSessionKeys.clear()
    this.defaultSessionKey = null
    this.emit('disconnected')
  }

  // ── Session tracking (store compatibility) ─────────────────────

  getActiveSessionKey(): string | null {
    return this.defaultSessionKey
  }

  setPrimarySessionKey(key: string | null): void {
    if (key) {
      this.parentSessionKeys.add(key)
      this.defaultSessionKey = key
    } else {
      this.defaultSessionKey = null
    }
  }

  // ── Sessions ───────────────────────────────────────────────────

  async listSessions(): Promise<Session[]> {
    try {
      const data = await this.bridgeFetch<any>('/sessions?limit=50')
      const sessions = Array.isArray(data?.sessions) ? data.sessions : []
      return sessions.map((s: any) => {
        const key = s.key || s.id
        return {
          id: key || `session-${Math.random()}`,
          key,
          title: humanizeSessionTitle(s, key),
          agentId: s.agentId || extractAgentIdFromKey(key),
          createdAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
          updatedAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
          lastMessage: sanitizePreviewText(s.lastMessagePreview || s.lastMessage || ''),
          spawned: s.spawned || isSubagentKey(key) || undefined,
          cron: s.cron || isCronKey(key) || undefined,
          parentSessionId: s.parentSessionId || s.parentKey || s.spawnedBy || undefined
        }
      })
    } catch {
      return []
    }
  }

  async createSession(agentId?: string): Promise<Session> {
    const agent = agentId || 'main'
    const uniqueId = crypto.randomUUID()
    const key = `agent:${agent}:${uniqueId}`
    return {
      id: key,
      key,
      title: 'New Chat',
      agentId: agent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }

  async deleteSession(_sessionId: string): Promise<void> {
    console.warn('[PRSM] deleteSession not yet available via bridge')
  }

  async updateSession(_sessionId: string, _updates: { label?: string }): Promise<void> {
    console.warn('[PRSM] updateSession not yet available via bridge')
  }

  async spawnSession(agentId: string, _prompt?: string): Promise<Session> {
    console.warn('[PRSM] spawnSession not yet available via bridge')
    const key = `agent:${agentId}:spawned-${Date.now()}`
    return {
      id: key,
      key,
      title: 'Spawned Session',
      agentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      spawned: true
    }
  }

  // ── Chat ───────────────────────────────────────────────────────

  async getSessionMessages(sessionId: string): Promise<ChatHistoryResult> {
    try {
      const data = await this.bridgeFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/messages`)
      const rawMessages: any[] = Array.isArray(data?.messages) ? data.messages : []
      return parseMessageHistory(rawMessages)
    } catch (err) {
      console.warn('[PRSM] getSessionMessages failed:', err)
      return { messages: [], toolCalls: [] }
    }
  }

  async sendMessage(params: {
    sessionId?: string
    content: string
    agentId?: string
    thinking?: boolean
    attachments?: ChatAttachmentInput[]
  }): Promise<{ sessionKey?: string }> {
    const sessionKey = params.sessionId || (params.agentId ? `agent:${params.agentId}:main` : 'agent:main:main')
    const idempotencyKey = crypto.randomUUID()

    const body: Record<string, unknown> = {
      message: params.content,
      sessionKey,
      idempotencyKey
    }
    if (params.agentId) body.agentId = params.agentId
    if (params.attachments && params.attachments.length > 0) {
      body.attachments = params.attachments
    }

    const result = await this.bridgeFetch<any>('/messages/send', {
      method: 'POST',
      body: JSON.stringify(body)
    })

    const resolvedKey = result?.result?.sessionKey || result?.sessionKey || sessionKey

    // Start polling for response
    this.startPolling(resolvedKey)

    return { sessionKey: resolvedKey }
  }

  async abortChat(_sessionId: string): Promise<void> {
    console.warn('[PRSM] abortChat not yet available via bridge')
    // Stop polling for this session
    if (this.activePollAbort) {
      this.activePollAbort.abort()
      this.activePollAbort = null
    }
  }

  // ── Polling for "streaming" ────────────────────────────────────

  private startPolling(sessionKey: string): void {
    // Cancel any existing poll
    if (this.activePollAbort) {
      this.activePollAbort.abort()
    }

    const abort = new AbortController()
    this.activePollAbort = abort
    const startTime = Date.now()
    let lastContent = ''
    let lastMessageCount = 0
    let stableCount = 0
    let streamStarted = false

    this.emit('streamStart', { sessionKey })

    const poll = async () => {
      if (abort.signal.aborted) return

      // Safety cutoff
      if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
        this.endPolling(sessionKey, streamStarted)
        return
      }

      try {
        const data = await this.bridgeFetch<any>(
          `/sessions/${encodeURIComponent(sessionKey)}/messages`
        )
        if (abort.signal.aborted) return

        const rawMessages: any[] = Array.isArray(data?.messages) ? data.messages : []

        // Find the last assistant message
        let lastAssistant: any = null
        for (let i = rawMessages.length - 1; i >= 0; i--) {
          const msg = rawMessages[i].message || rawMessages[i].data || rawMessages[i].entry || rawMessages[i]
          const role = msg.role || rawMessages[i].role
          if (role === 'assistant') {
            lastAssistant = msg
            break
          }
        }

        if (!lastAssistant) {
          // No assistant message yet — keep polling
          stableCount = 0
          const timer = setTimeout(poll, POLL_INTERVAL_MS)
          this.pollTimers.add(timer)
          return
        }

        const rawContent = lastAssistant.content
        let content = ''
        if (Array.isArray(rawContent)) {
          content = rawContent
            .filter((c: any) => c.type === 'text' || c.type === 'input_text' || c.type === 'output_text' || (!c.type && c.text))
            .map((c: any) => c.text)
            .filter(Boolean)
            .join('')
        } else if (typeof rawContent === 'string') {
          content = rawContent
        } else if (rawContent && typeof rawContent === 'object') {
          content = rawContent.text || rawContent.content || ''
        }

        content = stripAnsi(stripSystemNotifications(content).trim())

        const currentMessageCount = rawMessages.length

        if (content !== lastContent || currentMessageCount !== lastMessageCount) {
          // New or growing content
          stableCount = 0

          if (content && content !== lastContent) {
            if (!streamStarted) {
              streamStarted = true
            }

            // Emit the delta
            const delta = content.startsWith(lastContent) && lastContent
              ? content.slice(lastContent.length)
              : content

            if (delta) {
              if (!lastContent) {
                // First chunk — emit full content
                this.emit('streamChunk', { text: content, sessionKey })
              } else {
                this.emit('streamChunk', { text: delta, sessionKey })
              }
            }
          }

          lastContent = content
          lastMessageCount = currentMessageCount
        } else {
          // Content hasn't changed
          stableCount++
        }

        if (stableCount >= STABLE_POLL_THRESHOLD) {
          // Content stabilized — stream complete
          if (content) {
            // Emit final message
            const parsed = parseMessageHistory(rawMessages)
            const lastParsedAssistant = parsed.messages.filter(m => m.role === 'assistant').pop()
            if (lastParsedAssistant) {
              this.emit('message', { ...lastParsedAssistant, sessionKey })
            }
          }
          this.endPolling(sessionKey, streamStarted)
          return
        }

        // Continue polling
        const timer = setTimeout(poll, POLL_INTERVAL_MS)
        this.pollTimers.add(timer)
      } catch (err) {
        if (abort.signal.aborted) return
        // Network error during poll — retry
        const timer = setTimeout(poll, POLL_INTERVAL_MS)
        this.pollTimers.add(timer)
      }
    }

    // Start first poll after a brief delay to let the server process the message
    const timer = setTimeout(poll, POLL_INTERVAL_MS)
    this.pollTimers.add(timer)
  }

  private endPolling(sessionKey: string, streamStarted: boolean): void {
    if (this.activePollAbort) {
      this.activePollAbort.abort()
      this.activePollAbort = null
    }
    if (streamStarted) {
      this.emit('streamEnd', { sessionKey })
    }
  }

  // ── Agents (stubbed — bridge doesn't support yet) ──────────────

  async listAgents(): Promise<Agent[]> {
    try {
      const data = await this.bridgeFetch<any>('/agents')
      return Array.isArray(data?.result) ? data.result : []
    } catch (err) {
      console.warn('[PRSM] listAgents failed:', err)
      return [{
        id: 'main',
        name: 'Main Agent',
        status: 'online',
        emoji: '🦞',
        description: 'Default OpenClaw system agent'
      }]
    }
  }

  async getAgentIdentity(_agentId: string): Promise<{ name?: string; emoji?: string; avatar?: string; avatarUrl?: string } | null> {
    const agents = await this.listAgents()
    const agent = agents.find(a => a.id === _agentId)
    if (!agent) return null
    return { name: agent.name, emoji: agent.emoji, avatar: agent.avatar }
  }

  async getAgentFiles(_agentId: string): Promise<{ workspace: string; files: Array<{ name: string; path: string; missing: boolean; size?: number }> } | null> {
    console.warn('[PRSM] getAgentFiles not yet available via bridge')
    return null
  }

  async getAgentFile(_agentId: string, _fileName: string): Promise<{ content?: string; missing: boolean } | null> {
    console.warn('[PRSM] getAgentFile not yet available via bridge')
    return null
  }

  async setAgentFile(_agentId: string, _fileName: string, _content: string): Promise<boolean> {
    console.warn('[PRSM] setAgentFile not yet available via bridge')
    return false
  }

  async createAgent(_params: CreateAgentParams): Promise<CreateAgentResult> {
    console.warn('[PRSM] createAgent not yet available via bridge')
    throw new Error('createAgent not yet available via bridge')
  }

  async deleteAgent(_agentId: string): Promise<DeleteAgentResult> {
    console.warn('[PRSM] deleteAgent not yet available via bridge')
    throw new Error('deleteAgent not yet available via bridge')
  }

  // ── Skills (stubbed) ───────────────────────────────────────────

  async listWorkspaceFiles(): Promise<Array<{ path: string; name: string; group: 'core' | 'projects' | 'skills'; description?: string }>> {
    try {
      const data = await this.bridgeFetch<any>('/workspace/files')
      return Array.isArray(data?.files) ? data.files : []
    } catch (err) {
      console.warn('[PRSM] listWorkspaceFiles failed:', err)
      return []
    }
  }

  async listSkills(): Promise<Skill[]> {
    try {
      const data = await this.bridgeFetch<any>('/workspace/files')
      const files = Array.isArray(data?.files) ? data.files : []
      return files
        .filter((f: any) => f.group === 'skills')
        .map((f: any) => ({
          id: f.path,
          name: f.name,
          description: f.description || f.path,
          triggers: [],
          enabled: true,
          filePath: f.path,
          source: 'workspace'
        }))
    } catch (err) {
      console.warn('[PRSM] listSkills failed:', err)
      return []
    }
  }

  async toggleSkill(_skillKey: string, _enabled: boolean): Promise<void> {
    console.warn('[PRSM] toggleSkill not yet available via bridge')
  }

  async installSkill(_skillName: string, _installId: string): Promise<void> {
    console.warn('[PRSM] installSkill not yet available via bridge')
  }

  async installHubSkill(_slug: string, _sessionKey?: string): Promise<void> {
    console.warn('[PRSM] installHubSkill not yet available via bridge')
  }

  // ── Cron Jobs (stubbed) ────────────────────────────────────────

  async listCronJobs(): Promise<CronJob[]> {
    try {
      const data = await this.bridgeFetch<any>('/cron-jobs')
      return Array.isArray(data?.result) ? data.result : []
    } catch (err) {
      console.warn('[PRSM] listCronJobs failed:', err)
      return []
    }
  }

  async toggleCronJob(_cronId: string, _enabled: boolean): Promise<void> {
    console.warn('[PRSM] toggleCronJob not yet available via bridge')
  }

  async getCronJobDetails(_cronId: string): Promise<CronJob | null> {
    const jobs = await this.listCronJobs()
    return jobs.find(j => j.id === _cronId) || null
  }

  // ── Config (stubbed) ───────────────────────────────────────────

  async getServerConfig(): Promise<{ config: any; hash: string }> {
    try {
      const data = await this.bridgeFetch<any>('/config')
      return { config: data?.result?.config || {}, hash: data?.result?.hash || '' }
    } catch (err) {
      console.warn('[PRSM] getServerConfig failed:', err)
      return { config: null, hash: '' }
    }
  }

  async patchServerConfig(_patch: object, _baseHash: string): Promise<void> {
    console.warn('[PRSM] patchServerConfig not yet available via bridge')
  }

  // ── Usage (stubbed) ────────────────────────────────────────────

  async getUsageStatus(): Promise<any> {
    console.warn('[PRSM] getUsageStatus not yet available via bridge')
    return {}
  }

  async getUsageCost(): Promise<any> {
    console.warn('[PRSM] getUsageCost not yet available via bridge')
    return {}
  }
}

// ── Helpers ────────────────────────────────────────────────────

function extractAgentIdFromKey(key?: string): string | undefined {
  if (!key) return undefined
  const parts = key.split(':')
  if (parts[0] === 'agent' && parts.length >= 3) return parts[1]
  return undefined
}

function isSubagentKey(key?: string): boolean {
  return !!key && key.includes(':subagent:')
}

function isCronKey(key?: string): boolean {
  return !!key && key.includes(':cron:')
}

function humanizeSessionTitle(session: any, key?: string): string {
  if (session?.groupChannel) {
    return `Discord: ${String(session.groupChannel).replace(/^#/, '').replace(/\b\w/g, (c: string) => c.toUpperCase())}`
  }

  const raw = String(session?.displayName || session?.derivedTitle || session?.title || session?.label || key || 'New Chat')

  if (key === 'agent:main:main') return 'Main Session'
  if (key === 'agent:main:heartbeat') return 'Heartbeat'

  const discordMatch = raw.match(/discord:[^#]+#(.+)$/i)
  if (discordMatch) {
    const channel = discordMatch[1].trim()
    return `Discord: ${channel.replace(/\b\w/g, (c: string) => c.toUpperCase())}`
  }

  const cronMatch = key?.match(/:cron:([^:]+)$/)
  if (session?.name && key?.includes(':cron:')) return `Cron: ${session.name}`
  if (cronMatch && session?.label) return String(session.label)

  return raw.length > 80 ? `${raw.slice(0, 77)}...` : raw
}

function sanitizePreviewText(text: string): string {
  if (!text) return ''
  return text
    .replace(/Sender \(untrusted metadata\):[\s\S]*?```/g, '')
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Message history parser (extracted from chat.ts) ──────────

interface HistoryToolCall {
  toolCallId: string
  name: string
  phase: 'start' | 'result'
  result?: string
  args?: Record<string, unknown>
  afterMessageId?: string
}

function parseMessageHistory(rawMessages: any[]): ChatHistoryResult {
  const toolCalls: HistoryToolCall[] = []
  let lastAssistantId: string | null = null

  const parsed = rawMessages.map((m: any) => {
    const msg = m.message || m.data || m.entry || m
    const role: string = msg.role || m.role || 'assistant'
    const msgId = msg.id || m.id || m.runId || `history-${Math.random()}`
    const normalizedRole = role === 'user' ? 'user' : role === 'system' ? 'system' : 'assistant'
    let rawContent = msg.content ?? msg.body ?? msg.text
    let content = ''
    let thinking = msg.thinking

    if (normalizedRole === 'assistant') {
      lastAssistantId = msgId
    }

    if (Array.isArray(rawContent)) {
      content = rawContent
        .filter((c: any) => c.type === 'text' || c.type === 'input_text' || c.type === 'output_text' || (!c.type && c.text))
        .map((c: any) => c.text)
        .filter(Boolean)
        .join('')

      const thinkingBlock = rawContent.find((c: any) => c.type === 'thinking')
      if (thinkingBlock) thinking = thinkingBlock.thinking

      for (const c of rawContent) {
        if (c.type === 'toolCall') {
          const tcId = c.id || `htc-${Math.random().toString(36).slice(2, 8)}`
          let args: Record<string, unknown> | undefined
          if (c.arguments && typeof c.arguments === 'object') {
            args = c.arguments as Record<string, unknown>
          } else if (typeof c.arguments === 'string') {
            try { args = JSON.parse(c.arguments) } catch { /* ignore */ }
          } else if (c.input && typeof c.input === 'object') {
            args = c.input as Record<string, unknown>
          }
          toolCalls.push({
            toolCallId: tcId,
            name: c.name || 'tool',
            phase: 'result',
            args,
            afterMessageId: normalizedRole === 'assistant' ? msgId : lastAssistantId || undefined,
          })
        }
      }

      for (const c of rawContent) {
        if (c.type === 'toolResult') {
          const tcId = c.toolCallId || c.tool_use_id || c.id
          let resultText: string | undefined
          if (typeof c.content === 'string') {
            resultText = c.content
          } else if (Array.isArray(c.content)) {
            resultText = c.content
              .filter((b: any) => typeof b?.text === 'string')
              .map((b: any) => b.text)
              .join('')
          }
          const existing = tcId ? toolCalls.find(t => t.toolCallId === tcId) : null
          if (existing) {
            existing.phase = 'result'
            existing.result = resultText ? stripAnsi(resultText) : undefined
          } else {
            toolCalls.push({
              toolCallId: tcId || `htc-${Math.random().toString(36).slice(2, 8)}`,
              name: c.name || 'tool',
              phase: 'result',
              result: resultText ? stripAnsi(resultText) : undefined,
              afterMessageId: lastAssistantId || undefined,
            })
          }
        }
      }

      if (!content) {
        content = rawContent
          .map((c: any) => {
            if (typeof c.text === 'string') return c.text
            if (c.type === 'toolResult') {
              if (typeof c.content === 'string') return c.content
              if (Array.isArray(c.content)) {
                return c.content.filter((b: any) => typeof b?.text === 'string').map((b: any) => b.text).join('')
              }
            }
            return ''
          })
          .filter(Boolean)
          .join('')
      }
    } else if (typeof rawContent === 'object' && rawContent !== null) {
      content = rawContent.text || rawContent.content || JSON.stringify(rawContent)
    } else if (typeof rawContent === 'string') {
      content = rawContent
    }

    // Heartbeat detection
    const contentUpper = content.toUpperCase()
    const isHeartbeat =
      contentUpper.includes('HEARTBEAT_OK') ||
      contentUpper.includes('READ HEARTBEAT.MD') ||
      content.includes('# HEARTBEAT - Event-Driven Status') ||
      contentUpper.includes('CRON: HEARTBEAT')
    if (isHeartbeat) {
      if (role === 'user') return null
      content = '\u2764\uFE0F'
    }

    if (role === 'user') {
      const lower = content.toLowerCase()
      if (lower.includes('a scheduled reminder has been triggered') || lower.includes('scheduled update')) {
        return null
      }
    }

    if (content.trim() === 'NO_REPLY' || content.trim() === 'no_reply') return null
    if (role === 'toolResult') return null

    content = stripSystemNotifications(content).trim()
    if (role === 'user') {
      content = stripConversationMetadata(content).trim()
    }

    let mediaImages: Array<{ url: string; alt?: string }> | undefined
    if (normalizedRole === 'assistant' && content.includes('MEDIA:')) {
      const parsed = parseMediaTokens(content)
      content = parsed.cleanText
      if (parsed.images.length > 0) mediaImages = parsed.images
    }

    if (!content && !mediaImages && normalizedRole !== 'assistant') return null

    return {
      id: msgId,
      role: normalizedRole,
      content: stripAnsi(content),
      thinking: thinking ? stripAnsi(thinking) : thinking,
      timestamp: new Date(msg.timestamp || m.timestamp || msg.ts || m.ts || msg.createdAt || m.createdAt || Date.now()).toISOString(),
      ...(mediaImages ? { mediaImages } : {})
    } as Message
  })

  const filteredMessages = parsed.filter((m): m is Message => m !== null)

  // Merge consecutive empty assistant messages
  for (let i = filteredMessages.length - 1; i > 0; i--) {
    const curr = filteredMessages[i]
    const prev = filteredMessages[i - 1]
    if (curr.role === 'assistant' && prev.role === 'assistant' && !curr.content.trim()) {
      for (const tc of toolCalls) {
        if (tc.afterMessageId === curr.id) tc.afterMessageId = prev.id
      }
      filteredMessages.splice(i, 1)
    }
  }

  // Anchor orphaned tool calls
  for (const tc of toolCalls) {
    if (!tc.afterMessageId) {
      const lastAssistant = filteredMessages.filter(m => m.role === 'assistant').pop()
      if (lastAssistant) tc.afterMessageId = lastAssistant.id
    }
  }

  return { messages: filteredMessages, toolCalls }
}
