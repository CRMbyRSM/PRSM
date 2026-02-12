// OpenClaw Client - Chat API Methods

import type { Message, RpcCaller } from './types'
import { stripAnsi } from './utils'

export async function getSessionMessages(call: RpcCaller, sessionId: string): Promise<Message[]> {
  try {
    const result = await call<any>('chat.history', { sessionKey: sessionId })

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
      console.warn('[ClawControl] chat.history returned unexpected format for session', sessionId, result)
      return []
    }

    const rawMessages = messages.map((m: any) => {
        // The server already unwraps transcript lines with parsed.message,
        // so each m is { role, content, timestamp, ... } directly.
        // Fall back to nested wrappers for older formats.
        const msg = m.message || m.data || m.entry || m
        const role: string = msg.role || m.role || 'assistant'
        let rawContent = msg.content ?? msg.body ?? msg.text
        let content = ''
        let thinking = msg.thinking

        if (Array.isArray(rawContent)) {
          // Content blocks: [{ type: 'text', text: '...' }, { type: 'tool_use', ... }, ...]
          // Extract text from text/input_text blocks
          content = rawContent
            .filter((c: any) => c.type === 'text' || c.type === 'input_text' || c.type === 'output_text' || (!c.type && c.text))
            .map((c: any) => c.text)
            .filter(Boolean)
            .join('')

          // Extract thinking if present
          const thinkingBlock = rawContent.find((c: any) => c.type === 'thinking')
          if (thinkingBlock) {
            thinking = thinkingBlock.thinking
          }

          // For tool_result blocks (user-role internal protocol messages),
          // extract nested text so these entries aren't silently dropped
          if (!content) {
            content = rawContent
              .map((c: any) => {
                if (typeof c.text === 'string') return c.text
                // tool_result blocks can have content as string or array
                if (c.type === 'tool_result') {
                  if (typeof c.content === 'string') return c.content
                  if (Array.isArray(c.content)) {
                    return c.content
                      .filter((b: any) => typeof b?.text === 'string')
                      .map((b: any) => b.text)
                      .join('')
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
        } else {
           content = ''
        }

        // Replace heartbeat messages with a heart emoji
        if (role === 'assistant' || role === 'system') {
          const contentUpper = content.toUpperCase()
          const isHeartbeat =
            contentUpper.includes('HEARTBEAT_OK') ||
            contentUpper.includes('READ HEARTBEAT.MD') ||
            content.includes('# HEARTBEAT - Event-Driven Status')
          if (isHeartbeat) content = '\u2764\uFE0F'
        }

        // Skip toolResult protocol messages - these are internal agent steps,
        // not user-facing chat. Tool output is shown via tool call blocks instead.
        if (role === 'toolResult') return null

        // Filter out entries without displayable text content.
        // Assistant messages with only thinking (no text) are intermediate
        // tool-calling steps that clutter the chat view.
        if (!content) return null

        return {
          id: msg.id || m.id || m.runId || `history-${Math.random()}`,
          role: role === 'user' ? 'user' : role === 'system' ? 'system' : 'assistant',
          content: stripAnsi(content),
          thinking: thinking ? stripAnsi(thinking) : thinking,
          timestamp: new Date(msg.timestamp || m.timestamp || msg.ts || m.ts || msg.createdAt || m.createdAt || Date.now()).toISOString()
        }
      }) as (Message | null)[]

      return rawMessages.filter((m): m is Message => m !== null)
  } catch (err) {
    console.warn('[ClawControl] Failed to load chat history for session', sessionId, err)
    return []
  }
}

export async function sendMessage(call: RpcCaller, params: {
  sessionId?: string
  content: string
  agentId?: string
  thinking?: boolean
}): Promise<{ sessionKey?: string }> {
  const idempotencyKey = crypto.randomUUID()
  const payload: Record<string, unknown> = {
    message: params.content,
    idempotencyKey
  }

  payload.sessionKey = params.sessionId || 'agent:main:main'

  if (params.thinking) {
    payload.thinking = 'normal'
  }

  const result = await call<any>('chat.send', payload)
  return {
    sessionKey: result?.sessionKey || result?.session?.key || result?.key
  }
}

export async function abortChat(call: RpcCaller, sessionId: string): Promise<void> {
  await call<any>('chat.abort', { sessionKey: sessionId })
}
