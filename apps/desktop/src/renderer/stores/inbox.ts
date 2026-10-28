import type { Message, TaskNoticeEntry } from '@calaba/protocol';
import { create } from 'zustand';

/**
 * Mentions inbox (title bar «Упоминания», ADR-0141): chat mentions — history from
 * GET /api/me/mentions merged with the ones that arrive live over the gateway — and task notices —
 * GET /api/me/task-notices merged with the live TASK_UPDATE notices. Each list newest first,
 * unique by id (uuidv7: the two interleave by id).
 */
interface InboxState {
  items: Message[];
  /** Task notices (ADR-0141). */
  notices: TaskNoticeEntry[];
  /** History was fetched at least once (the first open shows a spinner until then). */
  loaded: boolean;
  loading: boolean;
  /** Older mention history exists on the server. */
  hasMore: boolean;
  /** Older task notices exist on the server. */
  noticesHasMore: boolean;
  setLoading: (v: boolean) => void;
  /** Merges a history page; `hasMore` only moves forward from the oldest page. */
  addPage: (list: Message[], hasMore: boolean, older: boolean) => void;
  /** Merges a page of task notices, like addPage. */
  addNotices: (list: TaskNoticeEntry[], hasMore: boolean, older: boolean) => void;
  addLive: (m: Message) => void;
  addLiveNotice: (e: TaskNoticeEntry) => void;
  /** Edit: keeps the new content, or drops the item when it no longer mentions me. */
  update: (m: Message, stillMentions: boolean) => void;
  remove: (messageId: string) => void;
  removeRooms: (keep: (roomId: string) => boolean) => void;
  /** A task gone for me (purged, or a scoped viewer lost it): its notices leave. */
  removeTask: (taskId: string) => void;
  reset: () => void;
}

/** uuidv7 ids are time-ordered: newest first. */
const merge = <T extends { id: string }>(a: T[], b: T[]): T[] => {
  const byId = new Map<string, T>();
  for (const m of [...a, ...b]) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => (x.id < y.id ? 1 : x.id > y.id ? -1 : 0));
};

/** Kept in memory; older pages are fetched on demand. */
const MAX_ITEMS = 500;

export const useInbox = create<InboxState>()((set) => ({
  items: [],
  notices: [],
  loaded: false,
  loading: false,
  hasMore: false,
  noticesHasMore: false,
  setLoading: (loading) => set({ loading }),
  addPage: (list, hasMore, older) =>
    set((s) => ({ items: merge(s.items, list).slice(0, MAX_ITEMS), loaded: true, hasMore: older || !s.loaded ? hasMore : s.hasMore })),
  addNotices: (list, hasMore, older) =>
    set((s) => ({ notices: merge(s.notices, list).slice(0, MAX_ITEMS), noticesHasMore: older || !s.loaded ? hasMore : s.noticesHasMore })),
  addLive: (m) => set((s) => ({ items: merge([m], s.items).slice(0, MAX_ITEMS) })),
  addLiveNotice: (e) => set((s) => ({ notices: merge([e], s.notices).slice(0, MAX_ITEMS) })),
  update: (m, still) =>
    set((s) => {
      if (!s.items.some((x) => x.id === m.id)) return still ? { items: merge([m], s.items) } : {};
      return { items: still ? s.items.map((x) => (x.id === m.id ? m : x)) : s.items.filter((x) => x.id !== m.id) };
    }),
  remove: (id) => set((s) => (s.items.some((x) => x.id === id) ? { items: s.items.filter((x) => x.id !== id) } : {})),
  removeRooms: (keep) => set((s) => ({ items: s.items.filter((m) => keep(m.roomId)) })),
  removeTask: (taskId) =>
    set((s) => (s.notices.some((e) => e.taskId === taskId) ? { notices: s.notices.filter((e) => e.taskId !== taskId) } : {})),
  reset: () => set({ items: [], notices: [], loaded: false, loading: false, hasMore: false, noticesHasMore: false }),
}));
