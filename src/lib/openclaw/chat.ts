// OpenClaw Client - Chat API Types
// Chat operations are now handled directly by the OpenClawClient via bridge HTTP calls.
// This file is kept for type definitions used by the client.

import type { Message } from './types'

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

export interface ChatAttachmentInput {
  type?: string
  mimeType?: string
  fileName?: string
  content: string
}
