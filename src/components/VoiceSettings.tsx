import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'

const HELP_MESSAGE = `I want to set up voice notes in PRSM. Can you help me? I need to know:
1. What STT (speech-to-text) service I can use
2. What URL, model name, and API key to enter
3. The cheapest/easiest option to get started

I need a Whisper-compatible transcription endpoint (OpenAI-compatible API at /v1/audio/transcriptions).`

interface VoiceSettingsProps {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
}

export function VoiceSettings({ open, onClose, anchorRef }: VoiceSettingsProps) {
  const { sttUrl, setSttUrl, sttModel, setSttModel, sttApiKey, setSttApiKey, sendMessage } = useStore()

  const [localUrl, setLocalUrl] = useState(sttUrl)
  const [localModel, setLocalModel] = useState(sttModel)
  const [localKey, setLocalKey] = useState(sttApiKey)
  const [saved, setSaved] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setLocalUrl(sttUrl)
      setLocalModel(sttModel)
      setLocalKey(sttApiKey)
      setSaved(false)
    }
  }, [open, sttUrl, sttModel, sttApiKey])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    // Delay to avoid the opening click closing it immediately
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 50)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [open, onClose, anchorRef])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const handleSave = () => {
    setSttUrl(localUrl.trim())
    setSttModel(localModel.trim())
    setSttApiKey(localKey.trim())
    setSaved(true)
    setTimeout(() => onClose(), 600)
  }

  if (!open) return null

  return (
    <div className="voice-settings-popover" ref={panelRef}>
      <div className="voice-settings-header">
        <span className="voice-settings-title">Voice Notes Setup</span>
        <button className="voice-settings-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p className="voice-settings-hint">
        Point this at any Whisper-compatible API — OpenAI, Speaches, LocalAI, etc.
      </p>

      <div className="voice-settings-field">
        <label htmlFor="vs-url">Endpoint URL</label>
        <input
          id="vs-url"
          type="text"
          value={localUrl}
          onChange={(e) => setLocalUrl(e.target.value)}
          placeholder="http://localhost:8000/v1/audio/transcriptions"
          autoComplete="off"
          autoFocus
        />
      </div>

      <div className="voice-settings-field">
        <label htmlFor="vs-model">Model</label>
        <input
          id="vs-model"
          type="text"
          value={localModel}
          onChange={(e) => setLocalModel(e.target.value)}
          placeholder="whisper-large-v3"
          autoComplete="off"
        />
      </div>

      <div className="voice-settings-field">
        <label htmlFor="vs-key">API Key <span className="voice-settings-optional">(optional)</span></label>
        <input
          id="vs-key"
          type="password"
          value={localKey}
          onChange={(e) => setLocalKey(e.target.value)}
          placeholder="Only for OpenAI or protected endpoints"
          autoComplete="off"
        />
      </div>

      <button
        className={`voice-settings-save ${saved ? 'saved' : ''}`}
        onClick={handleSave}
        disabled={!localUrl.trim()}
      >
        {saved ? '✓ Saved' : 'Save'}
      </button>

      <button
        className="voice-settings-help"
        onClick={() => {
          sendMessage(HELP_MESSAGE)
          onClose()
        }}
      >
        Not sure what to put here? Ask your assistant for help →
      </button>
    </div>
  )
}
