'use client';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Desktop enhancement of «Один день команды» (§4.3): the steps scroll on the left while one sticky frame on the
 * right shows the shot of the step in the middle of the screen. Without JS, on phones and narrow windows the
 * steps simply follow each other, each with its own shot. Work happens only in IntersectionObserver callbacks.
 */
export function StoryScroller({ children }: { children: ReactNode }) {
  const root = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = root.current;
    if (!list) return;
    const wide = window.matchMedia('(min-width: 1024px)');
    const steps = [...list.querySelectorAll<HTMLElement>('[data-step]')];
    let observer: IntersectionObserver | null = null;
    const show = (index: string) => {
      steps.forEach((s) => { s.toggleAttribute('data-active', s.dataset.step === index); });
    };
    const apply = () => {
      observer?.disconnect();
      observer = null;
      list.classList.toggle('story-sticky', wide.matches);
      if (!wide.matches) return;
      show('0');
      observer = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) show(e.target.closest<HTMLElement>('[data-step]')?.dataset.step ?? '0');
      }, { rootMargin: '-45% 0px -45% 0px' });
      steps.forEach((s) => {
        const text = s.querySelector('.story-text');
        if (text) observer?.observe(text);
      });
    };
    apply();
    wide.addEventListener('change', apply);
    return () => {
      observer?.disconnect();
      wide.removeEventListener('change', apply);
    };
  }, []);
  return (
    <ol ref={root} className="story-steps swipe-sm">
      {children}
    </ol>
  );
}
