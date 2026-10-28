// A STUB of the Document Server's api.js for the visual harness (ADR-0143): it draws a fake
// spreadsheet / document so the Calab frame around the editor can be checked without a Document
// Server. It is NOT ONLYOFFICE: real-editor screenshots come from the Docker test plan.
(function (win) {
  'use strict';
  var THEMES = {
    'default-dark': { bg: '#2a2a2a', bar: '#404040', tab: '#333', fg: '#e8e8e8', muted: '#999', line: '#555', cell: '#1f1f1f', head: '#2f2f2f', accent: '#4a8df6' },
    'default-light': { bg: '#f7f7f7', bar: '#ffffff', tab: '#ececec', fg: '#222', muted: '#777', line: '#d0d0d0', cell: '#ffffff', head: '#f1f1f1', accent: '#2a6ad6' },
  };
  function el(tag, css, text) {
    var e = win.document.createElement(tag);
    e.style.cssText = css;
    if (text) e.textContent = text;
    return e;
  }
  function DocEditor(id, config) {
    var root = win.document.getElementById(id);
    var c = (config.editorConfig && config.editorConfig.customization) || {};
    var t = THEMES[c.uiTheme] || THEMES['default-dark'];
    var cell = config.documentType === 'cell';
    var edit = config.editorConfig && config.editorConfig.mode === 'edit';
    root.innerHTML = '';
    var wrap = el('div', 'display:flex;flex-direction:column;height:100%;font:12px/1.4 Arial,sans-serif;background:' + t.bg + ';color:' + t.fg);
    var tabs = el('div', 'display:flex;gap:18px;align-items:center;height:28px;padding:0 12px;background:' + t.tab + ';border-bottom:1px solid ' + t.line);
    (edit ? ['Файл', 'Главная', 'Вставка', 'Макет', 'Формула', 'Данные', 'Вид'] : ['Файл', 'Вид']).forEach(function (s, i) {
      tabs.appendChild(el('span', i === 1 ? 'color:' + t.accent + ';border-bottom:2px solid ' + t.accent + ';padding:5px 0' : 'color:' + t.fg, s));
    });
    wrap.appendChild(tabs);
    if (edit) {
      var tools = el('div', 'display:flex;gap:6px;align-items:center;height:36px;padding:0 12px;background:' + t.bar + ';border-bottom:1px solid ' + t.line);
      for (var k = 0; k < 18; k++) tools.appendChild(el('span', 'width:22px;height:18px;border-radius:3px;background:' + t.line));
      wrap.appendChild(tools);
    }
    var body = el('div', 'flex:1;overflow:hidden;position:relative;background:' + (cell ? t.cell : t.bg));
    if (cell) {
      var fx = el('div', 'height:24px;display:flex;align-items:center;gap:8px;padding:0 8px;border-bottom:1px solid ' + t.line + ';color:' + t.muted, 'B3   fx   =СУММ(B2:B9)');
      body.appendChild(fx);
      var grid = el('table', 'border-collapse:collapse;table-layout:fixed');
      var cols = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      var data = [['Сотрудник', 'Начало', 'Конец', 'Дней'], ['Анна', '01.07.2026', '14.07.2026', '14'], ['Борис', '15.07.2026', '28.07.2026', '14'], ['Вера', '03.08.2026', '16.08.2026', '14']];
      for (var r = 0; r < 26; r++) {
        var tr = el('tr', '');
        for (var ci = 0; ci < cols.length; ci++) {
          var head = r === 0 || ci === 0;
          var txt = r === 0 ? cols[ci] : ci === 0 ? String(r) : (data[r - 1] && data[r - 1][ci - 1]) || '';
          tr.appendChild(el('td', 'height:20px;width:' + (ci === 0 ? 36 : 86) + 'px;padding:0 4px;border:1px solid ' + t.line + ';white-space:nowrap;overflow:hidden;' + (head ? 'background:' + t.head + ';color:' + t.muted + ';text-align:center' : ''), txt));
        }
        grid.appendChild(tr);
      }
      body.appendChild(grid);
    } else {
      var page = el('div', 'width:560px;margin:24px auto;min-height:700px;background:#fff;color:#222;padding:56px 64px;box-shadow:0 1px 4px rgba(0,0,0,.3)');
      page.appendChild(el('div', 'font:bold 16px Arial;margin-bottom:12px;text-align:center', 'ЛИЦЕНЗИОННЫЙ ДОГОВОР № ___'));
      page.appendChild(el('p', '', 'г. Москва «___» ________ 2026 г.'));
      page.appendChild(el('p', '', '1. Предмет договора. Лицензиар предоставляет Лицензиату право использования программы для ЭВМ на условиях простой (неисключительной) лицензии.'));
      body.appendChild(page);
    }
    wrap.appendChild(body);
    var foot = el('div', 'height:24px;display:flex;align-items:center;gap:12px;padding:0 12px;background:' + t.tab + ';border-top:1px solid ' + t.line + ';color:' + t.muted, cell ? 'Лист1   Лист2' : 'Страница 1 из 3');
    foot.appendChild(el('span', 'margin-left:auto;color:#d33;font-weight:bold', 'STUB — не ONLYOFFICE'));
    wrap.appendChild(foot);
    root.appendChild(wrap);
    var ev = config.events || {};
    setTimeout(function () {
      if (ev.onAppReady) ev.onAppReady();
      if (ev.onDocumentReady) ev.onDocumentReady();
      if (ev.onDocumentStateChange) ev.onDocumentStateChange({ data: false });
    }, 30);
  }
  DocEditor.prototype.destroyEditor = function () {};
  win.DocsAPI = { DocEditor: DocEditor };
})(window);
