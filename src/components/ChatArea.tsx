import { useRef, useEffect, Fragment, memo, useMemo, useCallback, Component, ErrorInfo, ReactNode, useState } from 'react'
import { useStore, ToolCall } from '../store'
import { Message, stripAnsi } from '../lib/openclaw-client'
import { SubagentBlock } from './SubagentBlock'
import { format, isSameDay } from 'date-fns'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { safe } from '../lib/safe-render'
import logoUrl from '../../build/icon.png'

/**
 * Per-message error boundary — catches React #310 and other render errors
 * for individual messages instead of crashing the whole app.
 */
class MessageErrorBoundary extends Component<
  { children: ReactNode; messageId: string; messageContent: string },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message || 'Unknown render error' }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log full details for remote debugging
    console.error(
      `[PRSM] Message render crash — id=${this.props.messageId}`,
      '\nError:', error.message,
      '\nContent type:', typeof this.props.messageContent,
      '\nContent preview:', String(this.props.messageContent).slice(0, 500),
      '\nContent full (for debugging):', this.props.messageContent,
      '\nComponent stack:', info.componentStack
    )
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="message agent" style={{ opacity: 0.7 }}>
          <div className="message-content">
            <div className="message-bubble" style={{ border: '1px solid #ef444466', background: '#1a1d24' }}>
              <p style={{ color: '#f87171', fontSize: '0.8rem', margin: '0 0 4px' }}>
                ⚠️ This message failed to render ({this.state.error})
              </p>
              <pre style={{
                fontSize: '0.75rem', color: '#8594a3', whiteSpace: 'pre-wrap',
                wordBreak: 'break-word', maxHeight: '200px', overflow: 'auto', margin: 0
              }}>
                {String(this.props.messageContent).slice(0, 2000)}
              </pre>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/** Detect the channel/source of a message from its content */
