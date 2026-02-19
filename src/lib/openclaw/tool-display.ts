/**
 * tool-display.ts — Human-readable tool call display metadata.
 *
 * Ported from upstream ClawControl (jakeledwards/ClawControl).
 * Pure utility module with no client/framework dependencies.
 */

// ── Icon types ──────────────────────────────────────────────────────
export type ToolIconType =
  | 'terminal'
  | 'file-text'
  | 'file-edit'
  | 'file-plus'
  | 'search'
  | 'globe'
  | 'download'
  | 'message-circle'
  | 'image'
  | 'speaker'
  | 'monitor'
  | 'camera'
  | 'map-pin'
  | 'cpu'
  | 'database'
  | 'git-branch'
  | 'send'
  | 'code'
  | 'layout'
  | 'smartphone'
  | 'tool'

// ── Tool map entry ──────────────────────────────────────────────────
export interface ToolDisplayInfo {
  /** Human-readable title */
  title: string
  /** Icon type to render */
  icon: ToolIconType
}

/**
 * Map of known tool names → display info.
 * Keys are lowercase for case-insensitive lookup.
 */
const TOOL_MAP: Record<string, ToolDisplayInfo> = {
  // Shell / exec
  exec:           { title: 'Running command',      icon: 'terminal' },
  shell:          { title: 'Running command',      icon: 'terminal' },
  run:            { title: 'Running command',      icon: 'terminal' },

  // File operations
  read:           { title: 'Reading file',         icon: 'file-text' },
  read_file:      { title: 'Reading file',         icon: 'file-text' },
  edit:           { title: 'Editing file',         icon: 'file-edit' },
  edit_file:      { title: 'Editing file',         icon: 'file-edit' },
  write:          { title: 'Writing file',         icon: 'file-plus' },
  write_file:     { title: 'Writing file',         icon: 'file-plus' },

  // Search / web
  web_search:     { title: 'Searching the web',    icon: 'search' },
  search:         { title: 'Searching',            icon: 'search' },
  web_fetch:      { title: 'Fetching URL',         icon: 'globe' },
  fetch:          { title: 'Fetching URL',         icon: 'globe' },

  // Browser
  browser:        { title: 'Browser action',       icon: 'monitor' },

  // Canvas
  canvas:         { title: 'Canvas',               icon: 'layout' },

  // Messaging
  message:        { title: 'Sending message',      icon: 'send' },
  send:           { title: 'Sending message',      icon: 'send' },

  // Image / media
  image:          { title: 'Analyzing image',      icon: 'image' },
  tts:            { title: 'Text to speech',       icon: 'speaker' },

  // Nodes / devices
  nodes:          { title: 'Node action',          icon: 'smartphone' },

  // Process management
  process:        { title: 'Managing process',     icon: 'cpu' },

  // Generic / fallback patterns
  git:            { title: 'Git operation',        icon: 'git-branch' },
  database:       { title: 'Database query',       icon: 'database' },
  code:           { title: 'Code operation',       icon: 'code' },
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Resolve a tool name to its display info (title + icon).
 * Falls back to a capitalised tool name with a generic icon.
 */
export function resolveToolDisplay(name: string): ToolDisplayInfo {
  const key = (name || '').toLowerCase().replace(/[^a-z0-9_]/g, '')

  // Direct match
  if (TOOL_MAP[key]) return TOOL_MAP[key]

  // Prefix match — e.g. "exec_command" matches "exec"
  for (const [mapKey, info] of Object.entries(TOOL_MAP)) {
    if (key.startsWith(mapKey)) return info
  }

  // Fallback: humanize the tool name
  const humanName = name
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()

  return {
    title: humanName || 'Tool call',
    icon: 'tool',
  }
}

/**
 * Extract a short detail string from tool call args for display
 * beneath the tool card title.
 */
export function extractToolDetail(name: string, args?: Record<string, unknown>): string {
  if (!args || typeof args !== 'object') return ''

  const key = (name || '').toLowerCase().replace(/[^a-z0-9_]/g, '')

  // exec / shell / run — show the command
  if (key === 'exec' || key === 'shell' || key === 'run') {
    const cmd = args.command || args.cmd || args.script
    if (typeof cmd === 'string') return truncate(cmd, 120)
  }

  // File operations — show the path
  if (key === 'read' || key === 'read_file' || key === 'write' || key === 'write_file' ||
      key === 'edit' || key === 'edit_file') {
    const p = args.file_path || args.path || args.filePath || args.filename
    if (typeof p === 'string') return p
  }

  // Web search — show query
  if (key === 'web_search' || key === 'search') {
    const q = args.query || args.q || args.search
    if (typeof q === 'string') return truncate(q, 100)
  }

  // Web fetch — show URL
  if (key === 'web_fetch' || key === 'fetch') {
    const u = args.url || args.uri
    if (typeof u === 'string') return truncate(u, 100)
  }

  // Browser — show action
  if (key === 'browser') {
    const action = args.action
    if (typeof action === 'string') {
      const url = args.url || args.targetUrl
      return typeof url === 'string' ? `${action} — ${truncate(url, 80)}` : action
    }
  }

  // Message — show target
  if (key === 'message' || key === 'send') {
    const target = args.target || args.channel || args.to
    const action = args.action
    if (typeof target === 'string') {
      return typeof action === 'string' ? `${action} → ${target}` : target
    }
  }

  // Image — show prompt preview
  if (key === 'image') {
    const prompt = args.prompt
    if (typeof prompt === 'string') return truncate(prompt, 100)
  }

  // TTS — show text preview
  if (key === 'tts') {
    const text = args.text
    if (typeof text === 'string') return truncate(text, 100)
  }

  // Nodes — show action + node
  if (key === 'nodes') {
    const action = args.action
    const node = args.node
    if (typeof action === 'string') {
      return typeof node === 'string' ? `${action} — ${node}` : String(action)
    }
  }

  // Canvas — show action
  if (key === 'canvas') {
    const action = args.action
    if (typeof action === 'string') return String(action)
  }

  // Process — show action
  if (key === 'process') {
    const action = args.action
    if (typeof action === 'string') return String(action)
  }

  // Generic fallback: show first string arg value
  for (const v of Object.values(args)) {
    if (typeof v === 'string' && v.length > 0) return truncate(v, 100)
  }

  return ''
}

function truncate(s: string, max: number): string {
  // Collapse to first line
  const line = s.split('\n')[0].trim()
  if (line.length <= max) return line
  return line.slice(0, max - 1) + '…'
}
