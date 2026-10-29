/**
 * Warms the office editor's files in the HTTP cache (ADR-0143) so the first open of a document is
 * not a download. The editor is ~12 MB of JS, wasm and CSS behind a requirejs waterfall (app.js asks
 * for its controllers one by one): on a slow or far link the first open takes 10–30 s, a cached one
 * a few seconds. Requests made here through the default session land in the same cache entries the
 * editor's frame reads (proven on Electron 44: the frame gets them `fromCache`).
 *
 * - When: the renderer asks on entering the Disk (`disk`) and at READY (`ready`, only for someone who
 *   has opened the editor before, after a pause). Once per Document Server version: the version is
 *   the `<x.y.z>-<hash>` prefix of every editor URL, read from the unversioned api.js.
 * - What: SEED, the files the three editors load (officeAssets.json, recorded by tools/office-assets.cjs),
 *   plus the paths the editor actually loaded here (learned from the frame's requests, kept relative to
 *   the version so they survive an upgrade that renames a few). Most of the time is the requirejs
 *   waterfall of ~200 small files, not the big ones: warming only the heavy files saved 25 %, all of
 *   them 90 % (spreadsheet editor on a 0.35 MB/s link: 13.6 s → 1.2 s).
 * - Cost: network only, PARALLEL requests at a time; nothing is parsed or run.
 */
import { app, session } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { log } from './logging';
import assets from './officeAssets.json';
import { officeOriginOf } from './officeFrame';

const API_JS = '/web-apps/apps/api/documents/api.js';
const VERSION = /\b(\d+\.\d+\.\d+-[0-9a-f]{32})\b/;
const VERSIONED = /^\/(\d+\.\d+\.\d+-[0-9a-f]{32})\/(.+)$/;
/** Paths under the version that are documents or sessions, not the editor's files. */
const NOT_ASSETS = /^(doc|cache|downloadfile|coauthoring|converter|healthcheck)\b/;
const MAX_PATHS = 600;
const PARALLEL = 6;
const RECHECK_MS = 30 * 60_000;
const READY_DELAY_MS = 60_000;

/** The three editors' files, merged in turn so each editor's first files come first (its waterfall needs them first). */
export function mergeInTurn(lists: readonly (readonly string[])[]): string[] {
  const out = new Set<string>();
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) for (const l of lists) if (i < l.length) out.add(l[i] as string);
  return [...out];
}

export const SEED: readonly string[] = mergeInTurn([assets.word, assets.cell, assets.slide]);

export interface WarmState {
  origin: string;
  /** The version last warmed completely enough ('' = never). */
  warmed: string;
  /** Paths the editor loaded, relative to the version root. */
  paths: string[];
}

const EMPTY: WarmState = { origin: '', warmed: '', paths: [] };

/** The Document Server version named in api.js, '' when it names none. */
export function versionOf(apiJs: string): string {
  return VERSION.exec(apiJs)?.[1] ?? '';
}

/** A request of the editor → its path relative to the version, or null when it is not an editor file of `origin`. */
export function assetPath(url: string, origin: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.origin !== origin) return null;
  const m = VERSIONED.exec(u.pathname);
  if (!m?.[2] || NOT_ASSETS.test(m[2])) return null;
  return m[2] + u.search;
}

/** The URLs to warm for `version`: SEED, then what was learned, each once. */
export function warmList(origin: string, version: string, learned: readonly string[]): string[] {
  return [...new Set([...SEED, ...learned])].map((p) => `${origin}/${version}/${p}`);
}

/** The state file's content, or EMPTY for anything unexpected. */
export function parseState(raw: string): WarmState {
  try {
    const v = JSON.parse(raw) as Partial<WarmState>;
    if (typeof v.origin !== 'string' || typeof v.warmed !== 'string' || !Array.isArray(v.paths)) return EMPTY;
    return { origin: v.origin, warmed: v.warmed, paths: v.paths.filter((p): p is string => typeof p === 'string').slice(0, MAX_PATHS) };
  } catch {
    return EMPTY;
  }
}

export interface WarmDeps {
  fetch(url: string, init: { signal: AbortSignal }): Promise<Response>;
  read(): Promise<string>;
  write(s: string): Promise<void>;
  now(): number;
  /** Resolves after `ms`, or early when `signal` aborts. */
  delay(ms: number, signal: AbortSignal): Promise<void>;
}

export type WarmReason = 'disk' | 'ready';

