import { Bot, Check } from 'lucide-react';
import { localePath, type Locale } from '@/i18n';
import { getHome } from '@/i18n/home';
import { getTelephony } from '@/i18n/telephony';
import { Button, Card, nb, Section, SectionHeading, Shot } from './ui';

/** «Телефония» (§4.5): the live calls with the six facts, the IVR and the groups, the bot block. Business and Enterprise. */
export function TelephonySection({ locale }: { locale: Locale }) {
  const t = getHome(locale);
  const p = t.telephony;
  // The live calls lead (left, with the six facts and the bot block under them); the IVR and the groups are stacked on the right, so every
  // frame is ~620 px wide (≥ 0.66 of its 698 px crop on 1440) instead of three 410 px ones.
  const [ivr, call, groups] = p.shots;
  const side = [ivr, groups];
  const figure = (s: (typeof p.shots)[number]) => (
    <figure key={s.shot}>
      <Shot scene={s.shot} locale={locale} alt={t.alts[s.shot]} sizes="(min-width: 1360px) 628px, (min-width: 1024px) 46vw, calc(100vw - 40px)" />
      <figcaption className="caption">{nb(s.caption)}</figcaption>
    </figure>
  );
  return (
    <Section id="telephony" labelledBy="telephony-title" className="telephony">
      <SectionHeading id="telephony-title" eyebrow={getTelephony(locale).eyebrow} title={p.title} lead={p.lead} sticker="headphones" />
      <div className="telephony-grid">
        <div className="telephony-main">
          {figure(call)}
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
        <div className="telephony-side">
          {side.map(figure)}
        </div>
      </div>
    </Section>
  );
}
