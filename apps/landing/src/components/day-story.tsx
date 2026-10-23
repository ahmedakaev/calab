import type { CSSProperties } from 'react';
import type { Locale } from '@/i18n';
import { getHome } from '@/i18n/home';
import { StoryScroller } from './story-scroller';
import { DrawnLink, nb, Section, SectionHeading, Shot } from './ui';

/** «Один день команды» (§4.3): six steps of one task (APP-7) across chat, board, calendar, recording, wiki, canvas. */
export function DayStory({ locale }: { locale: Locale }) {
  const t = getHome(locale);
  const s = t.story;
  return (
    <Section id="story" labelledBy="story-title" className="story">
      <SectionHeading id="story-title" title={s.title} lead={s.lead} />
      <StoryScroller>
        {s.steps.map((step, i) => (
          <li key={step.shot} data-step={i} className="story-step" style={{ '--row': i + 1 } as CSSProperties}>
            <div className="story-text">
              <span className="story-index" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="h3 h3-sm">{nb(step.title)}</h3>
              <p className="tile-text">{nb(step.text)}</p>
            </div>
            <div className="story-shot">
              <Shot scene={step.shot} locale={locale} alt={t.alts[step.shot]} sizes="(min-width: 1024px) 720px, (min-width: 640px) 56vw, 86vw" />
            </div>
          </li>
        ))}
      </StoryScroller>
      <p className="story-more">
        <DrawnLink href="#features" variant="cta" arrow="down">
          {s.cta}
        </DrawnLink>
      </p>
    </Section>
  );
}
