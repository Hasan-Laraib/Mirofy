
    /* Verified repository evidence is emitted only after the renderer checks
       the authored GitHub revision, source blobs, and optional line ranges
       against the explicit --repo-root. It remains outside the SVG so every
       canonical visual export stays free of repository paths. */
    Mirofy.sourceEvidence = (function () {
      var element = document.getElementById('mirofy-source-evidence-data');
      var payload = null;
      var svgNamespace = 'http://www.w3.org/2000/svg';
      if (element) {
        try {
          var parsed = JSON.parse(element.textContent || 'null');
          if (parsed && parsed.verified === true && parsed.repository && parsed.nodes) payload = parsed;
        } catch (_) {}
      }
      function installBeacons() {
        if (!payload) return 0;
        var svg = document.querySelector('.diagram-container svg');
        if (!svg) return 0;
        var installed = 0;
        Array.prototype.forEach.call(svg.querySelectorAll('[data-node-id]'), function (node) {
          var id = node.getAttribute('data-node-id');
          var sources = payload.nodes[id];
          if (!Array.isArray(sources) || !sources.length || node.querySelector('[data-source-evidence-beacon]')) return;
          var shape = node.querySelector('[data-animate="node"]') || node.querySelector('[class*="c-"]');
          var box;
          try { box = (shape || node).getBBox(); } catch (_) { return; }
          if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y) || !Number.isFinite(box.width) || box.width < 36) return;

          var count = sources.length;
          var label = viewerCount('viewer.passport.beacon', count);
          var beacon = document.createElementNS(svgNamespace, 'g');
          beacon.classList.add('source-evidence-beacon');
          beacon.setAttribute('data-source-evidence-beacon', '');
          beacon.setAttribute('aria-hidden', 'true');
          var brandOffset = node.hasAttribute('data-node-brand') ? 24 : 0;
          beacon.setAttribute('transform', 'translate(' + (box.x + box.width - 35 - brandOffset) + ' ' + (box.y + 5) + ')');
          var title = document.createElementNS(svgNamespace, 'title');
          title.textContent = label;
          var plate = document.createElementNS(svgNamespace, 'rect');
          plate.setAttribute('width', '30');
          plate.setAttribute('height', '12');
          plate.setAttribute('rx', '6');
          var text = document.createElementNS(svgNamespace, 'text');
          text.setAttribute('x', '15');
          text.setAttribute('y', '8.25');
          text.textContent = viewerText('viewer.passport.sourceMarker') + ' ' + count;
          beacon.appendChild(title);
          beacon.appendChild(plate);
          beacon.appendChild(text);
          node.appendChild(beacon);

          var originalLabel = node.getAttribute('aria-label') || '';
          node.setAttribute('data-source-evidence-count', String(count));
          node.setAttribute('data-source-evidence-original-label', originalLabel);
          node.setAttribute('aria-label', (originalLabel ? originalLabel + ', ' : '') + viewerCount('viewer.passport.sourceCount', count));
          installed += 1;
        });
        return installed;
      }
      return {
        available: function () { return Boolean(payload); },
        repository: function () { return payload ? payload.repository : null; },
        node: function (id) {
          var sources = payload && payload.nodes ? payload.nodes[id] : null;
          return Array.isArray(sources) ? sources.slice() : [];
        },
        installBeacons: installBeacons
      };
    })();
    Mirofy.sourceEvidence.installBeacons();

