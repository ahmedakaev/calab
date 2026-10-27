import type { SipJournalEntry } from '@calaba/protocol';
import { t } from '../../i18n';
import { haptics } from '../../lib/haptics';
import { pushOnTab } from '../../lib/phoneNav';
import { formatPhone } from '../../lib/sip';
import { copyText } from '../../services/boards';
import { startCall } from '../../services/call';
import { startDm } from '../../services/dms';
import { useTelephonyUi } from '../../stores/telephonyUi';
import { useUi } from '../../stores/ui';
import { canCallNow } from '../dm/canDm';
import { numberOf } from './timeline';

/*
 * What a row and the detail do (ADR-0137 §6–§7). «Позвонить» is the internal call (ADR-0034) to the
 * employee whose phone the number is; the call over the trunk to an outside number arrives with T4
 * — until then a row of an outside number opens its detail.
 */

/** The employee I can call back instead of the number ('' = none). */
export function internalPeer(e: SipJournalEntry | undefined, ws: string): string {
  const u = e?.memberUserId ?? '';
  return u && canCallNow(u, ws) ? u : '';
}

export function callBack(e: SipJournalEntry, ws: string): boolean {
  const peer = internalPeer(e, ws);
  if (!peer) return false;
  haptics.impact();
  void startCall(peer);
  return true;
}

/** The detail of a call: the right panel on the desktop, a pushed screen on the phone. */
export function openCallDetail(callId: string): void {
  const ui = useUi.getState();
  if (ui.phone.on) ui.setPhone((n) => pushOnTab(n, 'telephony', { kind: 'telCall', callId }));
  else useTelephonyUi.getState().openDetail(callId);
}

export function copyNumber(e: SipJournalEntry): void {
  const n = numberOf(e);
  if (n) copyText(formatPhone(n), t('tel.copied'));
}

/** «Написать» the employee whose phone it is. */
export function writeTo(e: SipJournalEntry): void {
  if (e.memberUserId) void startDm(e.memberUserId);
}
