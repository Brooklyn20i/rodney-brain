import React from 'react';
import ReactDOM from 'react-dom/client';
import { CadenceProvider } from './lib/store';
import { E2EProvider } from './lib/e2eProvider';
import { CadenceFinancialProvider } from './financial/lib/store';
import { CadenceFitnessProvider } from './fitness/lib/store';
import { App } from './App';
import { ErrorBoundary, SaveErrorBanner } from './components/ErrorBoundary';
import { lockCadencePortrait } from './fitness/lib/orientation';
import './styles.css';

// Build provenance for operators and bug reports. Vite replaces this at build
// time from Vercel's commit SHA or a local git fallback.
document.documentElement.dataset.buildCommit = __BUILD_COMMIT__;

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

// Actively lock to portrait where the platform allows it (installed Android
// PWAs). Cadence — the workout logger especially — is built for one-handed
// portrait use, so we never want it rotating into landscape. iOS Safari ignores
// this (and the manifest's orientation lock), so the CSS `.rotate-guard`
// overlay stays as the fallback there. lock() throws/rejects on desktop and
// unsupported browsers, so this is strictly best-effort.
lockCadencePortrait();

// Sentry is enabled when VITE_SENTRY_DSN is set (production). Loaded DYNAMICALLY
// so @sentry/react (~100KB gz) never touches the cold-start path — in dev / when
// no DSN is set it isn't fetched at all, and errors still hit the console.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      release: __BUILD_COMMIT__,
      // Capture 10% of sessions for performance profiling.
      tracesSampleRate: 0.1,
      // Only report errors from our own code, not third-party scripts.
      allowUrls: [/cadence/, /localhost/],
      sendDefaultPii: false,
      // Supabase REST URLs embed table names + filter values (owner ids) in the
      // query string; strip it from breadcrumbs so we don't ship that to Sentry.
      beforeBreadcrumb(breadcrumb) {
        const url = (breadcrumb.data as { url?: string } | undefined)?.url;
        if (typeof url === 'string' && url.includes('.supabase.co') && breadcrumb.data) {
          breadcrumb.data.url = url.split('?')[0];
        }
        return breadcrumb;
      },
    });
  });
}

// E2E builds (VITE_E2E=1, Playwright only) swap in an in-memory provider so the
// real app runs in a browser with no Supabase backend. Production never sets the
// flag, so this branch is eliminated and CadenceProvider is used unchanged.
const Provider = import.meta.env.VITE_E2E === '1' ? E2EProvider : CadenceProvider;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {/* iOS PWAs ignore the manifest's orientation lock, so this CSS-only guard
          keeps Cadence upright on a phone held sideways (the workout logger is
          built for one-handed portrait use). Hidden on tablets/desktop. */}
      <div className="rotate-guard" aria-hidden="true">
        <div className="rotate-guard-card">
          <div className="rotate-guard-icon">📱</div>
          <p>Turn your phone upright</p>
          <span>Cadence works best in portrait.</span>
        </div>
      </div>
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
