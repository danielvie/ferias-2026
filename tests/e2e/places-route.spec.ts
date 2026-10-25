import { expect, test, type Locator, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import type { Place, TripCommand, TripSnapshot } from '../../shared/model';

async function state(page: Page): Promise<TripSnapshot> {
  const response = await page.request.get('/api/trip');
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function command(page: Page, command: TripCommand) {
  const current = await state(page);
  const response = await page.request.post('/api/commands', { data: { revision: current.revision, command } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<TripSnapshot>;
}

async function setup(page: Page) {
  const response = await page.request.post('/api/trips', { data: {
    title: 'Our Belgium route', ownerName: 'Daniel', startDate: '2030-06-01', endDate: '2030-06-10',
    cities: ['Brussels', 'Ghent', 'Bruges', 'Brussels'],
  } });
  expect(response.ok()).toBeTruthy();
  const initial: TripSnapshot = (await response.json()).snapshot;
  const ids = initial.data.trip.cities.map(city => city.id);
  const activities = [
    ['walk', 'Grand Place walk', ids[0]], ['trail', 'Comic strip trail', ids[0]],
    ['castle', 'Gravensteen', ids[1]], ['belfry', 'Belfry', ids[2]], ['museum', 'Magritte Museum', ids[3]],
  ];
  for (const [id, title, cityId] of activities) {
    const place: Place = { id, title, cityId, category: 'walk', status: 'idea', description: 'Keep the details',
      address: 'Original address', url: 'https://example.com/', durationMinutes: 60, cost: '€10' };
    await command(page, { type: 'place.save', place });
  }
  await command(page, { type: 'event.save', event: {
    id: 'booking', title: 'Booked walk', cityId: ids[0], placeId: 'walk', date: '2030-06-02',
    startTime: '10:00', endTime: '11:00', kind: 'activity', status: 'planned', description: 'Keep the booking',
  } });
  await page.goto('/');
  await places(page);
  return ids;
}

async function places(page: Page) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Places', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Places', exact: true })).toBeVisible();
}

const visit = (page: Page, id: string) => page.locator(`[data-visit-id="${id}"]`);
const order = (page: Page) => page.locator('[data-visit-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-visit-id')));

async function drag(page: Page, handle: Locator, target: Locator) {
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  expect(from).not.toBeNull(); expect(to).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2 + 10, from!.y + from!.height / 2, { steps: 3 });
  await expect(page.locator('.route-drag-preview')).toBeVisible();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 20 });
  await page.mouse.up();
}

