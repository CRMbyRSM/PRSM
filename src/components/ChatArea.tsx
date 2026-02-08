import { useRef, useEffect, Fragment } from 'react'
import { useStore } from '../store'
import { Message } from '../lib/openclaw-client'
import { format, isSameDay } from 'date-fns'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import logoUrl from '../../build/icon.png'

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

export function ChatArea() {
  const { messages, isStreaming, agents, currentAgentId } = useStore()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const currentAgent = agents.find((a) => a.id === currentAgentId)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="chat-area">
        <div className="chat-empty">
          <div className="empty-logo">
            <img src={logoUrl} alt="ClawControlRSM logo" />
          </div>
          <h2>Start a Conversation</h2>
          <p>Send a message to begin chatting with {currentAgent?.name || 'the AI assistant'}</p>
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

  // Track channel changes for dividers
  let lastChannel = ''

  return (
    <div className="chat-area">
      <div className="chat-container">
        {messages.map((message, index) => {
          const isNewDay = index === 0 || !isSameDay(new Date(message.timestamp), new Date(messages[index - 1].timestamp))
          const currentChannel = detectChannel(message)
          const showChannelDivider = currentChannel !== lastChannel && lastChannel !== ''
          lastChannel = currentChannel
          
          return (
            <Fragment key={message.id}>
              {isNewDay && <DateSeparator date={new Date(message.timestamp)} />}
              {showChannelDivider && <ChannelDivider channel={currentChannel} />}
              <MessageBubble
                message={message}
                agentName={currentAgent?.name}
                channel={currentChannel}
              />
            </Fragment>
          )
        })}

        {isStreaming && (
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
      <span>{dateText}</span>
    </div>
  )
}

function ChannelDivider({ channel }: { channel: string }) {
  const info = channelLabels[channel] || channelLabels.direct
  return (
    <div className={`channel-divider channel-${channel}`}>
      <div className="channel-divider-line" />
      <span className="channel-divider-label">
        <span className="channel-divider-icon">{info.icon}</span>
        {info.label}
      </span>
      <div className="channel-divider-line" />
    </div>
  )
}

function MessageBubble({
  message,
  agentName,
  channel
}: {
  message: Message
  agentName?: string
  channel?: string
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
              <span className="message-time">{time}</span>
              {showBadge && info && <span className={`channel-badge channel-badge-${channel}`}>{info.icon} {info.label}</span>}
              <span className="message-author">You</span>
            </>
          ) : (
            <>
              <span className="message-author">{agentName || 'Assistant'}</span>
              {showBadge && info && <span className={`channel-badge channel-badge-${channel}`}>{info.icon} {info.label}</span>}
              <span className="message-time">{time}</span>
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
                      src={`data:${att.mimeType};base64,${att.content}`}
                      alt={`Attachment ${i + 1}`}
                      className="attachment-image"
                    />
                  ) : (
                    <div className="attachment-file">
                      <span className="attachment-icon">📎</span>
                      <span className="attachment-name">{att.mimeType}</span>
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
              <div className="thinking-content">{message.thinking}</div>
            </div>
          )}
          <MessageContent content={message.content} />
        </div>
      </div>

      {isUser && (
        <div className="message-avatar user-avatar">
          <span>You</span>
        </div>
      )}
    </div>
  )
}

function MessageContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        code(props) {
          const { children, className, node: _node, ...rest } = props
          const match = /language-(\w+)/.exec(className || '')
          return match ? (
            <pre>
              <div className="code-language">{match[1]}</div>
              <code className={className} {...rest}>
                {children}
              </code>
            </pre>
          ) : (
            <code className={className} {...rest}>
              {children}
            </code>
          )
        },
        a(props) {
          const { href, children, ...rest } = props
          return (
            <a
              {...rest}
              href={href}
              onClick={(e) => {
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
        img(props) {
          return (
            <img
              {...props}
              className="message-image"
              loading="lazy"
              alt={props.alt || 'Image'}
              onClick={() => {
                if (props.src) {
                  if (window.electronAPI?.openExternal) {
                    window.electronAPI.openExternal(props.src)
                  } else {
                    window.open(props.src, '_blank')
                  }
                }
              }}
            />
          )
        }
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
