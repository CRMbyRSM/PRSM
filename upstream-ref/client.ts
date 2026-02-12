// OpenClaw Client - Core Connection, Events, and Streaming

import type {
  Message, Session, Agent, Skill, CronJob,
  RequestFrame, ResponseFrame, EventFrame, EventHandler
} from './types'
import { stripAnsi, extractToolResultText, extractTextFromContent, isHeartbeatContent } from './utils'
import * as sessionsApi from './sessions'
import * as chatApi from './chat'
import * as agentsApi from './agents'
import * as skillsApi from './skills'
import * as cronApi from './cron-jobs'
import * as configApi from './config'

/** Per-session stream accumulation state. */
interface SessionStreamState {
  source: 'chat' | 'agent' | null
  text: string
  mode: 'delta' | 'cumulative' | null
  blockOffset: number
  started: boolean
  runId: string | null
}

function createSessionStream(): SessionStreamState {
  return { source: null, text: '', mode: null, blockOffset: 0, started: false, runId: null }
}

export class OpenClawClient {
  private ws: WebSocket | null = null
  private url: string
  private token: string
  private authMode: 'token' | 'password'
  private requestId = 0
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()
  private eventHandlers = new Map<string, Set<EventHandler>>()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private authenticated = false

  // Per-session stream tracking — allows concurrent agent conversations
  // without cross-contaminating stream text buffers.
  private sessionStreams = new Map<string, SessionStreamState>()
  // Set of session keys that the user has actively sent messages to.
  // Used for subagent detection: events from unknown sessions are subagents.
  private parentSessionKeys = new Set<string>()
  // The session key for the most recent user send (fallback for events without sessionKey).
  private defaultSessionKey: string | null = null
  // Guards against emitting duplicate streamSessionKey events per send cycle.
  private sessionKeyResolved = false

  constructor(url: string, token: string = '', authMode: 'token' | 'password' = 'token') {
    this.url = url
    this.token = token
    this.authMode = authMode
  }