test('inserts a separate visit from the connecting path and keeps its activities empty', async ({ page }) => {
  const ids = await setup(page);
  await page.getByRole('button', { name: 'Insert visit after Brussels · stop 1', exact: true }).click();
  await page.getByLabel('City name', { exact: true }).fill('Brussels');
  await expect(page.getByText(/This city is already on your route/)).toBeVisible();
  await page.getByRole('button', { name: 'Add visit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add city visit', exact: true })).toHaveCount(0);
  const saved = await state(page);
  const inserted = saved.data.trip.cities[1];
  expect(inserted.name).toBe('Brussels');
  expect(ids).not.toContain(inserted.id);
  expect(saved.data.places.filter(place => place.cityId === inserted.id)).toEqual([]);
  expect(await order(page)).toEqual([ids[0], inserted.id, ...ids.slice(1)]);
  await visit(page, inserted.id).getByRole('button', { name: '+ Add activity', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Return walk');
  await expect(page.getByRole('combobox', { name: 'City visit', exact: true })).toHaveValue(inserted.id);
  await page.getByRole('button', { name: 'Save activity', exact: true }).click();
  await expect(visit(page, inserted.id).getByRole('heading', { name: 'Return walk', exact: true })).toBeVisible();
  await page.reload(); await places(page);
  expect(await order(page)).toEqual(saved.data.trip.cities.map(city => city.id));
  await page.getByRole('navigation').getByRole('button', { name: 'Itinerary', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill('Same visits, new title');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Trip settings', exact: true })).toHaveCount(0);
  expect((await state(page)).data.trip.cities).toEqual(saved.data.trip.cities);
});

test('drags a whole visit, undoes it, and uses the same order in the itinerary after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const ids = await setup(page);
  await drag(page, visit(page, ids[0]).getByRole('button', { name: /Drag visit/ }), visit(page, ids[1]).locator('.route-visit-heading'));
  await expect.poll(() => order(page)).toEqual([ids[1], ids[0], ids[2], ids[3]]);
  expect((await state(page)).data.places.find(place => place.id === 'walk')?.cityId).toBe(ids[0]);
  await page.getByRole('button', { name: 'Undo move', exact: true }).click();
  await expect.poll(() => order(page)).toEqual(ids);
  await visit(page, ids[0]).getByLabel('Actions for visit Brussels · stop 1', { exact: true }).click();
  await visit(page, ids[0]).getByRole('button', { name: 'Move later', exact: true }).click();
  await expect.poll(() => order(page)).toEqual([ids[1], ids[0], ids[2], ids[3]]);
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Itinerary', exact: true }).click();
  await expect(page.locator('.itinerary-cities')).toHaveText('Ghent / Brussels · stop 2 / Bruges / Brussels · stop 4');
  await expect(page.locator('[data-trip-day]')).toHaveCount(10);
  await expect(page.locator('[data-trip-day="2030-06-02"]').getByRole('heading', { name: 'Booked walk', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Route', exact: true })).toHaveCount(0);
  expect((await state(page)).data.events[0].date).toBe('2030-06-02');
});

test('moves activities within and between visits without copying or moving booked times', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const ids = await setup(page);
  await drag(page, page.getByRole('button', { name: 'Drag activity Grand Place walk', exact: true }),
    page.locator('[data-activity-id="trail"]'));
  await expect.poll(async () => (await state(page)).data.places.filter(place => place.cityId === ids[0]).map(place => place.id))
    .toEqual(['trail', 'walk']);
  const before = await state(page);
  await drag(page, page.getByRole('button', { name: 'Drag activity Grand Place walk', exact: true }),
    visit(page, ids[3]).locator('.activity-drop-placeholder'));
  await expect(visit(page, ids[3]).locator('[data-activity-id="walk"]')).toBeVisible();
  const after = await state(page);
  expect(after.data.places).toHaveLength(before.data.places.length);
  expect(after.data.events[0]).toEqual({ ...before.data.events[0], cityId: ids[3] });
  expect(after.data.places.find(place => place.id === 'walk')).toEqual({ ...before.data.places.find(place => place.id === 'walk'), cityId: ids[3] });
  // The pointer sensor briefly suppresses clicks following a drag. Retry the
  // action until its result is visible, rather than sleeping for that interval.
  await expect(async () => {
    await page.getByRole('button', { name: 'Undo move', exact: true }).click();
    await expect(visit(page, ids[0]).locator('[data-activity-id="walk"]')).toBeVisible({ timeout: 250 });
  }).toPass({ timeout: 5000 });
  await page.getByLabel('Actions for Grand Place walk', { exact: true }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('[data-activity-id="walk"]').getByLabel('Move to visit', { exact: true }).selectOption(ids[1]);
  expect((await state(page)).data.events[0].cityId).toBe(ids[0]);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-activity-id="walk"]').getByLabel('Move to visit', { exact: true }).selectOption(ids[1]);
  await expect(visit(page, ids[1]).locator('[data-activity-id="walk"]')).toBeVisible();
  expect((await state(page)).data.events[0].date).toBe('2030-06-02');
});

test('shows the connected reference layout at desktop and phone sizes without accessibility violations', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await setup(page);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
    const boxes = await page.locator('[data-visit-id]').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y };
    }));
    if (width < 768) expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
    else expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(violation => violation.id)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`places-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('keeps a visit draft on conflicts and permits activity details while filtering', async ({ page }) => {
  const ids = await setup(page);
  await page.getByRole('button', { name: '+ Add city visit', exact: true }).click();
  await page.getByLabel('City name', { exact: true }).fill('Antwerp');
  await command(page, { type: 'visit.move', id: ids[0], beforeId: null });
  await page.getByRole('button', { name: 'Add visit', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Someone changed the trip');
  await expect(page.getByLabel('City name', { exact: true })).toHaveValue('Antwerp');
  await page.getByRole('button', { name: 'Add visit', exact: true }).click();
  await expect(page.getByLabel('City name', { exact: true })).toHaveCount(0);
  await page.getByText('Find an activity', { exact: true }).click();
  await page.getByLabel('Search activities', { exact: true }).fill('Grand Place');
  await expect(page.getByRole('button', { name: 'Drag activity Grand Place walk', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Grand Place walk', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close activity details', exact: true })).toBeVisible();
});

test('keeps viewer routes read-only', async ({ page, browser }) => {
  await setup(page);
  const response = await page.request.post('/api/invites', { data: { name: 'Viewer', role: 'viewer', eventIds: [], placeIds: [] } });
  const link = await response.json();
  const context = await browser.newContext();
  try {
    await context.request.post(new URL('/api/session', page.url()).href, { data: { token: link.token } });
    const reader = await context.newPage();
    await reader.goto(new URL('/', page.url()).href); await places(reader);
    await expect(reader.getByText('Read-only route.', { exact: false })).toBeVisible();
    await expect(reader.locator('.route-drag-handle, .route-insert, .visit-add-activity')).toHaveCount(0);
    await expect(reader.getByRole('button', { name: '+ Add city visit', exact: true })).toHaveCount(0);
    await expect(reader.getByRole('heading', { name: 'Grand Place walk', exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('supports keyboard visit dragging and cancels a failed save without changing the board', async ({ page }) => {
  const ids = await setup(page);
  const handle = visit(page, ids[0]).getByRole('button', { name: /Drag visit/ });
  await handle.focus(); await page.keyboard.press('Space');
  await expect(page.locator('.route-drag-preview')).toBeVisible();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space');
  await expect.poll(() => order(page)).toEqual([ids[1], ids[0], ids[2], ids[3]]);
  await page.getByRole('button', { name: 'Undo move', exact: true }).click();
  await expect.poll(() => order(page)).toEqual(ids);
  await page.route('**/api/commands', route => route.abort());
  await visit(page, ids[0]).getByLabel('Actions for visit Brussels · stop 1', { exact: true }).click();
  await visit(page, ids[0]).getByRole('button', { name: 'Move later', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await order(page)).toEqual(ids);
  await page.unroute('**/api/commands');
});

test('supports touch dragging an activity on a phone', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 390, height: 1200 } });
  try {
    const page = await context.newPage();
    const ids = await setup(page);
    const handle = page.getByRole('button', { name: 'Drag activity Grand Place walk', exact: true });
    await handle.scrollIntoViewIfNeeded();
    const from = (await handle.boundingBox())!;
    const to = (await page.locator('[data-activity-id="trail"]').boundingBox())!;
    const cdp = await context.newCDPSession(page);
    const point = (x: number, y: number) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x + 16, from.y + 22) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(from.x + 26, from.y + 22) });
    await expect(page.locator('.route-drag-preview')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(to.x + to.width / 2, to.y + to.height / 2) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await state(page)).data.places.filter(place => place.cityId === ids[0]).map(place => place.id))
      .toEqual(['trail', 'walk']);
  } finally { await context.close(); }
});
