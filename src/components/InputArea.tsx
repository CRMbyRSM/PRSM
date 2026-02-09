import { useState, useRef, useEffect, useCallback, KeyboardEvent, ChangeEvent, ClipboardEvent, DragEvent } from 'react'
import { useStore } from '../store'

const SPEACHES_URL = 'http://192.168.0.254:8000/v1/audio/transcriptions'
const STT_MODEL = 'deepdml/faster-whisper-large-v3-turbo-ct2'

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
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { sendMessage, isStreaming, connected } = useStore()

  const maxLength = 4000

  // Cleanup recording timer on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(t => t.stop())
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }
        setRecordingDuration(0)

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        if (audioBlob.size < 100) return // too small, probably empty

        // Transcribe via Speaches
        setIsTranscribing(true)
        try {
          const formData = new FormData()
          formData.append('file', audioBlob, 'recording.webm')
          formData.append('model', STT_MODEL)
          formData.append('language', 'en')

          const res = await fetch(SPEACHES_URL, { method: 'POST', body: formData })
          if (!res.ok) throw new Error(`STT error: ${res.status}`)
          const data = await res.json()
          const text = (data.text || '').trim()
          if (text) {
            setMessage(prev => prev ? prev + ' ' + text : text)
            // Focus the textarea so user can edit/send
            setTimeout(() => textareaRef.current?.focus(), 50)
          }
        } catch (err) {
          console.error('Transcription failed:', err)
          // Could show error toast here
        } finally {
          setIsTranscribing(false)
        }
      }

      mediaRecorder.start(250) // collect chunks every 250ms
      setIsRecording(true)
      setRecordingDuration(0)
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1)
      }, 1000)
    } catch (err) {
      console.error('Mic access denied:', err)
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }, [])

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Remove the onstop handler so it doesn't transcribe
      mediaRecorderRef.current.onstop = () => {
        mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop())
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }
        setRecordingDuration(0)
      }
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }, [])

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  useEffect(() => {
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [message])

  const compressImage = useCallback((dataUrl: string, _mimeType: string): Promise<{ dataUrl: string; mimeType: string }> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const MAX_DIM = 1920
        const QUALITY = 0.75

        let width = img.naturalWidth
        let height = img.naturalHeight

        // Scale down if either dimension exceeds MAX_DIM
        if (width > MAX_DIM || height > MAX_DIM) {
          const scale = Math.min(MAX_DIM / width, MAX_DIM / height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)

        // Always export as JPEG — PNG toDataURL ignores quality and produces huge files.
        // Screenshots don't need transparency.
        const compressedDataUrl = canvas.toDataURL('image/jpeg', QUALITY)

        resolve({ dataUrl: compressedDataUrl, mimeType: 'image/jpeg' })
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
          disabled={!connected || isRecording}
          aria-label="Attach image"
          title="Attach image"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        {!isRecording ? (
          <button
            className={`mic-btn ${isTranscribing ? 'transcribing' : ''}`}
            onClick={startRecording}
            disabled={!connected || isTranscribing}
            aria-label="Record voice note"
            title={isTranscribing ? 'Transcribing...' : 'Record voice note'}
          >
            {isTranscribing ? (
              <svg className="loading-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="32">
                  <animate attributeName="stroke-dashoffset" dur="1s" values="32;0" repeatCount="indefinite" />
                </circle>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
        ) : (
          <div className="recording-controls">
            <span className="recording-indicator" />
            <span className="recording-time">{formatDuration(recordingDuration)}</span>
            <button
              className="recording-cancel"
              onClick={cancelRecording}
              aria-label="Cancel recording"
              title="Cancel"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <button
              className="recording-stop"
              onClick={stopRecording}
              aria-label="Stop and transcribe"
              title="Stop & transcribe"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          </div>
        )}

        {!isRecording ? (
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={connected ? (isTranscribing ? "Transcribing..." : "Type a message...") : "Connecting..."}
            rows={1}
            disabled={!connected}
            aria-label="Message input"
          />
        ) : (
          <div className="recording-placeholder">
            Recording voice note...
          </div>
        )}

        <button
          className="send-btn"
          onClick={handleSubmit}
          disabled={(!message.trim() && attachments.length === 0) || !connected || isRecording}
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
