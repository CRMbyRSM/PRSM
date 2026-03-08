// OpenClaw Client - Session API Methods
// Session operations are now handled directly by the OpenClawClient via bridge HTTP calls.
// This file is kept for the createSession utility.

import type { Session } from './types'

export async function createSession(agentId?: string): Promise<Session> {
  // In v3, sessions are created lazily on first message.
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
