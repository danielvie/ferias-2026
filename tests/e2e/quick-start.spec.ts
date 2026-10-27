import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import type { TripSnapshot } from '../../shared/model';
import { recordDialogs } from './dialogs';

test('quick start creates and opens an editable sample itinerary in one action', async ({ page }) => {
  const dialogs = recordDialogs(page);
  let creates = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/trips') creates++;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick start', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Sample Belgium trip', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-trip-day]')).toHaveCount(7);
  await expect(page.getByText('Explore the Grand Place', { exact: true }).first()).toBeVisible();
  expect(creates).toBe(1);

  const saved: TripSnapshot = await (await page.request.get('/api/trip')).json();
  expect(saved.session.name).toBe('Demo traveler');
  expect(saved.data.trip.cities.map(city => city.name)).toEqual(['Brussels', 'Ghent', 'Bruges']);
  expect(saved.data.events).toHaveLength(3);
  expect(saved.data.events.every(event => event.status === 'tentative')).toBe(true);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(violations.map(violation => violation.id)).toEqual([]);
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sample Belgium trip', exact: true })).toBeVisible();
  await expect(page.getByText('Explore the Grand Place', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Trip name', { exact: true })).toHaveValue('Sample Belgium trip');
  await page.getByLabel('Trip name', { exact: true }).fill('My trip');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My trip', exact: true })).toBeVisible();
  expect(dialogs).toEqual([]);
});

test('quick start reports a failed creation and allows retry', async ({ page }) => {
  await page.goto('/');
  await page.route('**/api/trips', route => route.abort());
  await page.getByRole('button', { name: 'Quick start', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quick start', exact: true })).toBeEnabled();
  await page.unroute('**/api/trips');
  await page.getByRole('button', { name: 'Quick start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sample Belgium trip', exact: true })).toBeVisible();
});

test('quick start opens the created trip if adding sample activities fails', async ({ page }) => {
  await page.goto('/');
  await page.route('**/api/commands', route => route.abort());
  await page.getByRole('button', { name: 'Quick start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sample Belgium trip', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('some sample activities could not be added');
  await expect(page.getByRole('button', { name: 'Quick start', exact: true })).toHaveCount(0);
  const saved: TripSnapshot = await (await page.request.get('/api/trip')).json();
  expect(saved.data.events).toEqual([]);
});
