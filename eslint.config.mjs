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
      'no-restricted-properties': ['error',
        { object: 'window', property: 'anLayoutVars', message: 'Use the local typed layout function, not an app global.' },
      ],
    },
  },
  {
    files: ['src/**/*.js', 'scripts/**/*.mjs', 'vite.config.mjs'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: '../legacy/app.js', message: 'Import a typed domain module instead of the removed legacy runtime.' }],
        patterns: [{ group: ['**/legacy/**'], message: 'Legacy runtime modules are not allowed in application code.' }],
      }],
    },
  },
];
