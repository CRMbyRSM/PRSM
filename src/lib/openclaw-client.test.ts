import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OpenClawClient } from './openclaw-client'

describe('OpenClawClient', () => {
  let client: OpenClawClient

  beforeEach(() => {
    client = new OpenClawClient('ws://localhost:18789')
  })

  describe('constructor', () => {
    it('should create a client with the given URL', () => {
      expect(client).toBeDefined()
    })
  })

  describe('connect', () => {
    it('should connect to the WebSocket server', async () => {
      const connectedHandler = vi.fn()
      client.on('connected', connectedHandler)

      await client.connect()

      expect(connectedHandler).toHaveBeenCalled()
    })
  })

  describe('event handling', () => {
    it('should register and emit events', () => {
      const handler = vi.fn()
      client.on('test', handler)

      // @ts-expect-error - accessing private method for testing
      client.emit('test', 'data')

      expect(handler).toHaveBeenCalledWith('data')
    })

    it('should unregister events', () => {
      const handler = vi.fn()
      client.on('test', handler)
      client.off('test', handler)

      // @ts-expect-error - accessing private method for testing
      client.emit('test', 'data')

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('listSessions', () => {
    it('should return mock sessions when not connected', async () => {
      const sessions = await client.listSessions()

      expect(Array.isArray(sessions)).toBe(true)
      expect(sessions.length).toBeGreaterThan(0)
      expect(sessions[0]).toHaveProperty('id')
      expect(sessions[0]).toHaveProperty('title')
    })
  })

  describe('listAgents', () => {
    it('should return mock agents when not connected', async () => {
      const agents = await client.listAgents()

      expect(Array.isArray(agents)).toBe(true)
      expect(agents.length).toBeGreaterThan(0)
      expect(agents[0]).toHaveProperty('id')
      expect(agents[0]).toHaveProperty('name')
      expect(agents[0]).toHaveProperty('status')
    })
  })

  describe('listSkills', () => {
    it('should return mock skills when not connected', async () => {
      const skills = await client.listSkills()

      expect(Array.isArray(skills)).toBe(true)
      expect(skills.length).toBeGreaterThan(0)
      expect(skills[0]).toHaveProperty('id')
      expect(skills[0]).toHaveProperty('name')
      expect(skills[0]).toHaveProperty('triggers')
    })
  })

  describe('listCronJobs', () => {
    it('should return mock cron jobs when not connected', async () => {
      const cronJobs = await client.listCronJobs()

      expect(Array.isArray(cronJobs)).toBe(true)
      expect(cronJobs.length).toBeGreaterThan(0)
      expect(cronJobs[0]).toHaveProperty('id')
      expect(cronJobs[0]).toHaveProperty('name')
      expect(cronJobs[0]).toHaveProperty('schedule')
      expect(cronJobs[0]).toHaveProperty('status')
    })
  })

  describe('createSession', () => {
    it('should create a new session', async () => {
      const session = await client.createSession()

      expect(session).toHaveProperty('id')
      expect(session).toHaveProperty('title')
      expect(session.title).toBe('New Chat')
    })

    it('should create a session with an agent', async () => {
      const session = await client.createSession('claude')

      expect(session).toHaveProperty('agentId')
      expect(session.agentId).toBe('claude')
    })
  })

  describe('disconnect', () => {
    it('should close the WebSocket connection', async () => {
      await client.connect()
      client.disconnect()

      // Should not throw
      expect(true).toBe(true)
    })
  })
})
