
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
      /* One beacon builder for nodes and edges alike. Two implementations
         of the same marker would drift: the count, the marker text, the
         accessible label and the plate geometry all have to stay identical
         or the same evidence reads differently depending on what carries
         it. Only the anchor differs, and that is a parameter. */
      /* `labelKey` differs for edges: the node string says "focus this
         node to inspect", which is simply untrue when the beacon sits on
         a connection. Everything else about the marker is shared. */
      function buildBeacon(count, labelKey) {
        var label = viewerCount(labelKey, count);
        var beacon = document.createElementNS(svgNamespace, 'g');
        beacon.classList.add('source-evidence-beacon');
        beacon.setAttribute('data-source-evidence-beacon', '');
        beacon.setAttribute('aria-hidden', 'true');
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
        return beacon;
      }

      function announce(element, count) {
        var originalLabel = element.getAttribute('aria-label') || '';
        element.setAttribute('data-source-evidence-count', String(count));
        element.setAttribute('data-source-evidence-original-label', originalLabel);
        element.setAttribute('aria-label', (originalLabel ? originalLabel + ', ' : '')
          + viewerCount('viewer.passport.sourceCount', count));
      }

      function boxOf(element) {
        var box;
        try { box = element.getBBox(); } catch (_) { return null; }
        if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y) || !Number.isFinite(box.width)) return null;
        return box;
      }

      function installNodeBeacons(svg) {
        var installed = 0;
        Array.prototype.forEach.call(svg.querySelectorAll('[data-node-id]'), function (node) {
          var id = node.getAttribute('data-node-id');
          var sources = payload.nodes[id];
          if (!Array.isArray(sources) || !sources.length || node.querySelector('[data-source-evidence-beacon]')) return;
          var shape = node.querySelector('[data-animate="node"]') || node.querySelector('[class*="c-"]');
          var box = boxOf(shape || node);
          if (!box || box.width < 36) return;

          var count = sources.length;
          var beacon = buildBeacon(count, 'viewer.passport.beacon');
          var brandOffset = node.hasAttribute('data-node-brand') ? 24 : 0;
          beacon.setAttribute('transform', 'translate(' + (box.x + box.width - 35 - brandOffset) + ' ' + (box.y + 5) + ')');
          node.appendChild(beacon);
          announce(node, count);
          installed += 1;
        });
        return installed;
      }

      /* Edges are keyed by their index in the authored relationship array,
         which is what data-edge-key already carries (the fourth argument to
         focusEdgeAttrs) and what evidence resolution keys its edges map by.
         Keying on data-edge-id would reach only the edges that declare an
         id, and most authored relationships do not.

         An edge is drawn as more than one element -- typically a <path> and
         a <g data-detail="context"> sharing the key -- so the beacon goes on
         the group when there is one. A <path> cannot carry children at all,
         so when there is no group the beacon is appended to the path's
         parent and positioned from the path's own box. */
      function installEdgeBeacons(svg) {
        if (!payload.edges) return 0;
        var byKey = Object.create(null);
        Array.prototype.forEach.call(svg.querySelectorAll('[data-edge-key]'), function (element) {
          var key = element.getAttribute('data-edge-key');
          if (!key) return;
          (byKey[key] || (byKey[key] = [])).push(element);
        });

        var installed = 0;
        Object.keys(byKey).forEach(function (key) {
          var sources = payload.edges[key];
          if (!Array.isArray(sources) || !sources.length) return;
          var elements = byKey[key];
          var i;
          for (i = 0; i < elements.length; i += 1) {
            if (elements[i].querySelector && elements[i].querySelector('[data-source-evidence-beacon]')) return;
          }

          var anchor = null;
          var host = null;
          for (i = 0; i < elements.length; i += 1) {
            var box = boxOf(elements[i]);
            if (box && !anchor) anchor = box;
            if (!host && String(elements[i].tagName).toLowerCase() === 'g') host = elements[i];
          }
          if (!anchor) return;
          if (!host) host = elements[0].parentNode;
          if (!host || !host.appendChild) return;

          var count = sources.length;
          var beacon = buildBeacon(count, 'viewer.passport.beaconEdge');
          /* Centre of the edge's own box: the midpoint of the drawn route,
             which is where an edge label sits when it has one. */
          beacon.setAttribute('transform', 'translate(' + (anchor.x + (anchor.width / 2) - 15)
            + ' ' + (anchor.y + (anchor.height / 2) - 6) + ')');
          host.appendChild(beacon);
          for (i = 0; i < elements.length; i += 1) announce(elements[i], count);
          installed += 1;
        });
        return installed;
      }

      function installBeacons() {
        if (!payload) return 0;
        var svg = document.querySelector('.diagram-container svg');
        if (!svg) return 0;
        return installNodeBeacons(svg) + installEdgeBeacons(svg);
      }
      return {
        available: function () { return Boolean(payload); },
        repository: function () { return payload ? payload.repository : null; },
        node: function (id) {
          var sources = payload && payload.nodes ? payload.nodes[id] : null;
          return Array.isArray(sources) ? sources.slice() : [];
        },
        edge: function (key) {
          var sources = payload && payload.edges ? payload.edges[String(key)] : null;
          return Array.isArray(sources) ? sources.slice() : [];
        },
        /* How many citations the subject really has, when the document
           carries only the first few. Zero means "the list is complete",
           which is also what every artifact built before this existed
           reports -- so the passport falls back to saying nothing. */
        sourceTotal: function (id) {
          var totals = payload && payload.sourceTotals;
          var total = totals ? totals[id] : 0;
          return typeof total === 'number' ? total : 0;
        },
        installBeacons: installBeacons
      };
    })();
    Mirofy.sourceEvidence.installBeacons();

