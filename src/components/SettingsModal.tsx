import { useState, useEffect, useRef } from 'react'
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
    updatePolicy,
    setUpdatePolicy,
    fontSize,
    setFontSize
  } = useStore()

  const [url, setUrl] = useState(serverUrl)
  const [mode, setMode] = useState(authMode)
  const [token, setToken] = useState(gatewayToken)
  const [localUpdatePolicy, setLocalUpdatePolicy] = useState(updatePolicy)
  const [error, setError] = useState('')

  // Only reset local state when the modal OPENS (showSettings goes true)
  // Not on every re-render that changes store values
  const prevShowRef = useRef(false)
  useEffect(() => {
    if (showSettings && !prevShowRef.current) {
      setUrl(serverUrl)
      setMode(authMode)
      setToken(gatewayToken)
      setLocalUpdatePolicy(updatePolicy)
      setError('')
    }
    prevShowRef.current = showSettings
  }, [showSettings])

  const normalizeUrl = (value: string): string => {
    // Auto-convert http(s) to ws(s) for convenience
    if (value.startsWith('https://')) return 'wss://' + value.slice(8)
    if (value.startsWith('http://')) return 'ws://' + value.slice(7)
    // If no protocol at all, assume wss:// for remote, ws:// for local
    if (!value.startsWith('ws://') && !value.startsWith('wss://')) {
      const isLocal = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value)
      return (isLocal ? 'ws://' : 'wss://') + value
    }
    return value
  }

  const validateUrl = (value: string) => {
    try {
      const parsed = new URL(value)
      if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
        return 'URL must start with ws://, wss://, http://, or https://'
      }
      return ''
    } catch {
      return 'Invalid URL format'
    }
  }

  const handleSave = async () => {
    setError('')
    // Read directly from DOM as fallback — Android WebView sometimes desyncs React state
    const urlInput = document.getElementById('serverUrl') as HTMLInputElement
    const tokenInput = document.getElementById('gatewayToken') as HTMLInputElement
    const rawUrl = (urlInput?.value || url).trim()
    const trimmedToken = (tokenInput?.value || token).trim()

    if (!rawUrl) {
      setError('Server URL is required')
      return
    }

    const trimmedUrl = normalizeUrl(rawUrl)

    const urlError = validateUrl(trimmedUrl)
    if (urlError) {
      setError(urlError)
      return
    }

    // Disconnect any existing/stale connection before applying new settings
    disconnect()

    setServerUrl(trimmedUrl)
    setAuthMode(mode)
    setGatewayToken(trimmedToken)
    setUpdatePolicy(localUpdatePolicy)

    // Small delay to let disconnect + state settle before reconnecting
    await new Promise(r => setTimeout(r, 100))

    // Try to connect with new settings
    try {
      await connect()
      setShowSettings(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setError(`${msg}. Check URL, token, and that the server is reachable.`)
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
              placeholder="your-tunnel.example.com or wss://..."
              autoComplete="off"
            />
            <span className="form-hint">Enter hostname, https://, or wss:// URL — auto-converts for you</span>
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
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Text Size</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '14px', minWidth: 'auto' }}
                  onClick={() => setFontSize(Math.max(70, fontSize - 10))}
                  disabled={fontSize <= 70}
                >A−</button>
                <span style={{ minWidth: '40px', textAlign: 'center', fontSize: '0.85rem', opacity: 0.7 }}>{fontSize}%</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '14px', minWidth: 'auto' }}
                  onClick={() => setFontSize(Math.min(150, fontSize + 10))}
                  disabled={fontSize >= 150}
                >A+</button>
              </div>
            </label>
            <span className="form-hint">Scale all text (70%–150%). Default: 100%</span>
          </div>

          <div className="form-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Updates</span>
              <select
                value={localUpdatePolicy}
                onChange={(e) => setLocalUpdatePolicy(e.target.value as typeof localUpdatePolicy)}
                className="update-policy-select"
              >
                <option value="instant">Immediate</option>
                <option value="daily">Check daily</option>
                <option value="weekly">Check weekly</option>
                <option value="bugfix">Bug fixes only</option>
                <option value="feature">Features only</option>
                <option value="off">Off</option>
              </select>
            </label>
            <span className="form-hint">How PRSM checks for and installs updates</span>
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
          <button className="btn btn-primary" onClick={handleSave}>
            {connecting ? 'Reconnect' : 'Save & Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
