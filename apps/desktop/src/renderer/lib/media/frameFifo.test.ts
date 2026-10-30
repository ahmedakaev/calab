import { describe, expect, it } from 'vitest';
import { FrameFifo } from './frameFifo';

/** The worklet's loop: a quantum of input completes 480-sample frames (pushed), then one pull. */
function run(quanta: number, quantum = 128, frame = 480, skip: (q: number) => boolean = () => false) {
  const fifo = new FrameFifo(frame);
  const acc = new Float32Array(frame);
  let pos = 0;
  let n = 0;
  const out: number[] = [];
  let underruns = 0;
  const q = new Float32Array(quantum);
  for (let k = 0; k < quanta; k++) {
    if (!skip(k)) {
      for (let i = 0; i < quantum; i++) {
        acc[pos++] = ++n; // sample value = its 1-based index
        if (pos === frame) {
          fifo.push(acc);
          pos = 0;
        }
      }
    }
    if (!fifo.pull(q)) underruns++;
    out.push(...q);
  }
  return { out, underruns };
}

describe('FrameFifo', () => {
  it('never underruns with 480-sample frames and 128-sample quanta, at a constant 448-sample delay', () => {
    const { out, underruns } = run(48_000 / 128 * 10); // 10 s
    expect(underruns).toBe(0);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBe(i < 448 ? 0 : i - 448 + 1);
  });

  it('other quantum sizes (a future renderSizeHint) are covered by the same rule', () => {
    for (const quantum of [256, 512, 441, 1024]) expect(run(2000, quantum).underruns).toBe(0);
  });

  it('a starved quantum (no input) is one quantum of silence, then playback continues in order', () => {
    const { out, underruns } = run(400, 128, 480, (k) => k === 200);
    expect(underruns).toBeGreaterThan(0);
    const played = out.filter((v) => v > 0);
    for (let i = 1; i < played.length; i++) expect(played[i]).toBe((played[i - 1] ?? 0) + 1);
  });
});
