import type { SceneName } from '@/i18n/home';
import { SCREENS, type FocusScreenName, type ScreenName } from '@/lib/screens';

export type { SceneName };

/**
 * Scenes of the v6 page (docs/plans/landing-v6.md §5) that show a screen's phone crop (`<name>-focus.webp`, ≤ 720 px)
 * as the picture itself — catalogue tiles whose whole window would be too small to read. Every other scene name is a
 * screen of `lib/screens.ts` as is.
 */
const FOCUS_SCENES = {
  'voice-focus': 'voice',
  'kanban-focus': 'kanban-full',
  'timeline-focus': 'timeline',
} as const satisfies Record<string, FocusScreenName>;

type FocusScene = keyof typeof FOCUS_SCENES;

// Every scene name resolves: a screen of lib/screens.ts or a focus scene above (fails typecheck otherwise).
const resolves: Exclude<SceneName, ScreenName | FocusScene> extends never ? true : never = true;
void resolves;

/** What a scene shows: the screen's files, `focus` = its phone crop files, and the size in CSS px. */
export type SceneFile = { screen: ScreenName; focus: boolean; width: number; height: number };

export function sceneFile(scene: SceneName | ScreenName): SceneFile {
  if (scene in FOCUS_SCENES) {
    const screen = FOCUS_SCENES[scene as FocusScene];
    const { focus } = SCREENS[screen];
    return { screen, focus: true, width: focus.width, height: focus.height };
  }
  const screen = scene as ScreenName;
  const { width, height } = SCREENS[screen];
  return { screen, focus: false, width, height };
}
