import { describe, expect, it } from 'vitest';
import { MAX_TABS, reduceActivate, reduceAdd, reduceClose, reduceSync, sanitizeTabs, type TabsState, type TaskTab } from './taskTabs';

const tab = (id: string, at = 1): TaskTab => ({ id, ws: 'w', board: 'b', key: `K-${id}`, title: `Task ${id}`, at });
const ids = (s: TabsState): string[] => s.tabs.map((x) => x.id);
const empty: TabsState = { tabs: [], cur: null };

describe('reduceActivate', () => {
  it('creates no tab for a single task', () => {
    expect(reduceActivate(empty, tab('a'))).toBe(empty);
  });
  it('makes an existing tab current without moving it', () => {
    const s = reduceActivate({ tabs: [tab('a'), tab('b')], cur: 'a' }, tab('b', 9));
    expect(ids(s)).toEqual(['a', 'b']);
    expect(s.cur).toBe('b');
    expect(s.tabs[1]?.at).toBe(9);
  });
  it('replaces the current tab in place on a plain open', () => {
    const s = reduceActivate({ tabs: [tab('a'), tab('b'), tab('c')], cur: 'b' }, tab('x'));
    expect(ids(s)).toEqual(['a', 'x', 'c']);
    expect(s.cur).toBe('x');
  });
  it('appends when there is no current tab', () => {
    const s = reduceActivate({ tabs: [tab('a'), tab('b')], cur: null }, tab('x'));
    expect(ids(s)).toEqual(['a', 'b', 'x']);
  });
});

describe('reduceAdd', () => {
  it('appends in the background and keeps the current one', () => {
    const s = reduceAdd({ tabs: [tab('a')], cur: 'a' }, tab('b'));
    expect(ids(s)).toEqual(['a', 'b']);
    expect(s.cur).toBe('a');
  });
  it('takes the open task along when it is not a tab yet', () => {
    expect(ids(reduceAdd(empty, tab('b'), tab('a')))).toEqual(['a', 'b']);
  });
  it('does not duplicate', () => {
    expect(ids(reduceAdd({ tabs: [tab('a')], cur: null }, tab('a')))).toEqual(['a']);
  });
  it('drops the least recently used tab past the limit, never the open one', () => {
    const many = Array.from({ length: MAX_TABS }, (_, i) => tab(`t${i}`, 100 + i));
    const s = reduceAdd({ tabs: many, cur: null }, tab('new', 500), tab('t0', 100));
    expect(s.tabs).toHaveLength(MAX_TABS);
    expect(ids(s)).toContain('t0');
    expect(ids(s)).not.toContain('t1');
    expect(ids(s)).toContain('new');
  });
});

describe('reduceClose', () => {
  it('offers the right neighbour, else the left one', () => {
    const s: TabsState = { tabs: [tab('a'), tab('b'), tab('c')], cur: 'b' };
    expect(reduceClose(s, 'b').next?.id).toBe('c');
    expect(reduceClose(s, 'c').next?.id).toBe('b');
    expect(reduceClose(s, 'b').state.cur).toBeNull();
  });
  it('has no neighbour for the last tab, and ignores an unknown id', () => {
    const one: TabsState = { tabs: [tab('a')], cur: 'a' };
    expect(reduceClose(one, 'a').next).toBeNull();
    expect(reduceClose(one, 'zzz').state).toBe(one);
  });
});

describe('reduceSync / sanitizeTabs', () => {
  it('keeps the same state when the snapshot is current', () => {
    const s: TabsState = { tabs: [tab('a')], cur: null };
    expect(reduceSync(s, 'a', 'K-a', 'Task a')).toBe(s);
    expect(reduceSync(s, 'a', 'K-a', 'Renamed').tabs[0]?.title).toBe('Renamed');
  });
  it('survives garbage from storage', () => {
    expect(sanitizeTabs(null)).toEqual(empty);
    expect(sanitizeTabs({ tabs: 5 })).toEqual(empty);
    const s = sanitizeTabs({ tabs: [{ id: 'a', ws: 'w', board: 'b' }, { id: 'a', ws: 'w', board: 'b' }, { id: 3 }, null], cur: 'nope' });
    expect(ids(s)).toEqual(['a']);
    expect(s.cur).toBeNull();
  });
});
