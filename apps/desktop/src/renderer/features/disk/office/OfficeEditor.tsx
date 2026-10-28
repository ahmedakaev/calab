import { OfficeConfigResponseSchema, OfficeMode, type OfficeConfigResponse } from '@calaba/protocol';
import { Download } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as DialogP from '../../../components/radix/dialog';
import { IconButton, Spinner } from '../../../components/ui';
import { getLocale, t } from '../../../i18n';
import { call, qs } from '../../../lib/api/client';
import { downloadItem } from '../../../services/disk';
import { useDisk } from '../../../stores/disk';
import { useUi } from '../../../stores/ui';
import { ViewerBar, onDark } from '../../chat/Lightbox';
import { connectHost, nextStatus, originOf, type OfficeStatus } from './bridge';

type Load = { kind: 'loading' } | { kind: 'ready'; cfg: OfficeConfigResponse } | { kind: 'error'; unsupported: boolean };

const appTheme = (): 'dark' | 'light' => (document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark');

/** GET /api/office/config: the signed editor configuration of a Disk item (ADR-0143). */
export const officeApi = {
  config: (item: string, p: { theme: 'dark' | 'light'; phone: boolean; lang: string }, signal?: AbortSignal) =>
    call('GET', `/api/office/config${qs({ item, theme: p.theme, phone: p.phone ? 1 : undefined, lang: p.lang })}`, OfficeConfigResponseSchema, undefined, signal),
};

function useOfficeConfig(itemId: string): Load {
  const [state, setState] = useState<{ id: string; v: Load } | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    officeApi
      .config(itemId, { theme: appTheme(), phone: useUi.getState().phone.on, lang: getLocale().split('-')[0] ?? 'ru' }, ac.signal)
      .then((cfg) => {
        if (!ac.signal.aborted) setState({ id: itemId, v: { kind: 'ready', cfg } });
      })
      .catch((e: unknown) => {
        if (!ac.signal.aborted) setState({ id: itemId, v: { kind: 'error', unsupported: (e as { status?: number }).status === 415 } });
      });
    return () => ac.abort();
  }, [itemId]);
  return state?.id === itemId ? state.v : { kind: 'loading' };
}

/**
 * The editor's frame: the host page on the Document Server's origin in an iframe that exists only
 * while the dialog is open. Unmounting sends «close» (the host destroys the editor) and React
 * removes the iframe — the Document Server's JS, its socket and its timers go with it.
 */
function EditorFrame({ cfg, title, onStatus }: { cfg: OfficeConfigResponse; title: string; onStatus: (s: (prev: OfficeStatus) => OfficeStatus) => void }): ReactNode {
  const ref = useRef<HTMLIFrameElement>(null);
  const origin = originOf(cfg.docsUrl);
  useEffect(() => {
    const frame = ref.current;
    if (!frame || !origin) return;
    const conn = connectHost(window, frame, origin, cfg.configJson, (e) => onStatus((prev) => nextStatus(prev, e)));
    return () => conn.close();
  }, [cfg, origin, onStatus]);
  return (
    <iframe
      ref={ref}
      src={cfg.hostUrl}
      title={title}
      data-testid="office-frame"
      referrerPolicy="no-referrer"
      allow="clipboard-read; clipboard-write"
      className="size-full rounded-[var(--radius-card)] border-0 bg-elev shadow-[var(--shadow-popover)]"
    />
  );
}

/**
 * «Открыть» on a Disk xlsx / docx (ADR-0143, spike behind VITE_OFFICE): the full-window viewer
 * shell (`ViewerBar`: name, save status, «Скачать», «Закрыть») around ONLYOFFICE Docs. The mode
 * is the server's (Disk bits: «Правка» edits, the rest views); saving is the Document Server's
 * (autosave, Ctrl+S) — each save lands as a new version of the same Disk file.
 */
export function OfficeEditor({ itemId, name, onClose }: { itemId: string; name: string; onClose: () => void }): ReactNode {
  const load = useOfficeConfig(itemId);
  const [status, setStatus] = useState<OfficeStatus>('loading');
  const item = useDisk((s) => s.items[itemId]);
  const view = load.kind === 'ready' && load.cfg.mode !== OfficeMode.EDIT;
  const meta =
    load.kind === 'error' ? undefined : view && status !== 'loading' ? t('office.view') : status === 'saving' ? t('office.saving') : status === 'saved' ? t('office.saved') : undefined;
  return (
    <DialogP.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogP.Portal>
        <DialogP.Overlay className="no-drag anim-in fixed inset-0 z-[var(--z-modal)] bg-[rgb(0_0_0/82%)]" />
        <DialogP.Content
          aria-modal="true"
          data-testid="office-editor"
          data-state={load.kind === 'ready' ? status : load.kind}
          className="anim-in fixed inset-0 z-[var(--z-modal)] flex flex-col focus:outline-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          // Esc inside the editor belongs to the editor (cell edit, dialogs): only «Закрыть» closes.
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <ViewerBar title={name} meta={meta}>
            {item ? (
              <IconButton label={t('lightbox.download')} onClick={() => downloadItem(item)} className={onDark} data-testid="office-download">
                <Download className="size-5" />
              </IconButton>
            ) : null}
          </ViewerBar>
          <div className="relative grid min-h-0 flex-1 place-items-center px-2 pb-2">
            {load.kind === 'ready' ? (
              <EditorFrame cfg={load.cfg} title={name} onStatus={setStatus} />
            ) : load.kind === 'error' ? (
              <span role="alert" className="rounded-full bg-[rgb(0_0_0/60%)] px-3 py-1.5 text-caption text-[color:var(--color-on-accent)]">
                {load.unsupported ? t('office.unsupported') : t('office.failed')}
              </span>
            ) : null}
            {load.kind === 'loading' || (load.kind === 'ready' && status === 'loading') ? (
              <span className="pointer-events-none absolute grid size-12 place-items-center rounded-full bg-[rgb(0_0_0/50%)]">
                <Spinner className="size-6 text-[color:var(--color-on-accent)]" label={t('office.loading')} />
              </span>
            ) : null}
          </div>
        </DialogP.Content>
      </DialogP.Portal>
    </DialogP.Root>
  );
}
