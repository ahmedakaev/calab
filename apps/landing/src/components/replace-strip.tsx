import type { Locale } from '@/i18n';
import { getHome } from '@/i18n/home';
import { Container, nb } from './ui';

/** «Вместо семи сервисов — одно окно» (§4.2): a centred pause between the hero and the story (owner, 24.10). */
export function ReplaceStrip({ locale }: { locale: Locale }) {
  const t = getHome(locale).replace;
  return (
    <section id="one-window" aria-labelledby="replace-title" className="section replace" data-reveal>
      <Container className="heading-center replace-copy">
        <h2 id="replace-title" className="h2">
          {nb(t.title)}
        </h2>
        <p className="lead">{nb(t.lead)}</p>
      </Container>
    </section>
  );
}
