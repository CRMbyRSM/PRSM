import { useRef, useEffect, Fragment, memo, useMemo, useCallback, Component, ErrorInfo, ReactNode } from 'react'
import { useStore } from '../store'
import { Message } from '../lib/openclaw-client'
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
      `[ClawControlRSM] Message render crash — id=${this.props.messageId}`,
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
  direct: { label: 'ClawControlRSM', icon: '🖥️' },
}

// Shared markdown plugins — created once, not per render
const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeSanitize]

export function ChatArea() {
  const { messages, isStreaming, agents, currentAgentId } = useStore()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const isAutoScrollRef = useRef(true)
  const chatAreaRef = useRef<HTMLDivElement>(null)
  const currentAgent = agents.find((a) => a.id === currentAgentId)

  // Only auto-scroll if user is near the bottom
  const handleScroll = useCallback(() => {
    const el = chatAreaRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    isAutoScrollRef.current = nearBottom
  }, [])

  useEffect(() => {
    if (isAutoScrollRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'auto' })
    }
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="chat-area">
        <div className="chat-empty">
          <div className="empty-logo">
            <img src={logoUrl} alt="ClawControlRSM logo" />
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

  // Pre-compute channel info for dividers
  const messagesWithMeta = useMemo(() => {
    let lastChannel = ''
    return messages.map((message, index) => {
      const isNewDay = index === 0 || !isSameDay(new Date(message.timestamp), new Date(messages[index - 1].timestamp))
      const currentChannel = detectChannel(message)
      const showChannelDivider = currentChannel !== lastChannel && lastChannel !== ''
      lastChannel = currentChannel
      return { message, isNewDay, showChannelDivider, channel: currentChannel }
    })
  }, [messages])

  return (
    <div className="chat-area" ref={chatAreaRef} onScroll={handleScroll}>
      <div className="chat-container">
        {messagesWithMeta.map(({ message, isNewDay, showChannelDivider, channel }, index) => {
          const isLastMessage = index === messagesWithMeta.length - 1
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
                />
              </MessageErrorBoundary>
            </Fragment>
          )
        })}

        {isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
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
const markdownComponents = {
  code(props: any) {
    const { children, className } = props
    const match = /language-(\w+)/.exec(className || '')
    return match ? (
      <pre>
        <div className="code-language">{match[1]}</div>
        <code className={className}>
          {children}
        </code>
      </pre>
    ) : (
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
      '[ClawControlRSM] ReactMarkdown render crash',
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
  isStreaming
}: {
  message: Message
  agentName?: string
  channel?: string
  isStreaming?: boolean
}) {
  const isUser = message.role === 'user'
  const time = format(new Date(message.timestamp), 'h:mm a')
  const showBadge = channel && channel !== 'direct'
  const info = channel ? (channelLabels[channel] || channelLabels.direct) : null

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
          {message.thinking && (
            <div className="thinking-block">
              <div className="thinking-header">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                <span>Thinking...</span>
              </div>
              <div className="thinking-content">{safe(message.thinking)}</div>
            </div>
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
    prev.channel === next.channel
  )
})
