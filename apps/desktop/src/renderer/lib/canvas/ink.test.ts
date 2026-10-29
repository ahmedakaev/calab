import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { parse, serialize, toInits } from './clipboard';
import { CanvasDoc } from './doc';
import { INK_MAX_POINTS, cutInk, fitInk, inkDistance, inkFromStroke, isDot, simplify, tailRect, traceInk } from './ink';
import { Scene, visualBounds } from './scene';
import { ids, makeDoc } from './testing';
import { TextLayouter } from './textLayout';
import type { InkRec } from './types';

const sceneOf = (d: CanvasDoc): Scene => new Scene(d, new TextLayouter((t, s) => t.length * s * 0.5));
const ink = (s: Scene, id: string): InkRec => {
  const o = s.get(id);
  if (o?.kind !== 'ink') throw new Error(`${id} is not a stroke`);
  return o;
};

describe('cutInk', () => {
  const line = [0, 0, 100, 0];
  it('misses: null; a hit in the middle: the two runs outside the disc', () => {
    expect(cutInk(line, { x: 50, y: 20 }, 10, 2)).toBeNull();
    const runs = cutInk(line, { x: 50, y: 0 }, 10, 2) ?? [];
    expect(runs).toHaveLength(2);
    expect(runs[0]?.[0]).toBe(0);
    // The cut follows the disc's edge to within one step.
    expect(runs[0]?.[runs[0].length - 2]).toBeGreaterThanOrEqual(38);
    expect(runs[0]?.[runs[0].length - 2]).toBeLessThan(40);
    expect(runs[1]?.[0]).toBeGreaterThan(60);
    expect(runs[1]?.[0]).toBeLessThanOrEqual(62);
    expect(runs[1]?.[runs[1].length - 2]).toBe(100);
  });
  it('an end bitten off leaves one run; a stroke inside the disc or a dot leaves nothing', () => {
    expect(cutInk(line, { x: 100, y: 0 }, 10, 2)).toHaveLength(1);
    expect(cutInk([0, 0, 5, 0], { x: 2, y: 0 }, 10, 1)).toEqual([]);
    expect(cutInk([3, 3, 3, 3], { x: 3, y: 4 }, 2, 1)).toEqual([]);
  });
});

describe('simplify (Ramer–Douglas–Peucker)', () => {
  it('drops points on a straight run and keeps the corners', () => {
    const line = [0, 0, 10, 0, 20, 0, 30, 0, 30, 10, 30, 20];
    expect(simplify(line, 0.5)).toEqual([0, 0, 30, 0, 30, 20]);
  });
  it('keeps a bump bigger than the tolerance, drops a smaller one', () => {
    expect(simplify([0, 0, 10, 3, 20, 0], 1)).toEqual([0, 0, 10, 3, 20, 0]);
    expect(simplify([0, 0, 10, 0.4, 20, 0], 1)).toEqual([0, 0, 20, 0]);
  });
  it('handles one and two points, and a long stroke without recursion', () => {
    expect(simplify([5, 5], 1)).toEqual([5, 5]);
    expect(simplify([1, 2, 3, 4], 1)).toEqual([1, 2, 3, 4]);
    const zig: number[] = [];
    for (let i = 0; i < 100_000; i++) zig.push(i, i % 2 ? 5 : 0);
    expect(simplify(zig, 1).length).toBe(zig.length);
  });
});

describe('inkFromStroke', () => {
  it('moves the points to the frame corner and rounds them to 0.5', () => {
    const s = inkFromStroke([100.3, 50.2, 140.71, 50.2, 140.71, 90.9], 0.5);
    expect(s).toEqual({ x: 100.5, y: 50, w: 40, h: 41, points: [0, 0, 40, 0, 40, 41] });
  });
  it('a click without a drag is a dot of two equal points', () => {
    const s = inkFromStroke([10, 20], 0.5);
    expect(s?.points).toEqual([0, 0, 0, 0]);
    expect(s && isDot(s.points)).toBe(true);
    expect(inkFromStroke([], 0.5)).toBeNull();
  });
  it('a stroke too detailed for the cap is simplified harder until it fits', () => {
    const pts: number[] = [];
    for (let i = 0; i < 8000; i++) pts.push(i * 0.7, Math.sin(i) * 40);
    const s = inkFromStroke(pts, 0.1);
    expect(s).not.toBeNull();
    expect((s?.points.length ?? 0) / 2).toBeLessThanOrEqual(INK_MAX_POINTS);
    expect(s?.points.length).toBeGreaterThan(100);
  });
});

