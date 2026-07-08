import { test as base, expect, type Page } from '@playwright/test';

const ignoredConsoleMessages: RegExp[] = [
  // Add only narrowly-scoped, browser-generated noise here with a ticket/reference.
];

function isIgnoredConsoleMessage(text: string) {
  return ignoredConsoleMessages.some((pattern) => pattern.test(text));
}

export const test = base.extend<{ browserErrorGuard: void }>({
  browserErrorGuard: [async ({ page }, use) => {
    const failures: string[] = [];

    page.on('console', (message) => {
      const type = message.type();
      if (type !== 'error' && type !== 'warning') return;

      const text = message.text();
      if (isIgnoredConsoleMessage(text)) return;

      failures.push(`console.${type}: ${text}`);
    });

    page.on('pageerror', (error) => {
      failures.push(`pageerror: ${error.message}`);
    });

    await use();

    expect(failures, 'unexpected browser console warnings/errors or page errors').toEqual([]);
  }, { auto: true }],
});

export { expect };
export type { Page };
