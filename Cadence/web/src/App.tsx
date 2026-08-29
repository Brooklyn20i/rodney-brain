import { useMemo, useState, useEffect, useLayoutEffect, useRef, lazy, Suspense } from 'react';
import type { CSSProperties } from 'react';
import { useCadence } from './lib/store';
import { useCadenceFitness } from './fitness/lib/store';
import { useCadenceFinancial } from './financial/lib/store';
import { isUserTask } from './lib/tasks';
import { getLoadSummary, getWaitingOnOthers } from './lib/selectors';
import { Login } from './components/Login';
import { SetPassword } from './components/SetPassword';
import { Sidebar, type Domain } from './components/Sidebar';
import { GlobalCapture } from './components/GlobalCapture';
import { useCadenceLife } from './life/lib/store';
import { FINANCIAL_THEME_STYLE, LIFE_THEME_STYLE } from './lib/domainTheme';
import { holdPwaUpdates } from './lib/updateHold';
import { hasLiveWorkout } from './fitness/lib/liveSession';
import { Home } from './screens/taskScreens'; // eager — the default landing screen

// Lazy-load the remaining screens so the initial bundle ships only Home plus
// the shell. The per-screen chunks (vite manualChunks) are now actually
// deferred instead of eagerly imported by this module.
const Dashboard = lazy(() => import('./screens/Dashboard').then((m) => ({ default: m.Dashboard })));
const Inbox = lazy(() => import('./screens/Inbox').then((m) => ({ default: m.Inbox })));
const Projects = lazy(() => import('./screens/projectScreens').then((m) => ({ default: m.Projects })));
const People = lazy(() => import('./screens/People').then((m) => ({ default: m.People })));
const Meetings = lazy(() => import('./screens/Meetings').then((m) => ({ default: m.Meetings })));
const Notes = lazy(() => import('./screens/Notes').then((m) => ({ default: m.Notes })));
const Search = lazy(() => import('./screens/Search').then((m) => ({ default: m.Search })));
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })));

// ── Financial domain ──────────────────────────────────────────────────────
// Consolidated hubs (Overview/Cashflow/Risk) with old screen ids routed in as
// deep links to the matching view; Investments / Property / Watches /
// Conviction are deliberately untouched standalone screens.
const FinOverviewHub = lazy(() => import('./financial/screens/hubs').then((m) => ({ default: m.OverviewHub })));
const FinCashflowHub = lazy(() => import('./financial/screens/hubs').then((m) => ({ default: m.CashflowHub })));
const FinRiskHub = lazy(() => import('./financial/screens/hubs').then((m) => ({ default: m.RiskHub })));
const FinStrategy = lazy(() => import('./financial/screens/Strategy').then((m) => ({ default: m.Strategy })));
const FinMonthClose = lazy(() => import('./financial/screens/MonthClose').then((m) => ({ default: m.MonthClose })));
const FinDebtOffsetControl = lazy(() => import('./financial/screens/DebtOffsetControl').then((m) => ({ default: m.DebtOffsetControl })));
const FinInvestmentDeployment = lazy(() => import('./financial/screens/InvestmentDeployment').then((m) => ({ default: m.InvestmentDeployment })));
const FinWatches = lazy(() => import('./financial/screens/Watches').then((m) => ({ default: m.Watches })));
const FinPropertyPortfolio = lazy(() => import('./financial/screens/PropertyPortfolio').then((m) => ({ default: m.PropertyPortfolio })));
const FinConviction = lazy(() => import('./financial/screens/Conviction').then((m) => ({ default: m.Conviction })));
const FinKobe = lazy(() => import('./financial/screens/Kobe').then((m) => ({ default: m.Kobe })));

