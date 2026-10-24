'use client';
import { useEffect, useRef } from 'react';

const CJK = /[\u3000-\u9fff\uff00-\uffef]/;
const CJK_CLOSING = /[\uff0c\u3002\u3001\uff01\uff1f\uff1a\uff1b\uff09\u300d\u300f\u300b\u3009]/;

/** Words that wrap as wholes; CJK text breaks between characters, as it normally would. */
function words(text: string): string[] {
  const out: string[] = [];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    // A dash stays with the word before it (never starts a line).
    if (/^[—–-]$/.test(w) && out.length) out[out.length - 1] = `${out.at(-1) ?? ''}\u00a0${w}`;
    else if (CJK.test(w)) {
      // CJK breaks between characters, but closing punctuation («，», «。»…) never starts a line.
      for (const ch of Array.from(w)) {
        if (CJK_CLOSING.test(ch) && out.length) out[out.length - 1] = `${out.at(-1) ?? ''}${ch}`;
        else out.push(ch);
      }
    } else out.push(w);
  }
  // A one-letter word («в», «и», «с», «a») never ends a line: it travels with the next word.
  for (let i = out.length - 2; i >= 0; i--) {
    const w = out[i] ?? '';
    if (w.length === 1 && !CJK.test(w)) out.splice(i, 2, `${w}\u00a0${out[i + 1] ?? ''}`);
  }
  return out;
}

/**
 * The live headline (Source Serif 4, `accent` — the tail in the italic accent): each glyph lightens from the
 * title's own weight down to 200 as the mouse comes near. Work happens only on
 * pointer moves over a visible title (one rAF per move, no idle loop); touch, reduced motion — a static title.
 * Every glyph reserves its full-weight width, so the line never reflows while the weight changes.
 */
export function LivingTitle({ text, accent, id, className }: { text: string; accent?: string | undefined; id: string; className?: string }) {
  const root = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const media = window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)');
    const base = Number.parseFloat(getComputedStyle(node).fontWeight) || 400;
    const range = Math.max(0, base - 200);
    const glyphs = [...node.querySelectorAll<HTMLElement>('[data-glyph]')].map((el) => ({ el, x: 0, y: 0, value: base }));
    let frame = 0;
    let disposed = false;
    let px = 0;
    let py = 0;
    const measure = () => {
      glyphs.forEach((g) => {
        const b = g.el.parentElement?.getBoundingClientRect();
        if (b) {
          g.x = b.left + b.width / 2;
          g.y = b.top + b.height / 2;
        }
      });
    };
    const tick = () => {
      frame = 0;
      const box = node.getBoundingClientRect();
      if (box.bottom < 0 || box.top > window.innerHeight) return;
      measure();
      glyphs.forEach((g) => {
        const strength = Math.max(0, 1 - Math.hypot(px - g.x, py - g.y) / 400);
        const weight = base - range * strength;
        if (Math.abs(weight - g.value) < 0.5) return;
        g.value = weight;
        g.el.style.fontVariationSettings = `"wght" ${weight.toFixed(1)}`;
      });
    };
    const pointer = (e: PointerEvent) => {
      if (!media.matches || e.pointerType !== 'mouse') return;
      px = e.clientX;
      py = e.clientY;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      glyphs.forEach((g) => {
        g.value = base;
        g.el.style.removeProperty('font-variation-settings');
      });
    };
    document.fonts.ready.then(() => { if (!disposed) measure(); }).catch(() => undefined);
    window.addEventListener('pointermove', pointer, { passive: true });
    media.addEventListener('change', reset);
    return () => {
      disposed = true;
      reset();
      window.removeEventListener('pointermove', pointer);
      media.removeEventListener('change', reset);
    };
  }, []);
  let n = 0;
  const tail = accent && text.endsWith(accent) ? accent : '';
  const parts = [
    ...words(text.slice(0, text.length - tail.length)).map((word) => ({ word, accent: false })),
    ...(tail ? words(tail).map((word) => ({ word, accent: true })) : []),
  ];
  return (
    <h1 ref={root} id={id} className={`h1 living-title ${className ?? ''}`} aria-label={text}>
      {parts.map(({ word, accent: isAccent }, w) => (
        <span key={w} aria-hidden="true" className={isAccent ? 'accent' : undefined}>
          <span className="living-word">
            {Array.from(word).map((char, i) => (
              <span className="glyph-slot" data-char={char} key={i} style={{ animationDelay: `${0.1 + n++ * 0.018}s` }}>
                <span data-glyph>{char}</span>
              </span>
            ))}
          </span>
          {CJK.test(word) ? null : ' '}
        </span>
      ))}
    </h1>
  );
}
