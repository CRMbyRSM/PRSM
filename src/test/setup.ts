import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: {
    connect: vi.fn().mockResolvedValue({ success: true, url: 'ws://localhost:18789' }),
    getConfig: vi.fn().mockResolvedValue({ defaultUrl: 'ws://localhost:18789', theme: 'dark' }),
    saveToken: vi.fn().mockResolvedValue({ saved: true }),
    getToken: vi.fn().mockResolvedValue(''),
    isEncryptionAvailable: vi.fn().mockResolvedValue(true),
    platform: 'darwin'
  },
  writable: true
})

// Mock RPC responses for the OpenClaw v3 protocol
const mockRpcResponses: Record<string, unknown> = {
  'sessions.list': {
    sessions: [
      { key: 'session-1', title: 'Test Session', updatedAt: Date.now() }
    ]
  },
  'agents.list': {
    agents: [
      { agentId: 'main', name: 'Main Agent', status: 'online', identity: { name: 'Main Agent', emoji: null, avatar: null } }
    ]
  },
  'agent.identity.get': {
    name: 'Main Agent',
    emoji: null,
    avatar: null
  },
  'skills.status': {
    skills: [
      { skillKey: 'skill-1', name: 'Test Skill', description: 'A test skill', triggers: ['test'], eligible: true }
    ]
  },
  'cron.list': {
    cronJobs: [
      { id: 'cron-1', name: 'Test Cron', schedule: '0 * * * *', status: 'active', description: 'A test cron job' }
    ]
  }
}

// Mock WebSocket that simulates the OpenClaw v3 handshake protocol
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.OPEN
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(public url: string) {
    // Simulate: server fires onopen, then sends connect.challenge event
    setTimeout(() => {
      if (this.onopen) {
        this.onopen(new Event('open'))
      }
      // Server sends challenge after connection opens
      this.simulateMessage({
        type: 'event',
        event: 'connect.challenge',
        payload: { nonce: 'test-nonce' }
      })
    }, 0)
  }

  send(data: string) {
    const parsed = JSON.parse(data)

    if (parsed.type === 'req' && parsed.method === 'connect') {
      // Respond with hello-ok to complete handshake
      setTimeout(() => {
        this.simulateMessage({
          type: 'res',
          id: parsed.id,
          ok: true,
          payload: { type: 'hello-ok', protocol: 3 }
        })
      }, 0)
      return
    }

    if (parsed.type === 'req' && mockRpcResponses[parsed.method] !== undefined) {
      // Respond with mock data for known RPC methods
      setTimeout(() => {
        this.simulateMessage({
          type: 'res',
          id: parsed.id,
          ok: true,
          payload: mockRpcResponses[parsed.method]
        })
      }, 0)
      return
    }

    // Unknown method — respond with error
    if (parsed.type === 'req') {
      setTimeout(() => {
        this.simulateMessage({
          type: 'res',
          id: parsed.id,
          ok: false,
          error: { code: 'NOT_FOUND', message: `Unknown method: ${parsed.method}` }
        })
      }, 0)
    }
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose(new CloseEvent('close'))
    }
  }

  private simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }))
    }
  }
}

global.WebSocket = MockWebSocket as unknown as typeof WebSocket
