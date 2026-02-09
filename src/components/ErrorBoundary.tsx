import { Component, ErrorInfo, ReactNode } from 'react'
import { useStore } from '../store'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  componentStack: string
  diagnostics: string
  copied: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, componentStack: '', diagnostics: '', copied: false }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const lines: string[] = []
    lines.push('=== ClawControlRSM Crash Report ===')
    lines.push(`Time: ${new Date().toISOString()}`)
    lines.push(`Error: ${error.message}`)
    lines.push(`Stack: ${error.stack?.slice(0, 500) || 'none'}`)
    lines.push(`Component stack: ${info.componentStack || 'none'}`)
    lines.push('')

    try {
      const state = useStore.getState()

      // Dump message data for inspection
      lines.push(`=== Messages (${state.messages?.length || 0}) ===`)
      state.messages?.slice(0, 10).forEach((m: any, i: number) => {
        lines.push(`--- msg[${i}] ---`)
        lines.push(`  id: ${typeof m.id} = ${String(m.id).slice(0, 100)}`)
        lines.push(`  role: ${typeof m.role} = ${String(m.role).slice(0, 100)}`)
        lines.push(`  content type: ${typeof m.content}`)
        if (typeof m.content !== 'string') {
          lines.push(`  ⚠️ CONTENT IS NOT STRING: ${JSON.stringify(m.content).slice(0, 500)}`)
        } else {
          lines.push(`  content preview: ${m.content.slice(0, 200)}`)
        }
        lines.push(`  timestamp: ${typeof m.timestamp} = ${String(m.timestamp).slice(0, 50)}`)
        if (m.thinking !== undefined) {
          lines.push(`  thinking: ${typeof m.thinking} = ${String(m.thinking).slice(0, 100)}`)
        }
        // Check for ANY extra fields that aren't in Message interface
        const knownKeys = new Set(['id', 'role', 'content', 'timestamp', 'thinking', 'attachments'])
        for (const k of Object.keys(m)) {
          if (!knownKeys.has(k)) {
            const v = (m as any)[k]
            lines.push(`  ⚠️ EXTRA FIELD: ${k} = ${typeof v} ${typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v).slice(0, 100)}`)
          }
        }
      })
      lines.push('')

      // Dump session data
      lines.push(`=== Sessions (${state.sessions?.length || 0}) ===`)
      state.sessions?.slice(0, 5).forEach((s: any, i: number) => {
        const extras: string[] = []
        for (const [k, v] of Object.entries(s)) {
          if (v !== null && v !== undefined && typeof v === 'object' && typeof v !== 'function') {
            extras.push(`${k}=${JSON.stringify(v).slice(0, 200)}`)
          }
        }
        lines.push(`  session[${i}]: id=${s.id} title="${s.title}" ${extras.length > 0 ? 'OBJECTS: ' + extras.join(' | ') : 'clean'}`)
      })
      lines.push('')

      // Dump agent data
      lines.push(`=== Agents (${state.agents?.length || 0}) ===`)
      state.agents?.forEach((a: any, i: number) => {
        const extras: string[] = []
        for (const [k, v] of Object.entries(a)) {
          if (v !== null && v !== undefined && typeof v === 'object' && typeof v !== 'function') {
            extras.push(`${k}=${JSON.stringify(v).slice(0, 200)}`)
          }
        }
        lines.push(`  agent[${i}]: id=${a.id} name="${a.name}" ${extras.length > 0 ? 'OBJECTS: ' + extras.join(' | ') : 'clean'}`)
      })
      lines.push('')

      // Dump skill triggers specifically
      lines.push(`=== Skills (${state.skills?.length || 0}) ===`)
      state.skills?.slice(0, 5).forEach((s: any, i: number) => {
        const extras: string[] = []
        for (const [k, v] of Object.entries(s)) {
          if (v !== null && v !== undefined && typeof v === 'object' && typeof v !== 'function') {
            extras.push(`${k}=${JSON.stringify(v).slice(0, 200)}`)
          }
        }
        lines.push(`  skill[${i}]: name="${s.name}" ${extras.length > 0 ? 'OBJECTS: ' + extras.join(' | ') : 'clean'}`)
      })
      lines.push('')

      // Dump cron data
      lines.push(`=== Cron Jobs (${state.cronJobs?.length || 0}) ===`)
      state.cronJobs?.forEach((c: any, i: number) => {
        const extras: string[] = []
        for (const [k, v] of Object.entries(c)) {
          if (v !== null && v !== undefined && typeof v === 'object' && typeof v !== 'function') {
            extras.push(`${k}=${JSON.stringify(v).slice(0, 200)}`)
          }
        }
        lines.push(`  cron[${i}]: name="${c.name}" schedule="${c.schedule}" ${extras.length > 0 ? 'OBJECTS: ' + extras.join(' | ') : 'clean'}`)
      })
      lines.push('')

      // Current view state
      lines.push(`=== UI State ===`)
      lines.push(`  mainView: ${state.mainView}`)
      lines.push(`  currentSessionId: ${state.currentSessionId}`)
      lines.push(`  currentAgentId: ${state.currentAgentId}`)
      lines.push(`  connected: ${state.connected}`)
      lines.push(`  isStreaming: ${state.isStreaming}`)

    } catch (scanErr) {
      lines.push(`[Store scan failed: ${scanErr}]`)
    }

    const diagnostics = lines.join('\n')
    console.error(diagnostics)
    this.setState({ componentStack: info.componentStack || '', diagnostics })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          height: '100vh',
          width: '100vw',
          background: '#0a0d12',
          color: '#e0e6ed',
          fontFamily: 'system-ui, sans-serif',
          padding: '1.5rem',
          textAlign: 'center',
          overflow: 'auto'
        }}>
          <h1 style={{ color: '#ef4444', marginBottom: '0.5rem', fontSize: '1.5rem' }}>Something went wrong</h1>
          <p style={{ color: '#8594a3', marginBottom: '1rem', maxWidth: '600px', fontSize: '0.9rem' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              onClick={() => {
                navigator.clipboard.writeText(this.state.diagnostics).then(() => {
                  this.setState({ copied: true })
                  setTimeout(() => this.setState({ copied: false }), 2000)
                })
              }}
              style={{
                background: '#f59e0b',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 24px',
                fontSize: '1rem',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              {this.state.copied ? '✅ Copied!' : '📋 Copy Crash Report'}
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#17a192',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 24px',
                fontSize: '1rem',
                cursor: 'pointer'
              }}
            >
              Reload
            </button>
            <button
              onClick={() => {
                try { localStorage.removeItem('clawcontrol-storage') } catch {}
                window.location.reload()
              }}
              style={{
                background: 'transparent',
                color: '#8594a3',
                border: '1px solid #1e2533',
                borderRadius: '8px',
                padding: '10px 24px',
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              Reset & Reload
            </button>
          </div>

          <pre style={{
            background: '#1a1d24',
            color: '#d4d4d8',
            padding: '12px',
            borderRadius: '8px',
            fontSize: '0.65rem',
            maxWidth: '800px',
            width: '100%',
            maxHeight: '65vh',
            overflow: 'auto',
            textAlign: 'left',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            lineHeight: '1.4'
          }}>
            {this.state.diagnostics || 'Collecting diagnostics...'}
          </pre>

          <p style={{ color: '#4a5568', fontSize: '0.75rem', marginTop: '0.5rem' }}>
            Click "Copy Crash Report" and paste it to Antonella
          </p>
        </div>
      )
    }

    return this.props.children
  }
}
