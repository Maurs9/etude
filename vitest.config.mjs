import { mkdirSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

if (process.env.GITHUB_ACTIONS === 'true') {
  mkdirSync('i18n-tests', { recursive: true });
  writeFileSync('i18n-tests/i18n-extra.test.cjs', "require('../i18n/tests/i18n-extra.test.cjs');\n");
}

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.mjs'],
    environment: 'node',
  },
});
