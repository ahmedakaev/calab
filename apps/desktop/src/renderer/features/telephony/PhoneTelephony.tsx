import { Phone, Settings } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { HeaderIcon } from '../../components/PhoneHeader';
import { IconButton, Segmented } from '../../components/ui';
import { t, useLocale } from '../../i18n';
import { openTab } from '../../services/phoneNav';
import { useTelephonyUi } from '../../stores/telephonyUi';
import { useMayManageTelephony, useTelephonyConnected, useTelephonyVisible } from './access';
import { JournalList } from './Recents';
import { FilterButton, FilterCard, FilterChips, SearchField, setFilter } from './RecentsFilters';
import { NotConnected } from './settings/Connection';
import { pushTelSettings } from './settings/pages';

/**
 * «Телефония» on the phone (ADR-0137 §7 — the owner's priority: one hand, actions at the thumb,
 * the iPhone «Телефон» patterns): the tab root — the title, «Недавние | Пропущенные» segments (the
 * third, «Контакты», arrives with T4), the list with the search pill that scrolls away with it
 * (as iOS Contacts) and the funnel at its right end → a centred card with the other filters; the
 * set ones as chips. A row's tap calls back an employee or opens the detail (a pushed screen).
 * ⚙ in the header (MANAGE_INTEGRATIONS) pushes the station's settings list (T5); before telephony
 * is connected the root is the empty state «Подключите SIP-провайдера» with its one action.
 */
export function PhoneTelephony({ workspaceId }: { workspaceId: string }): ReactNode {
  useLocale();
  const visible = useTelephonyVisible(workspaceId);
  useEffect(() => {
    // The section went away (telephony off, a right taken): back to «Команда».
    if (!visible) openTab('chats');
  }, [visible]);
  const segment = useTelephonyUi((s) => s.filter.segment);
  const [filters, setFilters] = useState(false);
  const manage = useMayManageTelephony(workspaceId);
  const connected = useTelephonyConnected(workspaceId);
  if (!visible) return null;
  const header = (
    <Bar>
      <HeaderIcon icon={Phone} />
      <h1 className="min-w-0 flex-1 truncate text-headline font-semibold">{t('tel.section')}</h1>
      {manage ? (
        <IconButton tip={false} label={t('tset.title')} onClick={() => pushTelSettings('list')} bar data-testid="tel-settings-open">
          <Settings className="size-5" aria-hidden />
        </IconButton>
      ) : null}
    </Bar>
  );
  if (!connected) {
    return (
      <section className="mat-content flex min-h-0 flex-1 flex-col" data-testid="phone-telephony">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NotConnected onStart={() => pushTelSettings('connection')} />
        </div>
      </section>
    );
  }
  return (
    <section className="mat-content flex min-h-0 flex-1 flex-col" data-testid="phone-telephony">
      {header}
      <div className="shrink-0 px-3 pb-2 pt-1">
        <Segmented
          value={segment}
          onChange={(v) => setFilter({ segment: v })}
          label={t('tel.seg.label')}
          fill
          options={[
            { value: 'all', label: t('tel.seg.recents') },
            { value: 'missed', label: t('tel.seg.missed') },
          ]}
          testId="tel-segment"
        />
      </div>
      <JournalList ws={workspaceId} phone header={<ListHeader ws={workspaceId} onFilters={() => setFilters(true)} />} />
      <FilterCard ws={workspaceId} open={filters} onClose={() => setFilters(false)} />
    </section>
  );
}

/** The search pill with the funnel and, under it, the chips of the set filters (it scrolls with the list). */
function ListHeader({ ws, onFilters }: { ws: string; onFilters: () => void }): ReactNode {
  return (
    <div className="pt-1">
      <div className="px-3 pb-2">
        <SearchField phone trailing={<FilterButton onOpen={onFilters} />} />
      </div>
      <FilterChips ws={ws} />
    </div>
  );
}
