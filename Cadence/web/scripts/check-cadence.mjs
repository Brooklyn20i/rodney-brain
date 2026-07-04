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

const inviteMigration = read('../backend/migrations/0015_workspace_invites.sql');
assert(!inviteMigration.includes('for select using (true)'), 'workspace_invites SELECT must not publicly expose invite tokens.');
assert(inviteMigration.includes("cadence_workspace_access(workspace_id, 'admin')"), 'workspace_invites SELECT must be admin-scoped.');
const combinedMigration = read('../backend/migrations/combined_0008_to_0015.sql');
assert(!combinedMigration.includes('workspace_invites_select on public.workspace_invites\n  for select using (true)'), 'combined migration must not publicly expose invite tokens.');

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
