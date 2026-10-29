import type { HostCallsOperation } from '../../desktop/src/shared/hostCalls';
import type { MediaPermissionsOperation } from '../../desktop/src/shared/hostPermissions';
import { parseHostActivityMessage, type SessionActivitySnapshot } from '../../desktop/src/shared/hostActivity';

export type ActivityAction =
  | ({ type: 'permissions'; document: string; request: number } & MediaPermissionsOperation)
  | ({ type:'calls'; document:string; request:number } & HostCallsOperation)
  | { type: 'ready'; document: string }
  | { type: 'challenge'; document: string; nonce: string }
  | { type: 'publish'; document: string; snapshot: SessionActivitySnapshot }
  | { type: 'end'; reason?: 'logout' }
  | { type: 'notifications'; document: string; request: number; operation: 'status' | 'request' | 'clear' | 'ack' | 'test'; eventId?: string; body?: string };

/**
 * iOS: native has already proved frame, origin and current document; JS narrows schema and order.
 * Android (`challenge`): the unpatched WebView proves only the sender's origin (see
 * `androidMessageTrusted`), so a hello becomes ready only after a main-frame challenge injected by
 * the host finds the same document ID and answers with this host's nonce — an old document's hello
 * queued across a navigation cannot claim the new page (ADR-0070, Android).
 */
export class ActivityProtocol {
  private document: string | null = null;
  private sequence = 0;
  private generation = 0;
  private pending: { document: string; nonce: string } | null = null;
  private challenges = 0;

  constructor(private readonly host: number, private readonly challenge = false) {}

  belongsTo(host: number): boolean { return this.host === host; }

  isCurrent(document: string): boolean { return this.document === document; }

  /** The main document that completed the handshake, or null before it / after a revocation. */
  current(): string | null { return this.document; }

  reset(): void { this.document = null; this.sequence = 0; this.generation = 0; this.pending = null; }

  accept(raw: string): ActivityAction | null {
    if (this.challenge) {
      const proof = parseProof(raw);
      if (proof) {
        if (proof.host !== this.host || !this.pending || proof.document !== this.pending.document || proof.nonce !== this.pending.nonce) return null;
        this.reset();
        this.document = proof.document;
        return { type: 'ready', document: proof.document };
      }
    }
    const message = parseHostActivityMessage(raw);
    if (!message || message.host !== this.host) return null;
    if (message.type === 'hello') {
      if (this.document === message.document) return null;
      if (this.challenge) {
        // The latest challenge wins; a lost one (navigation) is reissued on the page's next hello.
        this.pending = { document: message.document, nonce: `${String(++this.challenges)}-${Math.random().toString(36).slice(2)}` };
        return { type: 'challenge', document: message.document, nonce: this.pending.nonce };
      }
      this.reset();
      this.document = message.document;
      return { type: 'ready', document: message.document };
    }
    if (message.document !== this.document || message.seq <= this.sequence) return null;
    this.sequence = message.seq;
    if (message.type === 'revoke') { this.reset(); return message.reason === 'logout' ? { type: 'end', reason: 'logout' } : { type: 'end' }; }
    if (message.type === 'calls') return { ...message, type:'calls' };
    if (message.type === 'permissions') return { ...message, type: 'permissions' };
    if (message.type === 'notifications') return { type: 'notifications', document: message.document, request: message.request, operation: message.operation, ...(message.eventId ? { eventId: message.eventId } : {}), ...(message.body ? { body: message.body } : {}) };
    if (message.snapshot.generation < this.generation) return null;
    this.generation = message.snapshot.generation;
    return { type: 'publish', document: message.document, snapshot: message.snapshot };
  }
}

