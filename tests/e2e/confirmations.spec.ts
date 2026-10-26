import { expect, test } from '@playwright/test';
import type { TripSnapshot } from '../../shared/model';
import { recordDialogs } from './dialogs';
import { selectTripDates } from './trip-dates';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add trip details', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill('Confirmation test trip');
  await page.getByLabel('Your name', { exact: true }).fill('Daniel');
  await selectTripDates(page, '2030-06-01', '2030-06-06');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirmation test trip', exact: true })).toBeVisible();
});

test('settings close, cancel, Escape, reload and save do not prompt for confirmation', async ({ page }) => {
  const dialogs = recordDialogs(page);
  for (const action of ['close', 'cancel', 'escape', 'reload']) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByLabel('Trip name', { exact: true })).toHaveValue('Confirmation test trip');
    await expect(page.getByLabel('City 1', { exact: true })).toHaveValue('Brussels');
    await expect(page.getByRole('group', { name: 'Trip dates', exact: true }).getByRole('status'))
      .toHaveText('1 Jun 2030 to 6 Jun 2030');
    await page.getByLabel('Trip name', { exact: true }).fill('Unsaved settings');
    await page.getByLabel('City 1', { exact: true }).fill('Unsaved city');
    await selectTripDates(page, '2030-06-02', '2030-06-08');
    expect(await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
    if (action === 'escape') await page.keyboard.press('Escape');
    else if (action === 'reload') await page.reload();
    else await page.getByRole('button', { name: action === 'close' ? 'Close Trip settings' : 'Cancel', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Confirmation test trip', exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill('Saved without confirmation');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved without confirmation', exact: true })).toBeVisible();
  expect(dialogs).toEqual([]);
});

test('pending settings saves stay disabled without alerts or unload prompts', async ({ page }) => {
  const dialogs = recordDialogs(page);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/commands', async route => {
    await waiting;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill('Pending settings');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Close Trip settings', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Trip settings', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
  release();
  await expect(page.getByRole('heading', { name: 'Pending settings', exact: true })).toBeVisible();
  expect(dialogs).toEqual([]);
});

test('calendar and packing deletions still require confirmation', async ({ page }) => {
  const state: TripSnapshot = await (await page.request.get('/api/trip')).json();
  const response = await page.request.post('/api/commands', { data: {
    revision: state.revision, command: { type: 'event.save', event: {
      id: 'deletion-check', title: 'Deletion check', cityId: state.data.trip.cities[0].id,
      date: '2030-06-01', startTime: '10:00', endTime: '11:00', kind: 'activity',
      status: 'planned', placeId: '', description: '',
    } },
  } });
  expect(response.ok()).toBe(true);
  await page.reload();
  const messages: string[] = [];
  page.on('dialog', async dialog => {
    messages.push(dialog.message());
    if (messages.length === 1) await dialog.dismiss();
    else await dialog.accept();
  });
  await page.getByRole('button', { name: 'Delete Deletion check', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Deletion check', exact: true })).toBeVisible();
  expect(messages).toEqual(['Delete "Deletion check" from the calendar?']);
  await page.getByRole('button', { name: 'Delete Deletion check', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Deletion check', exact: true })).toHaveCount(0);
  expect(messages).toEqual(Array(2).fill('Delete "Deletion check" from the calendar?'));

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Checklists', exact: true }).click();
  const row = page.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: 'Passport / ID', exact: true }) });
  await row.getByLabel('Options for Passport / ID', { exact: true }).click();
  await row.getByRole('button', { name: 'Delete item', exact: true }).click();
  await expect(row.getByRole('group', { name: 'Delete Passport / ID', exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Keep item', exact: true }).click();
  await expect(row.getByRole('group', { name: 'Delete Passport / ID', exact: true })).toHaveCount(0);
  await expect(row.getByRole('checkbox', { name: 'Passport / ID', exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Delete item', exact: true }).click();
  await row.getByRole('button', { name: 'Confirm delete item', exact: true }).click();
  await expect(row).toHaveCount(0);
});
