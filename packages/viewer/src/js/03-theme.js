
    /* ============================================================
       Theme toggle — persists to localStorage, respects system pref
       ============================================================ */

    Archify.theme = (function () {
      var STORAGE_KEY = 'archify-theme';
      var html = document.documentElement;
      var btn = document.getElementById('btn-theme');
      var label = document.getElementById('theme-label');

      // localStorage can throw (blocked cookies, sandboxed iframes); the whole
      // script element dies on an uncaught error, so guard every access.
      function readStored() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
      }
      function writeStored(value) {
        try { localStorage.setItem(STORAGE_KEY, value); } catch (_) {}
      }
      function urlOverride() {
        // URL param wins (useful for deterministic screenshots / share links)
        try {
          var param = new URLSearchParams(window.location.search).get('theme');
          if (param === 'light' || param === 'dark') return param;
        } catch (_) {}
        return null;
      }

      function resolveInitial() {
        var fromUrl = urlOverride();
        if (fromUrl) return fromUrl;
        var saved = readStored();
        if (saved === 'light' || saved === 'dark') return saved;
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }

      function apply(theme) {
        html.setAttribute('data-theme', theme);
        label.textContent = viewerText(theme === 'dark' ? 'viewer.theme.dark' : 'viewer.theme.light');
        btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      }

      function toggle() {
        var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        apply(next);
        writeStored(next);
      }

      apply(resolveInitial());
      btn.addEventListener('click', toggle);

      // Follow live OS theme changes while the user has no explicit preference.
      try {
        var media = window.matchMedia('(prefers-color-scheme: light)');
        var onChange = function (e) {
          var saved = readStored();
          if (urlOverride() || saved === 'light' || saved === 'dark') return;
          apply(e.matches ? 'light' : 'dark');
        };
        if (media.addEventListener) media.addEventListener('change', onChange);
        else if (media.addListener) media.addListener(onChange);
      } catch (_) {}

      return { toggle: toggle };
    })();
