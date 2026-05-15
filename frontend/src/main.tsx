import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Catch uncaught render errors so we never get a blank screen
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 32,
          background: '#0a0b0f', color: '#e8eaf2', fontFamily: 'monospace',
          textAlign: 'center', gap: 16
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f87171' }}>Something went wrong</div>
          <pre style={{
            background: '#181b22', border: '1px solid #2a2f3d', borderRadius: 6,
            padding: 16, fontSize: 12, color: '#f87171', maxWidth: 600,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', textAlign: 'left'
          }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack?.split('\n').slice(0, 6).join('\n')}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px', background: '#6ee7ff', color: '#000',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              fontWeight: 700, fontSize: 14
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
