/**
 * Safe render utility — prevents React error #310 ("Objects are not valid as a React child")
 * by ensuring any value rendered in JSX is a primitive (string/number/boolean/null/undefined).
 *
 * Usage: {safe(anyValue)} instead of {anyValue} in JSX
 */
export function safe(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return '[object]'
  }
}

/**
 * Deep sanitize an object — recursively convert all "renderable" fields to strings.
 * Fields known to be rendered in JSX are force-converted.
 * Returns a new object (does not mutate the original).
 */
const RENDERABLE_FIELDS = new Set([
  'content', 'thinking', 'title', 'name', 'description', 'status',
  'lastMessage', 'schedule', 'nextRun', 'emoji', 'theme', 'model',
  'thinkingLevel', 'filePath', 'homepage', 'source', 'label',
  'displayName', 'text', 'role', 'id', 'key', 'mimeType'
])

/**
 * Extract readable text from a content value that may be a string, an array
 * of content blocks (OpenClaw gateway format), or a nested object.
 */
function flattenToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  // Array of content blocks: [{type:"text", text:"..."}, {type:"toolCall",...}, ...]
  if (Array.isArray(value)) {
    const textParts = value
      .filter((block: any) => block && (block.type === 'text' || (!block.type && block.text)))
      .map((block: any) => typeof block.text === 'string' ? block.text : String(block.text ?? ''))
    if (textParts.length > 0) return textParts.join('')
    // Fallback: stringify the whole array
    try { return JSON.stringify(value) } catch { return '[array]' }
  }

  // Plain object with a text/content property
  if (typeof value === 'object') {
    const obj = value as any
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.content === 'string') return obj.content
    try { return JSON.stringify(value) } catch { return '[object]' }
  }

  return String(value)
}

export function deepSanitize<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') return obj
  if (Array.isArray(obj)) return obj.map(deepSanitize) as unknown as T
  if (typeof obj === 'object') {
    const result: any = {}
    for (const [k, v] of Object.entries(obj as any)) {
      if (v !== null && v !== undefined && typeof v === 'object' && RENDERABLE_FIELDS.has(k)) {
        // Object OR array in a renderable field — flatten to string
        result[k] = flattenToString(v)
      } else {
        result[k] = deepSanitize(v)
      }
    }
    return result as T
  }
  return String(obj) as unknown as T
}
