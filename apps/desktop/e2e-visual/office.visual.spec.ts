import { create } from '@bufbuild/protobuf';
import { FileMetaSchema } from '@calaba/protocol';
import { DiskItemKind } from '@calaba/protocol';
import type { Page } from '@playwright/test';
import { IDS, type MockServer } from '../e2e-support/mock-server';
import { expect, test } from './app';
import { checkpoint } from './harness';

/**
 * «Открыть» of an office file in the Calab window (ADR-0143, docs/08 «Редактор документов»). The
 * Document Server is the mock itself: the real host page (infra/office) and a STUB api.js that
 * draws a fake sheet / document / slides (e2e-support/assets/office-stub-api.js), so the screens
 * check the Calab frame around the editor, not ONLYOFFICE. The feature is a build switch, so the
 * run needs it on in both builds:
 *
 *   CALABA_OFFICE=1 VITE_OFFICE=1 CALABA_VISUAL_MOCK_PORT=4318 MOCK_LIVEKIT_ROOM_PREFIX=office_ \
 *     pnpm -F @calaba/desktop e2e:visual -g "office-"
 *
 * Projects office-dark-960 (all) and office-light-960 (the open editors).
 */

const WS = IDS.workspaces.main;

/** The Disk fixture plus a presentation and a legacy .doc in the root (the mock's Disk has no events: before `open`). */
function seedOffice(mock: MockServer): void {
  const base = [...mock.disk.items.values()].find((i) => i.name === 'Бюджет 2026.xlsx')?.file;
  if (!base) throw new Error('no fixture xlsx');
  const put = (name: string, mime: string): void => {
    mock.disk.put({ workspaceId: WS, kind: DiskItemKind.FILE, name, ownerId: IDS.users.anna, file: { ...base, name, mime } });
  };
  put('Питч для инвесторов.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  put('Договор (старый).doc', 'application/msword');
  put('График отпусков 2026.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

const row = (win: Page, name: string) => win.getByTestId('disk-row').filter({ hasText: name });

async function openDisk(win: Page): Promise<void> {
  await win.getByTestId('section-disk').click();
  await expect(win.getByTestId('disk-row').first()).toBeVisible();
}

test('office-entry-points', async ({ open, win, mock, shot, theme }) => {
  test.skip(theme !== 'dark', 'dark only');
  seedOffice(mock);
  await open({ prefs: { diskView: 'list' } });
  await openDisk(win);
  // The Disk row menu: «Открыть» is the editor for an office file.
  await row(win, 'График отпусков 2026.xlsx').click({ button: 'right' });
  await expect(win.getByTestId('disk-menu-open')).toBeVisible();
  await checkpoint(shot, 'office-entry-disk-menu');
  await win.keyboard.press('Escape');

  // A task's attachment: the chip opens the editor (view only for a plain file).
  const meta = create(FileMetaSchema, { id: IDS.files.sheet, workspaceId: WS, name: 'График отпусков 2026.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 19n });
  const task = mock.boards.taskByKey('CAL-3');
  if (!task) throw new Error('no CAL-3');
  task.task.attachments = [meta];
  task.task.attachmentCount = 1;
  await win.getByTestId('section-boards').click();
  await win.getByTestId('task-card').filter({ hasText: 'CAL-3' }).getByTestId('card-title').click();
  await expect(win.getByTestId('task-attachment')).toBeVisible();
  await checkpoint(shot, 'office-entry-attachment');
  await win.getByTestId('task-attachment-open').click();
  await expect(win.getByTestId('office-editor')).toHaveAttribute('data-mode', 'view');
  await expect(win.getByTestId('office-editor')).toHaveAttribute('data-state', 'saved');
  await win.getByRole('button', { name: 'Закрыть' }).first().click();
  await expect(win.getByTestId('office-editor')).toHaveCount(0);
  await win.keyboard.press('Escape');

  // A file message in chat.
  await win.getByTestId('section-chat').click();
  await win.locator('aside').getByRole('button', { name: /общий/ }).first().click();
  mock.injectMessage({ roomId: IDS.rooms.general, authorId: IDS.users.vera, content: 'График на подпись', attachments: [IDS.files.sheet] });
  await expect(win.getByRole('button', { name: /Открыть График отпусков 2026\.xlsx/ })).toBeVisible();
  await checkpoint(shot, 'office-entry-chat', { mask: [win.locator('[data-virtuoso-scroller]')] });
});

test('office-editor-xlsx', async ({ open, win, mock, shot }) => {
  seedOffice(mock);
  await open({ prefs: { diskView: 'list' } });
  await openDisk(win);
  await row(win, 'График отпусков 2026.xlsx').dblclick();
  const editor = win.getByTestId('office-editor');
  await expect(editor).toHaveAttribute('data-state', 'saved');
  await expect(editor).toHaveAttribute('data-mode', 'edit');
  await expect(win.getByTestId('office-status')).toHaveText('Сохранено');
  await checkpoint(shot, 'office-editor-xlsx');
});

test('office-unsaved-close', async ({ open, win, mock, shot, theme }) => {
  test.skip(theme !== 'dark', 'dark only');
  seedOffice(mock);
  mock.setOfficeFault('stuck');
  await open({ prefs: { diskView: 'list' } });
  await openDisk(win);
  await row(win, 'График отпусков 2026.xlsx').dblclick();
  await expect(win.getByTestId('office-editor')).toHaveAttribute('data-state', 'saved');
  // An edit inside the stub editor: unsaved («Сохраняется…»), the close asks.
  await win.frameLocator('[data-testid="office-frame"]').locator('body').click({ position: { x: 300, y: 200 } });
  await expect(win.getByTestId('office-editor')).toHaveAttribute('data-state', 'saving');
  await win.getByRole('button', { name: 'Закрыть' }).first().click();
  await expect(win.getByRole('alertdialog')).toBeVisible();
  await checkpoint(shot, 'office-unsaved-confirm');
  await win.getByRole('button', { name: 'Отмена' }).click();
  await expect(win.getByTestId('office-editor')).toBeVisible();
});

test('office-error', async ({ open, win, mock, shot, theme }) => {
  test.skip(theme !== 'dark', 'dark only');
  seedOffice(mock);
  mock.setOfficeFault('token');
  await open({ prefs: { diskView: 'list' } });
  await openDisk(win);
  await row(win, 'График отпусков 2026.xlsx').dblclick();
  await expect(win.getByTestId('office-error')).toBeVisible();
  await checkpoint(shot, 'office-error');
  // «Повторить» fetches a fresh config and opens again.
  mock.setOfficeFault('');
  await win.getByTestId('office-retry').click();
  await expect(win.getByTestId('office-editor')).toHaveAttribute('data-state', 'saved');
});

test('office-pptx', async ({ open, win, mock, shot }) => {
  seedOffice(mock);
  await open({ prefs: { diskView: 'list' } });
  await openDisk(win);
  await row(win, 'Питч для инвесторов.pptx').dblclick();
  await expect(win.getByTestId('office-editor')).toHaveAttribute('data-state', 'saved');
  await checkpoint(shot, 'office-editor-pptx');
});

test('office-legacy-doc', async ({ open, win, mock, shot, theme }) => {
  test.skip(theme !== 'dark', 'dark only');
  seedOffice(mock);
  await open({ prefs: { diskView: 'list' } });
  await openDisk(win);
  await row(win, 'Договор (старый).doc').dblclick();
  await expect(win.getByTestId('office-convert-notice')).toContainText('.docx');
  await expect(win.getByTestId('office-editor')).toHaveAttribute('data-state', 'saved');
  await checkpoint(shot, 'office-legacy-doc');
  await win.getByTestId('office-save-as').click();
  await expect(win.getByTestId('office-editor')).toBeVisible();
  await expect(win.getByRole('heading', { name: 'Договор (старый).docx' })).toBeVisible();
});
