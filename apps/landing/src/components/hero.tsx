import { AudioLines, BookOpenText, CalendarDays, MessagesSquare, Phone, Shapes, SquareKanban, type LucideIcon } from 'lucide-react';
import { preload } from 'react-dom';
import type { Locale } from '@/i18n';
import { getHome, HERO_SHOT, type HeroSceneKey } from '@/i18n/home';
import { APP_URL } from '@/lib/site';
import { CursorStickerTrail } from './cursor-sticker-trail';
import { LivingTitle } from './living-title';
import { SceneSwitcher } from './scene-switcher';
import { Button, Container, nb, Shot } from './ui';

const ICONS: Record<HeroSceneKey, LucideIcon> = {
  voice: AudioLines,
  chat: MessagesSquare,
  tasks: SquareKanban,
  calendar: CalendarDays,
  wiki: BookOpenText,
  canvas: Shapes,
  phone: Phone,
};

/** Hero «одно окно — семь сцен» (§4.1): the live H1, the lead, two buttons and the real app window. */
export function Hero({ locale }: { locale: Locale }) {
  const t = getHome(locale);
  const h = t.hero;
  // The H1 face only (subset, ~90 KB): without it the title reflows on swap (CLS). The serif text swaps in place.
  preload('/fonts/roboto-condensed-variable.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  const sizes = '(min-width: 1360px) 1200px, (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)';
  return (
    <section id="top" aria-labelledby="hero-title" className="hero">
      <Container>
        <LivingTitle id="hero-title" text={h.title} />
        <div className="hero-row">
          <p className="lead hero-lead">{nb(h.lead)}</p>
          <div className="hero-actions">
            <div className="hero-buttons">
              <Button href="#download">{h.download}</Button>
              <Button href={APP_URL} variant="secondary">
                {h.openWeb}
              </Button>
            </div>
            <p className="hero-platforms">{h.platforms}</p>
          </div>
        </div>
        <SceneSwitcher
          label={h.scenesLabel}
          chips={h.scenes.map((s) => {
            const Icon = ICONS[s.key];
            return { key: s.key, label: s.label, icon: <Icon aria-hidden="true" size={18} strokeWidth={1.9} /> };
          })}
          captions={h.scenes.map((s) => nb(s.caption))}
          panels={h.scenes.map((s, i) => (
            <Shot
              key={s.key}
              scene={HERO_SHOT[s.key]}
              locale={locale}
              alt={t.alts[HERO_SHOT[s.key]]}
              sizes={sizes}
              priority={i === 0}
              className="hero-shot"
            />
          ))}
        />
      </Container>
      <CursorStickerTrail quiet />
    </section>
  );
}
