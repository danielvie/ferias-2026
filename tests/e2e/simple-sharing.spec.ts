import { expect, type Page } from '@playwright/test';
import { simpleSharingTests } from './simple-sharing-flows';
import type { TripSnapshot } from '../../shared/model';
import { selectTripDates } from './trip-dates';

async function create(page: Page, title = 'Simple sharing trip') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add trip details', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill(title);
  await page.getByLabel('Your name', { exact: true }).fill('Daniel');
  await selectTripDates(page, '2030-06-01', '2030-06-06');
  const response = page.waitForResponse(result => result.url().endsWith('/api/trips') && result.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const result = await response;
  expect(result.status()).toBe(201);
  const link = new URL(page.url());
  link.hash = new URLSearchParams({ access: (await result.json()).ownerToken }).toString();
  return link.href;
}

async function snapshot(page: Page): Promise<TripSnapshot> {
  return page.evaluate(async () => {
    const key = Object.keys(sessionStorage).find(key => key.startsWith('belgium-together:session:'));
    const identity = key ? sessionStorage.getItem(key) || 'none' : 'none';
    const response = await fetch('/api/trip', { headers: { 'X-Trip-Identity': identity } });
    if (!response.ok) throw new Error(`Snapshot failed with ${response.status}`);
    return response.json();
  });
}

simpleSharingTests({ create, snapshot });
