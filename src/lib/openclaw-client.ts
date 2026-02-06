// OpenClaw Client - Custom Frame-based Protocol (v3)

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  thinking?: string
}

export interface Session {
  id: string
  key: string
  title: string
  agentId?: string
  createdAt: string
  updatedAt: string
  lastMessage?: string
}

export interface Agent {
  id: string
  name: string
  description?: string
  status: 'online' | 'offline' | 'busy'
  avatar?: string
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
    this.eventHandlers.get(event)?.forEach((handler) => {
      try {
        handler(...args)
      } catch (e) {
        console.error(`Error in event handler for ${event}:`, e)
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

  private handleNotification(event: string, payload: any): void {
    switch (event) {
      case 'chat':
        if (payload.state === 'delta') {
          const chunk = payload.message?.content || payload.errorMessage
          if (chunk) {
            const chunkUpper = chunk.toUpperCase()
            const isHeartbeat = chunkUpper.includes('HEARTBEAT_OK') || chunkUpper.includes('HEARTBEAT.MD')
            if (!isHeartbeat) {
              this.emit('streamChunk', chunk)
            }
          }
        } else if (payload.state === 'final') {
          if (payload.message) {
            const content = payload.message.content
            if (content) {
              const contentUpper = content.toUpperCase()
              const isHeartbeat = contentUpper.includes('HEARTBEAT_OK') || contentUpper.includes('HEARTBEAT.MD')
              if (!isHeartbeat) {
                this.emit('message', {
                  id: payload.message.id,
                  role: payload.message.role,
                  content: payload.message.content,
                  timestamp: new Date().toISOString()
                })
              }
            }
          }
          this.emit('streamEnd')
        }
        break
      case 'presence':
        this.emit('agentStatus', payload)
        break
      case 'agent':
        if (payload.stream === 'assistant') {
          // payload.data is { text: string, delta: string }
          const content = payload.data?.delta
          
          if (typeof content === 'string') {
            const contentUpper = content.toUpperCase()
            const isHeartbeat = contentUpper.includes('HEARTBEAT_OK') || contentUpper.includes('HEARTBEAT.MD')
            if (!isHeartbeat) {
              this.emit('streamChunk', content)
            }
          }
        } else if (payload.stream === 'lifecycle') {
           if (payload.data?.state === 'complete') {
             this.emit('streamEnd')
           }
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
      return sessions.map((s: any) => ({
        id: s.key || s.id || `session-${Math.random()}`,
        key: s.key || s.id,
        title: s.title || s.label || s.key || s.id || 'New Chat',
        agentId: s.agentId,
        createdAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
        updatedAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
        lastMessage: s.lastMessagePreview || s.lastMessage
      }))
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

  async getSessionMessages(sessionId: string): Promise<Message[]> {
    try {
      const result = await this.call<any>('chat.history', { sessionKey: sessionId })
      const messages = Array.isArray(result) ? result : (result?.messages || [])
      const rawMessages = messages.map((m: any) => {
          // Handle nested message structure (common in chat.history)
          const msg = m.message || m
          let rawContent = msg.content
          let content = ''
          let thinking = msg.thinking // Fallback if already parsed

          if (Array.isArray(rawContent)) {
            // Content is an array of blocks: [{ type: 'text', text: '...' }, { type: 'thinking', thinking: '...' }]
            content = rawContent
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('')
            
            // Extract thinking if present
            const thinkingBlock = rawContent.find((c: any) => c.type === 'thinking')
            if (thinkingBlock) {
              thinking = thinkingBlock.thinking
            }
          } else if (typeof rawContent === 'object' && rawContent !== null) {
             content = rawContent.text || rawContent.content || JSON.stringify(rawContent)
          } else {
             content = String(rawContent || '')
          }

          // Aggressive heartbeat filtering
          const contentUpper = content.toUpperCase()
          const isHeartbeat = 
            contentUpper.includes('HEARTBEAT_OK') || 
            contentUpper.includes('READ HEARTBEAT.MD') ||
            content.includes('# HEARTBEAT - Event-Driven Status')

          // Filter out items without content (e.g. status updates) or heartbeats
          if ((!content && !thinking) || isHeartbeat) return null

          return {
            id: msg.id || m.runId || `history-${Math.random()}`,
            role: msg.role || 'assistant',
            content,
            thinking,
            timestamp: new Date(msg.timestamp || m.timestamp || msg.ts || m.ts || Date.now()).toISOString()
          }
        }) as (Message | null)[]
        
        return rawMessages.filter((m): m is Message => m !== null)
    } catch {
      return []
    }
  }

  // Chat
  async sendMessage(params: {
    sessionId?: string
    content: string
    agentId?: string
    thinking?: boolean
  }): Promise<void> {
    const idempotencyKey = crypto.randomUUID()
    const payload = {
      sessionKey: params.sessionId || 'agent:main:main',
      message: params.content,
      thinking: params.thinking ? 'normal' : undefined,
      idempotencyKey
    }
    await this.call('chat.send', payload)
  }

  // Agents
  async listAgents(): Promise<Agent[]> {
    try {
      const result = await this.call<any>('agents.list')
      const agents = Array.isArray(result) ? result : (result?.agents || result?.items || result?.list || [])
      return agents.map((a: any) => ({
        id: String(a.agentId || a.id || `agent-${Math.random()}`),
        name: String(a.name || a.agentId || a.id || 'Unnamed Agent'),
        description: a.description ? String(a.description) : undefined,
        status: a.status || 'online'
      }))
    } catch {
      return []
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
        emoji: s.emoji,
        homepage: s.homepage,
        source: s.source,
        bundled: s.bundled,
        filePath: s.filePath,
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
          id: c.id || c.name || `cron-${Math.random()}`,
          name: c.name || 'Unnamed Job',
          schedule: String(schedule || 'N/A'),
          status: c.status || 'active',
          description: c.description,
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
        id: result.id || result.name || cronId,
        name: result.name || 'Unnamed Job',
        schedule: String(schedule || 'N/A'),
        status: result.status || 'active',
        description: result.description,
        nextRun: nextRun ? String(nextRun) : undefined,
        content: result.content || result.markdown || result.readme || ''
      }
    } catch {
      return null
    }
  }
}
