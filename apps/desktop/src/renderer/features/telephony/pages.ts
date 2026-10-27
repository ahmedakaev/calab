import { History, type LucideIcon } from 'lucide-react';
import { t } from '../../i18n';
import type { TelPage } from '../../stores/telephonyUi';

/**
 * The pages of «Телефония» (ADR-0137 §6): the column's navigation on the desktop. One registry so
 * the next stages only add entries — «Контакты» and «Набор» (T4), the station's settings under
 * «Настройки» for MANAGE_INTEGRATIONS (T5).
 */
export interface TelPageDef {
  id: TelPage;
  label: () => string;
  icon: LucideIcon;
  /** The red count of my missed calls next to it («Недавние»). */
  missedBadge?: boolean;
}

export const TEL_PAGES: readonly TelPageDef[] = [{ id: 'recents', label: () => t('tel.recents'), icon: History, missedBadge: true }];
