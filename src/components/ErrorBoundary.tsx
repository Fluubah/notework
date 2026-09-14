import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * Catches render-time crashes anywhere below it and shows a recoverable
 * screen instead of the blank white page React leaves behind when a root
 * render throws.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Notework crashed while rendering:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash-screen" role="alert">
        <div className="crash-card">
          <h1>Something broke</h1>
          <p>
            Notework hit an error while drawing the page. Your data is stored in this browser and
            hasn&apos;t been touched — reloading usually clears it up.
          </p>
          <div className="crash-actions">
            <button className="btn primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button className="btn ghost" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
          <details>
            <summary>Error details</summary>
            <pre>{error.stack || `${error.name}: ${error.message}`}</pre>
          </details>
        </div>
      </div>
    )
  }
}