/** The proof an Android challenge asks the main document to send back (exact shape, bounded). */
function parseProof(raw: string): { host: number; document: string; nonce: string } | null {
  if (raw.length > 256) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'document,host,nonce,type,v' || v.v !== 1 || v.type !== 'proof' ||
      typeof v.host !== 'number' || !Number.isSafeInteger(v.host) || typeof v.document !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(v.document) || typeof v.nonce !== 'string' || !/^[0-9]+-[0-9a-z]{0,16}$/.test(v.nonce)) return null;
  return { host: v.host, document: v.document, nonce: v.nonce };
}

/**
 * Android's sender proof. react-native-webview 13 reports the WebMessageListener's native
 * `sourceOrigin` of the posting frame as the event URL — exactly the app origin for our pages, a
 * different origin for any foreign iframe. Its fallback JavascriptInterface (no listener support)
 * reports the top page URL instead (always with a path), which is no frame proof: rejected.
 */
export function androidMessageTrusted(url: string | undefined, origin: string): boolean {
  return url === origin;
}

/** Main frame only (evaluateJavascript): sends the proof iff the current document is the one that said hello. */
export function activityChallenge(host: number, document: string, nonce: string): string {
  const ids = JSON.stringify([document, host, nonce]);
  return `(() => {
    const h = window.CalabHostActivity; const ids = ${ids};
    if (window === window.top && h && h.version === 1 && h.document === ids[0] && h.host === ids[1])
      h.send(JSON.stringify({v: 1, type: 'proof', host: ids[1], document: ids[0], nonce: ids[2]}));
  })(); true;`;
}

/**
 * Declaration only, main frame only. Native validation is the actual authority boundary.
 * `platform` (Platform.OS) tells the web client which store rules apply (App Store: no payment
 * UI in the iOS shell); additive — an older binary without it is treated as iOS unless its
 * user agent is Android (apps/desktop platform/nativeShell.ts). The Android host implements
 * notifications and links only: it does not advertise media permissions or calls, so the web
 * keeps its browser paths for those instead of waiting for replies (ADR-0070, Android).
 */
export function activityBootstrap(host: number, nativeAudio = false, platform: 'ios' | 'android' | null = null): string {
  const ios = platform !== 'android';
  const capabilities = ios ? `mediaPermissionsVersion: 1, callsVersion: 1, callsMuteVersion: 1, callsAnswerVersion: 1, ${nativeAudio ? 'callsAudioVersion: 1,' : ''}` : '';
  return `(() => {
    if (window !== window.top || !window.ReactNativeWebView || !window.crypto?.randomUUID) return;
    let documentId = crypto.randomUUID();
    Object.defineProperty(window, 'CalabHostActivity', { configurable: false, writable: false,
      value: Object.freeze({version: 1, notificationsVersion: 1, notificationsTestVersion: 1, ${capabilities} ${platform ? `platform: '${platform}',` : ''} host: ${String(host)}, get document() { return documentId; },
        rotateDocument: () => { documentId = crypto.randomUUID(); },
        send: (data) => window.ReactNativeWebView.postMessage(data)}) });
  })(); true;`;
}

export function activityReady(host: number, document: string, activity = true, android = false): string {
  const capability = activity ? 'sessionActivity' : 'notifications';
  const detail = JSON.stringify(android ? { v: 1, host, document, capability, notifications: 1, links: 1 }
    : { v: 1, host, document, capability, notifications: 1, calls: 1, permissions: 1, links: 1 });
  return `window.dispatchEvent(new CustomEvent('calab-host-activity-ready', {detail: ${detail}})); true;`;
}

/**
 * An incoming link for the running page (ADR-0142): `url` is an app URL from links.ts — the web
 * origin plus a task / invite / room route — that the page opens in place, as it would a click.
 * Carries no authority: the page accepts only its own origin and routes it could navigate to.
 */
export function linkEvent(host: number, document: string, url: string): string {
  const detail = JSON.stringify({ v: 1, host, document, url });
  return `window.dispatchEvent(new CustomEvent('calab-host-link', {detail: ${detail}})); true;`;
}
