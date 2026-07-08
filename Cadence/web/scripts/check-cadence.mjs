import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const login = read('src/components/Login.tsx');
assert(!login.includes('rbalech@gmail.com'), 'Login must not hardcode a personal email.');
assert(login.includes('type="email"'), 'Login must expose an email field.');

const css = read('src/styles.css');
assert(css.includes('input[type=password]'), 'Password inputs must use the same field styling as other inputs.');

const vercelConfig = read('vercel.json');
for (const header of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'X-Frame-Options']) {
  assert(vercelConfig.includes(header), `vercel.json must set ${header}.`);
}

const workflow = read('../../.github/workflows/cadence-web.yml');
const productionWatchdog = read('../../.github/workflows/cadence-production-watchdog.yml');
const dependabot = read('../../.github/dependabot.yml');
assert(!workflow.includes('@v4'), 'Cadence web workflow must not use Node 20-era @v4 GitHub actions.');
assert(workflow.includes('actions/checkout@v7'), 'Cadence web workflow must use Node 24 checkout action.');
assert(workflow.includes('actions/setup-node@v6'), 'Cadence web workflow must use Node 24 setup-node action.');
assert(workflow.includes('actions/upload-artifact@v7'), 'Cadence web workflow must use Node 24 upload-artifact action.');

// Guard the production smoke automation so it cannot silently disappear from
// the workflow. This CI job runs after `ci` on main pushes and verifies prod.
assert(workflow.includes('prod-smoke:'), 'Cadence web workflow must define the prod-smoke job.');
assert(workflow.includes('npm run smoke:prod'), 'prod-smoke job must run the production smoke check (npm run smoke:prod).');
assert(workflow.includes('--expected-commit="$GITHUB_SHA"'), 'prod-smoke job must require production to reach the pushed commit.');
assert(workflow.includes('for attempt in {1..30}'), 'prod-smoke job must poll for Vercel production deploy readiness.');
assert(workflow.includes('needs: ci'), 'prod-smoke job must run after the ci job (needs: ci).');
assert(
  workflow.includes("github.event_name == 'push' && github.ref == 'refs/heads/main'"),
  'prod-smoke job must be gated to pushes on main.',
);
assert(read('package.json').includes('"audit:security"'), 'package.json must expose a security audit script.');
assert(workflow.includes('npm run audit:security'), 'Cadence web workflow must run npm audit security gate.');
assert(productionWatchdog.includes('schedule:'), 'Cadence production watchdog must run on a schedule.');
assert(productionWatchdog.includes('workflow_dispatch:'), 'Cadence production watchdog must be manually runnable.');
assert(productionWatchdog.includes('npm run smoke:prod'), 'Cadence production watchdog must run the production smoke check.');
assert(!productionWatchdog.includes('--expected-commit'), 'Scheduled production watchdog must not require a specific deploy commit.');
assert(productionWatchdog.includes('actions/checkout@v7'), 'Cadence production watchdog must use Node 24 checkout action.');
assert(productionWatchdog.includes('actions/setup-node@v6'), 'Cadence production watchdog must use Node 24 setup-node action.');
assert(workflow.includes("'.github/dependabot.yml'"), 'Cadence web workflow push paths must include Dependabot config changes.');
assert(dependabot.includes('version: 2'), 'Dependabot config must use version 2.');
assert(dependabot.includes('package-ecosystem: npm') && dependabot.includes('directory: /Cadence/web'), 'Dependabot must monitor active Cadence web npm dependencies.');
assert(dependabot.includes('package-ecosystem: github-actions') && dependabot.includes('directory: /'), 'Dependabot must monitor GitHub Actions at repo root.');
assert(dependabot.includes('open-pull-requests-limit'), 'Dependabot config must cap open pull requests.');
assert(dependabot.includes('dependency-type: production'), 'Dependabot npm updates must group production dependencies.');
assert(dependabot.includes('dependency-type: development'), 'Dependabot npm updates must group development dependencies.');
assert(!dependabot.includes('CadenceFinancial') && !dependabot.includes('CadenceFitness'), 'Dependabot must not monitor superseded legacy Cadence apps.');

const viteConfig = read('vite.config.ts');
assert(viteConfig.includes('__BUILD_COMMIT__'), 'vite.config must inject __BUILD_COMMIT__ for deploy provenance.');
assert(read('src/main.tsx').includes('release: __BUILD_COMMIT__'), 'Sentry.init must tag errors with the deploy release.');
assert(read('src/vite-env.d.ts').includes('__BUILD_COMMIT__'), 'vite-env.d.ts must declare __BUILD_COMMIT__.');
assert(read('tsconfig.json').includes('"api"'), 'typecheck must include Vercel API functions.');
assert(read('package.json').includes('eslint src api'), 'lint must include Vercel API functions.');
assert(read('package.json').includes('smoke:prod'), 'package.json must expose production smoke checks.');
assert(read('eslint.config.js').includes("'api/**/*.ts'"), 'ESLint config must cover api/**/*.ts.');
assert(existsSync(join(root, 'api/health.ts')), 'api/health.ts must expose deploy provenance.');
const healthApi = read('api/health.ts');
assert(healthApi.includes("Cache-Control', 'no-store'"), 'api/health.ts must disable caching.');
assert(healthApi.includes('VERCEL_GIT_COMMIT_SHA') && healthApi.includes('VERCEL_ENV'), 'api/health.ts must return deploy commit and environment.');
assert(!/SUPABASE|SERVICE_ROLE|PASSWORD|SECRET|TOKEN/.test(healthApi), 'api/health.ts must not reference secrets or data backends.');

const e2eFixture = read('e2e/fixtures.ts');
assert(e2eFixture.includes("message.type()"), 'E2E fixture must inspect browser console message types.');
assert(e2eFixture.includes("type !== 'error' && type !== 'warning'"), 'E2E fixture must fail on console errors and warnings.');
assert(e2eFixture.includes("page.on('pageerror'"), 'E2E fixture must fail on browser page errors.');
for (const spec of readdirSync(join(root, 'e2e')).filter((name) => name.endsWith('.spec.ts'))) {
  const source = read(`e2e/${spec}`);
  assert(source.includes("from './fixtures'"), `${spec} must use the shared E2E browser-error guard fixture.`);
  assert(!source.includes("from '@playwright/test'"), `${spec} must not bypass the shared E2E browser-error guard fixture.`);
}

const inviteMigration = read('../backend/migrations/0015_workspace_invites.sql');
assert(!inviteMigration.includes('for select using (true)'), 'workspace_invites SELECT must not publicly expose invite tokens.');
assert(inviteMigration.includes("cadence_workspace_access(workspace_id, 'admin')"), 'workspace_invites SELECT must be admin-scoped.');

// Screens currently wired into the app. Decisions/Outbox were consolidated into
// other surfaces; Dashboard/Horizon/Board are the cockpit additions.
const SCREENS = [
  'Dashboard', 'Today', 'Horizon', 'Board', 'Tasks', 'Inbox',
  'Projects', 'People', 'Meetings', 'Notes', 'Review',
];

const app = read('src/App.tsx');
for (const screen of SCREENS) {
  assert(app.includes(`<${screen}`), `App must route to ${screen}, not a placeholder.`);
}

for (const screen of SCREENS) {
  const file = `src/screens/${screen}.tsx`;
  assert(existsSync(join(root, file)), `${file} must exist.`);
}

console.log('Cadence checks passed');