/** The warmer over its I/O (tests give fakes; `officeWarmer()` the real ones). */
export function createWarmer(deps: WarmDeps) {
  let state: WarmState | null = null;
  let running: Promise<void> | null = null;
  let checkedAt = -Infinity;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const stop = new AbortController();
  /** Entering the Disk while a READY run waits: it goes now. */
  let hurry = new AbortController();

  const load = async (): Promise<WarmState> => (state ??= parseState(await deps.read().catch(() => '')));
  const save = (): void => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (state) void deps.write(JSON.stringify(state)).catch(() => undefined);
    }, 5_000);
  };

  async function run(reason: WarmReason, docsUrl: () => Promise<unknown>): Promise<void> {
    if (reason === 'ready') {
      const s = await load();
      if (s.paths.length === 0) return; // never opened the editor: nothing is downloaded for it
      await deps.delay(READY_DELAY_MS, AbortSignal.any([stop.signal, hurry.signal]));
      if (stop.signal.aborted) return;
    }
    if (deps.now() - checkedAt < RECHECK_MS) return;
    checkedAt = deps.now();
    const origin = officeOriginOf(await docsUrl().catch(() => ''));
    if (!origin) return;
    const res = await deps.fetch(origin + API_JS, { signal: AbortSignal.any([stop.signal, AbortSignal.timeout(10_000)]) });
    const text = await res.text();
    const version = res.ok ? versionOf(text) : '';
    if (!version) return;
    const s = await load();
    if (s.origin === origin && s.warmed === version) return;
    const urls = warmList(origin, version, s.origin === origin ? s.paths : []);
    const started = deps.now();
    let next = 0;
    let ok = 0;
    let bytes = 0;
    const worker = async (): Promise<void> => {
      while (next < urls.length && !stop.signal.aborted) {
        const url = urls[next++];
        if (url === undefined) return;
        try {
          const r = await deps.fetch(url, { signal: stop.signal });
          // The whole body: an abandoned HTTP/2 stream keeps its window (apiProtocol.ts) and is not cached.
          bytes += (await r.arrayBuffer()).byteLength;
          if (r.ok) ok++;
        } catch {
          // offline or quitting: the next trigger tries again
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    log.info('[office] warmed the editor', { version, files: `${ok}/${urls.length}`, bytes, ms: deps.now() - started, reason });
    if (ok * 2 < urls.length) return;
    state = { origin, warmed: version, paths: state?.origin === origin ? state.paths : [] };
    save();
  }

  return {
    /** IPC `office:warm`: one run at a time, at most one version check per RECHECK_MS. */
    warm(reason: WarmReason, docsUrl: () => Promise<unknown>): Promise<void> {
      if (running) {
        if (reason === 'disk') hurry.abort();
        return running;
      }
      hurry = new AbortController();
      running = run(reason, docsUrl)
        .catch((e: unknown) => log.warn('[office] warming failed', e))
        .finally(() => {
          running = null;
        });
      return running;
    },
    /** A request the editor's frame completed: remembered when it is one of its files. */
    learn(url: string, origin: string): void {
      const p = assetPath(url, origin);
      if (p === null || !state) return;
      if (state.origin !== origin) state = { origin, warmed: '', paths: [] };
      if (state.paths.includes(p) || state.paths.length >= MAX_PATHS) return;
      state.paths.push(p);
      save();
    },
    /** The editor opened on `origin`: load the state so its requests can be learned. */
    async prepare(): Promise<void> {
      await load();
    },
    stop(): void {
      stop.abort();
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      if (state) void deps.write(JSON.stringify(state)).catch(() => undefined);
    },
  };
}

type Warmer = ReturnType<typeof createWarmer>;
let warmer: Warmer | null = null;
const learning = new Set<string>();

function officeWarmer(): Warmer {
  if (warmer) return warmer;
  const file = path.join(app.getPath('userData'), 'office-warm.json');
  const w = createWarmer({
    fetch: (url, init) => session.defaultSession.fetch(url, init),
    read: () => fs.readFile(file, 'utf8'),
    write: (s) => fs.writeFile(file, s),
    now: () => Date.now(),
    delay: (ms, signal) =>
      new Promise((resolve) => {
        const t = setTimeout(resolve, ms);
        const done = (): void => {
          clearTimeout(t);
          resolve();
        };
        signal.addEventListener('abort', done, { once: true });
      }),
  });
  app.once('before-quit', () => w.stop());
  warmer = w;
  return w;
}

/** IPC `office:warm`. */
export function warmOffice(reason: WarmReason, docsUrl: () => Promise<unknown>): Promise<void> {
  return officeWarmer().warm(reason, docsUrl);
}

/**
 * The editor's frame was allowed for `origin`: its completed requests are learned from now on (one
 * listener on the default session, no other code uses onCompleted there).
 */
export function learnOfficeFrom(origin: string): void {
  if (!origin || learning.has(origin)) return;
  learning.add(origin);
  const w = officeWarmer();
  void w.prepare();
  const origins = [...learning];
  session.defaultSession.webRequest.onCompleted({ urls: origins.map((o) => `${o}/*`) }, (d) => {
    if (d.method !== 'GET' || d.statusCode !== 200) return;
    for (const o of origins) w.learn(d.url, o);
  });
}
