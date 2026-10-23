import { BookOpenText, CalendarDays, HardDrive, Mail, Phone, Shapes, SquareKanban, User, Users, type LucideIcon } from 'lucide-react';
import type { Locale } from '@/i18n';
import { getHome } from '@/i18n/home';
import { Container, nb } from './ui';

/** The app rail's nine sections, in its order (SectionRail.tsx): Team, Personal, Calendar, Boards, Mail, Wiki, Canvas, Disk, Telephony. */
export const RAIL_ICONS: LucideIcon[] = [Users, User, CalendarDays, SquareKanban, Mail, BookOpenText, Shapes, HardDrive, Phone];

/**
 * «Вместо семи сервисов — одно окно» (§4.2): eight category «tabs» fold into the Calab rail once, when the
 * section first scrolls into view (CSS, 600 ms, `data-reveal`). Without JS or with reduced motion the end state
 * is shown as is: the tabs dimmed, the rail lit.
 */
export function ReplaceStrip({ locale }: { locale: Locale }) {
  const t = getHome(locale).replace;
  return (
    <section id="one-window" aria-labelledby="replace-title" className="section replace" data-reveal>
      <Container className="replace-layout">
        <div className="heading-copy">
          <h2 id="replace-title" className="h2">
            {nb(t.title)}
          </h2>
          <p className="lead">{nb(t.lead)}</p>
        </div>
        <div className="replace-visual" aria-hidden="true">
          <ul className="replace-tabs">
            {t.tabs.map((tab, i) => (
              <li key={tab} className="replace-tab" style={{ animationDelay: `${i * 40}ms` }}>
                <span className="replace-tab-dot" />
                {tab}
              </li>
            ))}
          </ul>
          <span className="replace-arrow">→</span>
          <ul className="replace-rail">
            {RAIL_ICONS.map((Icon, i) => (
              <li key={i} title={t.rail[i]} style={{ animationDelay: `${300 + i * 35}ms` }}>
                <Icon size={20} strokeWidth={1.8} />
              </li>
            ))}
          </ul>
        </div>
        <p className="sr-only">
          {t.railLabel}: {t.rail.join(', ')}
        </p>
      </Container>
    </section>
  );
}
