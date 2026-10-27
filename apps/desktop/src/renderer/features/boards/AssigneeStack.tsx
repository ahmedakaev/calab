/**
 * The assignees of a card / list row as overlapping 20 px circles (#92): ≤ 3, the last one «+N»
 * when there are more; the same height whatever the count, so rows and the right edge never move.
 * Order: assigned earlier first. Names are in the button's tip (the caller), `title` per circle.
 */
import type { TaskAssignee } from '@calaba/protocol';
import { memo, useMemo, type ReactNode } from 'react';
import { stackLayout } from '../../lib/boards/assigneeStack';
import { memberName } from '../../stores/workspaces';
import { MemberAvatar } from './menus';

const RING = 'ring-2 ring-[var(--color-bg-elevated)]';

export const AssigneeStack = memo(function AssigneeStack({ workspaceId, assignees }: { workspaceId: string; assignees: readonly TaskAssignee[] }): ReactNode {
  const { shown, more, lead } = useMemo(() => {
    const byId = new Map(assignees.map((a) => [a.userId, a]));
    const l = stackLayout(assignees.map((a) => ({ userId: a.userId, atMs: a.assignedAt ? Number(a.assignedAt.seconds) * 1000 : 0 })));
    return { shown: l.shown.map((s) => byId.get(s.userId) as TaskAssignee), more: l.more, lead: assignees.length > 1 };
  }, [assignees]);
  const hidden = more ? assignees.filter((a) => !shown.includes(a)) : [];
  return (
    <span className="flex items-center -space-x-1.5" data-testid="assignee-stack" aria-hidden>
      {shown.map((a) => (
        <span key={a.userId} className={`relative shrink-0 rounded-full ${RING}`} title={a.note ? `${memberName(workspaceId, a.userId)} — ${a.note}` : memberName(workspaceId, a.userId)}>
          <MemberAvatar workspaceId={workspaceId} userId={a.userId} size={20} />
          {a.isLead && lead ? <span className={`absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-accent ${RING}`} aria-hidden /> : null}
        </span>
      ))}
      {more ? (
        <span className={`grid size-5 shrink-0 place-items-center rounded-full bg-active text-micro font-medium tabular-nums text-fg ${RING}`} title={hidden.map((a) => memberName(workspaceId, a.userId)).join(', ')} data-testid="assignee-more">
          +{more}
        </span>
      ) : null}
    </span>
  );
});
