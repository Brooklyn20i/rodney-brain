import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { CadenceProvider } from './lib/store';
import { E2EProvider } from './lib/e2eProvider';
import { CadenceFinancialProvider } from './financial/lib/store';
import { CadenceFitnessProvider } from './fitness/lib/store';
import { App } from './App';
import { ErrorBoundary, SaveErrorBanner } from './components/ErrorBoundary';
import './styles.css';

// Resilience: a new deploy renames hashed chunks. If a stale service worker
// serves an old shell that imports a chunk that no longer exists, the browser
// fires vite:preloadError — reload once to fetch the fresh index instead of
// white-screening. The sessionStorage guard prevents a reload loop.
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('cad-reloaded') !== '1') {
    sessionStorage.setItem('cad-reloaded', '1');
    window.location.reload();
  }
});

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

// E2E builds (VITE_E2E=1, Playwright only) swap in an in-memory provider so the
// real app runs in a browser with no Supabase backend. Production never sets the
// flag, so this branch is eliminated and CadenceProvider is used unchanged.
const Provider = import.meta.env.VITE_E2E === '1' ? E2EProvider : CadenceProvider;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SaveErrorBanner />
      <Provider>
        {/* Financial and Fitness are mounted at the root (not per-domain) so
            switching domains in the sidebar is instant, with no reload/spinner
            -- all three data sets load once and stay live via realtime. */}
        <CadenceFinancialProvider>
          <CadenceFitnessProvider>
            <App />
          </CadenceFitnessProvider>
        </CadenceFinancialProvider>
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>,
);
