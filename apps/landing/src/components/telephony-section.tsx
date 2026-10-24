import { Bot, Check } from 'lucide-react';
import { localePath, type Locale } from '@/i18n';
import { getHome } from '@/i18n/home';
import { getTelephony } from '@/i18n/telephony';
import { Button, Card, nb, Section, SectionHeading, Shot } from './ui';

/** «Телефония» (§4.5): the live calls, the IVR and the groups, the bot block, six one-line facts, the bot block. Business and Enterprise. */
export function TelephonySection({ locale }: { locale: Locale }) {
  const t = getHome(locale);
  const p = t.telephony;
  // Two columns — the live calls and the IVR, the groups and the bot block — so every frame is ~628 px wide on 1440
  // (0.9 of its 698 px crop) instead of three 410 px ones (0.59); the six facts run in two columns under them.
  const [ivr, call, groups] = p.shots;
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
        {figure(call)}
        {figure(ivr)}
        {figure(groups)}
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
      <ul className="check-list check-list-2 telephony-points">
        {p.points.map((point) => (
          <li key={point}>
            <Check aria-hidden="true" size={18} strokeWidth={2.25} />
            {nb(point)}
          </li>
        ))}
      </ul>
    </Section>
  );
}
