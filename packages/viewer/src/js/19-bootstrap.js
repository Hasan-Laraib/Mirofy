
    /* ============================================================
       Global keyboard shortcuts
       ? -> open Diagram Guide
       T -> toggle theme
       S -> cycle visual style
       E -> open export menu
         F -> toggle presentation stage
         M -> toggle Semantic Radar
         L -> toggle Semantic Lens
         R -> start/clear Route Probe
         / -> open node finder or the active route endpoint picker
         + / - -> zoom, 0 -> reset view
         Escape -> clear temporary trace/focus/view first, then exit presentation
       Ignored when focus is inside an input/textarea/contenteditable.
       ============================================================ */
    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.defaultPrevented) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (Mirofy.preset && Mirofy.preset.isOpen() && e.key !== 'Escape' && e.key !== 's' && e.key !== 'S') {
        Mirofy.preset.close(false);
      }
      if (e.key === '?') {
        e.preventDefault();
        Mirofy.guide.toggle();
      } else if (e.key === '/') {
        e.preventDefault();
        Mirofy.finder.open();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        Mirofy.theme.toggle();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        Mirofy.preset.cycle();
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        if (!Mirofy.exportMenu.isOpen()) Mirofy.exportMenu.open();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        Mirofy.presentation.toggle();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        Mirofy.radar.toggle();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        Mirofy.semanticLens.toggle();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        Mirofy.routeProbe.toggle({ focusNode: true });
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        Mirofy.view.zoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        Mirofy.view.zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        Mirofy.view.reset();
      } else if (e.key === 'Escape' && Mirofy.preset.isOpen()) {
        e.preventDefault();
        Mirofy.preset.close(true);
      } else if (e.key === 'Escape' && Mirofy.semanticLens.isOpen()) {
        e.preventDefault();
        Mirofy.semanticLens.close({ restoreFocus: true });
      } else if (e.key === 'Escape' && Mirofy.semanticLens.active()) {
        e.preventDefault();
        Mirofy.semanticLens.clear({ preserveView: true });
      } else if (e.key === 'Escape' && Mirofy.guide.isOpen()) {
        e.preventDefault();
        Mirofy.guide.close({ restoreFocus: true });
      } else if (e.key === 'Escape' && Mirofy.radar.isOpen()) {
        e.preventDefault();
        Mirofy.radar.close({ restoreFocus: true });
      } else if (e.key === 'Escape' && Mirofy.routeProbe.active()) {
        e.preventDefault();
        Mirofy.routeProbe.escape({ restoreFocus: true });
      } else if (e.key === 'Escape' && Mirofy.intentTrace.active()) {
        e.preventDefault();
        Mirofy.intentTrace.clear();
      } else if (e.key === 'Escape' && Mirofy.focus.active()) {
        e.preventDefault();
        Mirofy.focus.clear({ restoreFocus: true });
      } else if (e.key === 'Escape' && Mirofy.presentation.active()) {
        e.preventDefault();
        Mirofy.presentation.exit();
      }
    });
