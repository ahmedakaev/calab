import type { SceneName } from '@/i18n/home';
import { SCREENS, type ScreenName } from '@/lib/screens';

export type { SceneName };

/**
 * Scene names of the v6 page (docs/plans/landing-v6.md §5) → the file shown. A scene that `lib/screens.ts`
 * already lists is used as is; until implementer A delivers it, the closest existing capture stands in
 * (TODO(shots A): the fallbacks go away when every §5 scene is in `SCREENS`). `null` = no stand-in: the
 * tile shows a quiet placeholder instead of a wrong picture.
 */
const FALLBACK: Record<SceneName, ScreenName | null> = {
  voice: 'voice',
  'chat-full': 'chat',
  'chat-focus': 'chat',
  'kanban-full': 'kanban',
  'calendar-week': 'calendar',
  'wiki-full': 'wiki',
  'wiki-focus': 'wiki',
  canvas: null,
  'canvas-focus': null,
  'phone-call': 'call',
  'phone-call-focus': 'sipdial',
  'telephony-ivr': 'sipsettings',
  'telephony-call': 'siplog',
  'telephony-groups': 'sipsettings',
  'temp-room': 'guest',
  'recording-focus': null,
  'recording-transcript': null,
  aitask: null,
  roles: null,
  'bot-card': 'webapps',
  gallery: 'gallery',
  findtime: 'findtime',
  taskhistory: 'taskhistory',
  timeline: 'timeline',
  search: 'search',
  notifyrelay: 'notifyrelay',
  disk: 'disk',
  mail: 'mail',
  webapps: 'webapps',
  'story-message': 'chat',
  'story-task': 'task',
  'story-meeting': 'calendar',
  'story-wiki': 'wiki',
  'story-canvas': null,
  'phone-rooms': 'phone-rooms',
  'phone-voice': 'phone-voice',
  'phone-canvas': 'phone-chat',
  rail: null,
};

/** The file for a scene: the scene itself once A's captures list it, else the stand-in (or null). */
export function sceneScreen(scene: SceneName | ScreenName): ScreenName | null {
  if (scene in SCREENS) return scene as ScreenName;
  return FALLBACK[scene as SceneName] ?? null;
}

/** §5 crop sizes (CSS px) of the v6 scenes: the frame keeps the final proportion while a stand-in is shown. */
export const SCENE_SIZE: Record<SceneName, readonly [number, number]> = {
  voice: [1440, 900],
  'chat-full': [1440, 900],
  'chat-focus': [940, 590],
  'kanban-full': [1440, 900],
  'calendar-week': [1440, 900],
  'wiki-full': [1440, 900],
  'wiki-focus': [940, 590],
  canvas: [1440, 900],
  'canvas-focus': [940, 590],
  'phone-call': [1440, 900],
  'phone-call-focus': [940, 590],
  'telephony-ivr': [940, 660],
  'telephony-call': [940, 660],
  'telephony-groups': [940, 660],
  'temp-room': [640, 520],
  'recording-focus': [940, 590],
  'recording-transcript': [940, 620],
  aitask: [760, 640],
  roles: [940, 660],
  'bot-card': [940, 590],
  gallery: [872, 504],
  findtime: [1110, 870],
  taskhistory: [1110, 870],
  timeline: [1110, 870],
  search: [660, 650],
  notifyrelay: [920, 640],
  disk: [990, 570],
  mail: [1440, 758],
  webapps: [1440, 870],
  'story-message': [720, 420],
  'story-task': [640, 760],
  'story-meeting': [720, 480],
  'story-wiki': [720, 520],
  'story-canvas': [720, 400],
  'phone-rooms': [390, 844],
  'phone-voice': [390, 844],
  'phone-canvas': [390, 844],
  rail: [72, 560],
};

/** The proportion a scene is laid out with: its own crop once captured, else the §5 size. */
export function sceneRatio(scene: SceneName | ScreenName): readonly [number, number] {
  if (scene in SCREENS) {
    const s = SCREENS[scene as ScreenName];
    return [s.width, s.height];
  }
  return SCENE_SIZE[scene as SceneName];
}
