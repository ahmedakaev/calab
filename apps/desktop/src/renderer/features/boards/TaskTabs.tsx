import { X } from 'lucide-react';
import { memo, useCallback, useEffect, type MouseEvent, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Tip, cx } from '../../components/ui';
import { t } from '../../i18n';
import { isMobileNow } from '../../lib/mobile';
import { openTaskAnywhere } from '../../services/boards';
import { useBoards } from '../../stores/boards';
import { useBoardsUi } from '../../stores/boardsUi';
import { useTaskTabs, type TaskTab } from '../../stores/taskTabs';

/** A tab entry for a task: the store's task when loaded, else only where it lives. */
function entryOf(id: string, workspaceId: string, boardId: string): TaskTab {
  const task = useBoards.getState().tasks[id];
  const prev = useTaskTabs.getState().tabs.find((x) => x.id === id);
  return { id, ws: task?.workspaceId ?? prev?.ws ?? workspaceId, board: task?.boardId ?? prev?.board ?? boardId, key: task?.key ?? prev?.key ?? '', title: task?.title ?? prev?.title ?? '', at: Date.now() };
}

/**
 * «Открыть в новой вкладке» (Ctrl/⌘-click on a card, the card menu): the task joins the strip in
 * the background; the open one (if any) stays open and joins too, so it is not lost.
 */
export function openInTab(id: string, workspaceId: string, boardId: string): void {
  const open = useBoardsUi.getState().taskId;
  useTaskTabs.getState().add(entryOf(id, workspaceId, boardId), open ? entryOf(open, workspaceId, boardId) : undefined);
}

/**
 * Ctrl/⌘-click on a card or row opens a background tab (#93) — unless a selection is under way,
 * where ⌘-click keeps toggling it — and never on the phone (no tabs there). True when it did.
 */
export function tabClick(id: string, e: Pick<MouseEvent, 'metaKey' | 'ctrlKey' | 'shiftKey'>, workspaceId: string, boardId: string): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || isMobileNow()) return false;
  if (Object.keys(useBoardsUi.getState().selected).length > 0) return false;
  openInTab(id, workspaceId, boardId);
  return true;
}

/**
 * The open tasks as browser tabs, above the boards area (desktop only). Follows the open task:
 * a plain open replaces the current tab (stores/taskTabs.ts). Rendered only with tabs, so a
 * workspace that never used them pays nothing. Each tab is a leaf with its own subscriptions.
 */
export const TaskTabs = memo(function TaskTabs({ workspaceId, boardId }: { workspaceId: string; boardId: string }): ReactNode {
  const taskId = useBoardsUi((s) => s.taskId);
  useEffect(() => {
    if (taskId) useTaskTabs.getState().activate(entryOf(taskId, workspaceId, boardId));
    // A new open task only: the workspace and board are its fallback place, not triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);
  const ids = useTaskTabs(useShallow((s) => s.tabs.filter((x) => x.ws === workspaceId).map((x) => x.id)));
  if (ids.length === 0) return null;
  return (
    <nav aria-label={t('boards.tabs')} className="scrollbar-thin flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2" data-testid="task-tabs">
      {ids.map((id) => (
        <TabItem key={id} id={id} />
      ))}
    </nav>
  );
});

const TabItem = memo(function TabItem({ id }: { id: string }): ReactNode {
  const active = useBoardsUi((s) => s.taskId === id);
  const stored = useTaskTabs((s) => s.tabs.find((x) => x.id === id));
  const key = useBoards((s) => s.tasks[id]?.key ?? '') || stored?.key || '';
  const title = useBoards((s) => s.tasks[id]?.title ?? '') || stored?.title || '';
  // The snapshot follows the live task, so the strip is right after a reload too.
  useEffect(() => {
    if (key || title) useTaskTabs.getState().sync(id, key, title);
  }, [id, key, title]);
  const open = useCallback(() => {
    const tab = useTaskTabs.getState().tabs.find((x) => x.id === id);
    if (tab) openTaskAnywhere({ id, workspaceId: tab.ws, boardId: tab.board });
  }, [id]);
  const close = useCallback((e?: MouseEvent) => {
    e?.stopPropagation();
    const wasOpen = useBoardsUi.getState().taskId === id;
    const next = useTaskTabs.getState().close(id);
    if (!wasOpen) return;
    if (next) openTaskAnywhere({ id: next.id, workspaceId: next.ws, boardId: next.board });
    else useBoardsUi.getState().openTask(null);
  }, [id]);
  return (
    <div
      className={cx('group flex h-7 min-w-0 max-w-[200px] shrink-0 items-center rounded-[var(--radius-row)] text-control', active ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg')}
      onAuxClick={(e) => e.button === 1 && close()}
      data-testid="task-tab"
      data-task-tab={id}
      data-active={active || undefined}
    >
      <button type="button" onClick={open} aria-current={active ? 'page' : undefined} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[var(--radius-row)] py-1 pl-2 pr-1 text-left" title={`${key} ${title}`.trim()}>
        <span className="shrink-0 font-medium tabular-nums">{key}</span>
        <span className="min-w-0 truncate">{title}</span>
      </button>
      <Tip label={t('boards.tab.close')}>
        <button type="button" onClick={close} aria-label={t('boards.tab.close')} className="mr-1 grid size-5 shrink-0 place-items-center rounded-[var(--radius-icon)] text-faint hover:bg-hover hover:text-fg" data-testid="task-tab-close">
          <X className="size-3.5" strokeWidth={1.75} aria-hidden />
        </button>
      </Tip>
    </div>
  );
});
