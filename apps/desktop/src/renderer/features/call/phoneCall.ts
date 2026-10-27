import type { SipCall } from '@calaba/protocol';
import { t } from '../../i18n';
import { isPersonalRoom, isPhoneRoom, phoneCallId } from '../../lib/sipInbound';
import { phonePartyLabel } from '../../lib/sipOutbound';
import { useSipInbound } from '../../stores/sipInbound';
import { useSipOutbound } from '../../stores/sipOutbound';
import { memberName, useWorkspaces } from '../../stores/workspaces';

/**
 * Who a phone call is with, for the island, the phone's call band and the notification (ADR-0137
 * §2 caller ID): the contact «Анна Петрова (ООО Ромашка)», the employee whose phone it is, the
 * number, «Скрытый номер». A string per subscriber: the band re-renders only when it changes.
 */
export function callPartyLabel(c: SipCall, fallbackName = ''): string {
  const employee = !c.callerName && c.callerUserId ? memberName(c.workspaceId, c.callerUserId) : '';
  return phonePartyLabel(c, t('call.sipUnknown'), fallbackName || employee);
}

/** The label of the phone call whose voice session `roomId` is (inbound or personal); null for any other room. */
export function usePhoneCallLabel(roomId: string | null | undefined): string | null {
  // Names follow renames of members (the employee case): read through the workspaces store.
  const inbound = useSipInbound((s) => (isPhoneRoom(roomId) && !isPersonalRoom(roomId) && s.active?.id === phoneCallId(roomId) ? s.active : null));
  const outbound = useSipOutbound((s) => (isPersonalRoom(roomId) && s.call?.id === phoneCallId(roomId) ? s.call : null));
  const name = useSipOutbound((s) => s.name);
  return useWorkspaces(() => (inbound ? callPartyLabel(inbound) : outbound ? callPartyLabel(outbound, name) : isPhoneRoom(roomId) ? '' : null));
}
