import { LayoutGrid, MessagesSquare, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import type { Locale } from '@/i18n';
import { getHome, type CatalogGroupKey } from '@/i18n/home';
import { localePath } from '@/i18n/locales';
import { getPageCopy } from '@/i18n/pages';
import { CatalogGroups } from './catalog-groups';
import { DrawnLink, Section, SectionHeading, Tile } from './ui';

const ICONS: Record<CatalogGroupKey, LucideIcon> = { talk: MessagesSquare, work: LayoutGrid, order: ShieldCheck, smart: Sparkles };

/** «Что есть в Calab» (§4.4): four groups of equal 16:10 tiles; every tile is a real capture, nothing cropped live. */
export function FeatureCatalog({ locale }: { locale: Locale }) {
  const t = getHome(locale);
  const c = t.catalog;
  const features = localePath(locale, 'features/');
  return (
    <Section id="features" labelledBy="catalog-title" className="catalog">
      <SectionHeading id="catalog-title" title={c.title} lead={c.lead} sticker="tasks" />
      <CatalogGroups
        label={c.title}
        arrows={getPageCopy(locale).catalogArrows}
        groups={c.groups.map((g) => {
          const Icon = ICONS[g.key];
          return {
            key: g.key,
            title: g.title,
            count: g.tiles.length,
            icon: <Icon aria-hidden="true" size={20} strokeWidth={1.8} />,
            tiles: g.tiles.map((tile) => (
              <Tile
                key={tile.shot}
                scene={tile.shot}
                locale={locale}
                title={tile.title}
                text={tile.text}
                alt={t.alts[tile.shot]}
                badge={tile.badge ? c.badges[tile.badge] : undefined}
                href={tile.anchor ? `${features}#${tile.anchor}` : undefined}
                more={c.more}
                ratio={[16, 10]}
                sizes="(min-width: 1360px) 588px, (min-width: 1024px) 46vw, (min-width: 640px) 60vw, 86vw"
                className="catalog-tile"
              />
            )),
          };
        })}
      />
      <p className="catalog-more">
        <DrawnLink href={localePath(locale, 'developers/')} variant="cta" arrow="right">
          {c.developers}
        </DrawnLink>
      </p>
    </Section>
  );
}