describe('stroke geometry', () => {
  it('fitInk stretches the points with the frame and keeps the array while the size is the same', () => {
    const raw = [0, 0, 10, 20];
    expect(fitInk(raw, 10, 20)).toBe(raw);
    const big = fitInk(raw, 30, 40);
    expect(big).toEqual([0, 0, 30, 40]);
    expect(fitInk(raw, 30, 40)).toBe(big);
    // A straight line does not span the other axis: it stays in the middle of the frame.
    expect(fitInk([0, 0, 50, 0], 100, 24)).toEqual([0, 12, 100, 12]);
  });
  it('inkDistance measures to the line, a dot to its point', () => {
    expect(inkDistance({ x: 5, y: 3 }, [0, 0, 10, 0])).toBe(3);
    expect(inkDistance({ x: 3, y: 4 }, [0, 0])).toBe(5);
  });
  it('traceInk: quadratic pieces through the midpoints, a straight end', () => {
    const calls: string[] = [];
    traceInk({
      moveTo: (x, y) => calls.push(`M${x},${y}`),
      lineTo: (x, y) => calls.push(`L${x},${y}`),
      quadraticCurveTo: (cx, cy, x, y) => calls.push(`Q${cx},${cy},${x},${y}`),
    }, [0, 0, 10, 0, 10, 10, 20, 10], 100, 0);
    expect(calls).toEqual(['M100,0', 'Q110,0,110,5', 'Q110,10,115,10', 'L120,10']);
  });
  it('tailRect covers the last points with the pad', () => {
    expect(tailRect([0, 0, 100, 100, 110, 100, 120, 90], 3, 2)).toEqual({ x: 98, y: 88, w: 24, h: 14 });
  });
});

