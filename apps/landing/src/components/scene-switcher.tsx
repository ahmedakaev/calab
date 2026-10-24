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
 * Desktop tilt: the window leans a few degrees towards the pointer — one rAF per pointer move, transform only,
 * listening only while the hero is on screen, and only for a fine pointer without reduced motion at ≥ 1024 px.
 * The CSS transition eases it (and back to rest on leave); nothing runs while the mouse is still.
 */
export function SceneSwitcher({
  copy,
  label,
  chips,
  captions,
  panels,
}: {
  /** The title, lead and buttons: the left column on desktop, above the window on phones. */
  copy: ReactNode;
  label: string;
  chips: { key: string; label: string; icon: ReactNode }[];
  captions: string[];
  panels: ReactNode[];
}) {
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const tilt = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const node = root.current;
    const stage = tilt.current;
    if (!node || !stage) return;
    const media = window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    let frame = 0;
    let px = 0;
    let py = 0;
    let listening = false;
    const apply = () => {
      frame = 0;
      const box = node.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, ((px - box.left) / box.width) * 2 - 1));
      const y = Math.max(-1, Math.min(1, ((py - box.top) / box.height) * 2 - 1));
      stage.style.setProperty('--tilt-x', `${(-y * 3).toFixed(2)}deg`);
      stage.style.setProperty('--tilt-y', `${(x * 4).toFixed(2)}deg`);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      px = e.clientX;
      py = e.clientY;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const rest = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      stage.style.removeProperty('--tilt-x');
      stage.style.removeProperty('--tilt-y');
    };
    const listen = (on: boolean) => {
      if (on === listening) return;
      listening = on;
      if (on) {
        node.addEventListener('pointermove', move, { passive: true });
        node.addEventListener('pointerleave', rest);
      } else {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerleave', rest);
        rest();
      }
    };
    let inView = false;
    const sync = () => { listen(inView && media.matches); };
    const observer = new IntersectionObserver(([entry]) => {
      inView = !!entry?.isIntersecting;
      sync();
    });
    observer.observe(node);
    media.addEventListener('change', sync);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', sync);
      listen(false);
    };
  }, []);

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
    <div ref={root} className="hero-layout" onPointerDown={() => { auto.current.done = true; window.clearTimeout(auto.current.timer); }}>
      <div className="hero-copy">{copy}</div>
      <div className="hero-stage">
        <div ref={tilt} className="scenes-window">
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
      </div>
      <div className="scene-nav">
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
              className="chip chip-quiet"
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
    </div>
  );
}
