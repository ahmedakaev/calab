'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { keepHashTarget } from '@/lib/hash-target';

type Group = { key: string; title: string; icon: ReactNode; count: number; tiles: ReactNode };

/** One group: a heading and a horizontal snap row of tiles (native scroll; the arrows are a JS convenience). */
function GroupRow({ group, labels, hidden, tabbed }: { group: Group; labels: { prev: string; next: string }; hidden: boolean; tabbed: boolean }) {
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () => {
      setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);
  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: reduce ? 'instant' : 'smooth' });
  };
  return (
    <div
      id={`catalog-${group.key}`}
      className="catalog-group"
      {...(tabbed ? { role: 'tabpanel', 'aria-labelledby': `catalog-tab-${group.key}` } : {})}
      hidden={hidden}
    >
      <div className="catalog-group-head">
        <h3 className="catalog-group-title">
          {group.icon}
          {group.title}
          <span className="catalog-count">{group.count}</span>
        </h3>
        <div className="catalog-arrows">
          <button type="button" className="round-button" aria-label={labels.prev} disabled={edge.start} onClick={() => { page(-1); }}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" className="round-button" aria-label={labels.next} disabled={edge.end} onClick={() => { page(1); }}>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
      <ul ref={track} className="catalog-track" aria-label={group.title}>
        {group.tiles}
      </ul>
    </div>
  );
}

/**
 * «Что есть в Calab» groups (§4.4). The mini-rail (desktop: sticky on the left, phone: chips) switches the group;
 * each group is one horizontal row of equal tiles. Without JS every group is shown, one row under another, and the
 * rail links scroll to them — the page stays complete; with JS one group at a time keeps the page short.
 */
export function CatalogGroups({ groups, label, arrows }: { groups: Group[]; label: string; arrows: { prev: string; next: string } }) {
  const [active, setActive] = useState(0);
  const [tabbed, setTabbed] = useState(false);
  const tabs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    setTabbed(true);
  }, []);
  // One group instead of four: the page got shorter under a `#download`-style target.
  useEffect(() => {
    if (tabbed) keepHashTarget();
  }, [tabbed]);
  const choose = (i: number, focus = false) => {
    setActive(i);
    if (focus) tabs.current[i]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = groups.length - 1;
    const to = { ArrowDown: active + 1, ArrowRight: active + 1, ArrowUp: active - 1, ArrowLeft: active - 1, Home: 0, End: last }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    choose(to > last ? 0 : to < 0 ? last : to, true);
  };
  return (
    <div className="catalog-body">
      <div className="catalog-rail" {...(tabbed ? { role: 'tablist', 'aria-orientation': 'vertical' as const, onKeyDown: onKey } : {})} aria-label={label}>
        {groups.map((g, i) =>
          tabbed ? (
            <button
              key={g.key}
              ref={(el) => { tabs.current[i] = el; }}
              id={`catalog-tab-${g.key}`}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-controls={`catalog-${g.key}`}
              tabIndex={i === active ? 0 : -1}
              className="catalog-rail-item"
              onClick={() => { choose(i); }}
            >
              {g.icon}
              <span>{g.title}</span>
            </button>
          ) : (
            <a key={g.key} href={`#catalog-${g.key}`} className="catalog-rail-item">
              {g.icon}
              <span>{g.title}</span>
            </a>
          ),
        )}
      </div>
      <div className="catalog-groups">
        {groups.map((g, i) => (
          <GroupRow key={g.key} group={g} labels={arrows} hidden={tabbed && i !== active} tabbed={tabbed} />
        ))}
      </div>
    </div>
  );
}
