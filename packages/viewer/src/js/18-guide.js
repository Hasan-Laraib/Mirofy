
    /* ============================================================
       Diagram Guide — a factual command deck over existing interactions.
       Counts come from compiled semantics; actions delegate to Finder, Route
       Probe, Semantic Radar, Semantic Lens, Story Trail, Presentation, theme, export, and
       camera without adding a second command implementation or SVG state.
       ============================================================ */
    Mirofy.guide = (function () {
      var html = document.documentElement;
      var container = document.querySelector('.diagram-container');
      var svg = container.querySelector(':scope > svg');
      var trigger = document.getElementById('btn-diagram-guide');
      var panel = document.getElementById('diagram-guide');
      var closeBtn = document.getElementById('diagram-guide-close');
      var stats = document.getElementById('diagram-guide-stats');
      var actions = document.getElementById('diagram-guide-actions');
      var feedback = document.getElementById('diagram-guide-feedback');
      var storyBtn = actions.querySelector('[data-guide-action="story"]');
      var storyCopy = document.getElementById('diagram-guide-story-copy');
      var routePanel = document.getElementById('route-probe');

      function viewCount() {
        return Mirofy.guidedViews && Number(Mirofy.guidedViews.count) || 0;
      }
      function relationshipCount() {
        var seen = {};
        Array.prototype.forEach.call(svg.querySelectorAll('[data-edge-from][data-edge-to]'), function (edge) {
          var key = edge.getAttribute('data-edge-key') || [
            edge.getAttribute('data-edge-from'),
            edge.getAttribute('data-edge-to'),
            edge.getAttribute('data-edge-label') || ''
          ].join('\u0000');
          seen[key] = true;
        });
        return Object.keys(seen).length;
      }
      function renderFacts() {
        var nodes = svg.querySelectorAll('[data-node-id]').length;
        var relationships = relationshipCount();
        var views = viewCount();
        stats.textContent = viewerText('viewer.guide.facts', {
          nodes: viewerCount('viewer.guide.fact.node', nodes),
          relationships: viewerCount('viewer.guide.fact.relationship', relationships),
          views: viewerCount('viewer.guide.fact.view', views)
        });
        storyBtn.disabled = views === 0;
        storyBtn.setAttribute('aria-disabled', views === 0 ? 'true' : 'false');
        storyCopy.textContent = views
          ? viewerCount('viewer.guide.story.available', views)
          : viewerText('viewer.guide.story.unavailable');
      }
      function actionButtons() {
        return Array.prototype.slice.call(actions.querySelectorAll('.diagram-guide-action:not(:disabled)'));
      }
      function close(options) {
        options = options || {};
        panel.hidden = true;
        html.removeAttribute('data-guide-open');
        routePanel.removeAttribute('data-guide-open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-label', viewerText('viewer.guide.open'));
        feedback.textContent = '';
        if (options.restoreFocus !== false) trigger.focus();
        return false;
      }
      function open() {
        if (html.getAttribute('data-embed') === 'true') return false;
        if (Mirofy.semanticLens && typeof Mirofy.semanticLens.clearPreview === 'function') Mirofy.semanticLens.clearPreview();
        if (Mirofy.exportMenu && Mirofy.exportMenu.isOpen()) Mirofy.exportMenu.close(false);
        if (Mirofy.finder && Mirofy.finder.isOpen()) Mirofy.finder.close({ restoreFocus: false });
        if (Mirofy.radar && Mirofy.radar.isOpen()) Mirofy.radar.close({ restoreFocus: false });
        if (Mirofy.semanticLens && Mirofy.semanticLens.isOpen()) Mirofy.semanticLens.close({ restoreFocus: false });
        if (Mirofy.guidedViews && Mirofy.guidedViews.isPlaying && Mirofy.guidedViews.isPlaying()) {
          Mirofy.guidedViews.pause();
        }
        if (Mirofy.routeProbe && Mirofy.routeProbe.isJourneyPlaying && Mirofy.routeProbe.isJourneyPlaying()) {
          Mirofy.routeProbe.pauseJourney({ preserveElapsed: true, reason: 'guide' });
        }
        renderFacts();
        panel.hidden = false;
        html.setAttribute('data-guide-open', 'true');
        routePanel.setAttribute('data-guide-open', 'true');
        trigger.setAttribute('aria-expanded', 'true');
        trigger.setAttribute('aria-label', viewerText('viewer.guide.close'));
        feedback.textContent = '';
        requestAnimationFrame(function () {
          var first = actionButtons()[0];
          if (first) first.focus();
        });
        return true;
      }
      function toggle() { return panel.hidden ? open() : close(); }
      function execute(action) {
        feedback.textContent = '';
        if (action === 'story' && !viewCount()) {
          feedback.textContent = viewerText('viewer.guide.noStory');
          return false;
        }
        close({ restoreFocus: false });
        if (action === 'find') return Mirofy.finder.open();
        if (action === 'route') return Mirofy.routeProbe.begin({ focusNode: true });
        if (action === 'map') return Mirofy.radar.open();
        if (action === 'lens') return Mirofy.semanticLens.open();
        if (action === 'story') return Mirofy.guidedViews.play();
        if (action === 'present') return Mirofy.presentation.enter();
        if (action === 'export') return Mirofy.exportMenu.open();
        if (action === 'theme') return Mirofy.theme.toggle();
        if (action === 'preset') return Mirofy.preset.cycle();
        if (action === 'reset') return Mirofy.view.reset();
        if (action === 'zoom-in') return Mirofy.view.zoomIn();
        if (action === 'zoom-out') return Mirofy.view.zoomOut();
        return false;
      }
      function actionForKey(key) {
        return {
          '/': 'find',
          r: 'route',
          m: 'map',
          l: 'lens',
          p: 'story',
          f: 'present',
          e: 'export',
          t: 'theme',
          s: 'preset',
          '0': 'reset',
          '+': 'zoom-in',
          '=': 'zoom-in',
          '-': 'zoom-out'
        }[key] || null;
      }

      trigger.addEventListener('click', toggle);
      closeBtn.addEventListener('click', function () { close(); });
      actions.addEventListener('click', function (event) {
        var button = event.target.closest('[data-guide-action]');
        if (!button || button.disabled) return;
        event.stopPropagation();
        execute(button.getAttribute('data-guide-action'));
      });
      panel.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' || event.key === '?') {
          event.preventDefault();
          event.stopPropagation();
          close();
          return;
        }
        var buttons = actionButtons();
        var index = buttons.indexOf(document.activeElement);
        var next = null;
        if (index >= 0 && event.key === 'ArrowRight') next = (index + 1) % buttons.length;
        else if (index >= 0 && event.key === 'ArrowDown') next = (index + 1) % buttons.length;
        else if (index >= 0 && event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
        else if (index >= 0 && event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
        else if (event.key === 'Home' && buttons.length) next = 0;
        else if (event.key === 'End' && buttons.length) next = buttons.length - 1;
        if (next !== null) {
          event.preventDefault();
          event.stopPropagation();
          buttons[next].focus();
          return;
        }
        var action = actionForKey(event.key.length === 1 ? event.key.toLowerCase() : event.key);
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        execute(action);
      });
      document.addEventListener('click', function (event) {
        if (!panel.hidden && !panel.contains(event.target) && event.target !== trigger) close({ restoreFocus: false });
      });

      renderFacts();
      return {
        open: open,
        close: close,
        toggle: toggle,
        execute: execute,
        isOpen: function () { return !panel.hidden; },
        facts: function () {
          return {
            nodes: svg.querySelectorAll('[data-node-id]').length,
            relationships: relationshipCount(),
            views: viewCount()
          };
        }
      };
    })();
