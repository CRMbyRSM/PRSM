// OpenClaw Client - Session API Methods

import type { Session, RpcCaller } from './types'
import { resolveSessionKey, toIsoTimestamp } from './utils'

// Extract agentId from session key format "agent:{agentId}:{uuid}"
function extractAgentIdFromKey(key?: string): string | undefined {
  if (!key) return undefined
  const parts = key.split(':')
  if (parts[0] === 'agent' && parts.length >= 3) return parts[1]
  return undefined
}

// Subagent sessions use key format "agent:<agentId>:subagent:<uuid>"
function isSubagentKey(key?: string): boolean {
  return !!key && key.includes(':subagent:')
}

export async function listSessions(call: RpcCaller): Promise<Session[]> {
  try {
    const result = await call<any>('sessions.list', {
      includeDerivedTitles: true,
      includeLastMessage: true,
      limit: 50
    })

    const sessions = Array.isArray(result) ? result : (result?.sessions || [])
    return (Array.isArray(sessions) ? sessions : []).map((s: any) => {
      const key = s.key || s.id
      const spawned = (s.spawned ?? s.isSpawned ?? isSubagentKey(key)) || undefined
      return {
        id: key || `session-${Math.random()}`,
        key,
        title: s.title || s.label || key || 'New Chat',
        agentId: s.agentId || extractAgentIdFromKey(key),
        createdAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
        updatedAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
        lastMessage: s.lastMessagePreview || s.lastMessage,
        spawned,
        parentSessionId: s.parentSessionId || s.parentKey || s.spawnedBy || undefined
      }
    })
  } catch {
    return []
  }
}

export async function createSession(agentId?: string): Promise<Session> {
  // In v3, sessions are created lazily on first message.
  // Generate a proper session key in the server's expected format.
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

export async function deleteSession(call: RpcCaller, sessionId: string): Promise<void> {
  await call('sessions.delete', { key: sessionId })
}

export async function updateSession(call: RpcCaller, sessionId: string, updates: { label?: string }): Promise<void> {
  await call('sessions.patch', { key: sessionId, ...updates })
}

export async function spawnSession(call: RpcCaller, agentId: string, prompt?: string): Promise<Session> {
  const result = await call<any>('sessions.spawn', { agentId, prompt })
  const s = result?.session || result || {}
  const key = resolveSessionKey(s) || `spawned-${Date.now()}`
  return {
    id: key,
    key,
    title: s.title || s.label || key,
    agentId: s.agentId || agentId,
    createdAt: toIsoTimestamp(s.createdAt ?? Date.now()),
    updatedAt: toIsoTimestamp(s.updatedAt ?? s.createdAt ?? Date.now()),
    spawned: true,
    parentSessionId: s.parentSessionId || s.parentKey || undefined
  }
}
