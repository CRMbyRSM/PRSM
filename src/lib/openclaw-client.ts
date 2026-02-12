// OpenClaw Client - Custom Frame-based Protocol (v3)
// Per-session stream architecture ported from upstream ClawControl v1.1.0

// ── Utility functions ──────────────────────────────────────────────

export function stripAnsi(str: string): string {
  return str
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[()#][A-Z0-9]/g, '')
    .replace(/\x1b[A-Z=><!*+\-\/]/gi, '')
    .replace(/\x9b[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x07/g, '')
}

function extractTextFromContent(content: unknown): string {
  let text = ''
  if (typeof content === 'string') {
    text = content
  } else if (Array.isArray(content)) {
    text = content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('')
  } else if (content && typeof content === 'object' && 'text' in content) {
    text = String((content as any).text)
  }
  return stripAnsi(text)
}

function isHeartbeatContent(text: string): boolean {
  const upper = text.toUpperCase()
  return upper.includes('HEARTBEAT_OK') || upper.includes('HEARTBEAT.MD')
}

function extractToolResultText(result: unknown): string | undefined {
  if (typeof result === 'string') return result
  if (!result || typeof result !== 'object') return undefined

  const record = result as Record<string, unknown>
  const content = Array.isArray(record.content) ? record.content : null
  if (!content) {
    if (typeof record.text === 'string') return record.text
    if (typeof record.output === 'string') return record.output
    return undefined
  }

  const texts = content
    .filter((c: any) => c && typeof c === 'object' && typeof c.text === 'string')
    .map((c: any) => c.text as string)
  return texts.length > 0 ? texts.join('\n') : undefined
}

// ── Types ──────────────────────────────────────────────────────────

export interface MessageAttachment {
  type: string
  mimeType: string
  content: string  // base64
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  thinking?: string
  attachments?: MessageAttachment[]
}

export interface Session {
  id: string
  key: string
  title: string
  agentId?: string
  createdAt: string
  updatedAt: string
  lastMessage?: string
  spawned?: boolean
  parentSessionId?: string
}

export interface Agent {
  id: string
  name: string
  description?: string
  status: 'online' | 'offline' | 'busy'
  avatar?: string
  emoji?: string
  theme?: string
  model?: string
  thinkingLevel?: string
  timeout?: number
  configured?: boolean
}

export interface AgentFile {
  name: string
  path: string
  missing: boolean
  size?: number
  updatedAtMs?: number
  content?: string
}

export interface SkillRequirements {
  bins: string[]
  anyBins: string[]
  env: string[]
  config: string[]
  os: string[]
}

export interface SkillInstallOption {
  id: string
  kind: string
  label: string
  bins?: string[]
}

export interface Skill {
  id: string
  name: string
  description: string
  triggers: string[]
  enabled?: boolean
  content?: string
  emoji?: string
  homepage?: string
  source?: string
  bundled?: boolean
  filePath?: string
  eligible?: boolean
  always?: boolean
  requirements?: SkillRequirements
  missing?: SkillRequirements
  install?: SkillInstallOption[]
}

export interface CronJob {
  id: string
  name: string
  schedule: string
  nextRun?: string
  status: 'active' | 'paused'
  description?: string
  content?: string
}

interface RequestFrame {
  type: 'req'
  id: string
  method: string
  params?: any
}

interface ResponseFrame {
  type: 'res'
  id: string
  ok: boolean
  payload?: any
  error?: {
    code: string
    message: string
    details?: any
  }
}

interface EventFrame {
  type: 'event'
  event: string
  payload?: any
}

type EventHandler = (...args: unknown[]) => void

// ── Per-session stream state ───────────────────────────────────────

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

// ── Client ─────────────────────────────────────────────────────────

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

  // ── Session key management ─────────────────────────────────────

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

  // ── Event handling ─────────────────────────────────────────────

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
      try {
        handler(...args)
      } catch {
        // Event handler error - silently ignore
      }
    })
  }

  // ── Connection management ──────────────────────────────────────

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          this.reconnectAttempts = 0
        }

        this.ws.onerror = (error) => {
          if (this.url.startsWith('wss://') && this.ws?.readyState === WebSocket.CLOSED) {
            try {
              const urlObj = new URL(this.url)
              const httpsUrl = `https://${urlObj.host}`
              this.emit('certError', { url: this.url, httpsUrl })
              reject(new Error(`Certificate error - visit ${httpsUrl} to accept the certificate`))
              return
            } catch {
              // URL parsing failed, fall through
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
          this.handleMessage(event.data, resolve, reject)
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
    this.maxReconnectAttempts = 0
    if (this.ws) {
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
          displayName: 'PRSM',
          version: __APP_VERSION__,
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

  // ── RPC ────────────────────────────────────────────────────────

  private async call<T>(method: string, params?: any): Promise<T> {
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
      }, 30000)
    })
  }

  private handleMessage(data: string, resolve?: () => void, reject?: (err: Error) => void): void {
    try {
      const message = JSON.parse(data)

      if (message.type === 'event') {
        const eventFrame = message as EventFrame

        if (eventFrame.event === 'connect.challenge') {
          this.performHandshake(eventFrame.payload?.nonce).catch((err) => {
            reject?.(err)
          })
          return
        }

        this.handleNotification(eventFrame.event, eventFrame.payload)
        return
      }

      if (message.type === 'res') {
        const resFrame = message as ResponseFrame
        const pending = this.pendingRequests.get(resFrame.id)

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
          const errorMsg = resFrame.error?.message || 'Handshake failed'
          reject?.(new Error(errorMsg))
        }
        return
      }
    } catch {
      // Failed to parse message
    }
  }

  // ── Per-session stream management ──────────────────────────────

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
    if (this.parentSessionKeys.has(sessionKey) && sessionKey !== this.defaultSessionKey) return

    this.sessionKeyResolved = true
    if (sessionKey === this.defaultSessionKey) return

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

      if (incoming.startsWith(previous)) return incoming

      // Check if incoming extends just the current content block
      const currentBlock = previous.slice(ss.blockOffset)
      if (currentBlock && incoming.startsWith(currentBlock)) {
        return previous.slice(0, ss.blockOffset) + incoming
      }

      // New content block detected
      const separator = '\n\n'
      ss.blockOffset = previous.length + separator.length
      return previous + separator + incoming
    }

    // Delta mode
    if (previous && incoming.startsWith(previous)) {
      return incoming
    }

    if (previous && previous.endsWith(incoming)) {
      return previous
    }

    // Fallback for partial overlap
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

  // ── Event / notification handling ──────────────────────────────

  private handleNotification(event: string, payload: any): void {
    const eventSessionKey = payload?.sessionKey as string | undefined
    const sk = this.resolveEventSessionKey(eventSessionKey)

    // Subagent detection: events from sessions not in the parent set
    if (this.parentSessionKeys.size > 0 && eventSessionKey && !this.parentSessionKeys.has(eventSessionKey)) {
      this.emit('subagentDetected', { sessionKey: eventSessionKey })
    }

    switch (event) {
      case 'chat': {
        const ss = this.getStream(sk)

        if (payload.state === 'delta') {
          this.ensureStream(ss, 'chat', 'cumulative', payload.runId, sk)
          if (ss.source !== 'chat') return

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

              // Extract thinking from content blocks (PRSM feature)
              let thinking: string | undefined
              const rawContent = payload.message.content
              if (Array.isArray(rawContent)) {
                const thinkingBlock = rawContent.find((c: any) => c.type === 'thinking')
                if (thinkingBlock) {
                  thinking = typeof thinkingBlock.thinking === 'string'
                    ? thinkingBlock.thinking
                    : JSON.stringify(thinkingBlock.thinking)
                }
              }

              this.emit('message', {
                id,
                role: payload.message.role,
                content: isHeartbeatContent(text) ? '\u2764\uFE0F' : text,
                thinking,
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
          if (ss.source !== 'agent') return

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
          this.emit('toolCall', {
            toolCallId: data.toolCallId || data.id || `tool-${Date.now()}`,
            name: data.name || data.toolName || 'unknown',
            phase: data.phase || (data.result !== undefined ? 'result' : 'start'),
            result: rawResult ? stripAnsi(rawResult) : undefined,
            sessionKey: eventSessionKey
          })
        } else if (payload.stream === 'lifecycle') {
          this.maybeEmitSessionKey(payload.runId, sk)
          const phase = payload.data?.phase
          const state = payload.data?.state
          if (phase === 'end' || phase === 'error' || state === 'complete' || state === 'error') {
            if (ss.source === 'agent' && ss.started) {
              this.emit('streamEnd', { sessionKey: eventSessionKey })
              // Partial reset: keep source so late chat:delta events are still
              // filtered. chat:final will delete the session stream entirely.
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

  // ── API Methods ────────────────────────────────────────────────

  async listSessions(): Promise<Session[]> {
    try {
      const result = await this.call<any>('sessions.list', {
        includeDerivedTitles: true,
        includeLastMessage: true,
        limit: 50
      })

      const sessions = Array.isArray(result) ? result : (result?.sessions || [])
      return sessions.map((s: any) => {
        const safeStr = (v: any, fallback = ''): string => {
          if (v == null) return fallback
          if (typeof v === 'string') return v
          if (typeof v === 'object') return JSON.stringify(v)
          return String(v)
        }
        return {
          id: safeStr(s.key || s.id, `session-${Math.random()}`),
          key: safeStr(s.key || s.id),
          title: safeStr(s.title || s.label || s.key || s.id, 'New Chat'),
          agentId: s.agentId ? String(s.agentId) : undefined,
          createdAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
          updatedAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
          lastMessage: (() => {
            const raw = s.lastMessagePreview || s.lastMessage
            if (!raw) return undefined
            if (typeof raw === 'string') return raw
            if (typeof raw === 'object' && raw.content) return typeof raw.content === 'string' ? raw.content : String(raw.content)
            return String(raw)
          })(),
          spawned: s.spawned ?? s.isSpawned ?? undefined,
          parentSessionId: s.parentSessionId || s.parentKey ? String(s.parentSessionId || s.parentKey) : undefined
        }
      })
    } catch {
      return []
    }
  }

  async createSession(agentId?: string): Promise<Session> {
    const id = `session-${Date.now()}`
    return {
      id,
      key: id,
      title: 'New Chat',
      agentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.call('sessions.delete', { key: sessionId })
  }

  async updateSession(sessionId: string, updates: { label?: string }): Promise<void> {
    await this.call('sessions.patch', { key: sessionId, ...updates })
  }

  async spawnSession(agentId: string, prompt?: string): Promise<Session> {
    const result = await this.call<any>('sessions.spawn', { agentId, prompt })
    const s = result?.session || result || {}
    return {
      id: s.key || s.id || `spawned-${Date.now()}`,
      key: s.key || s.id || `spawned-${Date.now()}`,
      title: s.title || s.label || `Subagent: ${agentId}`,
      agentId: s.agentId || agentId,
      createdAt: new Date(s.createdAt || Date.now()).toISOString(),
      updatedAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
      spawned: true,
      parentSessionId: s.parentSessionId || s.parentKey || undefined
    }
  }

  async getSessionMessages(sessionId: string): Promise<Message[]> {
    try {
      const result = await this.call<any>('chat.history', { sessionKey: sessionId })

      let messages: any[]
      if (Array.isArray(result)) {
        messages = result
      } else if (result?.messages) {
        messages = result.messages
      } else if (result?.history) {
        messages = result.history
      } else if (result?.entries) {
        messages = result.entries
      } else if (result?.items) {
        messages = result.items
      } else {
        console.warn('[PRSM] chat.history returned unexpected format for session', sessionId, result)
        return []
      }

      const rawMessages = messages.map((m: any) => {
          const msg = m.message || m.data || m.entry || m
          let rawContent = msg.content ?? msg.body ?? msg.text
          let content = ''
          let thinking = msg.thinking

          if (Array.isArray(rawContent)) {
            content = rawContent
              .filter((c: any) => c.type === 'text' || (!c.type && c.text))
              .map((c: any) => c.text)
              .join('')

            const thinkingBlock = rawContent.find((c: any) => c.type === 'thinking')
            if (thinkingBlock) {
              thinking = thinkingBlock.thinking
            }

            if (!content) {
              content = rawContent
                .map((c: any) => c.text || c.content || '')
                .filter(Boolean)
                .join('')
            }
          } else if (typeof rawContent === 'object' && rawContent !== null) {
             content = rawContent.text || rawContent.content || JSON.stringify(rawContent)
          } else if (typeof rawContent === 'string') {
             content = rawContent
          } else {
             content = ''
          }

          const contentUpper = content.toUpperCase()
          const isHeartbeat =
            contentUpper.includes('HEARTBEAT_OK') ||
            contentUpper.includes('READ HEARTBEAT.MD') ||
            content.includes('# HEARTBEAT - Event-Driven Status')

          if ((!content && !thinking) || isHeartbeat) return null

          const finalContent = typeof content === 'string' ? stripAnsi(content) : String(content || '')
          const finalThinking = thinking ? stripAnsi(typeof thinking === 'string' ? thinking : JSON.stringify(thinking)) : undefined

          return {
            id: String(msg.id || m.id || m.runId || `history-${Math.random()}`),
            role: msg.role || m.role || 'assistant',
            content: finalContent,
            thinking: finalThinking,
            timestamp: new Date(msg.timestamp || m.timestamp || msg.ts || m.ts || msg.createdAt || m.createdAt || Date.now()).toISOString()
          }
        }) as (Message | null)[]

        return rawMessages.filter((m): m is Message => m !== null)
    } catch (err) {
      console.warn('[PRSM] Failed to load chat history for session', sessionId, err)
      return []
    }
  }

  // Chat
  async sendMessage(params: {
    sessionId?: string
    content: string
    agentId?: string
    thinking?: boolean
    attachments?: Array<{type: string, mimeType: string, content: string}>
  }): Promise<{ sessionKey?: string }> {
    const idempotencyKey = crypto.randomUUID()
    const payload: Record<string, unknown> = {
      message: params.content,
      deliver: false,
      idempotencyKey
    }

    if (params.sessionId) {
      payload.sessionKey = params.sessionId
    }

    if (params.thinking) {
      payload.thinking = 'medium'
    }

    if (params.attachments && params.attachments.length > 0) {
      payload.attachments = params.attachments
      console.log('[PRSM] Sending with', params.attachments.length, 'attachment(s), total base64 length:', params.attachments.reduce((s, a) => s + (a.content?.length || 0), 0))
    }

    const result = await this.call<any>('chat.send', payload)
    console.log('[PRSM] chat.send result:', JSON.stringify(result)?.slice(0, 200))
    return {
      sessionKey: result?.sessionKey || result?.session?.key || result?.key
    }
  }

  async abortChat(sessionId: string): Promise<void> {
    await this.call('chat.abort', { sessionKey: sessionId })
  }

  // Resolve avatar URL
  private resolveAvatarUrl(avatar: string | undefined, agentId: string): string | undefined {
    if (!avatar) return undefined

    if (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('data:')) {
      return avatar
    }

    if (avatar.startsWith('/avatar/')) {
      try {
        const wsUrl = new URL(this.url)
        const protocol = wsUrl.protocol === 'wss:' ? 'https:' : 'http:'
        return `${protocol}//${wsUrl.host}${avatar}`
      } catch {
        return undefined
      }
    }

    if (avatar.includes('/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(avatar)) {
      try {
        const wsUrl = new URL(this.url)
        const protocol = wsUrl.protocol === 'wss:' ? 'https:' : 'http:'
        return `${protocol}//${wsUrl.host}/avatar/${agentId}`
      } catch {
        return undefined
      }
    }

    return undefined
  }

  // Agents
  async listAgents(): Promise<Agent[]> {
    try {
      const result = await this.call<any>('agents.list')
      const agents = Array.isArray(result) ? result : (result?.agents || result?.items || result?.list || [])

      const enrichedAgents: Agent[] = []
      for (const a of agents) {
        const agentId = String(a.agentId || a.id || 'main')
        let identity = a.identity || {}

        if (!identity.name && !identity.avatar) {
          try {
            const fetchedIdentity = await this.call<any>('agent.identity.get', { agentId })
            if (fetchedIdentity) {
              identity = {
                name: fetchedIdentity.name,
                emoji: fetchedIdentity.emoji,
                avatar: fetchedIdentity.avatar,
                avatarUrl: fetchedIdentity.avatarUrl
              }
            }
          } catch {
            // Identity fetch failed
          }
        }

        const avatarUrl = this.resolveAvatarUrl(identity.avatarUrl || identity.avatar, agentId)

        let emoji = identity.emoji
        if (emoji && (emoji.includes('none') || emoji.includes('*') || emoji.length > 4)) {
          emoji = undefined
        }

        enrichedAgents.push({
          id: agentId,
          name: String(identity.name || a.name || agentId || 'Unnamed Agent'),
          description: (a.description || identity.theme) ? String(a.description || identity.theme) : undefined,
          status: a.status || 'online',
          avatar: avatarUrl,
          emoji,
          theme: identity.theme ? String(identity.theme) : undefined,
          model: (a.model || a.config?.model) ? String(a.model || a.config?.model) : undefined,
          thinkingLevel: (a.thinkingLevel || a.config?.thinkingLevel || a.thinking) ? String(a.thinkingLevel || a.config?.thinkingLevel || a.thinking) : undefined,
          timeout: a.timeout ?? a.config?.timeout ?? undefined,
          configured: a.configured ?? a.config?.configured ?? undefined
        })
      }

      return enrichedAgents
    } catch {
      return []
    }
  }

  async getAgentIdentity(agentId: string): Promise<{ name?: string; emoji?: string; avatar?: string; avatarUrl?: string } | null> {
    try {
      return await this.call<any>('agent.identity.get', { agentId })
    } catch {
      return null
    }
  }

  async getAgentFiles(agentId: string): Promise<{ workspace: string; files: Array<{ name: string; path: string; missing: boolean; size?: number }> } | null> {
    try {
      return await this.call<any>('agents.files.list', { agentId })
    } catch {
      return null
    }
  }

  async getAgentFile(agentId: string, fileName: string): Promise<{ content?: string; missing: boolean } | null> {
    try {
      const result = await this.call<any>('agents.files.get', { agentId, name: fileName })
      return result?.file || null
    } catch {
      return null
    }
  }

  async setAgentFile(agentId: string, fileName: string, content: string): Promise<boolean> {
    try {
      await this.call<any>('agents.files.set', { agentId, name: fileName, content })
      return true
    } catch {
      return false
    }
  }

  // Skills
  async listSkills(): Promise<Skill[]> {
    try {
      const result = await this.call<any>('skills.status')
      const skills = Array.isArray(result) ? result : (result?.skills || result?.items || result?.list || [])
      return skills.map((s: any) => ({
        id: String(s.skillKey || s.id || s.name || `skill-${Math.random()}`),
        name: String(s.name || 'Unnamed Skill'),
        description: String(s.description || ''),
        triggers: Array.isArray(s.triggers) ? s.triggers.map(String) : [],
        enabled: !s.disabled,
        emoji: s.emoji ? String(s.emoji) : undefined,
        homepage: s.homepage ? String(s.homepage) : undefined,
        source: s.source ? String(s.source) : undefined,
        bundled: s.bundled,
        filePath: s.filePath ? String(s.filePath) : undefined,
        eligible: s.eligible,
        always: s.always,
        requirements: s.requirements,
        missing: s.missing,
        install: s.install
      }))
    } catch {
      return []
    }
  }

  async toggleSkill(skillKey: string, enabled: boolean): Promise<void> {
    await this.call('skills.update', { skillKey, enabled })
  }

  async installSkill(skillName: string, installId: string): Promise<void> {
    await this.call('skills.install', { name: skillName, installId, timeoutMs: 60000 })
  }

  // Cron Jobs
  async listCronJobs(): Promise<CronJob[]> {
    try {
      const result = await this.call<any>('cron.list')
      const jobs = Array.isArray(result) ? result : (result?.cronJobs || result?.jobs || result?.cron || result?.items || result?.list || [])
      return jobs.map((c: any) => {
        let schedule = c.schedule
        if (typeof schedule === 'object' && schedule !== null) {
          schedule = schedule.expr || schedule.display || JSON.stringify(schedule)
        }

        let nextRun = c.nextRun
        if (typeof nextRun === 'object' && nextRun !== null) {
          nextRun = nextRun.display || nextRun.time || JSON.stringify(nextRun)
        }

        return {
          id: String(c.id || c.name || `cron-${Math.random()}`),
          name: String(c.name || 'Unnamed Job'),
          schedule: String(schedule || 'N/A'),
          status: c.status || 'active',
          description: c.description ? String(c.description) : undefined,
          nextRun: nextRun ? String(nextRun) : undefined
        }
      })
    } catch {
      return []
    }
  }

  async toggleCronJob(cronId: string, enabled: boolean): Promise<void> {
    await this.call('cron.update', { id: cronId, status: enabled ? 'active' : 'paused' })
  }

  async getCronJobDetails(cronId: string): Promise<CronJob | null> {
    try {
      const result = await this.call<any>('cron.get', { id: cronId })
      if (!result) return null

      let schedule = result.schedule
      if (typeof schedule === 'object' && schedule !== null) {
        schedule = schedule.expr || schedule.display || JSON.stringify(schedule)
      }

      let nextRun = result.nextRun
      if (typeof nextRun === 'object' && nextRun !== null) {
        nextRun = nextRun.display || nextRun.time || JSON.stringify(nextRun)
      }

      return {
        id: String(result.id || result.name || cronId),
        name: String(result.name || 'Unnamed Job'),
        schedule: String(schedule || 'N/A'),
        status: result.status || 'active',
        description: result.description ? String(result.description) : undefined,
        nextRun: nextRun ? String(nextRun) : undefined,
        content: (result.content || result.markdown || result.readme) ? String(result.content || result.markdown || result.readme) : ''
      }
    } catch {
      return null
    }
  }
}
