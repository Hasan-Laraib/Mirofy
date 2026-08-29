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
  {
    files: ['packages/viewer/src/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        location: 'readonly', localStorage: 'readonly', console: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        getComputedStyle: 'readonly', matchMedia: 'readonly',
        Blob: 'readonly', URL: 'readonly', Image: 'readonly',
        XMLSerializer: 'readonly', MutationObserver: 'readonly',
        ResizeObserver: 'readonly', IntersectionObserver: 'readonly',
        fetch: 'readonly', Promise: 'readonly', CustomEvent: 'readonly',
        Mirofy: 'writable', mirofyI18nData: 'writable',
        viewerText: 'readonly', viewerCount: 'readonly',
        viewerKindLabel: 'readonly', hasDrawableGeometry: 'readonly',
        URLSearchParams: 'readonly', MediaRecorder: 'readonly',
        HTMLCanvasElement: 'readonly', performance: 'readonly',
        alert: 'readonly', ClipboardItem: 'readonly',
        Set: 'readonly', Node: 'readonly', history: 'readonly',
      },
    },
    rules: {
      // The modules share one script scope by design -- they are
      // concatenated into a single <script>, not loaded as ES modules. So
      // no-implicit-globals and no-unused-vars would both fire on correct
      // code (a global defined in 01-preamble and read in 07-focus). What
      // is still worth catching is a genuine typo referencing something
      // no module defines.
      //
      // Flat config merges `rules` by key across every config object whose
      // `files` matches, rather than the later object replacing the
      // earlier one wholesale -- so the first block's no-unused-vars and
      // no-implicit-globals still apply here unless explicitly turned off.
      'no-unused-vars': 'off',
      'no-implicit-globals': 'off',
      'no-undef': 'error',
    },
  },
];
