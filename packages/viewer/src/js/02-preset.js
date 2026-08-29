    Mirofy.preset = (function () {
      var PRESETS = ['classic', 'signal-flow', 'blueprint', 'editorial'];
      var LABELS = {
        classic: viewerText('viewer.preset.classic.short'),
        'signal-flow': viewerText('viewer.preset.flow.short'),
        blueprint: viewerText('viewer.preset.blueprint'),
        editorial: viewerText('viewer.preset.editorial')
      };
      var html = document.documentElement;
      var svg = document.querySelector('.diagram-container svg');
      var btn = document.getElementById('btn-preset');
      var label = document.getElementById('preset-label');
      var menu = document.getElementById('preset-menu');
      var options = function () {
        return Array.prototype.slice.call(menu.querySelectorAll('[data-preset-value]'));
      };
      var authored = PRESETS.indexOf(html.getAttribute('data-preset')) >= 0
        ? html.getAttribute('data-preset')
        : 'classic';

      function current() {
        var value = html.getAttribute('data-preset');
        return PRESETS.indexOf(value) >= 0 ? value : authored;
      }
      function nextAfter(preset) {
        return PRESETS[(PRESETS.indexOf(preset) + 1) % PRESETS.length];
      }
      function apply(preset) {
        if (html.getAttribute('data-embed') === 'true') return false;
        if (PRESETS.indexOf(preset) < 0) return false;
        html.setAttribute('data-preset', preset);
        svg.setAttribute('data-preset', preset);
        btn.setAttribute('data-preset-option', preset);
        label.textContent = LABELS[preset];
        btn.setAttribute('aria-label', viewerText('viewer.preset.current', { style: LABELS[preset] }));
        btn.title = viewerText('viewer.preset.choose.title');
        options().forEach(function (option) {
          var selected = option.getAttribute('data-preset-value') === preset;
          option.setAttribute('aria-checked', String(selected));
        });
        return true;
      }
      function cycle() { return apply(nextAfter(current())); }

      function isOpen() { return menu.classList.contains('open'); }
      function open(focusLast) {
        if (html.getAttribute('data-embed') === 'true') return false;
        if (Mirofy.exportMenu && Mirofy.exportMenu.isOpen()) Mirofy.exportMenu.close(false);
        menu.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        var available = options();
        var selected = available.find(function (option) { return option.getAttribute('aria-checked') === 'true'; });
        var target = focusLast ? available[available.length - 1] : (selected || available[0]);
        if (target) target.focus();
        return true;
      }
      function close(focusTrigger) {
        menu.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        if (focusTrigger) btn.focus();
        return false;
      }

      apply(authored);
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (isOpen()) close(false);
        else open(false);
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!isOpen()) open(e.key === 'ArrowUp');
        }
      });
      document.addEventListener('click', function (e) {
        if (!menu.contains(e.target) && e.target !== btn) close(false);
      });
      menu.addEventListener('click', function (e) {
        var option = e.target.closest('[data-preset-value]');
        if (!option || !menu.contains(option)) return;
        if (apply(option.getAttribute('data-preset-value'))) close(true);
      });
      menu.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
        if (e.key === 'Tab') { close(false); return; }
        var available = options();
        var active = available.indexOf(document.activeElement);
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            if (available.length) available[(active + 1 + available.length) % available.length].focus();
            break;
          case 'ArrowUp':
            e.preventDefault();
            if (available.length) available[(active - 1 + available.length) % available.length].focus();
            break;
          case 'Home':
            e.preventDefault();
            if (available[0]) available[0].focus();
            break;
          case 'End':
            e.preventDefault();
            if (available.length) available[available.length - 1].focus();
            break;
        }
      });
      return { cycle: cycle, apply: apply, current: current, authored: authored, open: open, close: close, isOpen: isOpen };
    })();
