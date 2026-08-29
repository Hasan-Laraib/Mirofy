export default [
  {
    files: ['**/*.mjs', '**/*.js'],
    ignores: ['packages/core/**', 'node_modules/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        process: 'readonly', console: 'readonly', URL: 'readonly',
        fetch: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-implicit-globals': 'error',
    },
  },
];
