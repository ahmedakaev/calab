import { useToasts, type Toast, type ToastAction } from '../stores/toasts';

/** The recovery notices after a return to the app (DEV-4955), by the order they matter. */
export type RecoveryToastKind = 'unheard' | 'busy' | 'playback' | 'outage';

/** unheard > mic busy > tap to enable sound > outage notice. */
const RANK: Record<RecoveryToastKind, number> = { unheard: 4, busy: 3, playback: 2, outage: 1 };

/**
 * What to do with a new recovery notice while `shown` is on screen: a notice of the same or a
 * higher rank replaces it, a lower one is dropped (the state behind it is re-raised by its own
 * check, if it still holds).
 */
export function recoveryDecision(shown: RecoveryToastKind | null, next: RecoveryToastKind): 'show' | 'drop' {
  return shown === null || RANK[next] >= RANK[shown] ? 'show' : 'drop';
}

/**
 * At most one recovery toast at a time: on a phone four of them covered the header and most of the
 * list. Built on the toast store (push / dismiss); other toasts are not touched.
 */
export class RecoveryToasts {
  private cur: { kind: RecoveryToastKind; id: number } | null = null;

  private shownKind(): RecoveryToastKind | null {
    if (this.cur && !useToasts.getState().items.some((x) => x.id === this.cur?.id)) this.cur = null;
    return this.cur?.kind ?? null;
  }

  isShown(kind: RecoveryToastKind): boolean {
    return this.shownKind() === kind;
  }

  /** Raises the notice unless a more important one is on screen; returns whether it was shown. */
  raise(kind: RecoveryToastKind, toastKind: Toast['kind'], text: string, action?: ToastAction, durationMs?: number): boolean {
    const shown = this.shownKind();
    if (recoveryDecision(shown, kind) === 'drop') return false;
    if (this.cur) useToasts.getState().dismiss(this.cur.id);
    this.cur = { kind, id: useToasts.getState().push(toastKind, text, action, durationMs) };
    return true;
  }

  /** Takes the notice of `kind` down (its cause is gone); another kind stays. */
  close(kind: RecoveryToastKind): void {
    if (this.shownKind() !== kind || !this.cur) return;
    useToasts.getState().dismiss(this.cur.id);
    this.cur = null;
  }
}

export const recoveryToasts = new RecoveryToasts();
