// OpenClaw Client - Chat API Methods

import type { Message, RpcCaller } from './types'
import { stripAnsi, stripSystemNotifications, stripConversationMetadata } from './utils'

export interface HistoryToolCall {
  toolCallId: string
  name: string
  phase: 'start' | 'result'
  result?: string
  args?: Record<string, unknown>
  afterMessageId?: string
}

export interface ChatHistoryResult {
  messages: Message[]
  toolCalls: HistoryToolCall[]
}

export async function getSessionMessages(call: RpcCaller, sessionId: string): Promise<ChatHistoryResult> {
  try {
    const result = await call<any>('chat.history', { sessionKey: sessionId })

    console.log('[chat.history] Raw result type:', typeof result, 'isArray:', Array.isArray(result))
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      console.log('[chat.history] Result keys:', Object.keys(result))
    }

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
      console.log('[chat.history] No recognized message array in result')
      return { messages: [], toolCalls: [] }
    }

    console.log('[chat.history] Found', messages.length, 'raw messages')

    const toolCalls: HistoryToolCall[] = []
    let lastAssistantId: string | null = null

    const rawMessages = messages.map((m: any) => {
        // The server already unwraps transcript lines with parsed.message,
        // so each m is { role, content, timestamp, ... } directly.
        // Fall back to nested wrappers for older formats.
        const msg = m.message || m.data || m.entry || m
        const role: string = msg.role || m.role || 'assistant'
        const msgId = msg.id || m.id || m.runId || `history-${Math.random()}`
        const normalizedRole = role === 'user' ? 'user' : role === 'system' ? 'system' : 'assistant'
        let rawContent = msg.content ?? msg.body ?? msg.text
        let content = ''
        let thinking = msg.thinking

        // Track last assistant message for tool call anchoring
        if (normalizedRole === 'assistant') {
          lastAssistantId = msgId
        }

        if (Array.isArray(rawContent)) {
          // Log content block types for debugging tool call extraction
          const blockTypes = rawContent.map((c: any) => c.type || 'no-type')
          if (blockTypes.some((t: string) => t.toLowerCase().includes('tool'))) {
            const toolBlocks = rawContent.filter((c: any) => c.type && c.type.toLowerCase().includes('tool'))
            console.log(`[chat.history] Message ${msgId} (${role}) tool blocks:`, JSON.stringify(toolBlocks.map((c: any) => {
              const copy = { ...c }
              // Truncate large fields for readability
              if (typeof copy.result === 'string' && copy.result.length > 100) copy.result = copy.result.slice(0, 100) + '...'
              if (typeof copy.content === 'string' && copy.content.length > 100) copy.content = copy.content.slice(0, 100) + '...'
              return copy
            })))
          }
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

          // Extract tool_use blocks as tool call cards, anchored to this message
          for (const c of rawContent) {
            if (c.type === 'toolCall') {
              const tcId = c.id || `htc-${Math.random().toString(36).slice(2, 8)}`
              const name = c.name || 'tool'
              let args: Record<string, unknown> | undefined
              if (c.arguments && typeof c.arguments === 'object') {
                args = c.arguments as Record<string, unknown>
              } else if (typeof c.arguments === 'string') {
                try { args = JSON.parse(c.arguments) } catch { /* ignore */ }
              } else if (c.input && typeof c.input === 'object') {
                args = c.input as Record<string, unknown>
              }
              // History tool calls are always completed
              toolCalls.push({
                toolCallId: tcId,
                name,
                phase: 'result',
                args,
                afterMessageId: normalizedRole === 'assistant' ? msgId : lastAssistantId || undefined,
              })
            }
          }

          // Extract tool_result blocks and merge into existing tool calls
          for (const c of rawContent) {
            if (c.type === 'toolResult') {
              const tcId = c.toolCallId || c.tool_use_id || c.id
              let resultText: string | undefined
              if (typeof c.content === 'string') {
                resultText = c.content
              } else if (Array.isArray(c.content)) {
                resultText = c.content
                  .filter((b: any) => typeof b?.text === 'string')
                  .map((b: any) => b.text)
                  .join('')
              }
              // Find matching tool call and upgrade it to result phase
              const existing = tcId ? toolCalls.find(t => t.toolCallId === tcId) : null
              if (existing) {
                existing.phase = 'result'
                existing.result = resultText ? stripAnsi(resultText) : undefined
              } else {
                // Standalone result without matching tool_use
                toolCalls.push({
                  toolCallId: tcId || `htc-${Math.random().toString(36).slice(2, 8)}`,
                  name: c.name || 'tool',
                  phase: 'result',
                  result: resultText ? stripAnsi(resultText) : undefined,
                  afterMessageId: lastAssistantId || undefined,
                })
              }
            }
          }

          // For tool_result blocks (user-role internal protocol messages),
          // extract nested text so these entries aren't silently dropped
          if (!content) {
            content = rawContent
              .map((c: any) => {
                if (typeof c.text === 'string') return c.text
                // tool_result blocks can have content as string or array
                if (c.type === 'toolResult') {
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

        // Detect heartbeat / cron trigger messages
        const contentUpper = content.toUpperCase()
        const isHeartbeat =
          contentUpper.includes('HEARTBEAT_OK') ||
          contentUpper.includes('READ HEARTBEAT.MD') ||
          content.includes('# HEARTBEAT - Event-Driven Status') ||
          contentUpper.includes('CRON: HEARTBEAT')
        if (isHeartbeat) {
          // User-role heartbeat messages are cron triggers — hide them entirely
          if (role === 'user') return null
          // Assistant/system heartbeat responses — collapse to a heart emoji
          content = '\u2764\uFE0F'
        }

        // Filter out cron-triggered user messages (scheduled reminders, updates, etc.)
        if (role === 'user') {
          const lower = content.toLowerCase()
          if (lower.includes('a scheduled reminder has been triggered') ||
              lower.includes('scheduled update')) {
            return null
          }
        }

        // Filter out NO_REPLY noise from agent
        if (content.trim() === 'NO_REPLY' || content.trim() === 'no_reply') return null

        // Skip toolResult protocol messages - these are internal agent steps,
        // not user-facing chat. Tool output is shown via tool call blocks instead.
        if (role === 'toolResult') return null

        // Strip system notification lines (exec status, etc.) from content
        content = stripSystemNotifications(content).trim()

        // Strip server-injected metadata prefix from user messages
        if (role === 'user') {
          content = stripConversationMetadata(content).trim()
        }

        // Filter out non-assistant entries without displayable text content.
        // Keep empty assistant messages so tool calls can anchor to them.
        if (!content && normalizedRole !== 'assistant') return null

        return {
          id: msgId,
          role: normalizedRole,
          content: stripAnsi(content),
          thinking: thinking ? stripAnsi(thinking) : thinking,
          timestamp: new Date(msg.timestamp || m.timestamp || msg.ts || m.ts || msg.createdAt || m.createdAt || Date.now()).toISOString()
        }
      }) as (Message | null)[]

      const filteredMessages = rawMessages.filter((m): m is Message => m !== null)

      // Merge consecutive empty assistant messages so their tool calls group
      // into a single bubble instead of creating separate empty bubbles.
      for (let i = filteredMessages.length - 1; i > 0; i--) {
        const curr = filteredMessages[i]
        const prev = filteredMessages[i - 1]
        if (
          curr.role === 'assistant' && prev.role === 'assistant' &&
          !curr.content.trim()
        ) {
          // Re-anchor tool calls from this empty message to the previous assistant
          for (const tc of toolCalls) {
            if (tc.afterMessageId === curr.id) {
              tc.afterMessageId = prev.id
            }
          }
          filteredMessages.splice(i, 1)
        }
      }

      // Anchor orphaned tool calls (no afterMessageId) to the nearest assistant
      // message so they render inside a bubble instead of trailing at the bottom.
      for (const tc of toolCalls) {
        if (!tc.afterMessageId) {
          // Find the last assistant message as fallback anchor
          const lastAssistant = filteredMessages.filter(m => m.role === 'assistant').pop()
          if (lastAssistant) tc.afterMessageId = lastAssistant.id
        }
      }

      console.log('[chat.history] Returning', filteredMessages.length, 'messages,', toolCalls.length, 'tool calls')
      if (toolCalls.length > 0) {
        console.log('[chat.history] Tool calls:', toolCalls.map(tc => `${tc.name}(${tc.phase}) after:${tc.afterMessageId}`))
      }
      // Log first few raw messages to see structure
      if (messages.length > 0 && toolCalls.length === 0) {
        const sample = messages.slice(0, 3).map((m: any) => {
          const msg = m.message || m.data || m.entry || m
          const rc = msg.content ?? msg.body ?? msg.text
          return {
            role: msg.role || m.role,
            contentType: typeof rc,
            isArray: Array.isArray(rc),
            contentPreview: Array.isArray(rc) ? rc.map((c: any) => ({ type: c.type, keys: Object.keys(c) })) : (typeof rc === 'string' ? rc.slice(0, 60) : 'other')
          }
        })
        console.log('[chat.history] Sample messages (no tool calls found):', JSON.stringify(sample, null, 2))
      }
      return { messages: filteredMessages, toolCalls }
  } catch (err) {
    console.warn('[chat.history] Failed to load messages:', err)
    return { messages: [], toolCalls: [] }
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

  payload.sessionKey = params.sessionId || (params.agentId ? `agent:${params.agentId}:main` : 'agent:main:main')

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
