'use client';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

const AUTO = 3500;
/** The finite autoplay: one pass over the first three scenes, then it stops for good. */
const AUTO_LAST = 2;

/**
 * Hero «одно окно — семь сцен» (§4.1): chips are a tablist (arrows, Home/End), the window cross-fades 250 ms.
 * Without JS only the first scene is in the HTML. The other scenes mount after the page has loaded and gone
 * idle (the LCP shot loads alone). Autoplay: once, while the hero is on screen and the tab is visible; any
 * pointer or key action, leaving the screen for good or reduced motion stops it.
 */
export function SceneSwitcher({
  label,
  chips,
  captions,
  panels,
}: {
  label: string;
  chips: { key: string; label: string; icon: ReactNode }[];
  captions: string[];
  panels: ReactNode[];
}) {
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const auto = useRef({ done: false, timer: 0, visible: false, step: 0 });

  useEffect(() => {
    const mount = () => {
      const idle = (cb: () => void) => {
        if ('requestIdleCallback' in window) window.requestIdleCallback(cb, { timeout: 2000 });
        else setTimeout(cb, 200);
      };
      idle(() => { setReady(true); });
    };
    if (document.readyState === 'complete') mount();
    else window.addEventListener('load', mount, { once: true });
    return () => { window.removeEventListener('load', mount); };
  }, []);

  useEffect(() => {
    const node = root.current;
    const a = auto.current;
    if (!node || !ready) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stopTimer = () => {
      window.clearTimeout(a.timer);
      a.timer = 0;
    };
    const finish = () => {
      a.done = true;
      stopTimer();
    };
    const schedule = () => {
      stopTimer();
      if (a.done || !a.visible || document.hidden || reduce.matches) return;
      a.timer = window.setTimeout(() => {
        a.step += 1;
        setActive(a.step);
        if (a.step >= AUTO_LAST) finish();
        else schedule();
      }, AUTO);
    };
    const observer = new IntersectionObserver(([entry]) => {
      a.visible = !!entry?.isIntersecting && entry.intersectionRatio >= 0.4;
      schedule();
    }, { threshold: [0, 0.4] });
    observer.observe(node);
    const onVisibility = () => { schedule(); };
    document.addEventListener('visibilitychange', onVisibility);
    reduce.addEventListener('change', finish);
    return () => {
      observer.disconnect();
      stopTimer();
      document.removeEventListener('visibilitychange', onVisibility);
      reduce.removeEventListener('change', finish);
    };
  }, [ready]);

  const choose = (i: number, focus = false) => {
    auto.current.done = true;
    window.clearTimeout(auto.current.timer);
    setActive(i);
    if (focus) tabs.current[i]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = chips.length - 1;
    const to = { ArrowRight: active + 1, ArrowDown: active + 1, ArrowLeft: active - 1, ArrowUp: active - 1, Home: 0, End: last }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    choose(to > last ? 0 : to < 0 ? last : to, true);
  };

  return (
    <div ref={root} className="scenes" onPointerDown={() => { auto.current.done = true; window.clearTimeout(auto.current.timer); }}>
      <div className="scenes-window">
        {panels.map((panel, i) =>
          i === 0 || ready ? (
            <div
              key={chips[i]?.key}
              id={`scene-${chips[i]?.key}`}
              role="tabpanel"
              aria-labelledby={`scene-tab-${chips[i]?.key}`}
              className="scene"
              data-active={i === active}
              hidden={ready ? undefined : i !== 0}
              inert={i !== active}
            >
              {panel}
            </div>
          ) : null,
        )}
      </div>
      <div role="tablist" aria-label={label} className="scene-chips" onKeyDown={onKey}>
        {chips.map((c, i) => (
          <button
            key={c.key}
            ref={(el) => { tabs.current[i] = el; }}
            id={`scene-tab-${c.key}`}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-controls={ready || i === 0 ? `scene-${c.key}` : undefined}
            tabIndex={i === active ? 0 : -1}
            className="chip"
            onClick={() => { choose(i); }}
          >
            {c.icon}
            {c.label}
          </button>
        ))}
      </div>
      <p className="scene-caption" key={active}>
        {captions[active]}
      </p>
    </div>
  );
}
