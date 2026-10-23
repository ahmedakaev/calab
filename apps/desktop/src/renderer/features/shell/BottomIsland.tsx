import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useCanvasUi } from '../../stores/canvasUi';
import { useMailUi } from '../../stores/mailUi';
import { useWikiUi } from '../../stores/wikiUi';
import { SelfPanel } from './SelfPanel';
import { VoiceBar } from './VoiceBar';
import { MeetingRecordPrompt } from '../calendar/RoomEvent';

/** Which left column the island's right edge follows (docs/08 «Нижний островок»). */
export type IslandColumn = 'sidebar' | 'wiki' | 'canvas' | 'mail';

/**
 * Bottom island (docs/08 «Нижний островок», Discord reference): «Голос подключён» and
 * the self panel as one floating block across the whole left part — from the rail's
 * left edge to the current screen's left column right edge, 8 px in (4 px up from the bottom, so my
 * avatar lands on the rail's axis at the inset the old rail avatar had), radius 12, on the window
 * layer. The rail and the column end above it: its height is published as `--island-height` on the
 * parent (their bottom padding).
 *
 * One island on every desktop screen (owner 23.10), with and without a call (VoiceBar only in
 * voice). `column` picks the width: room / DM / boards / calendar / Disk columns are
 * `--sidebar-width`, the wiki and canvas trees their own resizable width, mail its leftmost column's clamp.
 */
export function BottomIsland({ column }: { column: IslandColumn }): ReactNode {
  // Primitive selectors; only the active screen's store can change while it is shown.
  const wikiW = useWikiUi((s) => (column === 'wiki' ? s.treeWidth : 0));
  // A collapsed canvas tree has no column: the island keeps the usual size.
  const canvasW = useCanvasUi((s) => (column === 'canvas' && !s.treeCollapsed ? s.treeWidth : 0));
  // Mail: the leftmost column - the mailbox sidebar when shown, else the thread list.
  const mailSidebar = useMailUi((s) => column === 'mail' && s.sidebar);
  const colW =
    column === 'wiki'
      ? `${wikiW}px`
      : column === 'canvas' && canvasW > 0
        ? `${canvasW}px`
        : column === 'mail'
          ? mailSidebar
            ? 'clamp(224px, 19vw, 260px)'
            : 'clamp(300px, 30vw, 380px)'
          : 'var(--sidebar-width)';
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const ro = new ResizeObserver(() => host.style.setProperty('--island-height', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      host.style.removeProperty('--island-height');
    };
  }, []);
  return (
    <div
      ref={ref}
      data-testid="bottom-island"
      data-island
      className="mat-toolbar absolute bottom-2 left-2 z-[var(--z-sticky)] flex flex-col divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] shadow-[var(--shadow-island)]"
      style={{ width: `calc(var(--rail-width) + ${colW} - 16px)` }}
    >
      <MeetingRecordPrompt />
      <VoiceBar />
      <SelfPanel />
    </div>
  );
}
