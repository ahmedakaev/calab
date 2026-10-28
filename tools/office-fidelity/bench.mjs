#!/usr/bin/env node
// ONLYOFFICE fidelity and cost bench (ADR-0143 «План проверки»). Needs a local Document Server
// with JWT (tools/office-fidelity/run.sh starts one) and the fixtures (fixtures.py).
//
//   node tools/office-fidelity/bench.mjs --ds http://localhost:18080 --secret-file OUT/ds.env \
//        --fixtures OUT --out OUT [--port 18090] [--idle 30]
//
// 1. Conversion round trips: POST {ds}/converter (JWT in body and header) of every fixture into
//    its own format → OUT/convert-<name>; and the legacy path of «Сохранить как» (ADR-0143
//    «Форматы»): xlsx → xls → xlsx, docx → doc → docx, pptx → ppt → pptx → OUT/legacy-<name>
//    (compare.py against the original shows what the legacy format loses).
// 2. The editor through the Calab host page (infra/office/calab-editor.html, mounted into the
//    Document Server's web-apps): a parent page frames it like the Calab client and sends the
//    signed config; it measures the editor's download size, time to «ready», page CPU and JS
//    heap while idle; edits one cell / paragraph with the keyboard, Ctrl+S (forcesave → status 6
//    → OUT/editor6-<name>), closes (the iframe is removed → status 2 ≈10 s later →
//    OUT/editor2-<name>), and measures the page again against the baseline before opening.
// 3. OUT/bench.json with the numbers. Compare the files with compare.py.
import { createHmac, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(new URL('../../apps/desktop/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const DS = arg('ds', 'http://localhost:18080').replace(/\/$/, '');
const SECRET = arg('secret') ?? /JWT_SECRET=(\S+)/.exec(readFileSync(arg('secret-file', 'ds.env'), 'utf8'))?.[1];
const FIX = arg('fixtures', '.');
const OUT = arg('out', '.');
const PORT = Number(arg('port', '18090'));
const IDLE_S = Number(arg('idle', '30'));
// How the Document Server container reaches this harness (Docker Desktop / --add-host).
const HARNESS_FOR_DS = arg('harness-for-ds', `http://host.docker.internal:${PORT}`);
const HARNESS = `http://localhost:${PORT}`;
if (!SECRET) throw new Error('no JWT secret (--secret or --secret-file with JWT_SECRET=…)');

const b64u = (b) => Buffer.from(b).toString('base64url');
const sign = (payload) => {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  return `${h}.${p}.${createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
};
const verify = (tok) => {
  const [h, p, s] = String(tok).split('.');
  if (createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') !== s) throw new Error('bad signature');
  return JSON.parse(Buffer.from(p, 'base64url').toString());
};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------------------------------------------------------------- the harness server

const callbacks = []; // { name, status, at, url }
const waiters = [];
function waitCallback(pred, ms) {
  const hit = callbacks.find(pred);
  if (hit) return Promise.resolve(hit);
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('callback timeout')), ms);
    waiters.push({ pred, res: (c) => (clearTimeout(t), res(c)) });
  });
}

const parentPage = (hostUrl, configJson) => `<!doctype html><meta charset="utf-8"><title>bench</title>
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style>
<body><script>
window.__events = [];
const DOCS = ${JSON.stringify(new URL(DS).origin)};
const f = document.createElement('iframe');
f.src = ${JSON.stringify(hostUrl)};
addEventListener('message', (e) => {
  if (e.source !== f.contentWindow || e.origin !== DOCS || !e.data || e.data.source !== 'calab-office') return;
  if (e.data.type === 'hello') f.contentWindow.postMessage({ source: 'calab-office', type: 'open', config: ${configJson} }, DOCS);
  else window.__events.push({ t: performance.now(), type: e.data.type, name: e.data.name, data: e.data.data });
});
window.__close = () => { f.contentWindow && f.contentWindow.postMessage({ source: 'calab-office', type: 'close' }, DOCS); setTimeout(() => f.remove(), 200); };
document.body.appendChild(f);
</script></body>`;

let pageHtml = '';
const server = createServer(async (req, res) => {
  const url = new URL(req.url, HARNESS);
  try {
    if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
      const name = decodeURIComponent(url.pathname.slice(7));
      const auth = req.headers.authorization?.replace(/^Bearer /, '');
      if (auth) verify(auth); // the Document Server signs its download (JWT_ENABLED)
      const b = readFileSync(join(FIX, name));
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': b.length });
      return res.end(b);
    }
    if (req.method === 'POST' && url.pathname.startsWith('/callback/')) {
      const name = decodeURIComponent(url.pathname.slice(10));
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const auth = req.headers.authorization?.replace(/^Bearer /, '');
      const claims = auth ? verify(auth) : verify(raw.token);
      const body = claims.payload ?? claims;
      const cb = { name, status: body.status, at: Date.now(), url: body.url, users: body.users, forcesavetype: body.forcesavetype, operation: claims.operation };
      if ((body.status === 2 || body.status === 6) && body.url) {
        const r = await fetch(body.url);
        const file = join(OUT, `editor${body.status}-${name}`);
        writeFileSync(file, Buffer.from(await r.arrayBuffer()));
        cb.file = file;
      }
      callbacks.push(cb);
      log('callback', JSON.stringify(cb));
      for (const w of waiters.splice(0)) (w.pred(cb) ? w.res(cb) : waiters.push(w));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end('{"error":0}');
    }
    if (url.pathname === '/parent.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(pageHtml);
    }
    res.writeHead(404).end();
  } catch (e) {
    log('harness error', e.message);
    res.writeHead(500).end(String(e));
  }
});
await new Promise((r) => server.listen(PORT, '0.0.0.0', r));

// ---------------------------------------------------------------- 1. conversion round trip

async function convert(name, to, out = `convert-${name}`) {
  const ext = name.split('.').pop();
  const body = { async: false, filetype: ext, outputtype: to ?? ext, key: `bench-${randomBytes(6).toString('hex')}`, title: name, url: `${HARNESS_FOR_DS}/files/${encodeURIComponent(name)}` };
  const tok = sign({ ...body, operation: 'converter' });
  const r = await fetch(`${DS}/converter`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify({ ...body, token: tok }) });
  const j = await r.json();
  if (!j.endConvert || !j.fileUrl) return { name, error: j.error ?? j };
  const file = join(OUT, out);
  writeFileSync(file, Buffer.from(await (await fetch(j.fileUrl)).arrayBuffer()));
  return { name, file };
}

// ---------------------------------------------------------------- 2. the editor

const editorConfig = (name, theme) => {
  const ext = name.split('.').pop();
  const cfg = {
    type: 'desktop',
    documentType: { xlsx: 'cell', csv: 'cell', pptx: 'slide' }[ext] ?? 'word',
    document: { fileType: ext, key: `bench-${randomBytes(8).toString('hex')}`, title: name, url: `${HARNESS_FOR_DS}/files/${encodeURIComponent(name)}`, permissions: { edit: true, download: true, chat: false } },
    editorConfig: {
      mode: 'edit', lang: 'ru', callbackUrl: `${HARNESS_FOR_DS}/callback/${encodeURIComponent(name)}`,
      user: { id: '00000000-0000-7000-8000-000000000001', name: 'Bench' },
      customization: { uiTheme: theme, compactHeader: true, toolbarHideFileName: true, hideRightMenu: true, autosave: true, forcesave: true, help: false, feedback: false, plugins: false },
    },
  };
  return { ...cfg, token: sign(cfg) };
};

async function metrics(cdp) {
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  return { task: m.TaskDuration, heap: m.JSHeapUsedSize, nodes: m.Nodes, frames: m.Frames, docs: m.Documents };
}

async function editor(browser, name, theme, edit) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  let bytes = 0;
  let requests = 0;
  page.on('requestfinished', async (rq) => {
    if (!rq.url().startsWith(DS)) return;
    requests++;
    try {
      const s = await rq.sizes();
      bytes += s.responseBodySize + s.responseHeadersSize;
    } catch {
      // gone
    }
  });
  pageHtml = '<!doctype html><title>blank</title>';
  await page.goto(`${HARNESS}/parent.html`);
  await cdp.send('HeapProfiler.collectGarbage');
  const base = await metrics(cdp);

  pageHtml = parentPage(`${DS}/web-apps/apps/calab/calab-editor.html`, JSON.stringify(editorConfig(name, theme)));
  const t0 = Date.now();
  await page.goto(`${HARNESS}/parent.html`);
  await page.waitForFunction(() => window.__events.some((e) => e.name === 'ready' || e.name === 'error'), null, { timeout: 120_000 });
  const openMs = Date.now() - t0;
  const err = await page.evaluate(() => window.__events.find((e) => e.name === 'error'));
  await page.waitForTimeout(3000); // the first paint after ready
  await page.screenshot({ path: join(OUT, `editor-${theme}-${name}.png`) });
  const openBytes = bytes;
  const openRequests = requests;

  // Idle: nothing touched for IDLE_S seconds.
  const a = await metrics(cdp);
  await page.waitForTimeout(IDLE_S * 1000);
  const b = await metrics(cdp);
  const idleCpu = (b.task - a.task) / IDLE_S;

  // Edit + Ctrl+S (forcesave → status 6).
  let forcesave = null;
  if (edit && !err) {
    await page.mouse.click(720, 450);
    await edit(page);
    await page.keyboard.press('Control+S');
    forcesave = await waitCallback((c) => c.name === name && c.status === 6, 60_000).catch((e) => ({ error: e.message }));
  }

  // Close: the iframe goes; status 2 follows ≈10 s after the last editor leaves.
  await page.evaluate(() => window.__close());
  await page.waitForTimeout(5000);
  await cdp.send('HeapProfiler.collectGarbage');
  const after = await metrics(cdp);
  const c1 = await metrics(cdp);
  await page.waitForTimeout(10_000);
  const c2 = await metrics(cdp);
  const final = edit && !err ? await waitCallback((c) => c.name === name && (c.status === 2 || c.status === 4), 60_000).catch((e) => ({ error: e.message })) : null;
  await page.close();
  return {
    name, theme, error: err ?? null, openMs, openBytes, openRequests,
    idleCpuPercent: +(idleCpu * 100).toFixed(2), heapOpenMB: +(b.heap / 1048576).toFixed(1),
    base: { heapMB: +(base.heap / 1048576).toFixed(1), frames: base.frames, nodes: base.nodes },
    afterClose: { heapMB: +(after.heap / 1048576).toFixed(1), frames: after.frames, nodes: after.nodes, cpuPercent: +(((c2.task - c1.task) / 10) * 100).toFixed(2) },
    forcesave, final,
  };
}

const typeXlsx = async (page) => {
  // C4 (the first vacation start) := 02.07.2026
  await page.keyboard.press('Control+Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.type('02.07.2026');
  await page.keyboard.press('Enter');
};
const typeDocx = async (page) => {
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('End');
  await page.keyboard.type(' (правка из редактора)');
};

const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const report = { ds: DS, at: new Date().toISOString(), convert: [], editor: [] };
const FIXTURES = ['vacations.xlsx', 'contract.docx', 'deck.pptx', 'staff.csv'];
for (const n of FIXTURES) report.convert.push(await convert(n).catch((e) => ({ name: n, error: e.message })));
// The legacy path: the Document Server writes the legacy file (into FIX, so the harness serves
// it), then «Сохранить как» converts it back to OOXML.
for (const [n, legacy] of [['vacations.xlsx', 'xls'], ['contract.docx', 'doc'], ['deck.pptx', 'ppt']]) {
  const base = n.replace(/\.[^.]+$/, '');
  const old = await convert(n, legacy, `${base}.${legacy}`).catch((e) => ({ name: n, error: e.message }));
  if (old.error) { report.convert.push(old); continue; }
  writeFileSync(join(FIX, `${base}.${legacy}`), readFileSync(old.file));
  report.convert.push(await convert(`${base}.${legacy}`, n.split('.').pop(), `legacy-${n}`).catch((e) => ({ name: `${base}.${legacy}`, error: e.message })));
}
report.editor.push(await editor(browser, 'vacations.xlsx', 'default-dark', typeXlsx));
report.editor.push(await editor(browser, 'contract.docx', 'default-light', typeDocx));
// Look and feel: the same files read-only and in the other theme (no edit), for screenshots.
report.editor.push(await editor(browser, 'vacations.xlsx', 'default-light', null));
report.editor.push(await editor(browser, 'contract.docx', 'default-dark', null));
report.editor.push(await editor(browser, 'deck.pptx', 'default-dark', null));
await browser.close();
server.close();
writeFileSync(join(OUT, 'bench.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
