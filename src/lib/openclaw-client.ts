// OpenClaw Client - Custom Frame-based Protocol (v3)

export function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
}

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
  // Extended metadata from skills.status
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
  private activeStreamSource: 'chat' | 'agent' | null = null
  private suppressChatFinal = false
  private assistantStreamText = ''
  private primarySessionKey: string | null = null

  constructor(url: string, token: string = '', authMode: 'token' | 'password' = 'token') {
    this.url = url
    this.token = token
    this.authMode = authMode
  }

  // Session filtering — when set, events from other sessions are dropped
  // and a 'subagentDetected' event is emitted instead
  setPrimarySessionKey(key: string | null): void {
    this.primarySessionKey = key
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
    this.eventHandlers.get(event)?.forEach((handler) => {
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
          this.activeStreamSource = null
          this.suppressChatFinal = false
          this.assistantStreamText = ''
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
    this.maxReconnectAttempts = 0 // Prevent auto-reconnect
    this.ws?.close()
    this.ws = null
    this.authenticated = false
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

  // RPC methods
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

      // Timeout after 30 seconds
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

  private extractTextFromContent(content: unknown): string {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('')
    }
    if (content && typeof content === 'object' && 'text' in content) {
      return String((content as any).text)
    }
    return ''
  }

  private isHeartbeatContent(text: string): boolean {
    const upper = text.toUpperCase()
    return upper.includes('HEARTBEAT_OK') || upper.includes('HEARTBEAT.MD')
  }

  // Some gateways send cumulative assistant deltas (full text-so-far) instead of strict increments.
  // Normalize both formats to an append-only chunk for the UI layer.
  private toAssistantIncrement(incoming: string): string {
    if (!incoming) return ''

    const previous = this.assistantStreamText
    if (!previous) {
      this.assistantStreamText = incoming
      return incoming
    }

    if (incoming === previous || previous.endsWith(incoming)) {
      return ''
    }

    if (incoming.startsWith(previous)) {
      const append = incoming.slice(previous.length)
      this.assistantStreamText = incoming
      return append
    }

    // Fallback for partial overlap between chunk boundaries.
    const maxOverlap = Math.min(previous.length, incoming.length)
    let overlap = 0
    for (let i = maxOverlap; i > 0; i--) {
      if (previous.endsWith(incoming.slice(0, i))) {
        overlap = i
        break
      }
    }

    const append = incoming.slice(overlap)
    this.assistantStreamText = previous + append
    return append
  }

  /** Check if an event's sessionKey matches the primary filter. If not, emit subagentDetected. */
  private checkSessionFilter(sessionKey?: string): boolean {
    // No primary filter set — allow everything
    if (!this.primarySessionKey) return true
    // Event has no sessionKey — allow only if we haven't set a filter yet
    if (!sessionKey) return !this.primarySessionKey
    if (sessionKey === this.primarySessionKey) return true
    // Different session — this is likely a subagent
    this.emit('subagentDetected', { sessionKey })
    return false
  }

  private handleNotification(event: string, payload: any): void {
    switch (event) {
      case 'chat':
        // Session filtering — drop events from non-primary sessions
        if (!this.checkSessionFilter(payload.sessionKey || payload.message?.sessionKey)) return

        if (payload.state === 'delta') {
          // Assistant stream is canonical. Ignore chat deltas to avoid duplicate output.
          return
        } else if (payload.state === 'final') {
          // If assistant stream was used, chat final is duplicate; ignore it.
          if (this.suppressChatFinal || this.activeStreamSource === 'agent') {
            if (this.activeStreamSource === 'agent') {
              this.activeStreamSource = null
              this.assistantStreamText = ''
              this.emit('streamEnd')
            }
            this.suppressChatFinal = false
            return
          }

          if (payload.message) {
            const text = this.extractTextFromContent(payload.message.content)
            if (text && !this.isHeartbeatContent(text)) {
              // Extract thinking safely
              let thinking: string | undefined
              const rawContent = payload.message.content
              if (Array.isArray(rawContent)) {
                const thinkingBlock = rawContent.find((c: any) => c.type === 'thinking')
                if (thinkingBlock) {
                  thinking = typeof thinkingBlock.thinking === 'string' ? thinkingBlock.thinking : JSON.stringify(thinkingBlock.thinking)
                }
              }

              this.emit('message', {
                id: String(payload.message.id || `msg-${Date.now()}`),
                role: payload.message.role,
                content: typeof text === 'string' ? text : String(text),
                thinking,
                timestamp: new Date().toISOString()
              })
            }
          }
          this.activeStreamSource = null
          this.assistantStreamText = ''
          this.emit('streamEnd')
        }
        break
      case 'presence':
        this.emit('agentStatus', payload)
        break
      case 'agent':
        // Session filtering — drop events from non-primary sessions
        if (!this.checkSessionFilter(payload.sessionKey)) return

        if (payload.stream === 'assistant') {
          if (this.activeStreamSource !== 'agent') {
            this.assistantStreamText = ''
          }
          this.activeStreamSource = 'agent'
          this.suppressChatFinal = true

          // payload.data is usually { text: string, delta: string }
          const rawChunk =
            typeof payload.data?.delta === 'string'
              ? payload.data.delta
              : (typeof payload.data?.text === 'string' ? payload.data.text : '')

          if (typeof rawChunk === 'string' && !this.isHeartbeatContent(rawChunk)) {
            const append = this.toAssistantIncrement(rawChunk)
            if (append) {
              this.emit('streamChunk', append)
            }
          }
        } else if (payload.stream === 'lifecycle') {
          const phase = payload.data?.phase
          const state = payload.data?.state
          if (phase === 'end' || phase === 'error' || state === 'complete' || state === 'error') {
            if (this.activeStreamSource === 'agent') {
              this.activeStreamSource = null
              this.assistantStreamText = ''
              this.emit('streamEnd')
            }
          }
        } else if (payload.stream === 'tool') {
          const data = payload.data || {}
          this.emit('toolCall', {
            toolCallId: data.toolCallId || data.id || `tc-${Date.now()}`,
            name: data.name || data.toolName || 'unknown',
            phase: data.phase || (data.result ? 'result' : 'start'),
            result: data.result ? (typeof data.result === 'string' ? data.result : JSON.stringify(data.result)) : undefined,
            afterMessageId: data.afterMessageId
          })
        }
        break
      default:
        this.emit(event, payload)
    }
  }

  // API Methods
  async listSessions(): Promise<Session[]> {
    try {
      const result = await this.call<any>('sessions.list', {
        includeDerivedTitles: true,
        includeLastMessage: true,
        limit: 50
      })
      
      const sessions = Array.isArray(result) ? result : (result?.sessions || [])
      return sessions.map((s: any) => {
        // Force-stringify everything to prevent React error #310
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
    // In v3, we don't have sessions.create. We just use a new key.
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

      // Handle multiple possible response formats from the server
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
          // Handle nested message structure (common in chat.history)
          const msg = m.message || m.data || m.entry || m
          let rawContent = msg.content ?? msg.body ?? msg.text
          let content = ''
          let thinking = msg.thinking // Fallback if already parsed

          if (Array.isArray(rawContent)) {
            // Content is an array of blocks: [{ type: 'text', text: '...' }, { type: 'thinking', thinking: '...' }]
            content = rawContent
              .filter((c: any) => c.type === 'text' || (!c.type && c.text))
              .map((c: any) => c.text)
              .join('')

            // Extract thinking if present
            const thinkingBlock = rawContent.find((c: any) => c.type === 'thinking')
            if (thinkingBlock) {
              thinking = thinkingBlock.thinking
            }

            // If no text blocks found, try extracting all text content
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

          // Aggressive heartbeat filtering
          const contentUpper = content.toUpperCase()
          const isHeartbeat =
            contentUpper.includes('HEARTBEAT_OK') ||
            contentUpper.includes('READ HEARTBEAT.MD') ||
            content.includes('# HEARTBEAT - Event-Driven Status')

          // Filter out items without content (e.g. status updates) or heartbeats
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
      payload.thinking = 'normal'
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

  // Resolve avatar URL - handles relative paths like /avatar/main
  private resolveAvatarUrl(avatar: string | undefined, agentId: string): string | undefined {
    if (!avatar) return undefined

    // Already a full URL or data URI
    if (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('data:')) {
      return avatar
    }

    // Server-relative path like /avatar/main - convert to full URL
    if (avatar.startsWith('/avatar/')) {
      try {
        const wsUrl = new URL(this.url)
        const protocol = wsUrl.protocol === 'wss:' ? 'https:' : 'http:'
        return `${protocol}//${wsUrl.host}${avatar}`
      } catch {
        return undefined
      }
    }

    // Looks like a valid relative file path - construct avatar URL
    if (avatar.includes('/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(avatar)) {
      try {
        const wsUrl = new URL(this.url)
        const protocol = wsUrl.protocol === 'wss:' ? 'https:' : 'http:'
        return `${protocol}//${wsUrl.host}/avatar/${agentId}`
      } catch {
        return undefined
      }
    }

    // Invalid avatar (like single character from parsing error)
    return undefined
  }

  // Agents
  async listAgents(): Promise<Agent[]> {
    try {
      const result = await this.call<any>('agents.list')
      const agents = Array.isArray(result) ? result : (result?.agents || result?.items || result?.list || [])

      // Enrich each agent with identity from agent.identity.get
      const enrichedAgents: Agent[] = []
      for (const a of agents) {
        const agentId = String(a.agentId || a.id || 'main')
        let identity = a.identity || {}

        // Fetch identity if not already included
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
            // Identity fetch failed, continue with defaults
          }
        }

        // Resolve avatar URL
        const avatarUrl = this.resolveAvatarUrl(identity.avatarUrl || identity.avatar, agentId)

        // Clean up emoji - filter out placeholder text
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

  // Get agent identity
  async getAgentIdentity(agentId: string): Promise<{ name?: string; emoji?: string; avatar?: string; avatarUrl?: string } | null> {
    try {
      return await this.call<any>('agent.identity.get', { agentId })
    } catch {
      return null
    }
  }

  // Get agent workspace files
  async getAgentFiles(agentId: string): Promise<{ workspace: string; files: Array<{ name: string; path: string; missing: boolean; size?: number }> } | null> {
    try {
      return await this.call<any>('agents.files.list', { agentId })
    } catch {
      return null
    }
  }

  // Get agent file content
  async getAgentFile(agentId: string, fileName: string): Promise<{ content?: string; missing: boolean } | null> {
    try {
      const result = await this.call<any>('agents.files.get', { agentId, name: fileName })
      return result?.file || null
    } catch {
      return null
    }
  }

  // Set agent file content
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
        // Handle complex schedule objects (e.g., { kind, expr, tz })
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
