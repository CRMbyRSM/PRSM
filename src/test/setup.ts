import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: {
    connect: vi.fn().mockResolvedValue({ success: true, url: 'ws://localhost:18789' }),
    getConfig: vi.fn().mockResolvedValue({ defaultUrl: 'ws://localhost:18789', theme: 'dark' }),
    platform: 'darwin'
  },
  writable: true
})

// Mock WebSocket
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
    setTimeout(() => {
      if (this.onopen) {
        this.onopen(new Event('open'))
      }
    }, 0)
  }

  send(_data: string) {
    // Mock sending data
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose(new CloseEvent('close'))
    }
  }
}

global.WebSocket = MockWebSocket as unknown as typeof WebSocket