// ── Fitness domain ────────────────────────────────────────────────────────
const FitDashboard = lazy(() => import('./fitness/screens/Dashboard').then((m) => ({ default: m.Dashboard })));
const FitWorkout = lazy(() => import('./fitness/screens/Workout').then((m) => ({ default: m.Workout })));
const FitPrograms = lazy(() => import('./fitness/screens/Programs').then((m) => ({ default: m.Programs })));
const FitHistory = lazy(() => import('./fitness/screens/History').then((m) => ({ default: m.History })));
const FitExercises = lazy(() => import('./fitness/screens/Exercises').then((m) => ({ default: m.Exercises })));
const FitCardio = lazy(() => import('./fitness/screens/Cardio').then((m) => ({ default: m.Cardio })));
const FitNutrition = lazy(() => import('./fitness/screens/Nutrition').then((m) => ({ default: m.Nutrition })));
const FitBody = lazy(() => import('./fitness/screens/Body').then((m) => ({ default: m.Body })));
const FitRecovery = lazy(() => import('./fitness/screens/Recovery').then((m) => ({ default: m.Recovery })));
const FitSync = lazy(() => import('./fitness/screens/Sync').then((m) => ({ default: m.Sync })));
const FitKobe = lazy(() => import('./fitness/screens/Kobe').then((m) => ({ default: m.Kobe })));

const LifeDashboard = lazy(() => import('./life/screens/Dashboard').then((m) => ({ default: m.Dashboard })));
const LifeAdmin = lazy(() => import('./life/screens/Admin').then((m) => ({ default: m.Admin })));
const LifeObligations = lazy(() => import('./life/screens/Obligations').then((m) => ({ default: m.Obligations })));

const DEFAULT_SCREEN: Record<Domain, string> = {
  work: 'home',
  financial: 'financial:overview',
  fitness: 'fitness:dashboard',
  life: 'life:dashboard',
};

// Deep links: each domain has its own clean URL so a typed address or an
// iPhone Home Screen shortcut opens straight into that section. The path is
// mapped to the domain's default screen on boot, and kept in sync as the user
// switches domains (see the effect in App). '/health' is the public name for
// the fitness domain; '/fitness' is accepted as an alias.
const DOMAIN_PATH: Record<Domain, string> = {
  work: '/work',
  financial: '/financial',
  fitness: '/health',
  life: '/life',
};
const DOMAIN_THEME_COLOR: Record<Domain, string> = {
  work: '#1A1F2E',
  financial: '#124A2C',
  fitness: '#0B0E0C',
  life: '#3E2A1B',
};
// Home Screen identity per domain. Set dynamically (below) as well as statically
// in each per-path HTML, so "Add to Home Screen" shows the right name + icon
// however the user arrived — deep link, in-app domain switch, or a service
// worker serving the cached index.html shell.
const DOMAIN_TITLE: Record<Domain, string> = {
  work: 'Cadence Work',
  financial: 'Cadence Financial',
  fitness: 'Cadence Health',
  life: 'Cadence Life',
};
const DOMAIN_TAGLINE: Record<Domain, string> = {
  work: 'Sign in to your executive cockpit.',
  financial: 'Sign in to your wealth command centre.',
  fitness: 'Sign in to your health cockpit.',
  life: 'Sign in to your life admin.',
};
const DOMAIN_MANIFEST: Record<Domain, string> = {
  work: '/manifest.json',
  financial: '/manifest-financial.json',
  fitness: '/manifest-health.json',
  life: '/manifest-life.json',
};
const DOMAIN_ICON: Record<Domain, string> = {
  work: '/icon-work-180.png?v=4',
  financial: '/icon-financial-180.png?v=4',
  fitness: '/icon-health-180.png?v=4',
  life: '/icon-life-180.png',
};

function domainFromPath(): Domain {
  const p = window.location.pathname.replace(/\/+$/, '');
  if (p === '/financial') return 'financial';
  if (p === '/health' || p === '/fitness') return 'fitness';
  if (p === '/life') return 'life';
  return 'work';
}
const initialScreenFromPath = (): string => DEFAULT_SCREEN[domainFromPath()];

