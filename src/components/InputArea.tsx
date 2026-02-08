import { useState, useRef, useEffect, useCallback, KeyboardEvent, ChangeEvent, ClipboardEvent, DragEvent } from 'react'
import { useStore } from '../store'

interface Attachment {
  id: string
  file: File
  dataUrl: string
  mimeType: string
}

export function InputArea() {
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { sendMessage, isStreaming, connected } = useStore()

  const maxLength = 4000

  useEffect(() => {
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [message])

  const compressImage = useCallback((dataUrl: string, mimeType: string): Promise<{ dataUrl: string; mimeType: string }> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const MAX_WIDTH = 1920
        const QUALITY = 0.8

        let width = img.naturalWidth
        let height = img.naturalHeight

        // Scale down if wider than MAX_WIDTH, maintaining aspect ratio
        if (width > MAX_WIDTH) {
          height = Math.round(height * (MAX_WIDTH / width))
          width = MAX_WIDTH
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)

        // Keep PNG (with transparency support) for PNGs, otherwise export as JPEG
        const isPng = mimeType === 'image/png'
        const outputMime = isPng ? 'image/png' : 'image/jpeg'
        // For PNG, quality param is ignored by toDataURL but we pass it anyway
        // For JPEG, 0.8 gives good compression
        const compressedDataUrl = canvas.toDataURL(outputMime, QUALITY)

        resolve({ dataUrl: compressedDataUrl, mimeType: outputMime })
      }
      img.onerror = () => {
        // Fallback: return the original if compression fails
        resolve({ dataUrl, mimeType })
      }
      img.src = dataUrl
    })
  }, [])

  const addFiles = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    imageFiles.forEach(file => {
      const reader = new FileReader()
      reader.onload = async () => {
        const originalDataUrl = reader.result as string
        const compressed = await compressImage(originalDataUrl, file.type)
        setAttachments(prev => [...prev, {
          id: crypto.randomUUID(),
          file,
          dataUrl: compressed.dataUrl,
          mimeType: compressed.mimeType
        }])
      }
      reader.readAsDataURL(file)
    })
  }, [compressImage])

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  const handleSubmit = async () => {
    if ((!message.trim() && attachments.length === 0) || !connected) return

    const currentMessage = message
    const currentAttachments = attachments.map(a => ({
      type: 'image' as const,
      mimeType: a.mimeType,
      content: a.dataUrl.split(',')[1]
    }))

    setMessage('')
    setAttachments([])
    await sendMessage(currentMessage, currentAttachments.length > 0 ? currentAttachments : undefined)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target.value.length <= maxLength) {
      setMessage(e.target.value)
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageItems: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) imageItems.push(file)
      }
    }
    if (imageItems.length > 0) {
      e.preventDefault()
      addFiles(imageItems)
    }
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (e.dataTransfer?.files) {
      addFiles(e.dataTransfer.files)
    }
  }

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files)
      e.target.value = ''
    }
  }

  return (
    <div
      className={`input-area ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="drop-overlay">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
          <span>Drop images here</span>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="attachment-preview">
          {attachments.map(a => (
            <div key={a.id} className="attachment-thumb">
              <img src={a.dataUrl} alt="Attachment" />
              <button
                className="attachment-remove"
                onClick={() => removeAttachment(a.id)}
                aria-label="Remove attachment"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="input-container">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <button
          className="attachment-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={!connected}
          aria-label="Attach image"
          title="Attach image"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={connected ? "Type a message..." : "Connecting..."}
          rows={1}
          disabled={!connected}
          aria-label="Message input"
        />
        <button
          className="send-btn"
          onClick={handleSubmit}
          disabled={(!message.trim() && attachments.length === 0) || !connected}
          aria-label="Send message"
        >
          {isStreaming ? (
            <svg className="loading-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="32">
                <animate attributeName="stroke-dashoffset" dur="1s" values="32;0" repeatCount="indefinite" />
              </circle>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          )}
        </button>
      </div>
      <div className="input-footer">
        <span className="char-count">
          <span className={message.length > maxLength * 0.9 ? 'warning' : ''}>
            {message.length}
          </span>
          {' '}/{' '}{maxLength}
        </span>
        <span className="keyboard-hint">
          Press <kbd>Enter</kbd> to send, <kbd>Shift+Enter</kbd> for new line
        </span>
      </div>
    </div>
  )
}
