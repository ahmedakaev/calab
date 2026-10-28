// The Calab host page of the ONLYOFFICE editor (ADR-0143). Served from the Document Server's own
// origin (next to its api.js), it runs inside the iframe the Calab client creates on «Открыть»:
// the Document Server's JS never runs in the Calab page (no third-party script next to the
// app's bridge, no CSP script-src exception), and removing the iframe on close drops all of it.
//
// Protocol (window.postMessage, every message { source: 'calab-office', type, ... }):
//   host → parent  hello                         ready for the configuration
//   parent → host  open { config }               the signed DocsAPI configuration
//   host → parent  event { name, data }          ready | state (true = unsaved changes) |
//                                                 error | warning | requestClose
//   parent → host  close                         destroy the editor, then answer
//   host → parent  closed
// Messages are accepted only from window.parent; the host learns nothing it could leak: the
// configuration it gets is signed for this one document and user.
(function (win) {
  'use strict';
  var doc = win.document;
  var SRC = 'calab-office';
  var editor = null;
  var opened = false;

  function post(msg) {
    msg.source = SRC;
    // Events carry no secrets (state flags, error codes): any parent origin may read them.
    win.parent.postMessage(msg, '*');
  }

  function event(name, data) {
    post({ type: 'event', name: name, data: data === undefined ? null : data });
  }

  function load(cb) {
    if (win.DocsAPI) return cb();
    var s = doc.createElement('script');
    s.src = win.CALAB_OFFICE_API || '/web-apps/apps/api/documents/api.js';
    s.onload = function () {
      cb();
    };
    s.onerror = function () {
      event('error', { code: 'api-load' });
    };
    doc.head.appendChild(s);
  }

  function open(config) {
    if (opened || !config || typeof config !== 'object') return;
    opened = true;
    load(function () {
      if (!win.DocsAPI || typeof win.DocsAPI.DocEditor !== 'function') {
        event('error', { code: 'api-missing' });
        return;
      }
      config.width = '100%';
      config.height = '100%';
      config.events = {
        // «ready» = the document is loaded and shown (onAppReady fires earlier, with the
        // editor's own «Загрузка…» still over an empty sheet).
        onDocumentReady: function () {
          event('ready');
        },
        onDocumentStateChange: function (e) {
          event('state', !!(e && e.data));
        },
        onRequestClose: function () {
          event('requestClose');
        },
        onError: function (e) {
          event('error', e && e.data ? { code: e.data.errorCode, text: e.data.errorDescription } : null);
        },
        onWarning: function (e) {
          event('warning', e && e.data ? { code: e.data.warningCode, text: e.data.warningDescription } : null);
        },
      };
      editor = new win.DocsAPI.DocEditor('calab-office-editor', config);
    });
  }

  function close() {
    if (editor && typeof editor.destroyEditor === 'function') {
      try {
        editor.destroyEditor();
      } catch (e) {
        // the iframe goes away anyway
      }
    }
    editor = null;
    post({ type: 'closed' });
  }

  win.addEventListener('message', function (e) {
    if (e.source !== win.parent) return;
    var m = e.data;
    if (!m || m.source !== SRC) return;
    if (m.type === 'open') open(m.config);
    else if (m.type === 'close') close();
  });

  post({ type: 'hello' });
})(window);
