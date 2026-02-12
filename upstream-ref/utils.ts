// OpenClaw Client - Utility Functions

// Strip ANSI escape sequences (colors, cursor movement, mode switches, OSC, etc.)
// so terminal output from tool calls and streaming text renders cleanly in the UI.
// Uses inline regexes to avoid lastIndex state issues with reused global RegExp objects.
export function stripAnsi(text: string): string {
  return text
    // Standard CSI sequences: ESC[ ... final_byte
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    // OSC sequences: ESC] ... BEL  or  ESC] ... ST(ESC\)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    // ESC + single character sequences (charset selection, etc.)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[()#][A-Z0-9]/g, '')
    // Remaining ESC + one character (e.g. ESC>, ESC=, ESCM, etc.)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[A-Z=><!*+\-\/]/gi, '')
    // C1 control codes (0x80-0x9F range, e.g. \x9b as CSI)
    // eslint-disable-next-line no-control-regex
    .replace(/\x9b[0-9;?]*[A-Za-z]/g, '')
    // Bell character
    // eslint-disable-next-line no-control-regex
    .replace(/\x07/g, '')
}

// Extract displayable text from a tool result payload.
// The server sends result as { content: [{ type: "text", text: "..." }, ...] }
// or as a plain string (rare). Returns undefined if no text can be extracted.
export function extractToolResultText(result: unknown): string | undefined {
  if (typeof result === 'string') return result
  if (!result || typeof result !== 'object') return undefined

  const record = result as Record<string, unknown>
  const content = Array.isArray(record.content) ? record.content : null
  if (!content) {
    // Maybe the result is { text: "..." } or { output: "..." }
    if (typeof record.text === 'string') return record.text
    if (typeof record.output === 'string') return record.output
    return undefined
  }

  const texts = content
    .filter((c: any) => c && typeof c === 'object' && typeof c.text === 'string')
    .map((c: any) => c.text as string)
  return texts.length > 0 ? texts.join('\n') : undefined
}

export function extractTextFromContent(content: unknown): string {
  let text = ''
  if (typeof content === 'string') {
    text = content
  } else if (Array.isArray(content)) {
    text = content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('')
  } else if (content && typeof content === 'object' && 'text' in content) {
    text = String((content as any).text)
  }
  return stripAnsi(text)
}

export function isHeartbeatContent(text: string): boolean {
  const upper = text.toUpperCase()
  return upper.includes('HEARTBEAT_OK') || upper.includes('HEARTBEAT.MD')
}

export function resolveSessionKey(raw: any): string | null {
  const key =
    raw?.key ||
    raw?.sessionKey ||
    raw?.id ||
    raw?.session?.key ||
    raw?.session?.sessionKey ||
    raw?.session?.id
  return typeof key === 'string' && key.trim() ? key.trim() : null
}

export function toIsoTimestamp(ts: unknown): string {
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    const ms = ts > 1e12 ? ts : ts * 1000
    return new Date(ms).toISOString()
  }
  if (typeof ts === 'string' || ts instanceof Date) {
    const d = new Date(ts as any)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return new Date().toISOString()
}

// Resolve avatar URL - handles relative paths like /avatar/main
export function resolveAvatarUrl(avatar: string | undefined, agentId: string, wsUrl: string): string | undefined {
  if (!avatar) return undefined

  // Already a full URL or data URI
  if (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('data:')) {
    return avatar
  }

  // Server-relative path like /avatar/main - convert to full URL
  if (avatar.startsWith('/avatar/')) {
    try {
      const urlObj = new URL(wsUrl)
      const protocol = urlObj.protocol === 'wss:' ? 'https:' : 'http:'
      return `${protocol}//${urlObj.host}${avatar}`
    } catch {
      return undefined
    }
  }

  // Looks like a valid relative file path - construct avatar URL
  if (avatar.includes('/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(avatar)) {
    try {
      const urlObj = new URL(wsUrl)
      const protocol = urlObj.protocol === 'wss:' ? 'https:' : 'http:'
      return `${protocol}//${urlObj.host}/avatar/${agentId}`
    } catch {
      return undefined
    }
  }

  // Invalid avatar (like single character from parsing error)
  return undefined
}
