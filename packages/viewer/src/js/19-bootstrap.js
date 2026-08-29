
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
      if (Archify.preset && Archify.preset.isOpen() && e.key !== 'Escape' && e.key !== 's' && e.key !== 'S') {
        Archify.preset.close(false);
      }
      if (e.key === '?') {
        e.preventDefault();
        Archify.guide.toggle();
      } else if (e.key === '/') {
        e.preventDefault();
        Archify.finder.open();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        Archify.theme.toggle();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        Archify.preset.cycle();
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        if (!Archify.exportMenu.isOpen()) Archify.exportMenu.open();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        Archify.presentation.toggle();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        Archify.radar.toggle();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        Archify.semanticLens.toggle();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        Archify.routeProbe.toggle({ focusNode: true });
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        Archify.view.zoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        Archify.view.zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        Archify.view.reset();
      } else if (e.key === 'Escape' && Archify.preset.isOpen()) {
        e.preventDefault();
        Archify.preset.close(true);
      } else if (e.key === 'Escape' && Archify.semanticLens.isOpen()) {
        e.preventDefault();
        Archify.semanticLens.close({ restoreFocus: true });
      } else if (e.key === 'Escape' && Archify.semanticLens.active()) {
        e.preventDefault();
        Archify.semanticLens.clear({ preserveView: true });
      } else if (e.key === 'Escape' && Archify.guide.isOpen()) {
        e.preventDefault();
        Archify.guide.close({ restoreFocus: true });
      } else if (e.key === 'Escape' && Archify.radar.isOpen()) {
        e.preventDefault();
        Archify.radar.close({ restoreFocus: true });
      } else if (e.key === 'Escape' && Archify.routeProbe.active()) {
        e.preventDefault();
        Archify.routeProbe.escape({ restoreFocus: true });
      } else if (e.key === 'Escape' && Archify.intentTrace.active()) {
        e.preventDefault();
        Archify.intentTrace.clear();
      } else if (e.key === 'Escape' && Archify.focus.active()) {
        e.preventDefault();
        Archify.focus.clear({ restoreFocus: true });
      } else if (e.key === 'Escape' && Archify.presentation.active()) {
        e.preventDefault();
        Archify.presentation.exit();
      }
    });
