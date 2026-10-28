import { create } from '@bufbuild/protobuf';
import { MessageSchema, TaskNoticeEntrySchema } from '@calaba/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ mentions: vi.fn(), taskNotices: vi.fn() }));
vi.mock('../lib/api/endpoints', () => ({ api: { me: api } }));
vi.mock('../lib/log', () => ({ log: { warn: () => undefined } }));
vi.mock('../platform', () => ({ platform: { kind: 'web', app: { log: () => undefined } } }));

const { loadMentions } = await import('./mentions');
const { useInbox } = await import('../stores/inbox');

const m = (id: string) => create(MessageSchema, { id, roomId: 'a' });
const n = (id: string) => create(TaskNoticeEntrySchema, { id, taskId: 't' });

beforeEach(() => {
  useInbox.getState().reset();
  api.mentions.mockReset();
  api.taskNotices.mockReset();
});

describe('loadMentions (ADR-0140)', () => {
  it('loads chat mentions and task notices side by side', async () => {
    api.mentions.mockResolvedValue({ messages: [m('04')], hasMore: false });
    api.taskNotices.mockResolvedValue({ entries: [n('05')], hasMore: true });
    await loadMentions();
    const s = useInbox.getState();
    expect(s.loaded).toBe(true);
    expect(s.items.map((x) => x.id)).toEqual(['04']);
    expect(s.notices.map((x) => x.id)).toEqual(['05']);
    expect(s.noticesHasMore).toBe(true);
    // Older: only the list that has more pages on, from its oldest id.
    api.taskNotices.mockResolvedValue({ entries: [n('01')], hasMore: false });
    await loadMentions(true);
    expect(api.mentions).toHaveBeenCalledTimes(1);
    expect(api.taskNotices).toHaveBeenLastCalledWith({ limit: 30, before: '05' });
    expect(useInbox.getState().notices.map((x) => x.id)).toEqual(['05', '01']);
  });

  it('one failing list does not empty the other', async () => {
    api.mentions.mockRejectedValue(new Error('down'));
    api.taskNotices.mockResolvedValue({ entries: [n('05')], hasMore: false });
    await loadMentions();
    const s = useInbox.getState();
    expect(s.loaded).toBe(true);
    expect(s.loading).toBe(false);
    expect(s.notices).toHaveLength(1);
  });
});
