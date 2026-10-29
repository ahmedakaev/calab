/**
 * Freehand strokes (ADR-0127 addendum 2026-10-29 «Рисование от руки и ластик»): simplification of a captured
 * stroke into the stored point list, the frame scaling of a stored stroke, its hit test and its path. Pure, no DOM.
 */
import { distToSegment, pointsBounds, type Point, type Rect } from './geometry';

/** Points a stored stroke keeps at most (after simplification; a longer one is simplified harder). */
export const INK_MAX_POINTS = 2000;
/** Points a stroke in progress collects at most; the rest of a very long drag is not recorded. */
export const INK_RAW_MAX = 20_000;
/** Tolerance of the simplification, screen px (the gesture turns it into world units at the current zoom). */
export const INK_EPS_PX = 0.75;
/** Stored stroke width range, world units. */
export const INK_MIN_WIDTH = 1;
export const INK_MAX_WIDTH = 64;
/** How opaque a marker stroke is drawn (the color stays a plain hue in the doc). */
export const MARKER_ALPHA = 0.4;

/** Pen and marker widths the tool offers (world units). */
export const PEN_WIDTHS: readonly number[] = [2, 4, 8];
export const MARKER_WIDTHS: readonly number[] = [12, 20, 32];
/** Eraser radii the tool offers, screen px (its cursor is a ring of that size). */
export const ERASER_SIZES: readonly number[] = [6, 12, 24];

// `+ 0` folds a rounded -0 into 0.
const round2 = (v: number): number => Math.round(v * 2) / 2 + 0;

/**
 * Ramer–Douglas–Peucker on a flat [x0, y0, x1, y1, …] list: the points that keep the line within `eps` of the
 * original. Iterative (a long stroke would overflow a recursive one); the first and last points always stay.
 */
export function simplify(pts: readonly number[], eps: number): number[] {
  const n = Math.floor(pts.length / 2);
  if (n <= 2) return pts.slice(0, n * 2);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: number[] = [0, n - 1];
  while (stack.length > 0) {
    const b = stack.pop() ?? 0;
    const a = stack.pop() ?? 0;
    const ax = pts[2 * a] ?? 0;
    const ay = pts[2 * a + 1] ?? 0;
    const dx = (pts[2 * b] ?? 0) - ax;
    const dy = (pts[2 * b + 1] ?? 0) - ay;
    const len2 = dx * dx + dy * dy;
    let best = -1;
    // Squared distances, no allocations: this loop is the whole cost of a release.
    let bestD = eps * eps;
    // Of equally far points the one nearest the middle: an even zigzag then splits in halves (n log n), not one by one (n²).
    const mid = (a + b) / 2;
    for (let i = a + 1; i < b; i++) {
      const px = (pts[2 * i] ?? 0) - ax;
      const py = (pts[2 * i + 1] ?? 0) - ay;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
      const ex = px - t * dx;
      const ey = py - t * dy;
      const d = ex * ex + ey * ey;
      if (d > bestD || (d === bestD && best >= 0 && Math.abs(i - mid) < Math.abs(best - mid))) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) continue;
    keep[best] = 1;
    stack.push(a, best, best, b);
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i] ?? 0, pts[2 * i + 1] ?? 0);
  return out;
}

/** A captured stroke as it is stored: its frame and its points relative to the frame's corner. */
export interface InkShape {
  x: number;
  y: number;
  w: number;
  h: number;
  points: number[];
}

/**
 * Turns the world points of a finished stroke into the stored form: simplified within `eps` (harder until it fits
 * INK_MAX_POINTS), moved to the frame's corner, rounded to 0.5, repeated points dropped. A click without a drag is a
 * dot: one point, stored twice so it is still a segment. Null for no points.
 */
export function inkFromStroke(world: readonly number[], eps: number): InkShape | null {
  if (world.length < 2) return null;
  let e = Math.max(eps, 0.01);
  let pts = simplify(world, e);
  while (pts.length / 2 > INK_MAX_POINTS) {
    e *= 2;
    pts = simplify(world, e);
  }
  const b = pointsBounds(pts);
  const x = round2(b.x);
  const y = round2(b.y);
  const out: number[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const px = round2((pts[i] ?? 0) - x);
    const py = round2((pts[i + 1] ?? 0) - y);
    if (out.length >= 2 && out[out.length - 2] === px && out[out.length - 1] === py) continue;
    out.push(px, py);
  }
  if (out.length === 2) out.push(out[0] ?? 0, out[1] ?? 0);
  const nb = pointsBounds(out);
  return { x, y, w: Math.max(1, nb.x + nb.w), h: Math.max(1, nb.y + nb.h), points: out };
}

/** Stored points as the doc may hold them: an even list of 2…2·INK_MAX_POINTS finite numbers, else null. */
export function inkPoints(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length < 2 || v.length % 2 !== 0 || v.length > 2 * INK_MAX_POINTS) return null;
  for (const n of v) if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e7) return null;
  return v as number[];
}

const scaled = new WeakMap<readonly number[], { w: number; h: number; pts: readonly number[] }>();

