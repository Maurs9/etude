import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test-results/**',
      '.goals/**',
      'public/**',
      'tests/**',
      'etude.html',
      'src/legacy/app.js',
      'src/legacy/bridge.js',
      'sw.js',
      'scripts/sw-kill-switch.js',
      'i18n-framework/runtime.spec.cjs',
    ],
  },
  {
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: globals.node,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-dupe-keys': 'error',
    },
  },
];
