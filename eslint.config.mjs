import js from '@eslint/js';

export default [
  {
    files: ['scripts/**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    files: ['src/functions/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        console: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      // Top-level function declarations are entry points called by TypingMind at runtime
      'no-unused-vars': ['error', { vars: 'local', args: 'none' }],
    },
  },
];