describe('ink in the document', () => {
  const stroke = { kind: 'ink' as const, x: 10, y: 20, w: 100, h: 50, points: [0, 0, 50, 50, 100, 0], stroke: 'blue', strokeWidth: 4 };

  it('create is one undo step; undo removes the stroke, redo brings it back', () => {
    const d = makeDoc();
    const id = d.create(stroke) ?? '';
    expect(d.snapshot(id)).toMatchObject({ kind: 'ink', x: 10, y: 20, w: 100, h: 50, points: [0, 0, 50, 50, 100, 0], stroke: 'blue', strokeWidth: 4 });
    expect(d.undo.undoStack.length).toBe(1);
    d.undo.undo();
    expect(d.count).toBe(0);
    d.undo.redo();
    expect(d.count).toBe(1);
  });
  it('refuses a stroke without sane points and clamps its fields', () => {
    const d = makeDoc();
    expect(d.create({ ...stroke, points: [] })).toBeNull();
    expect(d.create({ ...stroke, points: [1, 2, 3] })).toBeNull();
    expect(d.create({ ...stroke, points: [0, Number.NaN] })).toBeNull();
    expect(d.create({ ...stroke, points: new Array(2 * INK_MAX_POINTS + 2).fill(0) })).toBeNull();
    const id = d.create({ ...stroke, strokeWidth: 500, marker: true }) ?? '';
    expect(d.snapshot(id)).toMatchObject({ strokeWidth: 64, marker: true });
    d.patch(id, { w: 0.2, h: 3, strokeWidth: 0 });
    expect(d.snapshot(id)).toMatchObject({ w: 1, h: 3, strokeWidth: 1 });
    // No text on a stroke.
    d.setText(id, 'hello');
    expect(d.objects.get(id)?.get('text')).toBeUndefined();
  });
  it('the scene fits the stored points to a resized frame and picks the stroke by its line', () => {
    const d = makeDoc();
    const id = d.create(stroke) ?? '';
    const s = sceneOf(d);
    const o = ink(s, id);
    expect(o.points).toEqual([0, 0, 50, 50, 100, 0]);
    // On the line (with half its width as slack) — yes; in the empty corner of its frame — no.
    expect(s.hit({ x: 60, y: 70 }, 0)?.id).toBe(id);
    expect(s.hit({ x: 60, y: 73 }, 1)?.id).toBe(id);
    expect(s.hit({ x: 12, y: 65 }, 2)).toBeNull();
    expect(visualBounds(o)).toEqual({ x: 7, y: 17, w: 106, h: 56 });
    d.patch(id, { w: 200 });
    expect(ink(s, id).points).toEqual([0, 0, 100, 50, 200, 0]);
    // The marquee takes it only across the line.
    expect(s.inRect({ x: 50, y: 40, w: 20, h: 10 }).map((r) => r.id)).toEqual([id]);
    expect(s.inRect({ x: 12, y: 50, w: 10, h: 15 })).toEqual([]);
  });
  it('a rotated stroke is hit in its own frame', () => {
    const d = makeDoc();
    const id = d.create({ ...stroke, points: [0, 0, 100, 0], w: 100, h: 1, rot: 90 }) ?? '';
    const s = sceneOf(d);
    // Turned 90° about the center (60, 20.5): the line runs vertically through x = 60.
    expect(s.hit({ x: 60, y: -20 }, 1)?.id).toBe(id);
    expect(s.hit({ x: 20, y: 20.5 }, 1)).toBeNull();
  });
  it('copy and paste keep the stroke whole', () => {
    const d = makeDoc({ makeId: ids('a') });
    const id = d.create({ ...stroke, marker: true }) ?? '';
    const s = sceneOf(d);
    const text = serialize(s, d, [id]);
    const payload = text ? parse(text) : null;
    expect(payload).not.toBeNull();
    if (!payload) return;
    const [copy] = toInits(payload, 5, 5, ids('b'));
    expect(copy?.init).toMatchObject({ kind: 'ink', x: 15, y: 25, w: 100, h: 50, points: [0, 0, 50, 50, 100, 0], stroke: 'blue', strokeWidth: 4, marker: true });
    // A pasted stroke with broken points is dropped.
    const bad = { ...payload, objects: payload.objects.map((o) => ({ ...o, points: 'x' })) };
    expect(toInits(bad, 0, 0)).toEqual([]);
  });
});

describe('a kind this build does not know (what a build before strokes does with `ink`)', () => {
  /** Writes an object the way a newer build would, with a kind outside this build's list. */
  const future = (d: CanvasDoc, id: string, kind: string): void => {
    d.ydoc.transact(() => {
      const m = new Y.Map<unknown>();
      d.objects.set(id, m);
      m.set('kind', kind);
      m.set('z', 'a5');
      m.set('x', 0);
      m.set('y', 0);
      m.set('points', [0, 0, 10, 10]);
    });
  };

  it('is skipped by the scene, the snapshot, the clipboard and the patches, and nothing breaks', () => {
    const d = makeDoc();
    const keep = d.create({ kind: 'sticky', x: 0, y: 0 }) ?? '';
    future(d, 'zz', 'hologram');
    const s = sceneOf(d);
    expect(s.size).toBe(1);
    expect(s.get('zz')).toBeUndefined();
    expect(s.hit({ x: 5, y: 5 }, 4)?.id).toBe(keep);
    expect(d.snapshot('zz')).toBeNull();
    expect(serialize(s, d, ['zz'])).toBeNull();
    d.patch('zz', { x: 50 });
    expect(d.objects.get('zz')?.get('x')).toBe(0);
    // Arriving later (a co-author's write) it is skipped the same way.
    future(d, 'zy', 'hologram');
    expect(s.size).toBe(1);
    // The document keeps it untouched for the builds that know it.
    expect(d.objects.get('zz')?.get('kind')).toBe('hologram');
  });
  it('a stroke with broken points is skipped by the scene, not drawn as garbage', () => {
    const d = makeDoc();
    future(d, 'zz', 'ink');
    d.objects.get('zz')?.set('points', [0, 'x']);
    expect(sceneOf(d).size).toBe(0);
  });
});
