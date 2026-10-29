/**
 * The toolbar's hint cards: one small scene per tool, drawn by the canvas's own renderer (so it matches the board
 * in both themes and needs no image files). Pure data, no React.
 */
import { buildTemplate, type TemplateText } from '../../../lib/canvas/templates';
import type { ObjectInit } from '../../../lib/canvas/types';

export const HINT_IDS = ['select', 'sticky', 'text', 'shape', 'connector', 'comment', 'sticker', 'templates', 'vote', 'timer'] as const;
export type HintId = (typeof HINT_IDS)[number];

export type HintArtKey = 'idea' | 'task' | 'note' | 'title' | 'body' | 'start' | 'finish' | 'comment';
export type HintText = (key: HintArtKey) => string;

type Item = { id: string; init: ObjectInit };

const sticky = (id: string, x: number, y: number, color: string, text: string, w = 160): Item => ({
  id, init: { kind: 'sticky', x, y, w, h: w, color, text },
});

/** The objects of a tool's scene, world units. `tpl` translates the template's own keys (the templates card). */
export function hintScene(id: HintId, tr: HintText, tpl: TemplateText): Item[] {
  switch (id) {
    case 'select':
      return [
        sticky('a', 0, 0, 'yellow', tr('idea')),
        sticky('b', 200, 40, 'sky', tr('task')),
        // The selection frame the live view draws as an overlay, here as an outline.
        { id: 'f', init: { kind: 'shape', shape: 'rect', x: -10, y: -10, w: 180, h: 180, fill: 'none', stroke: 'blue', strokeWidth: 3 } },
      ];
    case 'sticky':
      return [sticky('a', 0, 0, 'yellow', tr('idea')), sticky('b', 190, 0, 'pink', tr('task')), sticky('c', 380, 0, 'sky', tr('note'))];
    case 'text':
      return [
        { id: 'a', init: { kind: 'text', x: 0, y: 0, w: 420, size: 44, text: tr('title') } },
        { id: 'b', init: { kind: 'text', x: 0, y: 70, w: 420, size: 22, color: 'gray', text: tr('body') } },
      ];
    case 'shape':
      return [
        { id: 'a', init: { kind: 'shape', shape: 'rounded', x: 0, y: 20, w: 150, h: 100, fill: 'soft:blue', stroke: 'blue' } },
        { id: 'b', init: { kind: 'shape', shape: 'ellipse', x: 180, y: 10, w: 120, h: 120, fill: 'soft:green', stroke: 'green' } },
        { id: 'c', init: { kind: 'shape', shape: 'diamond', x: 330, y: 10, w: 130, h: 120, fill: 'soft:orange', stroke: 'orange' } },
      ];
    case 'connector':
      return [
        { id: 'a', init: { kind: 'shape', shape: 'rounded', x: 0, y: 0, w: 150, h: 80, fill: 'soft:green', stroke: 'green', text: tr('start') } },
        { id: 'b', init: { kind: 'shape', shape: 'rounded', x: 320, y: 90, w: 150, h: 80, fill: 'soft:blue', stroke: 'blue', text: tr('finish') } },
        { id: 'w', init: { kind: 'connector', from: { id: 'a', side: 'right' }, to: { id: 'b', side: 'left' }, route: 'curve', arrow: 'end', stroke: 'stroke', strokeWidth: 3 } },
      ];
    case 'comment':
      return [
        sticky('a', 0, 20, 'yellow', tr('idea')),
        { id: 'b', init: { kind: 'shape', shape: 'bubble', x: 190, y: 0, w: 250, h: 110, fill: 'white', stroke: 'gray', text: tr('comment') } },
      ];
    case 'sticker':
      return [{ id: 'a', init: { kind: 'text', x: 0, y: 0, w: 400, size: 72, text: '👍 🎉 ❤️ 🚀' } }];
    case 'templates': {
      let n = 0;
      return buildTemplate('kanban', { x: 0, y: 0 }, tpl, () => `k${n++}`);
    }
    case 'vote':
      return [
        sticky('a', 0, 0, 'yellow', tr('idea')),
        sticky('b', 190, 0, 'sky', tr('task')),
        { id: 'v1', init: { kind: 'shape', shape: 'ellipse', x: 120, y: -16, w: 52, h: 52, fill: 'blue', stroke: 'blue', text: '3' } },
        { id: 'v2', init: { kind: 'shape', shape: 'ellipse', x: 310, y: -16, w: 52, h: 52, fill: 'blue', stroke: 'blue', text: '1' } },
      ];
    case 'timer':
      return [
        { id: 'a', init: { kind: 'shape', shape: 'rounded', x: 0, y: 0, w: 300, h: 120, fill: 'soft:blue', stroke: 'none', strokeWidth: 0, fontPx: 64, text: '05:00' } },
      ];
  }
}
