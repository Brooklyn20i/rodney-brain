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

const app = read('src/App.tsx');
for (const screen of ['Inbox', 'Projects', 'People', 'Decisions', 'Outbox', 'Notes', 'Review', 'Meetings', 'Tasks', 'Today']) {
  assert(app.includes(`<${screen}`), `App must route to ${screen}, not a placeholder.`);
}

for (const file of [
  'src/screens/Inbox.tsx',
  'src/screens/Projects.tsx',
  'src/screens/People.tsx',
  'src/screens/Decisions.tsx',
  'src/screens/Outbox.tsx',
  'src/screens/Notes.tsx',
  'src/screens/Review.tsx',
  'src/screens/Meetings.tsx',
  'src/screens/Tasks.tsx',
  'src/screens/Today.tsx',
]) {
  assert(existsSync(join(root, file)), `${file} must exist.`);
}

console.log('Cadence checks passed');
