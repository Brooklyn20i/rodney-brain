import React from 'react';

// Stops a single render error from white-screening the whole app.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    void error;
  }
  render() {
    if (this.state.error) {
      return (
        <div className="login-wrap">
          <div className="login-card">
            <h1>Something went wrong</h1>
            <p>The screen hit an error, but your data is safe. Reload to continue.</p>
            <button
              className="btn btn-primary"
              onClick={() => {
                this.setState({ error: null });
                location.reload();
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
