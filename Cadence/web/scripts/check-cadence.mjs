import { readFileSync, existsSync } from 'node:fs';
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
assert(!workflow.includes('@v4'), 'Cadence web workflow must not use Node 20-era @v4 GitHub actions.');
assert(workflow.includes('actions/checkout@v7'), 'Cadence web workflow must use Node 24 checkout action.');
assert(workflow.includes('actions/setup-node@v6'), 'Cadence web workflow must use Node 24 setup-node action.');
assert(workflow.includes('actions/upload-artifact@v7'), 'Cadence web workflow must use Node 24 upload-artifact action.');

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