  // Event handling
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
    const handlers = this.eventHandlers.get(event)
    handlers?.forEach((handler) => {
      try {
        handler(...args)
      } catch {
        // Event handler error - silently ignore
      }
    })
  }

  // Connection management
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          this.reconnectAttempts = 0
        }

        this.ws.onerror = (error) => {
          // Check if this might be a certificate error (wss:// that failed to connect)
          if (this.url.startsWith('wss://') && this.ws?.readyState === WebSocket.CLOSED) {
            try {
              const urlObj = new URL(this.url)
              const httpsUrl = `https://${urlObj.host}`
              this.emit('certError', { url: this.url, httpsUrl })
              reject(new Error(`Certificate error - visit ${httpsUrl} to accept the certificate`))
              return
            } catch {
              // URL parsing failed, fall through to generic error
            }
          }

          this.emit('error', error)
          reject(new Error('WebSocket connection failed'))
        }

        this.ws.onclose = () => {
          this.authenticated = false
          this.resetStreamState()
          this.emit('disconnected')
          this.attemptReconnect()
        }

        this.ws.onmessage = (event) => {
          const incoming = (event as MessageEvent).data
          if (typeof incoming === 'string') {
            this.handleMessage(incoming, resolve, reject)
            return
          }

          // Some runtimes deliver WebSocket frames as Blob/ArrayBuffer.
          if (incoming instanceof Blob) {
            incoming.text().then((text) => {
              this.handleMessage(text, resolve, reject)
            }).catch(() => {})
            return
          }

          if (incoming instanceof ArrayBuffer) {
            try {
              const text = new TextDecoder().decode(new Uint8Array(incoming))
              this.handleMessage(text, resolve, reject)
            } catch {
              // ignore
            }
            return
          }

          // Unknown frame type; ignore.
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    setTimeout(() => {
      this.connect().catch(() => {})
    }, delay)
  }

  disconnect(): void {
    this.maxReconnectAttempts = 0 // Prevent auto-reconnect
    if (this.ws) {
      // Null out handlers BEFORE close() so the socket stops processing
      // messages immediately. ws.close() is async — without this, events
      // arriving during the CLOSING state still trigger handleMessage.
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
    }
    this.ws = null
    this.authenticated = false
    this.resetStreamState()
  }

  private async performHandshake(_nonce?: string): Promise<void> {
    const id = (++this.requestId).toString()
    const connectMsg: RequestFrame = {
      type: 'req',
      id,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        role: 'operator',
        client: {
          id: 'gateway-client',
          displayName: 'ClawControl',
          version: '1.0.0',
          platform: 'web',
          mode: 'backend'
        },
        auth: this.token
            ? (this.authMode === 'password' ? { password: this.token } : { token: this.token })
            : undefined
      }
    }

    this.ws?.send(JSON.stringify(connectMsg))
  }

  // RPC methods
  private async call<T>(method: string, params?: any, options?: { timeoutMs?: number }): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to OpenClaw')
    }

    const id = (++this.requestId).toString()
    const request: RequestFrame = {
      type: 'req',
      method,
      params,
      id
    }

    const timeoutMs = options?.timeoutMs || 30000

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject
      })

      this.ws!.send(JSON.stringify(request))

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`Request timeout: ${method}`))
        }
      }, timeoutMs)
    })
  }

  private handleMessage(data: string, resolve?: () => void, reject?: (err: Error) => void): void {
    try {
      const message = JSON.parse(data)

      // 1. Handle Events
      if (message.type === 'event') {
        const eventFrame = message as EventFrame

        // Special case: Handshake Challenge
        if (eventFrame.event === 'connect.challenge') {
          this.performHandshake(eventFrame.payload?.nonce).catch((err) => {
            reject?.(err)
          })
          return
        }

        this.handleNotification(eventFrame.event, eventFrame.payload)
        return
      }

      // 2. Handle Responses
      if (message.type === 'res') {
        const resFrame = message as ResponseFrame
        const pending = this.pendingRequests.get(resFrame.id)

        // Special case: Initial Connect Response
        if (!this.authenticated && resFrame.ok && resFrame.payload?.type === 'hello-ok') {
          this.authenticated = true
          this.emit('connected', resFrame.payload)
          resolve?.()
          return
        }

        if (pending) {
          this.pendingRequests.delete(resFrame.id)
          if (resFrame.ok) {
            pending.resolve(resFrame.payload)
          } else {
            const errorMsg = resFrame.error?.message || 'Unknown error'
            pending.reject(new Error(errorMsg))
          }
        } else if (!resFrame.ok && !this.authenticated) {
          // Failed connect response
          const errorMsg = resFrame.error?.message || 'Handshake failed'
          reject?.(new Error(errorMsg))
        }
        return
      }
    } catch {
      // Failed to parse message
    }
  }

  // Stream state management — per-session

  private getStream(sessionKey: string): SessionStreamState {
    let ss = this.sessionStreams.get(sessionKey)
    if (!ss) {
      ss = createSessionStream()
      this.sessionStreams.set(sessionKey, ss)
    }
    return ss
  }

  /** Resolve the session key for an event. Falls back to defaultSessionKey for legacy events. */
  private resolveEventSessionKey(eventSessionKey?: unknown): string {
    if (typeof eventSessionKey === 'string' && eventSessionKey) return eventSessionKey
    return this.defaultSessionKey || '__default__'
  }

  private resetSessionStream(sessionKey: string): void {
    this.sessionStreams.delete(sessionKey)
  }

  private resetStreamState(): void {
    this.sessionStreams.clear()
    this.parentSessionKeys.clear()
    this.defaultSessionKey = null
    this.sessionKeyResolved = false
  }

  /** Emit streamSessionKey for the first event of a new send cycle if the key differs. */
  private maybeEmitSessionKey(runId: unknown, sessionKey: string): void {
    if (this.sessionKeyResolved) return
    if (!this.defaultSessionKey) return
    // Skip events from other known parent sessions (different conversations)
    if (this.parentSessionKeys.has(sessionKey) && sessionKey !== this.defaultSessionKey) return

    this.sessionKeyResolved = true
    if (sessionKey === this.defaultSessionKey) return // Same key, no rename needed

    // Server assigned a different canonical key — update tracking and notify store
    this.parentSessionKeys.add(sessionKey)
    this.emit('streamSessionKey', { runId, sessionKey })
  }

  private ensureStream(ss: SessionStreamState, source: 'chat' | 'agent', modeHint: 'delta' | 'cumulative', runId: unknown, sessionKey: string): void {
    if (typeof runId === 'string' && !ss.runId) {
      ss.runId = runId
    }
    this.maybeEmitSessionKey(runId, sessionKey)

    if (ss.source === null) {
      ss.source = source
    }
    if (ss.source !== source) return

    if (!ss.mode) {
      ss.mode = modeHint
    }

    if (!ss.started) {
      ss.started = true
      this.emit('streamStart', { sessionKey })
    }
  }

  private applyStreamText(ss: SessionStreamState, nextText: string, sessionKey: string): void {
    if (!nextText) return
    const previous = ss.text
    if (nextText === previous) return

    if (!previous) {
      ss.text = nextText
      this.emit('streamChunk', { text: nextText, sessionKey })
      return
    }

    if (nextText.startsWith(previous)) {
      const append = nextText.slice(previous.length)
      ss.text = nextText
      if (append) {
        this.emit('streamChunk', { text: append, sessionKey })
      }
      return
    }

    // New content block — accumulate rather than replace.
    const separator = '\n\n'
    ss.text = ss.text + separator + nextText
    this.emit('streamChunk', { text: separator + nextText, sessionKey })
  }

  private mergeIncoming(ss: SessionStreamState, incoming: string, modeHint: 'delta' | 'cumulative'): string {
    const previous = ss.text

    if (modeHint === 'cumulative') {
      if (!previous) return incoming
      if (incoming === previous) return previous

      // Normal cumulative growth: incoming extends the full accumulated text
      if (incoming.startsWith(previous)) return incoming

      // Check if incoming extends just the current content block
      // (agent data.text is cumulative per-block, resetting on tool calls)
      const currentBlock = previous.slice(ss.blockOffset)
      if (currentBlock && incoming.startsWith(currentBlock)) {
        return previous.slice(0, ss.blockOffset) + incoming
      }

      // New content block detected — accumulate rather than replace.
      const separator = '\n\n'
      ss.blockOffset = previous.length + separator.length
      return previous + separator + incoming
    }

    // Some servers send cumulative strings even in "delta" fields.
    if (previous && incoming.startsWith(previous)) {
      return incoming
    }

    // Some servers repeat a suffix; avoid regressions.
    if (previous && previous.endsWith(incoming)) {
      return previous
    }

    // Fallback for partial overlap between chunk boundaries.
    if (previous) {
      const maxOverlap = Math.min(previous.length, incoming.length)
      for (let i = maxOverlap; i > 0; i--) {
        if (previous.endsWith(incoming.slice(0, i))) {
          return previous + incoming.slice(i)
        }
      }
    }

    return previous + incoming
  }

  // Notification / event handling

  private handleNotification(event: string, payload: any): void {
    const eventSessionKey = payload?.sessionKey as string | undefined
    const sk = this.resolveEventSessionKey(eventSessionKey)

    // Subagent detection: events from sessions not in the parent set
    // indicate a spawned subagent conversation.
    if (this.parentSessionKeys.size > 0 && eventSessionKey && !this.parentSessionKeys.has(eventSessionKey)) {
      this.emit('subagentDetected', { sessionKey: eventSessionKey })
    }

    switch (event) {
      case 'chat': {
        const ss = this.getStream(sk)

        if (payload.state === 'delta') {
          this.ensureStream(ss, 'chat', 'cumulative', payload.runId, sk)
          if (ss.source !== 'chat') return // Another stream type already claimed this session

          const rawText = payload.message?.content !== undefined
            ? extractTextFromContent(payload.message.content)
            : (typeof payload.delta === 'string' ? stripAnsi(payload.delta) : '')

          if (rawText) {
            const nextText = this.mergeIncoming(ss, isHeartbeatContent(rawText) ? '\u2764\uFE0F' : rawText, 'cumulative')
            this.applyStreamText(ss, nextText, sk)
          }
          return
        } else if (payload.state === 'final') {
          this.maybeEmitSessionKey(payload.runId, sk)

          // Always emit the canonical final message so the store can replace
          // any truncated streaming placeholder.
          if (payload.message) {
            const text = extractTextFromContent(payload.message.content)
            if (text) {
              const id =
                (typeof payload.message.id === 'string' && payload.message.id) ||
                (typeof payload.runId === 'string' && payload.runId) ||
                `msg-${Date.now()}`
              const tsRaw = payload.message.timestamp
              const tsNum = typeof tsRaw === 'number' ? tsRaw : NaN
              const tsMs = Number.isFinite(tsNum) ? (tsNum > 1e12 ? tsNum : tsNum * 1000) : Date.now()
              this.emit('message', {
                id,
                role: payload.message.role,
                content: isHeartbeatContent(text) ? '\u2764\uFE0F' : text,
                timestamp: new Date(tsMs).toISOString(),
                sessionKey: eventSessionKey
              })
            }
          }

          if (ss.started) {
            this.emit('streamEnd', { sessionKey: eventSessionKey })
          }
          this.resetSessionStream(sk)
        }
        break
      }
      case 'presence':
        this.emit('agentStatus', payload)
        break
      case 'agent': {
        const ss = this.getStream(sk)

        if (payload.stream === 'assistant') {
          const hasCanonicalText = typeof payload.data?.text === 'string'
          this.ensureStream(ss, 'agent', hasCanonicalText ? 'cumulative' : 'delta', payload.runId, sk)
          if (ss.source !== 'agent') return // Another stream type already claimed this session

          // Prefer canonical cumulative text when available.
          const canonicalText = typeof payload.data?.text === 'string' ? stripAnsi(payload.data.text) : ''
          if (canonicalText) {
            const nextText = this.mergeIncoming(ss, isHeartbeatContent(canonicalText) ? '\u2764\uFE0F' : canonicalText, 'cumulative')
            this.applyStreamText(ss, nextText, sk)
            return
          }

          const deltaText = typeof payload.data?.delta === 'string' ? stripAnsi(payload.data.delta) : ''
          if (deltaText) {
            const nextText = this.mergeIncoming(ss, isHeartbeatContent(deltaText) ? '\u2764\uFE0F' : deltaText, 'delta')
            this.applyStreamText(ss, nextText, sk)
          }
        } else if (payload.stream === 'tool') {
          this.maybeEmitSessionKey(payload.runId, sk)

          if (!ss.started) {
            ss.started = true
            this.emit('streamStart', { sessionKey: sk })
          }

          const data = payload.data || {}
          const rawResult = extractToolResultText(data.result)
          const toolPayload = {
            toolCallId: data.toolCallId || data.id || `tool-${Date.now()}`,
            name: data.name || data.toolName || 'unknown',
            phase: data.phase || (data.result !== undefined ? 'result' : 'start'),
            result: rawResult ? stripAnsi(rawResult) : undefined,
            sessionKey: eventSessionKey
          }
          this.emit('toolCall', toolPayload)
        } else if (payload.stream === 'lifecycle') {
          this.maybeEmitSessionKey(payload.runId, sk)
          const phase = payload.data?.phase
          const state = payload.data?.state
          if (phase === 'end' || phase === 'error' || state === 'complete' || state === 'error') {
            if (ss.source === 'agent' && ss.started) {
              this.emit('streamEnd', { sessionKey: eventSessionKey })
              // Partial reset: keep source and text so late-arriving chat:delta
              // events are still filtered by the source !== 'chat' guard.
              // chat:final will delete the session stream entirely.
              ss.started = false
            }
          }
        }
        break
      }
      default:
        this.emit(event, payload)
    }
  }

  getActiveSessionKey(): string | null {
    return this.defaultSessionKey
  }

  setPrimarySessionKey(key: string | null): void {
    if (key) {
      this.parentSessionKeys.add(key)
      this.defaultSessionKey = key
      this.sessionKeyResolved = false
    } else {
      // Clear default when switching sessions (parent set is preserved
      // so concurrent streams from other sessions aren't detected as subagents)
      this.defaultSessionKey = null
    }
  }

  // Domain API methods - delegated to modules

  // Sessions
  async listSessions(): Promise<Session[]> {
    return sessionsApi.listSessions(this.call.bind(this))
  }

  async createSession(agentId?: string): Promise<Session> {
    return sessionsApi.createSession(agentId)
  }

  async deleteSession(sessionId: string): Promise<void> {
    return sessionsApi.deleteSession(this.call.bind(this), sessionId)
  }

  async updateSession(sessionId: string, updates: { label?: string }): Promise<void> {
    return sessionsApi.updateSession(this.call.bind(this), sessionId, updates)
  }

  async spawnSession(agentId: string, prompt?: string): Promise<Session> {
    return sessionsApi.spawnSession(this.call.bind(this), agentId, prompt)
  }

  // Chat
  async getSessionMessages(sessionId: string): Promise<Message[]> {
    return chatApi.getSessionMessages(this.call.bind(this), sessionId)
  }

  async sendMessage(params: {
    sessionId?: string
    content: string
    agentId?: string
    thinking?: boolean
  }): Promise<{ sessionKey?: string }> {
    return chatApi.sendMessage(this.call.bind(this), params)
  }

  async abortChat(sessionId: string): Promise<void> {
    return chatApi.abortChat(this.call.bind(this), sessionId)
  }

  // Agents
  async listAgents(): Promise<Agent[]> {
    return agentsApi.listAgents(this.call.bind(this), this.url)
  }

  async getAgentIdentity(agentId: string): Promise<{ name?: string; emoji?: string; avatar?: string; avatarUrl?: string } | null> {
    return agentsApi.getAgentIdentity(this.call.bind(this), agentId)
  }

  async getAgentFiles(agentId: string): Promise<{ workspace: string; files: Array<{ name: string; path: string; missing: boolean; size?: number }> } | null> {
    return agentsApi.getAgentFiles(this.call.bind(this), agentId)
  }

  async getAgentFile(agentId: string, fileName: string): Promise<{ content?: string; missing: boolean } | null> {
    return agentsApi.getAgentFile(this.call.bind(this), agentId, fileName)
  }

  async setAgentFile(agentId: string, fileName: string, content: string): Promise<boolean> {
    return agentsApi.setAgentFile(this.call.bind(this), agentId, fileName, content)
  }

  async createAgent(params: agentsApi.CreateAgentParams): Promise<agentsApi.CreateAgentResult> {
    return agentsApi.createAgent(this.call.bind(this), params)
  }

  async deleteAgent(agentId: string): Promise<agentsApi.DeleteAgentResult> {
    return agentsApi.deleteAgent(this.call.bind(this), agentId)
  }

  // Skills
  async listSkills(): Promise<Skill[]> {
    return skillsApi.listSkills(this.call.bind(this))
  }

  async toggleSkill(skillKey: string, enabled: boolean): Promise<void> {
    return skillsApi.toggleSkill(this.call.bind(this), skillKey, enabled)
  }

  async installSkill(skillName: string, installId: string): Promise<void> {
    return skillsApi.installSkill(this.call.bind(this), skillName, installId)
  }

  async installHubSkill(slug: string): Promise<void> {
    return skillsApi.installHubSkill(this.call.bind(this), slug)
  }

  // Cron Jobs
  async listCronJobs(): Promise<CronJob[]> {
    return cronApi.listCronJobs(this.call.bind(this))
  }

  async toggleCronJob(cronId: string, enabled: boolean): Promise<void> {
    return cronApi.toggleCronJob(this.call.bind(this), cronId, enabled)
  }

  async getCronJobDetails(cronId: string): Promise<CronJob | null> {
    return cronApi.getCronJobDetails(this.call.bind(this), cronId)
  }

  // Config
  async getServerConfig(): Promise<{ config: any; hash: string }> {
    return configApi.getServerConfig(this.call.bind(this))
  }

  async patchServerConfig(patch: object, baseHash: string): Promise<void> {
    return configApi.patchServerConfig(this.call.bind(this), patch, baseHash)
  }
}
