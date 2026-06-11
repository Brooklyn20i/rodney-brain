import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep this local-only: enough context for debugging without leaking data.
    console.error('Cadence crashed', { error, componentStack: info.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="login-wrap">
        <div className="login-card error-card" role="alert">
          <h1>Cadence hit a problem</h1>
          <p>
            The cockpit failed to render. Reload the app; if it keeps happening,
            capture the browser console error before continuing serious work.
          </p>
          <pre>{this.state.error.message}</pre>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload Cadence
          </button>
        </div>
      </div>
    );
  }
}
