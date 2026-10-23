'use client';
import { useEffect, useRef } from 'react';

const CJK = /[\u3000-\u9fff\uff00-\uffef]/;

/** Words that wrap as wholes; CJK text breaks between characters, as it normally would. */
function words(text: string): string[] {
  const out: string[] = [];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    // A dash stays with the word before it (never starts a line).
    if (/^[—–-]$/.test(w) && out.length) out[out.length - 1] = `${out.at(-1) ?? ''}\u00a0${w}`;
    else out.push(...(CJK.test(w) ? Array.from(w) : [w]));
  }
  return out;
}

/**
 * The live headline (CalabCondensed 900): each glyph lightens as the mouse comes near. Work happens only on
 * pointer moves over a visible title (one rAF per move, no idle loop); touch, reduced motion — a static title.
 * Every glyph reserves its 900-weight width, so the line never reflows while the weight changes.
 */
export function LivingTitle({ text, id, className }: { text: string; id: string; className?: string }) {
  const root = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const media = window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)');
    const glyphs = [...node.querySelectorAll<HTMLElement>('[data-glyph]')].map((el) => ({ el, x: 0, y: 0, value: 900 }));
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
        const weight = 900 - 800 * strength;
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
        g.value = 900;
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
  return (
    <h1 ref={root} id={id} className={`h1 living-title ${className ?? ''}`} aria-label={text}>
      {words(text).map((word, w) => (
        <span key={w} aria-hidden="true">
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
