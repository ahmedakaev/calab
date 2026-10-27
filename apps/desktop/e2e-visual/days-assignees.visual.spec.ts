import type { Locator, Page } from '@playwright/test';
import { create } from '@bufbuild/protobuf';
import { TaskAssigneeSchema } from '@calaba/protocol';
import { TimestampSchema } from '@bufbuild/protobuf/wkt';
import { IDS } from '../e2e-support/mock-server';
import { expect, signIn, test } from './calendarWeb';
import { checkpoint, type Shot, type Theme } from './harness';

/**
 * Day separators in a chat and in a task card's comments over several days (#87) and the assignee
 * circles on a board card / list row with 1, 2 and 5 people (#92). Web build; projects days-dark-960,
 * days-light-960 (chat + board), days-phone-390 (WebKit, iPhone 14).
 *
 *   pnpm -F @calaba/desktop build:web && pnpm -F @calaba/desktop exec playwright test --config playwright.visual.config.ts --project days-dark-960
 */

const phone = (): boolean => test.info().project.name.includes('phone');
const light = (): boolean => test.info().project.name.includes('light');
const tap = (l: Locator): Promise<void> => (phone() ? l.tap() : l.click());
const DAY_MS = 86_400_000;
const NOW_MS = Date.parse('2026-01-15T13:30:00+03:00');

/** signIn() makes the theme dark: the light project flips the saved preference and reloads. */
async function lightTheme(page: Page): Promise<void> {
  if (!light()) return;
  await page.evaluate(() => localStorage.setItem('calaba-prefs', JSON.stringify({ state: { theme: 'light', onboarded: true, locale: 'ru' }, version: 1 })));
  await page.reload();
  await expect(page.locator('aside').first()).toBeVisible({ timeout: 30_000 });
}

function shot(page: Page): Shot {
  const theme: Theme = light() ? 'light' : 'dark';
  return { page, theme, viewport: page.viewportSize() ?? { width: 960, height: 600 } };
}

/** Messages over several days: [days before NOW, hours into that day, text]. */
const THREAD: [number, number, string][] = [
  [400, 10, 'Договор подписан в прошлом году'],
  [3, 23, 'Отправил договор на согласование'],
  [3, 23.2, 'Жду ответа'],
  [1, 9, 'Вчера утром юристы вернули правки'],
  [0, 9, 'Сегодня внёс правки, смотрите'],
  [0, 10, 'Ок, принято'],
];

function at(daysBack: number, hour: number): number {
  const start = new Date(NOW_MS - daysBack * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  return start.getTime() + (hour - 3) * 3_600_000;
}

test('days: chat with messages over several days', async ({ page, mock }) => {
  const room = IDS.rooms.general;
  for (const [d, h, text] of THREAD) {
    const m = mock.injectMessage({ roomId: room, authorId: d % 2 ? IDS.users.boris : IDS.users.anna, content: text });
    m.createdAt = create(TimestampSchema, { seconds: BigInt(Math.floor(at(d, h) / 1000)) });
  }
  await signIn(page, mock);
  await lightTheme(page);
  if (phone()) await tap(page.getByTestId('phone-tab-chats'));
  await page.getByRole('button', { name: /общий/ }).first().click();
  const sep = page.getByRole('separator');
  await expect(sep.filter({ hasText: 'Вчера' })).toHaveCount(1);
  await expect(sep.filter({ hasText: '12 января' })).toHaveCount(1);
  await expect(sep.filter({ hasText: '2024' })).toHaveCount(1);
  await checkpoint(shot(page), 'days-chat', { axe: false });
});

test('days: task card comments over several days', async ({ page, mock }) => {
  test.skip(light(), 'dark and phone only');
  const task = mock.boards.taskByKey('CAL-3');
  if (!task) throw new Error('no CAL-3');
  for (const [d, h, text] of THREAD) {
    const m = mock.injectMessage({ roomId: task.task.roomId, authorId: d % 2 ? IDS.users.boris : IDS.users.anna, content: text });
    m.createdAt = create(TimestampSchema, { seconds: BigInt(Math.floor(at(d, h) / 1000)) });
  }
  await signIn(page, mock);
  await lightTheme(page);
  await openBoard(page);
  await tap(page.getByTestId(phone() ? 'list-row' : 'task-card').filter({ hasText: 'Эхо в звонке' }).getByText('Эхо в звонке'));
  const panel = page.getByTestId('task-panel');
  await expect(panel).toBeVisible();
  const feed = page.getByTestId('activity-feed');
  await expect(feed.getByRole('separator').filter({ hasText: 'Вчера' }).first()).toBeVisible();
  await expect(feed.getByRole('separator').filter({ hasText: '2024' })).toHaveCount(1);
  await feed.getByText('Ок, принято').scrollIntoViewIfNeeded();
  await checkpoint(shot(page), 'days-task-comments', { axe: false });
});

test('assignees: 1, 2 and 5 on a board card', async ({ page, mock }) => {
  // Written straight into the mock: not everyone is a member of the board, but the card shows whoever is listed.
  const u = IDS.users;
  const set = (key: string, ids: string[]): void => {
    const t = mock.boards.taskByKey(key);
    if (!t) throw new Error(`no ${key}`);
    t.task.assignees = ids.map((userId, i) => create(TaskAssigneeSchema, { userId, isLead: i === 0, assignedAt: create(TimestampSchema, { seconds: BigInt(1_768_000_000 + i * 60) }) }));
  };
  set('CAL-1', [u.anna]);
  set('CAL-2', [u.anna, u.boris]);
  set('CAL-4', [u.anna, u.boris, u.vera, u.grigory, u.dina]);
  if (!phone()) await page.setViewportSize({ width: 1440, height: 800 }); // the «В работе» column with the 5-person card in view
  await signIn(page, mock);
  await lightTheme(page);
  await openBoard(page);
  const rows = page.getByTestId(phone() ? 'list-row' : 'task-card');
  const stacks = rows.filter({ hasText: /Экспорт доски|Тёмная тема|Карточки задач/ }).getByTestId('assignee-stack');
  await expect(stacks).toHaveCount(3);
  await expect(page.getByTestId('assignee-more')).toHaveCount(1);
  // Same circle size and the same right edge for every count.
  const boxes = await stacks.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); const c = e.closest('[data-testid=task-card],[data-testid=list-row]')?.getBoundingClientRect(); return { h: Math.round(r.height), right: Math.round((c?.right ?? 0) - r.right) }; }));
  expect(new Set(boxes.map((b) => b.h)).size).toBe(1);
  expect(new Set(boxes.map((b) => b.right)).size, JSON.stringify(boxes)).toBe(1);
  await expect(page.getByTestId('assignee-more')).toHaveText('+3');
  const more = await page.getByTestId('assignee-more').boundingBox();
  expect(Math.round(more?.width ?? 0)).toBe(20);
  expect(Math.round(more?.height ?? 0)).toBe(20);
  await checkpoint(shot(page), 'days-assignees', { axe: false });
});

async function openBoard(page: Page): Promise<void> {
  if (phone()) {
    await tap(page.getByTestId('phone-tab-boards'));
    await tap(page.getByTestId('board-row').filter({ hasText: 'Разработка' }).getByRole('button').first());
    await expect(page.getByTestId('list-view')).toBeVisible();
  } else {
    await page.getByTestId('section-boards').click();
    await expect(page.getByTestId('kanban')).toBeVisible();
  }
}
