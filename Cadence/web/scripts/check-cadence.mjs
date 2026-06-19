import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const login = read('src/components/Login.tsx');
assert(!login.includes('rbalech@gmail.com'), 'Login must not hardcode Rodney\'s personal email.');
assert(login.includes('type="email"'), 'Login must expose an email field.');
assert(login.includes('localStorage'), 'Login should remember only the last email, never a password.');

const css = read('src/styles.css');
assert(css.includes('input[type=password]'), 'Password inputs must use the same field styling as other inputs.');
assert(css.includes('.split-list'), 'Operational split-pane screens need shared styles.');

const app = read('src/App.tsx');
for (const screen of ['Inbox', 'Projects', 'People', 'Decisions', 'Outbox', 'Notes', 'Capture', 'WeeklyReview']) {
  assert(app.includes(`<${screen}`), `App must route to ${screen}, not a placeholder.`);
}

for (const file of [
  'src/screens/Inbox.tsx',
  'src/screens/Projects.tsx',
  'src/screens/People.tsx',
  'src/screens/Decisions.tsx',
  'src/screens/Outbox.tsx',
  'src/screens/Notes.tsx',
  'src/screens/Capture.tsx',
  'src/screens/WeeklyReview.tsx',
]) {
  assert(existsSync(join(root, file)), `${file} must exist.`);
}

const quickAdd = read('src/screens/QuickAdd.tsx');
assert(quickAdd.includes('person_id'), 'Quick Add must support person/follow-up assignment, not just projects.');
assert(quickAdd.includes('setErr'), 'Quick Add must surface save failures to the user.');

console.log('Cadence checks passed');
