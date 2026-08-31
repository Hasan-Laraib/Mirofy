      /* ============================================================
         Attribution — present by default, dismissible by the reader
         ============================================================ */

      Mirofy.attribution = (function () {
        var STORAGE_KEY = 'mirofy-attribution-dismissed';
        var root = document.getElementById('attribution');
        var text = document.getElementById('attribution-text');
        var dismiss = document.getElementById('btn-attribution-dismiss');

        // localStorage can throw (blocked cookies, sandboxed iframes, file://
        // in some browsers); the whole script element dies on an uncaught
        // error, so guard every access. A read that throws means "not
        // dismissed", which shows attribution rather than hiding it -- the
        // failure mode that keeps the artifact traceable.
        function readStored() {
          try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
        }
        function writeStored(value) {
          try { localStorage.setItem(STORAGE_KEY, value); } catch (_) {}
        }

        function show() {
          if (!root) return;
          root.hidden = false;
          document.documentElement.setAttribute('data-attribution', 'shown');
        }

        function hide(persist) {
          if (!root) return;
          root.hidden = true;
          document.documentElement.setAttribute('data-attribution', 'dismissed');
          if (persist) writeStored('1');
        }

        function init() {
          if (!root || !text) return;
          text.textContent = viewerText('viewer.attribution.footer');
          if (readStored() === '1') hide(false);
          else show();
          if (dismiss) {
            dismiss.addEventListener('click', function () { hide(true); });
          }
        }

        // Modules here self-initialise; the return value is for tests and the
        // keyboard layer, not a caller that must remember to start it.
        init();

        return { init: init, show: show, hide: hide };
      })();
