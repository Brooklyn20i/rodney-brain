import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('queued Work save feedback', () => {
  it('never labels remaining queued changes as synced', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).toContain("change{pendingCount === 1 ? '' : 's'} pending sync");
    expect(app).not.toContain("change{pendingCount === 1 ? '' : 's'} synced");
  });
});
