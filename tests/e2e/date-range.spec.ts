import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { selectTripDates, showTripMonth } from './trip-dates';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add trip details', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill('Calendar trip');
  await page.getByLabel('Your name', { exact: true }).fill('Daniel');
});

test('one calendar requires both dates, previews and highlights the range at every screen size', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const picker = page.getByRole('group', { name: 'Trip dates', exact: true });
  await expect(picker.getByRole('grid')).toHaveCount(1);
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
  await expect(picker.getByRole('status')).toHaveText('No dates selected');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Choose a start and end date for your trip.');

  const grid = await showTripMonth(page, '2026-12-02');
  await grid.getByRole('button', { name: 'Wednesday, 2 December 2026', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(picker.getByRole('status')).toHaveText('2 Dec 2026 to …');
  await grid.getByRole('button', { name: 'Tuesday, 15 December 2026', exact: true }).hover();
  await expect(grid.locator('[data-in-range]')).toHaveCount(14);
  await expect(grid.locator('[aria-selected="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Choose a start and end date for your trip.');
  await grid.getByRole('button', { name: 'Tuesday, 15 December 2026', exact: true }).click();
  await expect(grid.locator('[aria-selected="true"]')).toHaveCount(14);
  await expect(grid.locator('[data-endpoint]')).toHaveCount(2);
  await expect(picker.getByRole('status')).toHaveText('2 Dec 2026 to 15 Dec 2026');

  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await picker.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(await page.getByRole('dialog').evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
    await expect(grid.locator('[data-date="2026-12-02"]')).toBeInViewport();
    await expect(grid.locator('[data-date="2026-12-15"]')).toBeInViewport();
    await picker.screenshot({ path: testInfo.outputPath(`date-range-${width}.png`) });
  }
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((item) => item.id)).toEqual([]);
  expect(errors).toEqual([]);
});

test('cross-year dates save and reload, and cancelling a cleared range preserves the saved dates', async ({ page }) => {
  await selectTripDates(page, '2026-12-28', '2027-01-05');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calendar trip', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const picker = page.getByRole('group', { name: 'Trip dates', exact: true });
  await expect(picker.getByRole('status')).toHaveText('28 Dec 2026 to 5 Jan 2027');
  await expect(picker.getByRole('grid').locator('[aria-selected="true"]')).toHaveCount(4);
  await picker.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(picker.getByLabel('Calendar year', { exact: true })).toHaveValue('2027');
  await expect(picker.getByRole('grid').locator('[aria-selected="true"]')).toHaveCount(5);
  await picker.getByRole('button', { name: 'Previous month', exact: true }).click();
  await expect(picker.getByLabel('Calendar year', { exact: true })).toHaveValue('2026');
  await picker.getByRole('button', { name: 'Clear dates', exact: true }).click();
  await expect(picker.getByRole('status')).toHaveText('No dates selected');
  await expect(picker.getByRole('grid').locator('[aria-selected="true"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(picker.getByRole('status')).toHaveText('28 Dec 2026 to 5 Jan 2027');
});

test('touch selection handles reverse ranges, leap days and single-day trips', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 320, height: 1000 } });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'Add trip details', exact: true }).tap();
    const grid = await showTripMonth(page, '2028-02-29');
    const picker = page.getByRole('group', { name: 'Trip dates', exact: true });
    await grid.locator('[data-date="2028-02-29"]').tap();
    await grid.locator('[data-date="2028-02-25"]').tap();
    await expect(picker.getByRole('status')).toHaveText('25 Feb 2028 to 29 Feb 2028');
    await expect(grid.locator('[aria-selected="true"]')).toHaveCount(5);
    await grid.locator('[data-date="2028-02-28"]').tap();
    await expect(picker.getByRole('status')).toHaveText('28 Feb 2028 to …');
    await grid.locator('[data-date="2028-02-28"]').tap();
    await expect(picker.getByRole('status')).toHaveText('28 Feb 2028');
    await expect(grid.locator('[aria-selected="true"]')).toHaveCount(1);
    await expect(grid.locator('[data-endpoint]')).toHaveCount(1);
    await page.getByLabel('Trip name', { exact: true }).fill('One day');
    await page.getByLabel('Your name', { exact: true }).fill('Daniel');
    await page.getByRole('button', { name: 'Save trip details', exact: true }).tap();
    await expect(page.getByRole('heading', { name: 'One day', exact: true })).toBeVisible();
    await expect(page.locator('[data-trip-day]')).toHaveCount(1);
  } finally { await context.close(); }
});

test('keyboard navigation crosses month boundaries and uses one grid tab stop', async ({ page }) => {
  const grid = await showTripMonth(page, '2028-01-31');
  await grid.locator('[data-date="2028-01-31"]').focus();
  for (const [key, date] of [
    ['ArrowRight', '2028-02-01'], ['ArrowLeft', '2028-01-31'],
    ['ArrowDown', '2028-02-07'], ['ArrowUp', '2028-01-31'],
    ['Home', '2028-01-30'], ['End', '2028-02-05'],
    ['PageUp', '2028-01-05'], ['PageDown', '2028-02-05'],
    ['Shift+PageDown', '2029-02-05'], ['Shift+PageUp', '2028-02-05'],
  ]) {
    await page.keyboard.press(key);
    await expect(grid.locator(`[data-date="${date}"]`)).toBeFocused();
    await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);
  }
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('City 1', { exact: true })).toBeFocused();
  await showTripMonth(page, '2028-01-31');
  await grid.locator('[data-date="2028-01-31"]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('PageDown');
  await expect(grid.locator('[data-date="2028-02-29"]')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('group', { name: 'Trip dates', exact: true }).getByRole('status'))
    .toHaveText('31 Jan 2028 to 29 Feb 2028');
  await expect(grid.locator('[aria-selected="true"]')).toHaveCount(29);
});
