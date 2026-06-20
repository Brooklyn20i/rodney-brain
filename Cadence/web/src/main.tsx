import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { CadenceProvider } from './lib/store';
import { App } from './App';
import { ErrorBoundary, SaveErrorBanner } from './components/ErrorBoundary';
import './styles.css';

// Sentry is enabled when VITE_SENTRY_DSN is set in the environment.
// In dev mode it is left unconfigured (errors still appear in the console).
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    // Capture 10% of sessions for performance profiling.
    tracesSampleRate: 0.1,
    // Only report errors from our own code, not third-party scripts.
    allowUrls: [/cadence/, /localhost/],
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SaveErrorBanner />
      <CadenceProvider>
        <App />
      </CadenceProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
