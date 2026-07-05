import React from 'react';

// Stops a single render error from white-screening the whole app.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { /* intentionally not logging content to console */ void error; }
  render() {
    if (this.state.error) {
      return (
        <div className="login-wrap"><div className="login-card">
          <h1>Something went wrong</h1>
          <p>The screen hit an error, but your data is safe. Reload to continue.</p>
          <button className="btn btn-primary" onClick={() => { this.setState({ error: null }); location.reload(); }}>Reload</button>
        </div></div>
      );
    }
    return this.props.children;
  }
}

// Lightweight banner that surfaces background save failures (writes are async
// and otherwise fail silently). Listens for unhandled promise rejections.
export function SaveErrorBanner() {
  const [show, setShow] = React.useState(false);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    const onReject = () => {
      setShow(true);
      // Auto-dismiss: a transient blip shouldn't leave a scary red bar pinned to
      // the screen for the rest of a workout. Writes retry on their own, so the
      // banner is a brief heads-up, not a permanent alarm.
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setShow(false), 5000);
    };
    window.addEventListener('unhandledrejection', onReject);
    return () => {
      window.removeEventListener('unhandledrejection', onReject);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);
  if (!show) return null;
  return (
    <div className="save-error-banner">
      ⚠ A change may not have saved — it will retry automatically.
      <button onClick={() => setShow(false)}>Dismiss</button>
    </div>
  );
}
