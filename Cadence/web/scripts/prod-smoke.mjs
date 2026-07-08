#!/usr/bin/env node
import assert from 'node:assert/strict';

const args = new Set(process.argv.slice(2));
const baseFlag = process.argv.find((arg) => arg.startsWith('--base='));
const expectedCommitFlag = process.argv.find((arg) => arg.startsWith('--expected-commit='));
const base = (baseFlag ? baseFlag.split('=')[1] : process.env.CADENCE_BASE_URL) || 'https://cadence-agent.com';
const expectedCommitRaw = expectedCommitFlag ? expectedCommitFlag.split('=')[1] : process.env.CADENCE_EXPECTED_COMMIT;
const expectedCommit = expectedCommitRaw?.slice(0, 7);
const timeoutMs = Number(process.env.CADENCE_SMOKE_TIMEOUT_MS || 10_000);
const requireProduction = !args.has('--allow-preview') && process.env.CADENCE_ALLOW_PREVIEW !== '1';

const url = (path) => new URL(path, base).toString();

async function fetchText(path, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url(path), { redirect: 'manual', signal: controller.signal, ...init });
    const text = await res.text();
    return { res, text };
  } finally {
    clearTimeout(timer);
  }
}

function headerIncludes(res, name, expected) {
  const value = res.headers.get(name) || '';
  assert(
    value.toLowerCase().includes(expected.toLowerCase()),
    `${name} must include ${expected}; got ${JSON.stringify(value)}`,
  );
}

const healthResponse = await fetchText('/api/health');
assert.equal(healthResponse.res.status, 200, '/api/health must return 200');
headerIncludes(healthResponse.res, 'cache-control', 'no-store');
const health = JSON.parse(healthResponse.text);
assert.equal(health.ok, true, '/api/health ok must be true');
assert.match(health.commit, /^[0-9a-f]{7}$/, '/api/health commit must be a short SHA');
assert.match(health.ref, /^[\w./-]+$/, '/api/health ref must be present');
if (requireProduction) assert.equal(health.env, 'production', '/api/health must be production');
if (expectedCommit) assert.equal(health.commit, expectedCommit, '/api/health commit must match expected commit');

const requiredHeaders = [
  ['content-security-policy', "default-src 'self'"],
  ['x-content-type-options', 'nosniff'],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
  ['permissions-policy', 'camera=()'],
  ['x-frame-options', 'deny'],
];

const pages = [
  ['/', 'Cadence'],
  ['/work', 'Cadence Work'],
  ['/financial', 'Cadence Wealth'],
  ['/health', 'Cadence Health'],
  ['/tour/work', 'Work'],
  ['/tour/wealth', 'Wealth'],
  ['/tour/health', 'Health'],
  ['/kobe', 'Kobe'],
];

for (const [path, marker] of pages) {
  const { res, text } = await fetchText(path);
  assert.equal(res.status, 200, `${path} must return 200`);
  for (const [name, expected] of requiredHeaders) headerIncludes(res, name, expected);
  headerIncludes(res, 'content-type', 'text/html');
  assert(text.includes(marker), `${path} must include marker ${JSON.stringify(marker)}`);
}

const spa = await fetchText('/definitely-not-a-real-route');
assert.equal(spa.res.status, 200, 'SPA fallback route must return 200');
assert(spa.text.includes('Cadence'), 'SPA fallback route must return the app shell');

console.log(JSON.stringify({
  ok: true,
  base,
  commit: health.commit,
  ref: health.ref,
  env: health.env,
  pages: pages.map(([path]) => path),
}, null, 2));
