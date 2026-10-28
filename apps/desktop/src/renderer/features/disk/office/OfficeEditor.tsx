import { DiskItemResponseSchema, OfficeConfigResponseSchema, OfficeMode, type OfficeConfigResponse } from '@calaba/protocol';
import { Download, FolderOpen, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { confirmAction } from '../../../components/Confirm';
import { Button, Modal, Spinner } from '../../../components/ui';
import { getLocale, t } from '../../../i18n';
import { ApiError, call, qs } from '../../../lib/api/client';
import { platform } from '../../../platform';
import { downloadItem, revealDiskItem } from '../../../services/disk';
import { downloadFile } from '../../../services/files';
import { useDisk } from '../../../stores/disk';
import { toast } from '../../../stores/toasts';
import { useUi } from '../../../stores/ui';
import { FRAME_START, connectHost, convertTarget, frameReducer, officeCapability, originOf, viewOnly, type FrameState, type HostConnection, type HostEvent } from './bridge';

export type OfficeSource = { itemId: string } | { fileId: string };

type Load = { kind: 'loading' } | { kind: 'ready'; cfg: OfficeConfigResponse } | { kind: 'error'; why: 'unsupported' | 'unavailable' | 'failed' };

const appTheme = (): 'dark' | 'light' => (document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark');

/** The Document Server does not say hello (unreachable, blocked): the frame gives up after this. */
const HELLO_TIMEOUT_MS = 15_000;

export const officeApi = {
  /** GET /api/office/config: the signed editor configuration of a Disk item or, view only, of a plain file (ADR-0143). */
  config: (src: OfficeSource, p: { theme: 'dark' | 'light'; phone: boolean; lang: string }, signal?: AbortSignal) =>
    call('GET', `/api/office/config${qs({ ...('itemId' in src ? { item: src.itemId } : { file: src.fileId }), theme: p.theme, phone: p.phone ? 1 : undefined, lang: p.lang })}`, OfficeConfigResponseSchema, undefined, signal),
  /** A legacy file saved as a copy in the modern format: a new Disk item next to the original (ADR-0143 addendum). */
  saveAs: (itemId: string, ext: string) => call('POST', `/api/office/save-as${qs({ item: itemId, ext })}`, DiskItemResponseSchema),
};

/** A fresh config on mount and on every `attempt` (the retry); aborted on close. */
function useOfficeConfig(src: OfficeSource, attempt: number): Load {
  const key = 'itemId' in src ? src.itemId : src.fileId;
  const [state, setState] = useState<{ key: string; attempt: number; v: Load } | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    officeApi
      .config(src, { theme: appTheme(), phone: useUi.getState().phone.on, lang: getLocale().split('-')[0] ?? 'ru' }, ac.signal)
      .then((cfg) => {
        if (!ac.signal.aborted) setState({ key, attempt, v: { kind: 'ready', cfg } });
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        const status = e instanceof ApiError ? e.status : 0;
        setState({ key, attempt, v: { kind: 'error', why: status === 415 ? 'unsupported' : status === 404 ? 'unavailable' : 'failed' } });
      });
    return () => ac.abort();
    // `src` is identified by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  return state?.key === key && state.attempt === attempt ? state.v : { kind: 'loading' };
}

/**
 * The editor's frame: the host page on the Document Server's origin in an iframe that exists only
 * while the dialog is open. Unmounting sends «close» (the host destroys the editor), tells main to
 * stop allowing the origin, and React removes the iframe — the Document Server's JS, its socket and
 * its timers go with it. While it loads, one timer waits for the host's hello.
 */
function EditorFrame({ cfg, title, loading, onEvent }: { cfg: OfficeConfigResponse; title: string; loading: boolean; onEvent: (e: HostEvent) => void }): ReactNode {
  const ref = useRef<HTMLIFrameElement>(null);
  const origin = originOf(cfg.docsUrl);
  useEffect(() => {
    const frame = ref.current;
    if (!frame || !origin) return;
    let conn: HostConnection | null = null;
    let live = true;
    // Electron: main lets exactly this origin's host page through its navigation guards (main/officeFrame.ts).
    void (platform.kind === 'electron' ? (window.calaba.office?.setFrameOrigin(origin) ?? Promise.resolve()) : Promise.resolve()).then(() => {
      if (!live) return;
      conn = connectHost(window, frame, origin, cfg.configJson, onEvent);
      frame.src = cfg.hostUrl;
    });
    // The theme follows the app while the editor is open (the host applies it if the editor supports that).
    const mo = new MutationObserver(() => conn?.setTheme(appTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      live = false;
      mo.disconnect();
      conn?.close();
      if (platform.kind === 'electron') void window.calaba.office?.setFrameOrigin(null);
    };
  }, [cfg, origin, onEvent]);
  useEffect(() => {
    if (!loading) return;
    const id = window.setTimeout(() => onEvent({ name: 'error', code: 'timeout' }), HELLO_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [loading, onEvent]);
  return (
    <iframe
      ref={ref}
      title={title}
      data-testid="office-frame"
      referrerPolicy="no-referrer"
      allow="clipboard-read; clipboard-write"
      className="size-full rounded-[var(--radius-card)] border border-line bg-elev"
    />
  );
}

const chip = 'inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-caption';

/** The status line of the frame: «Сохранено» / «Сохраняется…», the badges, the co-editors. */
function StatusBar({ state, view, convert, others }: { state: FrameState; view: boolean; convert: string; others: string[] }): ReactNode {
  const status = state.status === 'saving' ? t('office.saving') : state.status === 'saved' ? t('office.saved') : '';
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {view && state.status !== 'loading' ? (
        <span className={`${chip} bg-hover font-medium text-muted`} data-testid="office-view-badge">
          {t('office.view')}
        </span>
      ) : null}
      {status ? (
        <span role="status" className="inline-flex items-center gap-1.5 text-caption text-muted" data-testid="office-status">
          {state.status === 'saving' ? <Spinner className="size-3" label="" /> : null}
          {status}
        </span>
      ) : null}
      {others.length ? (
        <span className="min-w-0 truncate text-caption text-muted" data-testid="office-users">
          {t('office.users', { names: others.join(', ') })}
        </span>
      ) : null}
      {convert && !view ? (
        <span className={`${chip} bg-hover text-fg`} data-testid="office-convert-notice">
          {t('office.convert', { ext: convert })}
        </span>
      ) : null}
    </div>
  );
}

/**
 * «Открыть» on an office file (ADR-0143): ONLYOFFICE Docs in a full-window dialog. The mode is the
 * server's (Disk bits: «Правка» edits, the rest views; the phone and view-only types always view);
 * saving is the Document Server's (autosave, Ctrl+S), each save a new version of the same Disk file.
 * A legacy format (`convert`) saves as a copy in the modern one: «Сохранить как .docx» opens it.
 */
export function OfficeEditor({ source, name, onClose }: { source: OfficeSource; name: string; onClose: () => void }): ReactNode {
  const [attempt, setAttempt] = useState(0);
  const load = useOfficeConfig(source, attempt);
  const [state, dispatch] = useReducer(frameReducer, FRAME_START);
  const phone = useUi((s) => s.phone.on);
  const itemId = 'itemId' in source ? source.itemId : '';
  const cap = officeCapability(name) ?? 'view';
  const view = load.kind === 'ready' ? viewOnly(cap, load.cfg.mode === OfficeMode.EDIT, phone) : true;
  const convert = !view && cap === 'convert' ? convertTarget(name) : '';
  const dirty = useRef(false);
  dirty.current = state.status === 'saving';
  const [saving, setSaving] = useState(false);

  // A host event of a stale frame (before a retry) never reaches the new state: the frame is re-keyed.
  const retry = (): void => {
    dispatch({ name: 'reset' });
    setAttempt((n) => n + 1);
  };

  const requestClose = useCallback(async (): Promise<boolean> => {
    // Unsaved changes (the editor reports them): ask before the editor is torn down.
    if (dirty.current && !(await confirmAction(t('office.unsaved.title'), t('office.unsaved.text'), t('office.unsaved.close')))) return false;
    onClose();
    return true;
  }, [onClose]);
  // The editor's own «close» asks the same way.
  const onEvent = useCallback(
    (e: HostEvent) => {
      if (e.name === 'requestClose') void requestClose();
      else dispatch(e);
    },
    [requestClose],
  );

  const download = (): void => {
    const item = itemId ? useDisk.getState().items[itemId] : undefined;
    if (item) downloadItem(item);
    else if ('fileId' in source) downloadFile({ id: source.fileId, name });
  };
  const inDisk = (): void => {
    void requestClose().then((closed) => {
      const item = useDisk.getState().items[itemId];
      if (closed && item) revealDiskItem(item, false);
    });
  };
  const saveAs = (): void => {
    setSaving(true);
    officeApi.saveAs(itemId, convert).then(
      (r) => {
        setSaving(false);
        if (!r.item) return;
        useDisk.getState().upsert(r.item);
        useUi.getState().openDialog({ kind: 'office', source: { itemId: r.item.id }, name: r.item.name });
      },
      (e: unknown) => {
        setSaving(false);
        toast.fail(e, t('office.saveAs.failed'));
      },
    );
  };

  const failed = load.kind === 'error' || state.status === 'error';
  const message =
    load.kind === 'error'
      ? load.why === 'unsupported'
        ? t('office.unsupported')
        : load.why === 'unavailable'
          ? t('office.unavailable')
          : t('office.failed')
      : state.problem === 'unreachable'
        ? t('office.unreachable')
        : state.problem === 'token'
          ? t('office.token')
          : t('office.error');
  const canRetry = !(load.kind === 'error' && (load.why === 'unsupported' || load.why === 'unavailable'));
  const frameLoading = load.kind === 'loading' || (load.kind === 'ready' && state.status === 'loading');

  return (
    <Modal open title={name} onClose={() => void requestClose()} full fullWidth closeButton>
      <div className="flex min-h-0 flex-1 flex-col gap-2 pb-4" data-testid="office-editor" data-state={failed ? 'error' : load.kind === 'ready' ? state.status : load.kind} data-mode={view ? 'view' : 'edit'}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <StatusBar state={state} view={view} convert={convert} others={state.others} />
          <div className="flex shrink-0 items-center gap-1.5">
            {convert ? (
              <Button variant="secondary" size="sm" onClick={saveAs} disabled={saving} data-testid="office-save-as">
                {t('office.saveAs', { ext: convert })}
              </Button>
            ) : null}
            {itemId && !phone ? (
              <Button variant="ghost" size="sm" onClick={inDisk} data-testid="office-in-disk">
                <FolderOpen className="size-4" aria-hidden /> {t('office.inDisk')}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={download} data-testid="office-download">
              <Download className="size-4" aria-hidden /> {t('lightbox.download')}
            </Button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          {load.kind === 'ready' && !failed ? <EditorFrame key={attempt} cfg={load.cfg} title={name} loading={state.status === 'loading'} onEvent={onEvent} /> : null}
          {failed ? (
            <div role="alert" className="grid size-full place-items-center rounded-[var(--radius-card)] border border-line bg-elev p-6 text-center" data-testid="office-error">
              <div className="flex max-w-[360px] flex-col items-center gap-3">
                <p className="text-body text-fg">{message}</p>
                {canRetry ? (
                  <Button variant="secondary" size="sm" onClick={retry} data-testid="office-retry">
                    <RotateCw className="size-4" aria-hidden /> {t('common.retry')}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {frameLoading && !failed ? (
            <span className="pointer-events-none absolute inset-0 grid place-items-center">
              <Spinner className="size-6 text-muted" label={t('office.loading')} />
            </span>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
