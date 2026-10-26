import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import type { TripSnapshot } from '../../shared/model';
import { recordDialogs } from './dialogs';
import { selectTripDates } from './trip-dates';

test('quick start prefills an editable sample without saving, and cancel returns to a blank start', async ({ page }, testInfo) => {
  const dialogs = recordDialogs(page);
  let creates = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/trips') creates++;
  });
  await page.goto('/');
  const quickStart = page.getByRole('button', { name: 'Quick start', exact: true });
  await quickStart.focus();
  await quickStart.press('Enter');
  const pane = page.getByRole('dialog', { name: 'Quick start', exact: true });
  await expect(pane.getByLabel('Trip name', { exact: true })).toHaveValue('Sample Belgium trip');
  await expect(pane.getByLabel('Your name', { exact: true })).toHaveValue('Demo traveler');
  await expect(pane.getByLabel('City 1', { exact: true })).toHaveValue('Brussels');
  await expect(pane.getByLabel('City 2', { exact: true })).toHaveValue('Ghent');
  await expect(pane.getByLabel('City 3', { exact: true })).toHaveValue('Bruges');
  await expect(pane.getByText(/These are sample details/)).toBeVisible();
  await expect(pane.getByRole('group', { name: 'Trip dates', exact: true }).getByRole('status')).not.toHaveText('No dates selected');
  await expect(pane.locator('input[type="date"]')).toHaveCount(0);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(await pane.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(violations.map(violation => violation.id)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`quick-start-${width}.png`), fullPage: true });
  }
  expect(creates).toBe(0);
  await pane.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(quickStart).toBeFocused();
  expect((await page.request.get('/api/trip')).status()).toBe(401);
  await page.getByRole('button', { name: 'Add trip details', exact: true }).click();
  await expect(page.getByLabel('Trip name', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('');
  await expect(page.getByRole('group', { name: 'Trip dates', exact: true })).toContainText('No dates selected');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await quickStart.click();
  await expect(page.getByLabel('Trip name', { exact: true })).toHaveValue('Sample Belgium trip');
  expect(dialogs).toEqual([]);
});

test('quick start saves an immediately usable trip and keeps sample values out of later Settings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick start', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill('My quick-start trip');
  await page.getByLabel('Your name', { exact: true }).fill('Daniel');
  await page.getByLabel('City 2', { exact: true }).fill('Gent');
  await selectTripDates(page, '2030-06-01', '2030-06-07');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My quick-start trip', exact: true })).toBeVisible();
  await expect(page.locator('[data-trip-day]')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Quick start', exact: true })).toHaveCount(0);
  const saved: TripSnapshot = await (await page.request.get('/api/trip')).json();
  expect(saved.session.name).toBe('Daniel');
  expect(saved.data.trip.cities.map(city => city.name)).toEqual(['Brussels', 'Gent', 'Bruges']);
  expect(saved.data.events).toEqual([]);
  expect(saved.data.places).toEqual([]);
  expect(saved.data.notes).toEqual([]);
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Trip name', { exact: true })).toHaveValue('My quick-start trip');
  await expect(page.getByRole('group', { name: 'Trip dates', exact: true }).getByRole('status')).toHaveText('1 Jun 2030 to 7 Jun 2030');
  await expect(page.getByText(/These are sample details/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Places', exact: true }).click();
  await page.locator('.checkpoint-open').first().click();
  await page.getByLabel('New activity', { exact: true }).fill('Try quick activity');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Try quick activity', exact: true })).toBeVisible();
});

test('quick start preserves edited sample values after a failed create and retries without a popup', async ({ page }) => {
  const dialogs = recordDialogs(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick start', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill('Keep this sample draft');
  await page.route('**/api/trips', route => route.abort());
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Quick start', exact: true }).getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Trip name', { exact: true })).toHaveValue('Keep this sample draft');
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Demo traveler');
  await page.unroute('**/api/trips');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Keep this sample draft', exact: true })).toBeVisible();
  await expect(page.locator('[data-trip-day]')).toHaveCount(7);
  expect(dialogs).toEqual([]);
});