export function App() {
  const { ready, configured, session, needsPasswordSet, data, workspace, signOut, syncError, clearSyncError, acceptInvite, isOffline, pendingCount, isSyncing, canEdit } = useCadence();
  // Fitness/Financial have their own data stores; without this their save
  // failures were invisible (no banner anywhere) — a failed write just looked
  // like the tap did nothing.
  const fitness = useCadenceFitness();
  const financial = useCadenceFinancial();
  const life = useCadenceLife();
  const domainSyncError = syncError || fitness.syncError || financial.syncError || life.syncError;
  const clearDomainSyncError = () => {
    clearSyncError();
    fitness.clearSyncError();
    financial.clearSyncError();
    life.clearSyncError();
  };
  const [screen, setScreen] = useState(initialScreenFromPath);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);

  // The active domain is derived from the screen id's prefix rather than
  // tracked as separate state, so it can never drift out of sync with what's
  // actually on screen: 'financial:x' / 'fitness:x' / anything else -> work.
  const domain: Domain = screen.startsWith('financial:')
    ? 'financial'
    : screen.startsWith('fitness:')
      ? 'fitness'
      : screen.startsWith('life:')
        ? 'life'
        : 'work';

  // Re-theme the whole app for the active domain and keep the URL honest so a
  // reload / share / Home Screen shortcut re-opens the same section. Setting
  // data-domain on <html> lets the token overrides cascade to <body> too.
  // Layout effect prevents one frame of Health's pale text on Financial cards.
  useLayoutEffect(() => {
    document.documentElement.dataset.domain = domain;
    document.title = DOMAIN_TITLE[domain];
    const set = (sel: string, attr: string, val: string) =>
      document.querySelector(sel)?.setAttribute(attr, val);
    set('meta[name="theme-color"]', 'content', DOMAIN_THEME_COLOR[domain]);
    set('meta[name="apple-mobile-web-app-title"]', 'content', DOMAIN_TITLE[domain]);
    set('link[rel="apple-touch-icon"]', 'href', DOMAIN_ICON[domain]);
    set('link[rel="manifest"]', 'href', DOMAIN_MANIFEST[domain]);
    if (domainFromPath() !== domain) {
      history.replaceState(null, '', DOMAIN_PATH[domain] + window.location.search + window.location.hash);
    }
  }, [domain]);

  // A deployment reload mid-set was the "workout stops halfway and makes me
  // reopen it" bug. While a live session exists, hold PWA update handovers
  // (see pwaUpdate.ts) so a new deploy waits until the workout is done.
  useEffect(() => {
    holdPwaUpdates(hasLiveWorkout(fitness.data.workouts));
  }, [fitness.data.workouts]);

  // And if a reload happens anyway (iOS killing the PWA, a handover that got
  // through), boot straight back into the live session instead of landing on
  // the dashboard and making Rodney tap his way back mid-workout. Runs once,
  // only before any manual navigation.
  const autoResumed = useRef(false);
  useEffect(() => {
    if (autoResumed.current || !fitness.ready) return;
    autoResumed.current = true;
    if (screen === DEFAULT_SCREEN.fitness && hasLiveWorkout(fitness.data.workouts)) {
      setScreen('fitness:workout');
    }
  }, [fitness.ready, fitness.data.workouts, screen]);

  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!domainSyncError) return;
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => clearDomainSyncError(), 30000);
    return () => { if (errorTimer.current) clearTimeout(errorTimer.current); };
  // the clear callbacks are stable (useCallback); omitting avoids double-timer bug.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainSyncError]);

  // Handle ?invite=<token> on load. Stash token for post-login processing.
  const inviteToken = new URLSearchParams(window.location.search).get('invite');
  useEffect(() => {
    if (!inviteToken) return;
    if (!session) {
      // Not logged in — preserve token across login via sessionStorage.
      sessionStorage.setItem('cadence_invite', inviteToken);
      return;
    }
    // Logged in — accept now (handles both direct link and post-login redirect).
    const token = inviteToken || sessionStorage.getItem('cadence_invite');
    if (!token) return;
    sessionStorage.removeItem('cadence_invite');
    history.replaceState(null, '', window.location.pathname);
    acceptInvite(token).then((result) => {
      setInviteBanner(result.error ? `Could not join workspace: ${result.error}` : '✓ You have joined the workspace');
      setTimeout(() => setInviteBanner(null), 6000);
    });
  // acceptInvite is stable; inviteToken and session drive the key behaviour.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, inviteToken]);

  const badges = useMemo(() => ({
    // Tasks badge = overdue in Rodney's own lane. Inbox badge = unprocessed
    // captures waiting to be triaged. People badge = Waiting / owed by others.
    home: { count: getLoadSummary(data.work_items).overdue, cls: 'red' },
    inbox: { count: data.work_items.filter((w) => isUserTask(w) && w.inboxed).length, cls: '' },
    people: { count: getWaitingOnOthers(data.work_items).length, cls: 'blue' },
    'life:admin': { count: life.data.life_items.filter((i) => !i.deleted_at && i.status === 'inbox').length, cls: '' },
  }), [data, life.data.life_items]);

  if (!ready) return <div className="login-wrap"><div className="login-card"><h1>Cadence</h1><p>Loading…</p></div></div>;
  if (!configured || !session) return <Login inviteHint={!!sessionStorage.getItem('cadence_invite') || !!inviteToken} title={DOMAIN_TITLE[domain]} tagline={DOMAIN_TAGLINE[domain]} />;
  if (needsPasswordSet) return <SetPassword />;

  const navigate = (id: string, entityId?: string | null) => {
    setFocusId(entityId ?? null);
    setScreen(id);
    setMenuOpen(false);
  };
  const onMenu = () => setMenuOpen(true);
  const email = session.user.email ?? undefined;
  const onDomainChange = (d: Domain) => navigate(DEFAULT_SCREEN[d]);

  // Wrap each domain's own onNavigate prop so its internal bare ids (e.g.
  // Financial's Overview calling onNavigate('property')) land on the
  // correctly-prefixed shared screen id, without touching that domain's own
  // screen code at all.
  const financialNavigate = (id: string) => navigate(`financial:${id}`);
  const fitnessNavigate = (id: string) => navigate(`fitness:${id}`);
  const lifeNavigate = (id: string) => navigate(`life:${id}`);

  const render = () => {
    if (domain === 'financial') {
      const s = screen.slice('financial:'.length);
      switch (s) {
        // Hubs. Old screen ids stay routable as deep links into the matching
        // hub view, so in-app navigation and muscle memory keep working.
        case 'overview': return <FinOverviewHub onMenu={onMenu} onNavigate={financialNavigate} />;
        case 'net-worth-bridge': return <FinOverviewHub onMenu={onMenu} onNavigate={financialNavigate} initialView="bridge" />;
        case 'performance': return <FinOverviewHub onMenu={onMenu} onNavigate={financialNavigate} initialView="performance" />;
        case 'allocation': return <FinOverviewHub onMenu={onMenu} onNavigate={financialNavigate} initialView="allocation" />;
        case 'goals': return <FinOverviewHub onMenu={onMenu} onNavigate={financialNavigate} initialView="goals" />;
        case 'cashflow': return <FinCashflowHub onMenu={onMenu} />;
        case 'budget': return <FinCashflowHub onMenu={onMenu} />;
        case 'free-cash-engine': return <FinCashflowHub onMenu={onMenu} initialView="freecash" />;
        case 'risk': return <FinRiskHub onMenu={onMenu} />;
        case 'stress': return <FinRiskHub onMenu={onMenu} initialView="stress" />;
        case 'protection': return <FinRiskHub onMenu={onMenu} initialView="protection" />;
        case 'strategy': return <FinStrategy onMenu={onMenu} />;
        case 'decisions': return <FinStrategy onMenu={onMenu} initialView="decisions" />;
        case 'month-close': return <FinMonthClose onMenu={onMenu} />;
        case 'evidence': return <FinMonthClose onMenu={onMenu} initialView="evidence" />;
        // Standalone screens (untouched).
        case 'debt-offset': return <FinDebtOffsetControl onMenu={onMenu} />;
        case 'investments': return <FinInvestmentDeployment onMenu={onMenu} />;
        case 'watches': return <FinWatches onMenu={onMenu} />;
        case 'property': return <FinPropertyPortfolio onMenu={onMenu} />;
        case 'conviction': return <FinConviction onMenu={onMenu} />;
        case 'kobe': return <FinKobe onMenu={onMenu} />;
        default: return <FinOverviewHub onMenu={onMenu} onNavigate={financialNavigate} />;
      }
    }
    if (domain === 'fitness') {
      const s = screen.slice('fitness:'.length);
      switch (s) {
        case 'dashboard': return <FitDashboard onMenu={onMenu} onNavigate={fitnessNavigate} />;
        case 'workout': return <FitWorkout onMenu={onMenu} onNavigate={fitnessNavigate} />;
        case 'programs': return <FitPrograms onMenu={onMenu} />;
        case 'history': return <FitHistory onMenu={onMenu} />;
        case 'exercises': return <FitExercises onMenu={onMenu} />;
        case 'cardio': return <FitCardio onMenu={onMenu} />;
        case 'nutrition': return <FitNutrition onMenu={onMenu} />;
        case 'body': return <FitBody onMenu={onMenu} />;
        case 'recovery': return <FitRecovery onMenu={onMenu} />;
        case 'sync': return <FitSync onMenu={onMenu} />;
        case 'kobe': return <FitKobe onMenu={onMenu} />;
        default: return <FitDashboard onMenu={onMenu} onNavigate={fitnessNavigate} />;
      }
    }
    if (domain === 'life') {
      const s = screen.slice('life:'.length);
      switch (s) {
        case 'dashboard': return <LifeDashboard onMenu={onMenu} onNavigate={lifeNavigate} />;
        case 'admin': return <LifeAdmin onMenu={onMenu} />;
        case 'obligations': return <LifeObligations onMenu={onMenu} />;
        default: return <LifeDashboard onMenu={onMenu} onNavigate={lifeNavigate} />;
      }
    }
    switch (screen) {
      case 'home': return <Home onMenu={onMenu} onNavigate={navigate} />;
      case 'dashboard': return <Dashboard onMenu={onMenu} onNavigate={navigate} />;
      case 'inbox': return <Inbox onMenu={onMenu} />;
      case 'projects': return <Projects onMenu={onMenu} initialSelectedId={focusId} />;
      case 'people': return <People onMenu={onMenu} initialSelectedId={focusId} />;
      case 'meetings': return <Meetings onMenu={onMenu} initialSelectedId={focusId} />;
      case 'notes': return <Notes onMenu={onMenu} />;
      case 'search': return <Search onMenu={onMenu} onNavigate={navigate} />;
      case 'settings': return <Settings onMenu={onMenu} email={email} onSignOut={signOut} />;
      // Retired screen ids (today/tasks/calendar/board/review/ace) fall through
      // to Home so stale deep links and old localStorage never dead-end.
      default: return <Home onMenu={onMenu} />;
    }
  };

  return (
    <div id="app" style={domain === 'financial' ? FINANCIAL_THEME_STYLE as CSSProperties : domain === 'life' ? LIFE_THEME_STYLE as CSSProperties : undefined}>
      {isOffline && (
        <div className="offline-banner">
          Offline{pendingCount > 0 ? ` — ${pendingCount} change${pendingCount === 1 ? '' : 's'} pending sync` : ''}
        </div>
      )}
      {!canEdit && domain === 'work' && (
        <div className="syncing-banner" style={{ background: 'var(--text2)' }}>👁 Read-only access — you can view but not edit this workspace</div>
      )}
      {!isOffline && isSyncing && (
        <div className="syncing-banner">Syncing…</div>
      )}
      {!isOffline && !isSyncing && pendingCount > 0 && (
        <div className="syncing-banner">{pendingCount} change{pendingCount === 1 ? '' : 's'} synced</div>
      )}
      {domainSyncError && (
        <div className="sync-error-banner">
          ⚠ {domainSyncError}
          <button className="sync-error-dismiss" onClick={clearDomainSyncError}>✕</button>
        </div>
      )}
      {inviteBanner && (
        <div className={`sync-error-banner${inviteBanner.startsWith('✓') ? ' sync-success-banner' : ''}`}>
          {inviteBanner}
        </div>
      )}
      <Sidebar domain={domain} onDomainChange={onDomainChange} current={screen} onNavigate={navigate} badges={badges} open={menuOpen} workspaceName={workspace?.name ?? null} />
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <div id="main">
        <Suspense fallback={<div className="screen-content" style={{ padding: 24, color: 'var(--text3)' }}>Loading…</div>}>
          {render()}
        </Suspense>
        {/* Global Capture — every Work screen gets the same one-tap capture */}
        {domain === 'work' && <GlobalCapture />}
      </div>
    </div>
  );
}
