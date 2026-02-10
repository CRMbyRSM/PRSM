import { useState, useEffect } from 'react'
import { useStore } from '../store'

export function SettingsModal() {
  const {
    serverUrl,
    setServerUrl,
    authMode,
    setAuthMode,
    gatewayToken,
    setGatewayToken,
    showSettings,
    setShowSettings,
    connect,
    disconnect,
    connected,
    connecting,
    notificationsEnabled,
    setNotificationsEnabled,
    sttUrl,
    setSttUrl,
    sttModel,
    setSttModel,
    sttApiKey,
    setSttApiKey,
    updatePolicy,
    setUpdatePolicy
  } = useStore()

  const [url, setUrl] = useState(serverUrl)
  const [mode, setMode] = useState(authMode)
  const [token, setToken] = useState(gatewayToken)
  const [localSttUrl, setLocalSttUrl] = useState(sttUrl)
  const [localSttModel, setLocalSttModel] = useState(sttModel)
  const [localSttApiKey, setLocalSttApiKey] = useState(sttApiKey)
  const [localUpdatePolicy, setLocalUpdatePolicy] = useState(updatePolicy)
  const [error, setError] = useState('')

  useEffect(() => {
    setUrl(serverUrl)
    setMode(authMode)
    setToken(gatewayToken)
    setLocalSttUrl(sttUrl)
    setLocalSttModel(sttModel)
    setLocalSttApiKey(sttApiKey)
    setLocalUpdatePolicy(updatePolicy)
  }, [serverUrl, authMode, gatewayToken, sttUrl, sttModel, sttApiKey, updatePolicy, showSettings])

  const validateUrl = (value: string) => {
    try {
      const parsed = new URL(value)
      if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
        return 'URL must start with ws:// or wss://'
      }
      return ''
    } catch {
      return 'Invalid URL format'
    }
  }

  const handleSave = async () => {
    setError('')
    const trimmedUrl = url.trim()
    const trimmedToken = token.trim()

    if (!trimmedUrl) {
      setError('Server URL is required')
      return
    }

    const urlError = validateUrl(trimmedUrl)
    if (urlError) {
      setError(urlError)
      return
    }

    // Save settings
    setServerUrl(trimmedUrl)
    setAuthMode(mode)
    setGatewayToken(trimmedToken)
    setSttUrl(localSttUrl.trim())
    setSttModel(localSttModel.trim())
    setSttApiKey(localSttApiKey.trim())
    setUpdatePolicy(localUpdatePolicy)

    // Try to connect
    try {
      await connect()
      setShowSettings(false)
    } catch (err) {
      setError('Connection failed. Check URL and token.')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Escape') {
      setShowSettings(false)
    }
  }

  if (!showSettings) return null

  return (
    <div className="modal-overlay" onClick={() => setShowSettings(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="modal-header">
          <h2>Connection Settings</h2>
          <button className="modal-close" onClick={() => setShowSettings(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="serverUrl">Server URL</label>
            <input
              type="text"
              id="serverUrl"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="wss://your-server.local"
              autoComplete="off"
            />
            <span className="form-hint">WebSocket URL (e.g., wss://your-server.local or ws://localhost:8080)</span>
          </div>

          <div className="form-group">
            <label>Authentication Mode</label>
            <div className="auth-mode-toggle">
              <button
                type="button"
                className={`toggle-btn ${mode === 'token' ? 'active' : ''}`}
                onClick={() => setMode('token')}
              >
                Token
              </button>
              <button
                type="button"
                className={`toggle-btn ${mode === 'password' ? 'active' : ''}`}
                onClick={() => setMode('password')}
              >
                Password
              </button>
            </div>
            <span className="form-hint">Choose based on your server's gateway.auth.mode setting.</span>
          </div>

          <div className="form-group">
            <label htmlFor="gatewayToken">{mode === 'token' ? 'Gateway Token' : 'Gateway Password'}</label>
            <input
              id="gatewayToken"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={mode === 'token' ? 'Enter your gateway token' : 'Enter your gateway password'}
              autoComplete="off"
            />
            <span className="form-hint">Required if authentication is enabled on the server.</span>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="connection-status-box">
            <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`} />
            <span>{connected ? 'Connected' : connecting ? 'Connecting...' : 'Disconnected'}</span>
          </div>

          <div className="form-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Notifications</span>
              <label className="toggle-switch" style={{ marginLeft: '8px' }}>
                <input
                  type="checkbox"
                  checked={notificationsEnabled}
                  onChange={(e) => setNotificationsEnabled(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </label>
            <span className="form-hint">Get notified when an agent responds</span>
          </div>

          <div className="form-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
            <label style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px', display: 'block' }}>Speech-to-Text</label>
            <span className="form-hint" style={{ marginBottom: '12px', display: 'block' }}>
              Configure a Whisper-compatible STT service to enable voice notes. Works with OpenAI, Speaches, LocalAI, or any OpenAI-compatible endpoint.
            </span>

            <div className="form-group" style={{ marginTop: '8px' }}>
              <label htmlFor="sttUrl">STT Endpoint URL</label>
              <input
                type="text"
                id="sttUrl"
                value={localSttUrl}
                onChange={(e) => setLocalSttUrl(e.target.value)}
                placeholder="http://localhost:8000/v1/audio/transcriptions"
                autoComplete="off"
              />
            </div>

            <div className="form-group" style={{ marginTop: '8px' }}>
              <label htmlFor="sttModel">STT Model</label>
              <input
                type="text"
                id="sttModel"
                value={localSttModel}
                onChange={(e) => setLocalSttModel(e.target.value)}
                placeholder="whisper-large-v3"
                autoComplete="off"
              />
              <span className="form-hint">Model name for the transcription API</span>
            </div>

            <div className="form-group" style={{ marginTop: '8px' }}>
              <label htmlFor="sttApiKey">API Key (optional)</label>
              <input
                type="password"
                id="sttApiKey"
                value={localSttApiKey}
                onChange={(e) => setLocalSttApiKey(e.target.value)}
                placeholder="Only needed for OpenAI or protected endpoints"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="form-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
            <label style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px', display: 'block' }}>Updates</label>
            <span className="form-hint" style={{ marginBottom: '12px', display: 'block' }}>
              How ClawControlRSM checks for and installs updates.
            </span>

            <div className="form-group" style={{ marginTop: '8px' }}>
              <label htmlFor="updatePolicy">Update Preference</label>
              <select
                id="updatePolicy"
                value={localUpdatePolicy}
                onChange={(e) => setLocalUpdatePolicy(e.target.value as typeof localUpdatePolicy)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              >
                <option value="instant">All updates, install immediately</option>
                <option value="daily">Check daily</option>
                <option value="weekly">Check weekly</option>
                <option value="bugfix">Bug fixes only</option>
                <option value="feature">Feature releases only</option>
                <option value="off">Off</option>
              </select>
              <span className="form-hint">
                {localUpdatePolicy === 'instant' && 'Install updates as soon as they\'re available'}
                {localUpdatePolicy === 'daily' && 'Check once a day, prompt before installing'}
                {localUpdatePolicy === 'weekly' && 'Check once a week, prompt before installing'}
                {localUpdatePolicy === 'bugfix' && 'Only install patch versions (x.x.PATCH)'}
                {localUpdatePolicy === 'feature' && 'Install minor and patch versions (x.MINOR.patch)'}
                {localUpdatePolicy === 'off' && 'Never check for updates'}
              </span>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {connected && (
            <button className="btn btn-danger" onClick={() => { disconnect(); setShowSettings(false); }}>
              Disconnect
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={connecting}>
            {connecting ? 'Connecting...' : 'Save & Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
