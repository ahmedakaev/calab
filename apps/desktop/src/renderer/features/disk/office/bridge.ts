/**
 * The Calab side of the office editor's host page protocol (ADR-0143, infra/office/calab-editor.js):
 * the editor runs in an iframe on the Document Server's origin; this module hands it the signed
 * configuration when it says hello and turns its events into the frame's status. Nothing here
 * loads the Document Server's JS: closing the dialog removes the iframe and with it everything
 * the editor ran (no idle cost — CLAUDE.md «Производительность»).
 */

export type OfficeStatus = 'loading' | 'saved' | 'saving' | 'error';

export type HostEvent =
  | { name: 'ready' }
  | { name: 'state'; dirty: boolean }
  | { name: 'error'; code: string }
  | { name: 'warning' }
  | { name: 'requestClose' }
  | { name: 'closed' };

const SRC = 'calab-office';

/** The frame's status after an event of the host page. */
export function nextStatus(prev: OfficeStatus, e: HostEvent): OfficeStatus {
  switch (e.name) {
    case 'ready':
      return prev === 'error' ? prev : 'saved';
    case 'state':
      return prev === 'error' ? prev : e.dirty ? 'saving' : 'saved';
    case 'error':
      return 'error';
    default:
      return prev;
  }
}

/** The origin of an http(s) URL, '' otherwise. */
export function originOf(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : '';
  } catch {
    return '';
  }
}

function parse(data: unknown): HostEvent | 'hello' | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as { source?: unknown; type?: unknown; name?: unknown; data?: unknown };
  if (m.source !== SRC) return null;
  if (m.type === 'hello') return 'hello';
  if (m.type === 'closed') return { name: 'closed' };
  if (m.type !== 'event') return null;
  switch (m.name) {
    case 'ready':
    case 'warning':
    case 'requestClose':
      return { name: m.name };
    case 'state':
      return { name: 'state', dirty: m.data === true };
    case 'error': {
      const code = m.data && typeof m.data === 'object' ? (m.data as { code?: unknown }).code : undefined;
      return { name: 'error', code: typeof code === 'number' || typeof code === 'string' ? String(code) : '' };
    }
    default:
      return null;
  }
}

export interface HostConnection {
  /** Asks the host page to destroy the editor and stops listening (the caller removes the frame). */
  close(): void;
}

/**
 * Listens to the host page in `frame` (messages from its window and the Document Server's origin
 * only) and sends it `configJson` once it says hello (only to that origin).
 */
export function connectHost(win: Window, frame: HTMLIFrameElement, docsOrigin: string, configJson: string, on: (e: HostEvent) => void): HostConnection {
  let sent = false;
  const listener = (e: MessageEvent): void => {
    if (e.source !== frame.contentWindow || e.origin !== docsOrigin) return;
    const m = parse(e.data);
    if (m === null) return;
    if (m === 'hello') {
      if (sent) return;
      sent = true;
      let config: unknown;
      try {
        config = JSON.parse(configJson);
      } catch {
        on({ name: 'error', code: 'config' });
        return;
      }
      frame.contentWindow?.postMessage({ source: SRC, type: 'open', config }, docsOrigin);
      return;
    }
    on(m);
  };
  win.addEventListener('message', listener);
  return {
    close() {
      win.removeEventListener('message', listener);
      frame.contentWindow?.postMessage({ source: SRC, type: 'close' }, docsOrigin);
    },
  };
}

/** Disk files the editor opens (ADR-0143 v1: xlsx and docx). */
export function isOfficeFile(name: string): boolean {
  return /\.(xlsx|docx)$/i.test(name);
}

/**
 * The spike's switch (off by default): the build sets VITE_OFFICE=1. The full implementation
 * reads the server's OFFICE_ENABLED instead (ADR-0143 «Остаётся»).
 */
export function officeEnabled(): boolean {
  return (import.meta.env['VITE_OFFICE'] as string | undefined) === '1';
}
