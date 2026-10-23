import { Bot, Check } from 'lucide-react';
import { localePath, type Locale } from '@/i18n';
import { getHome } from '@/i18n/home';
import { getTelephony } from '@/i18n/telephony';
import { Button, Card, nb, Section, SectionHeading, Shot } from './ui';

/** «Телефония» (§4.5): three real captures with captions, six one-line facts, the bot block. Business and Enterprise. */
export function TelephonySection({ locale }: { locale: Locale }) {
  const t = getHome(locale);
  const p = t.telephony;
  return (
    <Section id="telephony" labelledBy="telephony-title" className="telephony">
      <SectionHeading id="telephony-title" eyebrow={getTelephony(locale).eyebrow} title={p.title} lead={p.lead} sticker="headphones" />
      <ul className="shot-row swipe-sm">
        {p.shots.map((s) => (
          <li key={s.shot}>
            <figure>
              <Shot scene={s.shot} locale={locale} alt={t.alts[s.shot]} sizes="(min-width: 1360px) 420px, (min-width: 1024px) 31vw, 86vw" />
              <figcaption className="caption">{nb(s.caption)}</figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <div className="telephony-facts">
        <ul className="check-list">
          {p.points.map((point) => (
            <li key={point}>
              <Check aria-hidden="true" size={18} strokeWidth={2.25} />
              {nb(point)}
            </li>
          ))}
        </ul>
        <Card className="telephony-bot">
          <Bot aria-hidden="true" size={24} strokeWidth={1.9} />
          <div>
            <h3 className="h3">{p.botTitle}</h3>
            <p className="tile-text">{nb(p.botText)}</p>
            <p className="caption">{nb(p.plan)}</p>
            <div className="button-row">
          <Button href={localePath(locale, 'docs/telephony/')} variant="secondary" size="md">
            {p.docs}
          </Button>
          <Button href={localePath(locale, 'docs/bots/')} variant="secondary" size="md">
            {p.botApi}
          </Button>
            </div>
          </div>
        </Card>
      </div>
    </Section>
  );
}
