import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('CI runs the canonical i18n npm script instead of the removed test path', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/test.yml', import.meta.url), 'utf8');
  expect(workflow).toMatch(/^\s*- run: npm run test:i18n\s*$/m);
  expect(workflow).not.toContain('i18n-tests/i18n-extra.test.cjs');
});
