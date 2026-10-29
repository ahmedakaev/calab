import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { parseNotificationState, parseNotificationTestResult, type HostNotificationTestResult, type HostNotificationState } from '../../desktop/src/shared/hostActivity';

interface NativePush {
  testNotification(document: string, body: string): Promise<unknown>;
  pushState(document: string, requestPermission: boolean): Promise<unknown>;
  acknowledgePush(document: string, eventId: string): Promise<void>;
  addListener(name: 'onPushChanged', callback: (value: { document: string; state: unknown }) => void): { remove(): void };
  /** Android only: the document grant the iOS WebView patch posts natively (ADR-0070, Android). */
  grantDocument?(document: string): void;
  revokeDocument?(logout: boolean): void;
}
const native = Platform.OS === 'ios' || Platform.OS === 'android' ? requireOptionalNativeModule<NativePush>('CalabMessageNotifications') : null;
/**
 * The channel can truthfully report unsupported even on a build without APNs/FCM; Activity
 * permission is unrelated. Android (DEV-5033): the origin + main-frame challenge boundary of
 * activityProtocol.ts stands in for the iOS native frame check.
 */
export const hostChannelEnabled = Platform.OS === 'ios' || Platform.OS === 'android';

/** Android: hand the proven document to the push module, or revoke it (navigation, reload, logout). */
export function grantNotificationsDocument(document: string): void {
  if (Platform.OS === 'android') native?.grantDocument?.(document);
}
export function revokeNotificationsDocument(logout: boolean): void {
  if (Platform.OS === 'android') native?.revokeDocument?.(logout);
}
export async function notificationState(document: string, request: boolean): Promise<HostNotificationState> {
  try { return parseNotificationState(await native?.pushState(document, request)) ?? { permission: 'unsupported' }; }
  catch { return { permission: 'unsupported' }; }
}
export function subscribeNotifications(callback: (document: string, state: HostNotificationState) => void): () => void {
  const subscription = native?.addListener('onPushChanged', (value) => {
    const state = parseNotificationState(value.state);
    if (state) callback(value.document, state);
  });
  return () => subscription?.remove();
}
export function notificationReply(host: number, document: string, request: number, state: HostNotificationState): string {
  const detail = JSON.stringify({ v: 1, host, document, request, state });
  return `window.dispatchEvent(new CustomEvent('calab-host-notifications', {detail: ${detail}})); true;`;
}

export async function testNotification(document: string, body: string): Promise<HostNotificationTestResult> {
  if (!native) return 'unsupported';
  try { return parseNotificationTestResult(await native.testNotification(document, body)) ?? 'failed'; }
  catch { return 'failed'; }
}
export function notificationTestReply(host: number, document: string, request: number, result: HostNotificationTestResult): string {
  return `window.dispatchEvent(new CustomEvent('calab-host-notification-test', {detail: ${JSON.stringify({ v: 1, host, document, request, result })}})); true;`;
}

export function acknowledgeNotification(document: string, eventId: string): void { void native?.acknowledgePush(document, eventId).catch(() => undefined); }
