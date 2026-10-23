'use client';

import { useSyncExternalStore } from 'react';
import { detectOs } from '@/lib/detect-os';
import type { Dict } from '@/i18n';
import { rich } from '@/lib/rich';
import { APP_URL, DOWNLOADS, REPO_URL, repoFile } from '@/lib/site';
import { Button, Section } from './ui';

// Direct links to the stable latest/ names (no directory listing, no redirect hop).
const platforms: {
  id: keyof Dict['downloads']['platforms'];
  name: string;
  variants: string;
  files: { label: string | ((t: Dict['downloads']) => string); href: string }[];
}[] = [
  {
    id: 'mac',
    name: 'macOS',
    variants: 'Apple Silicon · Intel',
    files: [
      { label: 'Apple Silicon', href: DOWNLOADS.macArm64 },
      { label: 'Intel', href: DOWNLOADS.macX64 },
    ],
  },
  {
    id: 'win',
    name: 'Windows',
    variants: 'x64',
    files: [{ label: (t) => t.platforms.win.file, href: DOWNLOADS.win }],
  },
  {
    id: 'linux',
    name: 'Linux',
    variants: 'AppImage · deb',
    files: [
      { label: 'AppImage', href: DOWNLOADS.appImage },
      { label: '.deb', href: DOWNLOADS.deb },
    ],
  },
];

const noSubscribe = () => () => undefined;

/**
 * A platform's note. A long one with a «head: steps» shape (the SmartScreen walk-through) folds its steps into a
 * native <details> (§4.11), so the three cards stay the same short height.
 */
function Note({ text }: { text: string }) {
  const body = rich(text, { code: <code className="font-mono text-[13px]">chmod +x</code> });
  const at = text.indexOf(': ');
  if (text.length < 90 || at < 0) return <p className="download-note">{body}</p>;
  return (
    <details className="download-note download-more">
      <summary>{text.slice(0, at)}</summary>
      <p>{text.slice(at + 2)}</p>
    </details>
  );
}

export function Downloads({ t }: { t: Dict['downloads'] }) {
  const os = useSyncExternalStore(noSubscribe, detectOs, () => null);
  return (
    <Section id="download" labelledBy="download-title">
      <h2 id="download-title" className="sr-only">{t.title}</h2>
      <ul className="swipe-sm mx-auto grid max-w-[960px] gap-4 md:grid-cols-3 md:gap-6">
        {platforms.map((p) => (
          <li key={p.id} data-current-os={p.id === os ? true : undefined} className="card download-platform flex flex-col items-center text-center">
            <img className="platform-sticker" src={`/editorial/sticker-${p.id === 'win' ? 'windows' : p.id}.webp`} width={140} height={140} alt="" loading="lazy" />
            <h3 className="mt-3 text-[21px] leading-7 font-semibold tracking-tight">{p.name}</h3>
            <p className="mt-1 text-[15px] leading-6 text-fg">{p.variants}</p>
            <p className="text-[14px] leading-5 text-fg-2">{t.platforms[p.id].format}</p>
            <Note text={t.platforms[p.id].note} />
            <div className="mt-auto flex w-full gap-2 pt-6">
              {p.files.map((f) => (
                <Button key={f.href} href={f.href} variant={p.id === os ? 'primary' : 'secondary'} size="md" className="min-w-0 flex-1 px-3">
                  {typeof f.label === 'string' ? f.label : f.label(t)}
                  <span className="sr-only"> — {p.name}</span>
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-center text-[15px] leading-6 text-pretty text-fg-2">
        {rich(t.web, {
          link: (
            <a href={APP_URL} className="link">
              {t.webLink}
            </a>
          ),
        })}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <span className="text-[14px] leading-5 text-fg-2">{t.whatsNew}</span>
        <Button href={repoFile('CHANGELOG.md')} variant="secondary" size="sm">
          {t.changelog}
        </Button>
        <Button href={`${REPO_URL}/releases`} variant="secondary" size="sm">
          {t.releases}
        </Button>
      </div>
    </Section>
  );
}
