/**
 * Who sees the «Телефония» section (ADR-0137 §5): a pure rule over what the client already knows —
 * the server never depends on it (every journal read, call and setting is checked there).
 *
 *  - not a guest, and
 *  - telephony is connected in the workspace (`Workspace.sip_enabled`) and I have something to do
 *    there: PLACE_CALLS of the workspace, an internal number of mine, VIEW_JOURNALS or
 *    MANAGE_INTEGRATIONS.
 *
 * The administrator's branch «no connection yet / the plan lapsed» (the section opens on
 * «Подключение») arrives with the settings pages (T5); until then the settings window keeps them.
 */
export interface TelephonyAccessInput {
  guest: boolean;
  /** Workspace.sip_enabled: the account is on and the trunk saved. */
  sipEnabled: boolean;
  /** PLACE_CALLS at the workspace level (no room overrides: a personal call has no room). */
  placeCalls: boolean;
  /** WorkspaceMember.extension of mine (ADR-0117), '' when none. */
  extension: string;
  viewJournals: boolean;
  manageIntegrations: boolean;
}

export function telephonyVisible(a: TelephonyAccessInput): boolean {
  if (a.guest || !a.sipEnabled) return false;
  return a.placeCalls || a.extension !== '' || a.viewJournals || a.manageIntegrations;
}

/**
 * The scopes of the journal I may read: my own calls always; the whole workspace (and one
 * employee's) with VIEW_JOURNALS (ADR-0137 §1 «Видимость»).
 */
export const mayReadAllCalls = (a: Pick<TelephonyAccessInput, 'viewJournals'>): boolean => a.viewJournals;
