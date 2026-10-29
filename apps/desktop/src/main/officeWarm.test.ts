import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp', once: vi.fn() }, session: {} }));
vi.mock('./logging', () => ({ log: { info: vi.fn(), warn: vi.fn() } }));

const { SEED, assetPath, createWarmer, parseState, versionOf, warmList } = await import('./officeWarm');

const DOCS = 'https://docs.example.test';
const V = '10.0.0-ce0e996f340571b62de360f416560cfc';
const API = `/* … */ var ver = '/${V}/'; /* … */`;

function deps(opts: { state?: string; api?: string; failing?: (url: string) => boolean } = {}) {
  const fetched: string[] = [];
  let written = '';
  let clock = 0;
  const d = {
    fetch: vi.fn((url: string) => {
      fetched.push(url);
      if (url.endsWith('/api.js')) return Promise.resolve(new Response(opts.api ?? API));
      if (opts.failing?.(url)) return Promise.reject(new Error('offline'));
      return Promise.resolve(new Response('x'.repeat(10)));
    }),
    read: () => Promise.resolve(opts.state ?? ''),
    write: (s: string) => {
      written = s;
      return Promise.resolve();
    },
    now: () => clock,
    delay: vi.fn(() => Promise.resolve()),
  };
  return { d, fetched, written: () => written, tick: (ms: number) => (clock += ms) };
}

const docsUrl = () => Promise.resolve(DOCS);

describe('officeWarm', () => {
  it('reads the version from api.js', () => {
    expect(versionOf(API)).toBe(V);
    expect(versionOf('no version here')).toBe('');
  });

  it('learns only the editor files of the origin, relative to the version', () => {
    expect(assetPath(`${DOCS}/${V}/sdkjs/cell/sdk-all.js`, DOCS)).toBe('sdkjs/cell/sdk-all.js');
    expect(assetPath(`${DOCS}/${V}/web-apps/apps/x/main/locale/ru.json?_dc=1`, DOCS)).toBe('web-apps/apps/x/main/locale/ru.json?_dc=1');
    expect(assetPath(`${DOCS}/${V}/doc/key/c/`, DOCS)).toBeNull();
    expect(assetPath(`${DOCS}/cache/files/data/k/Editor.bin`, DOCS)).toBeNull();
    expect(assetPath(`https://evil.test/${V}/sdkjs/cell/sdk-all.js`, DOCS)).toBeNull();
    expect(assetPath('not a url', DOCS)).toBeNull();
  });

  it('warms SEED plus the learned paths under the current version, each once', () => {
    const urls = warmList(DOCS, V, ['sdkjs/cell/sdk-all.js', 'extra.js']);
    expect(urls).toHaveLength(SEED.length + 1);
    expect(urls.at(-1)).toBe(`${DOCS}/${V}/extra.js`);
    expect(urls.every((u) => u.startsWith(`${DOCS}/${V}/`))).toBe(true);
  });

  it('drops a broken state file', () => {
    expect(parseState('{')).toEqual({ origin: '', warmed: '', paths: [] });
    expect(parseState(JSON.stringify({ origin: DOCS, warmed: V, paths: ['a', 1] }))).toEqual({ origin: DOCS, warmed: V, paths: ['a'] });
  });

  it('warms once per version from the Disk', async () => {
    const t = deps();
    const w = createWarmer(t.d);
    await w.warm('disk', docsUrl);
    expect(t.fetched).toHaveLength(1 + SEED.length);
    w.stop();
    expect(JSON.parse(t.written())).toMatchObject({ origin: DOCS, warmed: V });

    const again = deps({ state: t.written() });
    const w2 = createWarmer(again.d);
    await w2.warm('disk', docsUrl);
    expect(again.fetched).toEqual([`${DOCS}/web-apps/apps/api/documents/api.js`]);
  });

  it('rewarms after a Document Server upgrade, with what it learned', async () => {
    const t = deps({ state: JSON.stringify({ origin: DOCS, warmed: '9.0.0-' + 'a'.repeat(32), paths: ['learned.js'] }) });
    await createWarmer(t.d).warm('disk', docsUrl);
    expect(t.fetched).toContain(`${DOCS}/${V}/learned.js`);
  });

  it('at READY warms only for someone who opened the editor, after a pause', async () => {
    const never = deps();
    await createWarmer(never.d).warm('ready', docsUrl);
    expect(never.fetched).toHaveLength(0);

    const used = deps({ state: JSON.stringify({ origin: DOCS, warmed: '', paths: ['a.js'] }) });
    await createWarmer(used.d).warm('ready', docsUrl);
    expect(used.d.delay).toHaveBeenCalledOnce();
    expect(used.fetched.length).toBeGreaterThan(SEED.length);
  });

  it('checks the version at most once per 30 minutes', async () => {
    const t = deps({ api: 'nothing' });
    const w = createWarmer(t.d);
    await w.warm('disk', docsUrl);
    await w.warm('disk', docsUrl);
    expect(t.fetched).toHaveLength(1);
    t.tick(31 * 60_000);
    await w.warm('disk', docsUrl);
    expect(t.fetched).toHaveLength(2);
  });

  it('does not mark a version warmed when most files failed', async () => {
    const t = deps({ failing: (u) => !u.endsWith('require.js') });
    const w = createWarmer(t.d);
    await w.warm('disk', docsUrl);
    w.stop();
    const saved = t.written() === '' ? null : parseState(t.written());
    expect(saved?.warmed ?? '').toBe('');
  });

  it('nothing happens with the editor off', async () => {
    const t = deps();
    await createWarmer(t.d).warm('disk', () => Promise.resolve(''));
    expect(t.fetched).toHaveLength(0);
  });

  it('remembers what the frame loaded, once', async () => {
    const t = deps();
    const w = createWarmer(t.d);
    await w.prepare();
    w.learn(`${DOCS}/${V}/a.js`, DOCS);
    w.learn(`${DOCS}/${V}/a.js`, DOCS);
    w.learn(`${DOCS}/${V}/doc/k/c/`, DOCS);
    w.stop();
    expect(JSON.parse(t.written())).toMatchObject({ origin: DOCS, paths: ['a.js'] });
  });
});
