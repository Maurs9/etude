import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';

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
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'import-x': importX,
    },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-useless-assignment': 'off',
      'no-func-assign': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-dupe-keys': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'event', message: 'Use an explicitly typed event parameter.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'anLayoutVars',
          message: 'Use the local typed layout function, not an app global.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/legacy/**'], message: 'Legacy runtime modules are not allowed.' },
            { group: ['./views', './views.*'], message: 'Domain modules must not depend on the view runtime.' },
          ],
        },
      ],
      'import-x/no-cycle': ['error', { maxDepth: Infinity }],
    },
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'import-x': importX,
    },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-useless-assignment': 'off',
      'no-func-assign': 'off',
      'no-dupe-keys': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/legacy/**'], message: 'Legacy runtime modules are not allowed.' },
            { group: ['../domain/views', '../domain/views.*'], message: 'Locale modules cannot depend on views.' },
          ],
        },
      ],
      'import-x/no-cycle': ['error', { maxDepth: Infinity }],
    },
  },
  {
    files: ['src/domain/theory.ts', 'src/domain/router.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['./audio', './audio.*', './storage', './storage.*', './notation', './notation.*', './views', './views.*'], message: 'Pure domain modules must not depend on browser or view domains.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Pure domain code must be browser-independent.' },
        { name: 'document', message: 'Pure domain code must be browser-independent.' },
        { name: 'localStorage', message: 'Pure domain code must be browser-independent.' },
      ],
    },
  },
  {
    files: ['src/domain/storage.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Storage receives an explicit storage adapter.' },
        { name: 'document', message: 'Storage receives an explicit storage adapter.' },
      ],
    },
  },
  {
    files: ['src/domain/audio.ts', 'src/domain/notation.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['./views', './views.*'], message: 'Infrastructure domains must not depend on the view runtime.' },
          ],
        },
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
