import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ClawControlRSM] React error boundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          background: '#0a0d12',
          color: '#e0e6ed',
          fontFamily: 'system-ui, sans-serif',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <h1 style={{ color: '#ef4444', marginBottom: '1rem' }}>Something went wrong</h1>
          <p style={{ color: '#8594a3', marginBottom: '1.5rem', maxWidth: '500px' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => {
              // Clear persisted state and reload
              try { localStorage.removeItem('clawcontrol-storage') } catch {}
              window.location.reload()
            }}
            style={{
              background: '#17a192',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 24px',
              fontSize: '1rem',
              cursor: 'pointer',
              marginBottom: '0.5rem'
            }}
          >
            Reset &amp; Reload
          </button>
          <button
            onClick={() => window.location.reload()}
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
            Just Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