function detectChannel(message: Message): string {
  const c = message.content || ''
  if (/\[Slack\s/i.test(c) || /Slack DM from/i.test(c)) return 'slack'
  if (/\[Telegram\s/i.test(c) || /Telegram.*from/i.test(c)) return 'telegram'
  if (/\[Discord\s/i.test(c) || /Discord.*from/i.test(c)) return 'discord'
  if (/\[WhatsApp\s/i.test(c) || /WhatsApp.*from/i.test(c)) return 'whatsapp'
  if (message.role === 'system') return 'system'
  return 'direct'
}

const channelLabels: Record<string, { label: string; icon: string }> = {
  slack: { label: 'Slack', icon: '💬' },
  telegram: { label: 'Telegram', icon: '✈️' },
  discord: { label: 'Discord', icon: '🎮' },
  whatsapp: { label: 'WhatsApp', icon: '📱' },
  system: { label: 'System', icon: '⚙️' },
  direct: { label: 'PRSM', icon: '🖥️' },
}

// Shared markdown plugins — created once, not per render
const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeSanitize]

/** Collapsible thinking block — collapsed by default to reduce clutter */
function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const safeContent = safe(content)
  // Truncate preview to first ~80 chars
  const preview = safeContent.length > 80 ? safeContent.slice(0, 80) + '…' : safeContent

  return (
    <div className={`thinking-block ${expanded ? 'expanded' : 'collapsed'}`}>
      <button className="thinking-header" onClick={() => setExpanded(!expanded)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <span className="thinking-label-text">Thinking</span>
        {!expanded && <span className="thinking-preview">{preview}</span>}
        <svg className={`thinking-chevron ${expanded ? 'expanded' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && (
        <div className="thinking-content">
          <MessageContent content={safeContent} />
        </div>
      )}
    </div>
  )
}

function ToolCallBlock({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false)
  const isRunning = toolCall.phase === 'start'

  return (
    <div className={`tool-call-block ${isRunning ? 'running' : 'completed'}`}>
      <button className="tool-call-header" onClick={() => setExpanded(!expanded)}>
        {isRunning ? (
          <svg className="tool-call-icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        ) : (
          <svg className="tool-call-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
        <span className="tool-call-name">{toolCall.name}</span>
        <span className="tool-call-status">{isRunning ? 'Running...' : 'Done'}</span>
        <svg className={`tool-call-chevron ${expanded ? 'expanded' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && toolCall.result && (
        <div className="tool-call-result">
          <pre>{stripAnsi(toolCall.result)}</pre>
        </div>
      )}
    </div>
  )
}

export function ChatArea() {
  const messages = useStore((s) => s.messages)
  const isStreaming = useStore((s) => s.isStreaming)
  const hadStreamChunks = useStore((s) => s.hadStreamChunks)
  const agents = useStore((s) => s.agents)
  const currentAgentId = useStore((s) => s.currentAgentId)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const sessions = useStore((s) => s.sessions)
  const activeToolCalls = useStore((s) => s.activeToolCalls)
  const activeSubagents = useStore((s) => s.activeSubagents)
  const thinkingEnabled = useStore((s) => s.thinkingEnabled)
  const openSubagentPopout = useStore((s) => s.openSubagentPopout)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const isAutoScrollRef = useRef(true)
  const chatAreaRef = useRef<HTMLDivElement>(null)

  // Resolve agent from current session's agentId
  const currentSession = sessions.find(s => (s.key || s.id) === currentSessionId)
  const sessionAgentId = currentSession?.agentId || currentAgentId
  const currentAgent = agents.find((a) => a.id === sessionAgentId)

  // Only auto-scroll if user is near the bottom
  const handleScroll = useCallback(() => {
    const el = chatAreaRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    isAutoScrollRef.current = nearBottom
  }, [])

  // Pre-compute channel info for dividers
  // IMPORTANT: This useMemo MUST be before any early returns (Rules of Hooks)
  // The try/catch prevents errors here from corrupting React's internal hook
  // state which would cause a secondary error #310 on re-render.
  const messagesWithMeta = useMemo(() => {
    try {
      // Filter out heartbeat messages (prompt + HEARTBEAT_OK responses)
      const isHeartbeat = (m: Message) => {
        const c = (m.content || '').trim()
        if (c === 'HEARTBEAT_OK') return true
        if (m.role === 'user' && c.startsWith('Read HEARTBEAT.md')) return true
        return false
      }

      let lastChannel = ''
      return messages
        .filter((m): m is Message => m != null && typeof m === 'object')
        .filter((m) => !isHeartbeat(m))
        .map((message, index, arr) => {
          let isNewDay = index === 0
          if (!isNewDay) {
            try {
              const curr = new Date(message.timestamp || 0)
              const prev = new Date(arr[index - 1].timestamp || 0)
              isNewDay = !isSameDay(curr, prev)
            } catch {
              isNewDay = false
            }
          }
          const currentChannel = detectChannel(message)
          const showChannelDivider = currentChannel !== lastChannel && lastChannel !== ''
          lastChannel = currentChannel
          return { message, isNewDay, showChannelDivider, channel: currentChannel }
        })
    } catch (err) {
      console.error('[PRSM] useMemo crash in messagesWithMeta:', err)
      // Return a safe fallback — render messages without metadata
      return messages
        .filter((m): m is Message => m != null && typeof m === 'object')
        .map((message) => ({
          message,
          isNewDay: false,
          showChannelDivider: false,
          channel: 'direct' as string
        }))
    }
  }, [messages])

  // Build lookup maps for tool calls and subagents by afterMessageId
  const toolCallsByMessageId = useMemo(() => {
    const map = new Map<string, ToolCall[]>()
    for (const tc of activeToolCalls) {
      const key = tc.afterMessageId || '__trailing__'
      const arr = map.get(key) || []
      arr.push(tc)
      map.set(key, arr)
    }
    return map
  }, [activeToolCalls])

  const subagentsByMessageId = useMemo(() => {
    const map = new Map<string, typeof activeSubagents>()
    for (const sa of activeSubagents) {
      const key = sa.afterMessageId || '__trailing__'
      const arr = map.get(key) || []
      arr.push(sa)
      map.set(key, arr)
    }
    return map
  }, [activeSubagents])

  // Reset auto-scroll when switching sessions so we always land at the bottom
  const prevSessionRef = useRef(currentSessionId)
  useEffect(() => {
    if (currentSessionId !== prevSessionRef.current) {
      isAutoScrollRef.current = true
      prevSessionRef.current = currentSessionId
    }
  }, [currentSessionId])

  useEffect(() => {
    if (isAutoScrollRef.current) {
      // Use rAF to ensure scroll happens after React has flushed the DOM
      requestAnimationFrame(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'auto' })
      })
    }
  }, [messages])

  // Empty state — all hooks already called above
  if (messages.length === 0) {
    return (
      <div className="chat-area">
        <div className="chat-empty">
          <div className="empty-logo">
            <img src={logoUrl} alt="PRSM logo" />
          </div>
          <h2>Start a Conversation</h2>
          <p>Send a message to begin chatting with {safe(currentAgent?.name) || 'the AI assistant'}</p>
          <div className="quick-actions">
            <button className="quick-action">
              <span>Explain a concept</span>
            </button>
            <button className="quick-action">
              <span>Help me code</span>
            </button>
            <button className="quick-action">
              <span>Analyze data</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-area" ref={chatAreaRef} onScroll={handleScroll}>
      <div className="chat-container">
        {messagesWithMeta.map(({ message, isNewDay, showChannelDivider, channel }, index) => {
          const isLastMessage = index === messagesWithMeta.length - 1
          const msgToolCalls = toolCallsByMessageId.get(message.id)
          const msgSubagents = subagentsByMessageId.get(message.id)
          return (
            <Fragment key={message.id}>
              {isNewDay && <DateSeparator date={new Date(message.timestamp)} />}
              {showChannelDivider && <ChannelDivider channel={channel} />}
              <MessageErrorBoundary messageId={message.id} messageContent={message.content}>
                <MessageBubble
                  message={message}
                  agentName={currentAgent?.name}
                  channel={channel}
                  isStreaming={isLastMessage && isStreaming}
                  sessionId={currentSessionId}
                />
              </MessageErrorBoundary>
              {msgToolCalls && msgToolCalls.length > 0 && (
                <div className="tool-calls-container">
                  {msgToolCalls.map(tc => (
                    <ToolCallBlock key={tc.toolCallId} toolCall={tc} />
                  ))}
                </div>
              )}
              {msgSubagents && msgSubagents.length > 0 && (
                <div className="subagents-container">
                  {msgSubagents.map(sa => (
                    <SubagentBlock key={sa.sessionKey} subagent={sa} onOpen={openSubagentPopout} />
                  ))}
                </div>
              )}
            </Fragment>
          )
        })}

        {/* Trailing tool calls / subagents not attached to a specific message */}
        {toolCallsByMessageId.get('__trailing__') && (
          <div className="tool-calls-container">
            {toolCallsByMessageId.get('__trailing__')!.map(tc => (
              <ToolCallBlock key={tc.toolCallId} toolCall={tc} />
            ))}
          </div>
        )}
        {subagentsByMessageId.get('__trailing__') && (
          <div className="subagents-container">
            {subagentsByMessageId.get('__trailing__')!.map(sa => (
              <SubagentBlock key={sa.sessionKey} subagent={sa} onOpen={openSubagentPopout} />
            ))}
          </div>
        )}

        {isStreaming && !hadStreamChunks && (
          <div className="message agent typing-indicator-container">
            <div className="message-avatar">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2zm-4 12a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm8 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
              </svg>
            </div>
            <div className="message-content">
              <div className="typing-indicator">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>
    </div>
  )
}

function DateSeparator({ date }: { date: Date }) {
  let dateText = ''
  try {
    dateText = format(date, 'EEEE, MMMM d, yyyy')
  } catch (e) {
    return null
  }

  return (
    <div className="date-separator">
      <span>{safe(dateText)}</span>
    </div>
  )
}

function ChannelDivider({ channel }: { channel: string }) {
  const info = channelLabels[channel] || channelLabels.direct
  return (
    <div className={`channel-divider channel-${safe(channel)}`}>
      <div className="channel-divider-line" />
      <span className="channel-divider-label">
        <span className="channel-divider-icon">{safe(info.icon)}</span>
        {safe(info.label)}
      </span>
      <div className="channel-divider-line" />
    </div>
  )
}

// Memoized markdown components — created once
// IMPORTANT: react-markdown passes `node` (HAST AST object) and other non-DOM
// props to every custom component. NEVER spread {...rest} or {...props} onto
// DOM elements — only pass known, safe DOM attributes explicitly.
function CodeCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }, [code])
  return (
    <button className={`code-copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy} aria-label="Copy code">
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  )
}

const markdownComponents = {
  code(props: any) {
    const { children, className } = props
    const match = /language-(\w+)/.exec(className || '')
    if (match) {
      const codeText = String(children).replace(/\n$/, '')
      return (
        <pre>
          <div className="code-language">{match[1]}</div>
          <CodeCopyButton code={codeText} />
          <code className={className}>
            {children}
          </code>
        </pre>
      )
    }
    return (
      <code className={className}>
        {children}
      </code>
    )
  },
  a(props: any) {
    const { href, children, title, className } = props
    return (
      <a
        href={href}
        title={title}
        className={className}
        onClick={(e: React.MouseEvent) => {
          e.preventDefault()
          if (href) {
            if (window.electronAPI?.openExternal) {
              window.electronAPI.openExternal(href)
            } else {
              window.open(href, '_blank')
            }
          }
        }}
        style={{ cursor: 'pointer' }}
      >
        {children}
      </a>
    )
  },
  img(props: any) {
    const { src, alt, title, width, height } = props
    return (
      <img
        src={src}
        alt={alt || 'Image'}
        title={title}
        width={width}
        height={height}
        className="message-image"
        loading="lazy"
        onClick={() => {
          if (src) {
            if (window.electronAPI?.openExternal) {
              window.electronAPI.openExternal(src)
            } else {
              window.open(src, '_blank')
            }
          }
        }}
      />
    )
  }
}

/**
 * SafeMarkdown error boundary — catches crashes inside ReactMarkdown/remark/rehype
 * and falls back to displaying raw text content.
 */
class SafeMarkdownBoundary extends Component<
  { children: ReactNode; rawContent: string },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      '[PRSM] ReactMarkdown render crash',
      '\nError:', error.message,
      '\nContent preview:', this.props.rawContent?.slice(0, 500),
      '\nStack:', info.componentStack
    )
  }
  render() {
    if (this.state.hasError) {
      return <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{this.props.rawContent}</pre>
    }
    return this.props.children
  }
}

/** Memoized message content — only re-parses markdown when content changes */
const MessageContent = memo(function MessageContent({ content }: { content: string }) {
  // Nuclear safety: ensure content is always a string no matter what
  const safeContent = typeof content === 'string' ? content : safe(content)
  return (
    <SafeMarkdownBoundary rawContent={safeContent}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {safeContent}
      </ReactMarkdown>
    </SafeMarkdownBoundary>
  )
})

/** Memoized message bubble — skips re-render unless props actually change */
const MessageBubble = memo(function MessageBubble({
  message,
  agentName,
  channel,
  isStreaming,
  sessionId
}: {
  message: Message
  agentName?: string
  channel?: string
  isStreaming?: boolean
  sessionId?: string | null
}) {
  const isUser = message.role === 'user'
  const time = format(new Date(message.timestamp), 'h:mm a')
  const showBadge = channel && channel !== 'direct'
  const info = channel ? (channelLabels[channel] || channelLabels.direct) : null

  const pinMessage = useStore((s) => s.pinMessage)
  const unpinMessage = useStore((s) => s.unpinMessage)
  const pinnedMessages = useStore((s) => s.pinnedMessages)
  const pinned = sessionId
    ? pinnedMessages.some((p) => p.sessionId === sessionId && p.messageId === message.id)
    : false

  const handlePin = useCallback(() => {
    if (!sessionId) return
    if (pinned) {
      const pin = pinnedMessages.find((p) => p.sessionId === sessionId && p.messageId === message.id)
      if (pin) unpinMessage(pin.id)
    } else {
      pinMessage(sessionId, message)
    }
  }, [sessionId, pinned, pinnedMessages, message, pinMessage, unpinMessage])

  return (
    <div className={`message ${isUser ? 'user' : 'agent'}`}>
      {!isUser && (
        <div className="message-avatar">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2zm-4 12a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm8 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
          </svg>
        </div>
      )}

      <div className="message-content">
        <div className="message-header">
          {isUser ? (
            <>
              <span className="message-time">{safe(time)}</span>
              {showBadge && info && <span className={`channel-badge channel-badge-${safe(channel)}`}>{safe(info.icon)} {safe(info.label)}</span>}
              <span className="message-author">You</span>
            </>
          ) : (
            <>
              <span className="message-author">{safe(agentName) || 'Assistant'}</span>
              {showBadge && info && <span className={`channel-badge channel-badge-${safe(channel)}`}>{safe(info.icon)} {safe(info.label)}</span>}
              <span className="message-time">{safe(time)}</span>
            </>
          )}
        </div>
        <div className="message-bubble">
          <button
            className={`pin-btn ${pinned ? 'pinned' : ''}`}
            onClick={handlePin}
            title={pinned ? 'Unpin message' : 'Pin message'}
            aria-label={pinned ? 'Unpin message' : 'Pin message'}
          >
            <svg viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9l3-9z" />
            </svg>
          </button>
          {message.attachments && message.attachments.length > 0 && (
            <div className="message-attachments">
              {message.attachments.map((att, i) => (
                <div key={i} className="attachment-thumbnail">
                  {att.type === 'image' ? (
                    <img
                      src={`data:${safe(att.mimeType)};base64,${safe(att.content)}`}
                      alt={`Attachment ${i + 1}`}
                      className="attachment-image"
                    />
                  ) : (
                    <div className="attachment-file">
                      <span className="attachment-icon">📎</span>
                      <span className="attachment-name">{safe(att.mimeType)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {thinkingEnabled && message.thinking && (
            <ThinkingBlock content={message.thinking} />
          )}
          <MessageContent content={safe(message.content)} />
        </div>
      </div>

      {isUser && (
        <div className="message-avatar user-avatar">
          <span>You</span>
        </div>
      )}
    </div>
  )
}, (prev, next) => {
  // Custom comparison — only re-render if content actually changed
  // During streaming, only the last message changes
  if (prev.isStreaming || next.isStreaming) return false // always re-render streaming message
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.agentName === next.agentName &&
    prev.channel === next.channel &&
    prev.sessionId === next.sessionId
  )
})
