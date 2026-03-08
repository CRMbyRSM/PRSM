// OpenClaw Client - Agent API Methods
// Agent operations are stubbed — bridge doesn't expose these endpoints yet.
// Type definitions and interfaces are preserved for future implementation.

export interface CreateAgentParams {
  name: string
  workspace: string
  model?: string
  emoji?: string
  avatar?: string
  avatarFileName?: string
}

export interface CreateAgentResult {
  ok: boolean
  agentId: string
  name: string
  workspace: string
}

export interface DeleteAgentResult {
  ok: boolean
  agentId: string
}

// Normalize agent name to a safe ID (mirrors server-side normalizeAgentId)
export function normalizeAgentId(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'main'
  if (/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(trimmed)) {
    return trimmed.toLowerCase()
  }
  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 64)
  return normalized || 'main'
}

/**
 * Build the IDENTITY.md content string for a new agent.
 */
export function buildIdentityContent(params: {
  name: string
  emoji?: string
  avatar?: string
  agentId?: string
  avatarFileName?: string
}): string {
  const lines = [`- **Name:** ${params.name.trim()}`]
  if (params.emoji) lines.push(`- **Emoji:** ${params.emoji}`)

  if (params.avatarFileName && params.agentId) {
    lines.push(`- **Avatar:** avatars/${params.agentId}/${params.avatarFileName}`)
  } else if (params.avatar && !params.avatar.startsWith('data:')) {
    lines.push(`- **Avatar:** ${params.avatar}`)
  }

  return lines.join('\n') + '\n'
}