/**
 * The stored points fitted to the frame `w × h` (a resized stroke stretches with it; an axis the points do not span —
 * a straight line — stays centered). Cached per stored array and size, so a record rebuilt by a move keeps the same
 * array.
 */
export function fitInk(raw: readonly number[], w: number, h: number): readonly number[] {
  const hit = scaled.get(raw);
  if (hit && hit.w === w && hit.h === h) return hit.pts;
  const b = pointsBounds(raw);
  const sx = b.w >= 1 ? w / b.w : 1;
  const sy = b.h >= 1 ? h / b.h : 1;
  const ox = b.w >= 1 ? 0 : (w - b.w) / 2;
  const oy = b.h >= 1 ? 0 : (h - b.h) / 2;
  let pts: readonly number[];
  if (sx === 1 && sy === 1 && ox === 0 && oy === 0 && b.x === 0 && b.y === 0) pts = raw;
  else {
    const out = new Array<number>(raw.length);
    for (let i = 0; i + 1 < raw.length; i += 2) {
      out[i] = ((raw[i] ?? 0) - b.x) * sx + ox;
      out[i + 1] = ((raw[i + 1] ?? 0) - b.y) * sy + oy;
    }
    pts = out;
  }
  scaled.set(raw, { w, h, pts });
  return pts;
}

/** Distance from `p` (relative to the stroke's corner) to the stroke's center line. */
export function inkDistance(p: Point, pts: readonly number[]): number {
  if (pts.length < 4) return Math.hypot(p.x - (pts[0] ?? 0), p.y - (pts[1] ?? 0));
  let best = Infinity;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const d = distToSegment(p, { x: pts[i] ?? 0, y: pts[i + 1] ?? 0 }, { x: pts[i + 2] ?? 0, y: pts[i + 3] ?? 0 });
    if (d < best) best = d;
  }
  return best;
}

/** Whether all points coincide (a dot): drawn as a filled circle, a zero-length line having no caps in every engine. */
export function isDot(pts: readonly number[]): boolean {
  const x = pts[0] ?? 0;
  const y = pts[1] ?? 0;
  for (let i = 2; i + 1 < pts.length; i += 2) if (pts[i] !== x || pts[i + 1] !== y) return false;
  return true;
}

interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
}

/**
 * Traces the smoothed stroke at offset `ox, oy`: quadratic segments through the midpoints with the points as control
 * points, a straight piece to the last point. The live preview and the stored stroke use the same path.
 */
export function traceInk(ctx: PathSink, pts: readonly number[], ox: number, oy: number): void {
  const n = Math.floor(pts.length / 2);
  if (n === 0) return;
  ctx.moveTo(ox + (pts[0] ?? 0), oy + (pts[1] ?? 0));
  for (let i = 1; i < n - 1; i++) {
    const cx = pts[2 * i] ?? 0;
    const cy = pts[2 * i + 1] ?? 0;
    ctx.quadraticCurveTo(ox + cx, oy + cy, ox + (cx + (pts[2 * i + 2] ?? 0)) / 2, oy + (cy + (pts[2 * i + 3] ?? 0)) / 2);
  }
  if (n > 1) ctx.lineTo(ox + (pts[2 * n - 2] ?? 0), oy + (pts[2 * n - 1] ?? 0));
}

/** World rect a stroke's last few points (what one more point repaints) cover, padded by `pad`. */
export function tailRect(pts: readonly number[], count: number, pad: number): Rect {
  const from = Math.max(0, pts.length - 2 * count);
  const b = pointsBounds(pts.slice(from));
  return { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
}

/**
 * What an eraser disc (center `c` and radius `r`, relative to the stroke's corner; `r` already includes half the
 * stroke's width) leaves of a stroke: segments near the disc are subdivided every `step` so the cut follows its edge,
 * points inside are dropped and the rest split into runs of two or more points. Null when the disc misses the line,
 * [] when nothing is left (a dot, or a stroke wholly inside).
 */
export function cutInk(pts: readonly number[], c: Point, r: number, step: number): number[][] | null {
  if (inkDistance(c, pts) > r) return null;
  if (pts.length < 4 || isDot(pts)) return [];
  const runs: number[][] = [];
  let cur: number[] = [];
  const visit = (x: number, y: number): void => {
    if (Math.hypot(x - c.x, y - c.y) > r) {
      cur.push(x, y);
      return;
    }
    if (cur.length >= 4) runs.push(cur);
    cur = [];
  };
  visit(pts[0] ?? 0, pts[1] ?? 0);
  const s = Math.max(step, 0.01);
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const a = { x: pts[i] ?? 0, y: pts[i + 1] ?? 0 };
    const b = { x: pts[i + 2] ?? 0, y: pts[i + 3] ?? 0 };
    const n = distToSegment(c, a, b) <= r + s ? Math.min(512, Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / s))) : 1;
    for (let k = 1; k <= n; k++) visit(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
  }
  if (cur.length >= 4) runs.push(cur);
  return runs;
}
