import { beforeEach, describe, expect, it, vi } from 'vitest';

// The toast store pulls in the API client (and with it the platform bridge): only the store is under test.
vi.mock('../lib/log', () => ({ log: { info: () => undefined, warn: () => undefined, error: () => undefined } }));
vi.mock('../i18n', () => ({ t: (k: string) => k }));
vi.mock('../lib/api/errors', () => ({ describeError: () => ({ text: '', retry: false }), errorText: () => '' }));

import { useToasts } from '../stores/toasts';
import { RecoveryToasts, recoveryDecision, type RecoveryToastKind } from './recoveryToasts';

const texts = (): string[] => useToasts.getState().items.map((x) => x.text);

describe('recoveryDecision', () => {
  const order: RecoveryToastKind[] = ['unheard', 'busy', 'playback', 'outage'];
  it('shows anything while nothing is on screen', () => {
    for (const k of order) expect(recoveryDecision(null, k)).toBe('show');
  });
  it('a notice of the same or a higher rank replaces, a lower one is dropped', () => {
    for (const [i, shown] of order.entries()) {
      for (const [j, next] of order.entries()) expect(recoveryDecision(shown, next)).toBe(j <= i ? 'show' : 'drop');
    }
  });
});

describe('RecoveryToasts', () => {
  let rt: RecoveryToasts;
  beforeEach(() => {
    useToasts.setState({ items: [] });
    rt = new RecoveryToasts();
  });

  it('keeps at most one recovery toast when all four are raised in a row', () => {
    expect(rt.raise('outage', 'info', 'outage')).toBe(true);
    expect(rt.raise('playback', 'info', 'tap', { label: 'On', run: () => undefined })).toBe(true);
    expect(rt.raise('busy', 'warning', 'busy')).toBe(true);
    expect(rt.raise('unheard', 'error', 'unheard')).toBe(true);
    expect(texts()).toEqual(['unheard.']);
  });

  it('drops a less important notice while a more important one is shown', () => {
    rt.raise('busy', 'warning', 'busy');
    expect(rt.raise('playback', 'info', 'tap')).toBe(false);
    expect(rt.raise('outage', 'info', 'outage')).toBe(false);
    expect(texts()).toEqual(['busy']);
    expect(useToasts.getState().items[0]?.kind).toBe('warning');
  });

  it('shows a lower notice again once the higher one is gone', () => {
    rt.raise('busy', 'warning', 'busy');
    const id = useToasts.getState().items[0]?.id ?? 0;
    useToasts.getState().dismiss(id);
    expect(rt.raise('playback', 'info', 'tap')).toBe(true);
    expect(texts()).toEqual(['tap']);
  });

  it('does not touch other toasts', () => {
    useToasts.getState().push('success', 'saved');
    rt.raise('busy', 'warning', 'busy');
    rt.raise('unheard', 'error', 'unheard');
    expect(texts()).toEqual(['saved', 'unheard.']);
  });

  it('close takes down only its own kind', () => {
    rt.raise('busy', 'warning', 'busy');
    rt.close('playback');
    expect(texts()).toEqual(['busy']);
    expect(rt.isShown('busy')).toBe(true);
    rt.close('busy');
    expect(texts()).toEqual([]);
    expect(rt.isShown('busy')).toBe(false);
  });

  it('the same notice raised again replaces itself instead of stacking', () => {
    rt.raise('playback', 'info', 'tap');
    rt.raise('playback', 'info', 'tap');
    expect(useToasts.getState().items).toHaveLength(1);
  });
});
