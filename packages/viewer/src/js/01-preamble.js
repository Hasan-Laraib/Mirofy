    var Mirofy = {};
    var mirofyI18nData = (function () {
      var node = document.getElementById('mirofy-i18n-data');
      try { return JSON.parse(node ? node.textContent : '{}'); }
      catch (_) { return { locale: 'en', messages: {} }; }
    })();
    Mirofy.locale = mirofyI18nData.locale || 'en';

    function viewerText(key, values) {
      var messages = mirofyI18nData.messages || {};
      var template = Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : key;
      return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, name) {
        return values && Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match;
      });
    }

    function viewerCount(key, count, values) {
      var suffix = Number(count) === 1 ? '.one' : '.other';
      var payload = Object.assign({}, values || {}, { count: count });
      return viewerText(key + suffix, payload);
    }

    function viewerKindLabel(value) {
      var normalized = String(value || 'node').toLowerCase();
      var knownKey = 'viewer.kind.' + normalized;
      var known = viewerText(knownKey);
      if (known !== knownKey) return known;
      return normalized
        .replace(/messagebus/gi, 'message bus')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
    }

    function hasDrawableGeometry(element) {
      if (!element) return false;
      var geometries = /^(path|line|polyline)$/i.test(element.tagName)
        ? [element]
        : Array.prototype.slice.call(element.querySelectorAll('path, line, polyline'));
      return geometries.some(function (geometry) {
        var source = geometry.tagName.toLowerCase() === 'path'
          ? geometry.getAttribute('d')
          : geometry.tagName.toLowerCase() === 'polyline'
            ? geometry.getAttribute('points')
            : [geometry.getAttribute('x1'), geometry.getAttribute('y1'), geometry.getAttribute('x2'), geometry.getAttribute('y2')].join(' ');
        if (!source || /(?:^|[^a-z])(?:nan|infinity)(?:[^a-z]|$)/i.test(source) || typeof geometry.getTotalLength !== 'function') return false;
        try {
          var length = Number(geometry.getTotalLength());
          return Number.isFinite(length) && length > 0;
        } catch (_) {
          return false;
        }
      });
    }

    /* ============================================================
       Visual style try-on — one topology, four bundled presets.
       The reader's choice is intentionally session-only: it updates the
       live page and canonical SVG together, but never rewrites the source,
       URL, or a later diagram's authored default.
       ============================================================ */
