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

async function openCheckpoint(page: Page, id: string) {
  const button = visit(page, id).locator('.checkpoint-open');
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
  await expect(page.locator('#checkpoint-details')).toHaveAttribute('data-checkpoint-id', id);
  await expect(page.locator('#checkpoint-details')).toBeVisible();
}

async function closeCheckpoint(page: Page) {
  await page.locator('.checkpoint-open[aria-expanded="true"]').click();
  await expect(page.locator('#checkpoint-details')).toHaveCount(0);
}

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

test('inserts a separate visit from the checkpoint menu and keeps its activities empty', async ({ page }) => {
  const ids = await setup(page);
  await openCheckpoint(page, ids[0]);
  await visit(page, ids[0]).getByLabel('Actions for checkpoint 1: Brussels', { exact: true }).click();
  await page.getByRole('button', { name: 'Insert checkpoint after', exact: true }).click();
  await page.getByLabel('City name', { exact: true }).fill('Brussels');
  await expect(page.getByText(/This city is already on your route/)).toBeVisible();
  await page.getByRole('region', { name: 'Add checkpoint', exact: true }).getByRole('button', { name: 'Add checkpoint', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add checkpoint', exact: true })).toHaveCount(0);
  const saved = await state(page);
  const inserted = saved.data.trip.cities[1];
  expect(inserted.name).toBe('Brussels');
  expect(ids).not.toContain(inserted.id);
  expect(saved.data.places.filter(place => place.cityId === inserted.id)).toEqual([]);
  expect(await order(page)).toEqual([ids[0], inserted.id, ...ids.slice(1)]);
  await expect(visit(page, inserted.id).locator('.checkpoint-count')).toHaveText('0 activities');
  await expect(page.locator('#checkpoint-details')).toContainText('No activities yet.');
  await page.getByRole('button', { name: '+ Add activity', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Return walk');
  await expect(page.getByRole('combobox', { name: 'Checkpoint', exact: true })).toHaveValue(inserted.id);
  await page.getByRole('button', { name: 'Save activity', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Return walk', exact: true })).toBeVisible();
  await expect(visit(page, inserted.id).locator('.checkpoint-count')).toHaveText('1 activity');
  await page.reload(); await places(page);
  expect(await order(page)).toEqual(saved.data.trip.cities.map(city => city.id));
  await page.getByRole('navigation').getByRole('button', { name: 'Itinerary', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill('Same visits, new title');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Trip settings', exact: true })).toHaveCount(0);
  expect((await state(page)).data.trip.cities).toEqual(saved.data.trip.cities);
});

test('inserts at either end from the expanded checkpoint menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const ids = await setup(page);
  await openCheckpoint(page, ids[0]);
  await visit(page, ids[0]).getByLabel('Actions for checkpoint 1: Brussels', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Move earlier', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Insert checkpoint before', exact: true }).click();
  const form = page.getByRole('region', { name: 'Add checkpoint', exact: true });
  await expect(form).toContainText('Insert before Brussels · stop 1');
  await form.getByLabel('City name', { exact: true }).fill('Antwerp');
  await form.getByRole('button', { name: 'Add checkpoint', exact: true }).click();
  const first = (await state(page)).data.trip.cities[0];
  expect(first.name).toBe('Antwerp');
  expect(await order(page)).toEqual([first.id, ...ids]);
  await expect(visit(page, first.id).locator('#checkpoint-details')).toContainText('No activities yet.');
  await openCheckpoint(page, ids[3]);
  await visit(page, ids[3]).getByLabel('Actions for checkpoint 5: Brussels', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Move later', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Insert checkpoint after', exact: true }).click();
  await expect(form).toContainText('Add to the end of your route.');
  await form.getByLabel('City name', { exact: true }).fill('Leuven');
  await form.getByRole('button', { name: 'Add checkpoint', exact: true }).click();
  const last = (await state(page)).data.trip.cities.at(-1)!;
  expect(last.name).toBe('Leuven');
  expect(await order(page)).toEqual([first.id, ...ids, last.id]);
  await expect(visit(page, last.id).locator('.checkpoint-count')).toHaveText('0 activities');
});

test('drags a whole visit, undoes it, and uses the same order in the itinerary after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const ids = await setup(page);
  await drag(page, visit(page, ids[0]).getByRole('button', { name: /Drag checkpoint/ }), visit(page, ids[1]).locator('.route-visit'));
  await expect.poll(() => order(page)).toEqual([ids[1], ids[0], ids[2], ids[3]]);
  expect((await state(page)).data.places.find(place => place.id === 'walk')?.cityId).toBe(ids[0]);
  // Pointer drags briefly suppress clicks to prevent accidental activation.
  await expect(async () => {
    await page.getByRole('button', { name: 'Undo move', exact: true }).click();
    await expect.poll(() => order(page), { timeout: 250 }).toEqual(ids);
  }).toPass({ timeout: 5000 });
  await openCheckpoint(page, ids[0]);
  await visit(page, ids[0]).getByLabel('Actions for checkpoint 1: Brussels', { exact: true }).click();
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
  await openCheckpoint(page, ids[0]);
  const activity = page.locator('[data-activity-id="walk"]');
  const dialog = page.getByRole('dialog', { name: 'Move activity', exact: true });
  await expect(page.getByRole('button', { name: /^Drag activity/ })).toHaveCount(0);
  await activity.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(dialog).toContainText('From Brussels · stop 1');
  await expect(dialog.getByRole('button', { name: 'Move activity', exact: true })).toBeDisabled();
  await dialog.getByLabel('Position', { exact: true }).selectOption('');
  await dialog.getByRole('button', { name: 'Move activity', exact: true }).click();
  await expect.poll(async () => (await state(page)).data.places.filter(place => place.cityId === ids[0]).map(place => place.id))
    .toEqual(['trail', 'walk']);
  const before = await state(page);
  await activity.getByRole('button', { name: 'Move', exact: true }).click();
  await dialog.getByLabel('Destination checkpoint', { exact: true }).selectOption(ids[3]);
  await expect(dialog.getByRole('option', { name: '4. Brussels', exact: true })).toHaveCount(1);
  await dialog.getByLabel('Position', { exact: true }).selectOption('museum');
  await expect(dialog).toContainText('Scheduled dates and times stay unchanged');
  await dialog.getByRole('button', { name: 'Move activity', exact: true }).click();
  await expect(page.locator('#checkpoint-details [data-activity-id="walk"]')).toBeVisible();
  await expect(visit(page, ids[0]).locator('.checkpoint-count')).toHaveText('1 activity');
  await expect(visit(page, ids[3]).locator('.checkpoint-count')).toHaveText('2 activities');
  const after = await state(page);
  expect(after.data.places).toHaveLength(before.data.places.length);
  expect(after.data.places.filter(place => place.cityId === ids[3]).map(place => place.id)).toEqual(['walk', 'museum']);
  expect(after.data.events[0]).toEqual({ ...before.data.events[0], cityId: ids[3] });
  expect(after.data.places.find(place => place.id === 'walk')).toEqual({ ...before.data.places.find(place => place.id === 'walk'), cityId: ids[3] });
  await page.getByRole('button', { name: 'Undo move', exact: true }).click();
  await expect(page.locator('#checkpoint-details')).toHaveAttribute('data-checkpoint-id', ids[0]);
  await expect(activity).toBeVisible();
  await activity.getByRole('button', { name: 'Move', exact: true }).click();
  await dialog.getByLabel('Destination checkpoint', { exact: true }).selectOption(ids[1]);
  await expect(dialog).toContainText('This is a different city');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await state(page)).data.events[0].cityId).toBe(ids[0]);
  await activity.getByRole('button', { name: 'Move', exact: true }).click();
  await dialog.getByLabel('Destination checkpoint', { exact: true }).selectOption(ids[1]);
  await dialog.getByRole('button', { name: 'Move activity', exact: true }).click();
  await expect(page.locator('#checkpoint-details')).toHaveAttribute('data-checkpoint-id', ids[1]);
  await expect(activity).toBeVisible();
  expect((await state(page)).data.events[0].date).toBe('2030-06-02');
});

test('shows a compact straight rail with inline expansion without overflow or accessibility violations', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const ids = await setup(page);
  for (const name of ['Antwerp', 'Leuven', 'Namur', 'Dinant']) {
    await command(page, { type: 'visit.add', visit: { id: `extra-${name}`, name }, beforeId: null });
  }
  await page.reload(); await places(page);
  const before = await state(page);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
    await expect(page.getByRole('group', { name: 'City card view', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-activity-id]')).toHaveCount(0);
    await expect(page.locator('.checkpoint-count')).toHaveText([
      '2 activities', '1 activity', '1 activity', '1 activity', '0 activities', '0 activities', '0 activities', '0 activities',
    ]);
    const boxes = await page.locator('.route-visit').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y };
    }));
    expect(boxes.every(box => box.x === boxes[0].x)).toBeTruthy();
    expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
    const heights = await page.locator('.route-visit').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
    expect(heights.every(height => height <= 60)).toBeTruthy();
    expect(boxes[7].y - boxes[0].y).toBeLessThanOrEqual(7 * 60);
    await expect(visit(page, 'extra-Dinant')).toBeInViewport();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(violation => violation.id)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`places-${width}.png`), fullPage: true });
    await openCheckpoint(page, ids[1]);
    await expect(page.locator('[data-activity-id]')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Gravensteen', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(visit(page, ids[1]).locator('#checkpoint-details')).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('overflow', 'visible');
    const header = (await visit(page, ids[1]).locator('.route-visit').boundingBox())!;
    const details = (await page.locator('#checkpoint-details').boundingBox())!;
    const next = (await visit(page, ids[2]).locator('.route-visit').boundingBox())!;
    expect(details.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(details.y + details.height).toBeLessThanOrEqual(next.y);
    expect(details.x).toBeGreaterThan(header.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
    const detailsResult = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(detailsResult.violations.map(violation => violation.id)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`places-details-${width}.png`), fullPage: true });
    await closeCheckpoint(page);
    await expect(visit(page, ids[1]).locator('.checkpoint-open')).toBeFocused();
  }
  expect(await state(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('keeps a visit draft on conflicts and permits activity details while filtering', async ({ page }) => {
  const ids = await setup(page);
  await page.getByRole('button', { name: 'Add checkpoint', exact: true }).click();
  await page.getByLabel('City name', { exact: true }).fill('Antwerp');
  await command(page, { type: 'visit.move', id: ids[0], beforeId: null });
  await page.getByRole('region', { name: 'Add checkpoint', exact: true }).getByRole('button', { name: 'Add checkpoint', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Someone changed the trip');
  await expect(page.getByLabel('City name', { exact: true })).toHaveValue('Antwerp');
  await page.getByRole('region', { name: 'Add checkpoint', exact: true }).getByRole('button', { name: 'Add checkpoint', exact: true }).click();
  await expect(page.getByLabel('City name', { exact: true })).toHaveCount(0);
  await openCheckpoint(page, ids[0]);
  await page.getByText('Find an activity', { exact: true }).click();
  await page.getByLabel('Search activities', { exact: true }).fill('Grand Place');
  await expect(page.getByRole('button', { name: /^Drag activity/ })).toHaveCount(0);
  await expect(page.locator('[data-activity-id="walk"]').getByRole('button', { name: 'Move', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: /^Drag checkpoint/ }).first()).toBeEnabled();
  await expect(visit(page, ids[0]).locator('.checkpoint-count')).toHaveText('2 activities');
  await expect(page.locator('[data-activity-id]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Grand Place walk', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close activity details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close activity details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Grand Place walk', exact: true })).toBeFocused();
});

test('keeps viewer routes read-only', async ({ page, browser }) => {
  const ids = await setup(page);
  const response = await page.request.post('/api/invites', { data: { name: 'Viewer', role: 'viewer', eventIds: [], placeIds: [] } });
  const link = await response.json();
  const context = await browser.newContext();
  try {
    await context.request.post(new URL('/api/session', page.url()).href, { data: { token: link.token } });
    const reader = await context.newPage();
    await reader.goto(new URL('/', page.url()).href); await places(reader);
    await expect(reader.getByText('Read-only route.', { exact: false })).toBeVisible();
    await expect(reader.locator('.route-drag-handle, .route-insert, .visit-add-activity')).toHaveCount(0);
    await expect(reader.getByRole('button', { name: 'Add checkpoint', exact: true })).toHaveCount(0);
    await expect(reader.getByRole('button', { name: 'Move', exact: true })).toHaveCount(0);
    await openCheckpoint(reader, ids[0]);
    await expect(reader.getByRole('heading', { name: 'Grand Place walk', exact: true })).toBeVisible();
    await expect(reader.locator('.visit-add-activity')).toHaveCount(0);
  } finally { await context.close(); }
});

test('supports keyboard visit dragging and cancels a failed save without changing the board', async ({ page }) => {
  const ids = await setup(page);
  const handle = visit(page, ids[0]).getByRole('button', { name: /Drag checkpoint/ });
  await handle.focus(); await page.keyboard.press('Space');
  const preview = page.locator('.route-drag-preview');
  await expect(preview).toBeVisible();
  const startY = (await preview.boundingBox())!.y;
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await preview.boundingBox())?.y ?? startY).toBeGreaterThan(startY + 20);
  await page.keyboard.press('Space');
  await expect.poll(() => order(page)).toEqual([ids[1], ids[0], ids[2], ids[3]]);
  await page.getByRole('button', { name: 'Undo move', exact: true }).click();
  await expect.poll(() => order(page)).toEqual(ids);
  await page.route('**/api/commands', route => route.abort());
  await openCheckpoint(page, ids[0]);
  await visit(page, ids[0]).getByLabel('Actions for checkpoint 1: Brussels', { exact: true }).click();
  await visit(page, ids[0]).getByRole('button', { name: 'Move later', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await order(page)).toEqual(ids);
  await page.unroute('**/api/commands');
});

test('moves an activity to an offscreen checkpoint and opens its inline activities on a phone', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    const ids = await setup(page);
    for (let i = 0; i < 10; i++) {
      await command(page, { type: 'visit.add', visit: { id: `far-${i}`, name: 'Brussels' }, beforeId: null });
    }
    await page.reload(); await places(page);
    await expect(visit(page, 'far-9')).not.toBeInViewport();
    await openCheckpoint(page, ids[0]);
    await page.locator('[data-activity-id="walk"]').getByRole('button', { name: 'Move', exact: true }).tap();
    const dialog = page.getByRole('dialog', { name: 'Move activity', exact: true });
    await expect(dialog).toBeInViewport();
    await dialog.getByLabel('Destination checkpoint', { exact: true }).selectOption('far-9');
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(violation => violation.id)).toEqual([]);
    await dialog.getByRole('button', { name: 'Move activity', exact: true }).tap();
    await expect(dialog).toHaveCount(0);
    expect((await state(page)).data.places.find(place => place.id === 'walk')?.cityId).toBe('far-9');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(visit(page, 'far-9').locator('.checkpoint-open')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#checkpoint-details [data-activity-id="walk"]')).toBeVisible();
    await expect(page.locator('#checkpoint-details [data-activity-id="walk"]')).toBeInViewport();
    await page.getByRole('button', { name: 'Undo move', exact: true }).tap();
    await expect(visit(page, ids[0]).locator('.checkpoint-open')).toHaveAttribute('aria-expanded', 'true');
    expect((await state(page)).data.places.find(place => place.id === 'walk')?.cityId).toBe(ids[0]);
  } finally { await context.close(); }
});

test('keeps move choices through a conflicting save and supports retry and undo', async ({ page }) => {
  const ids = await setup(page);
  const before = await state(page);
  await openCheckpoint(page, ids[0]);
  await page.locator('[data-activity-id="walk"]').getByRole('button', { name: 'Move', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Move activity', exact: true });
  await dialog.getByLabel('Destination checkpoint', { exact: true }).selectOption(ids[3]);
  await dialog.getByLabel('Position', { exact: true }).selectOption('museum');
  await page.route('**/api/commands', route => route.abort());
  await dialog.getByRole('button', { name: 'Move activity', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Your choices are kept');
  expect(await state(page)).toEqual(before);
  await page.unroute('**/api/commands');
  await command(page, { type: 'visit.move', id: ids[1], beforeId: ids[0] });
  await dialog.getByRole('button', { name: 'Move activity', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Your choices are kept');
  await expect(dialog.getByLabel('Destination checkpoint', { exact: true })).toHaveValue(ids[3]);
  await expect(dialog.getByLabel('Position', { exact: true })).toHaveValue('museum');
  await dialog.getByRole('button', { name: 'Move activity', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#checkpoint-details')).toHaveAttribute('data-checkpoint-id', ids[3]);
  await expect(page.locator('[data-activity-id="walk"]')).toBeVisible();
  await page.getByRole('button', { name: 'Undo move', exact: true }).click();
  await expect(page.locator('#checkpoint-details')).toHaveAttribute('data-checkpoint-id', ids[0]);
  await expect(page.locator('[data-activity-id="walk"]')).toBeVisible();
});

test('checkpoints fit on a phone and can drag the first city directly to the last without opening it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const ids = await setup(page);
  const before = await state(page);
  await expect(visit(page, ids[3])).toBeInViewport();
  await drag(page, visit(page, ids[0]).getByRole('button', { name: /^Drag checkpoint/ }),
    visit(page, ids[3]).locator('.route-visit'));
  await expect.poll(() => order(page)).toEqual([ids[1], ids[2], ids[3], ids[0]]);
  const after = await state(page);
  expect(after.data.places).toEqual(before.data.places);
  expect(after.data.events).toEqual(before.data.events);
  await expect(page.locator('#checkpoint-details')).toHaveCount(0);
  await expect(async () => {
    await visit(page, ids[0]).locator('.checkpoint-open').click();
    await expect(page.locator('[data-activity-id="walk"]')).toBeVisible({ timeout: 250 });
  }).toPass({ timeout: 5000 });
});

test('supports touch dragging compact checkpoints', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 390, height: 1000 } });
  try {
    const page = await context.newPage();
    const ids = await setup(page);
    const handle = visit(page, ids[0]).getByRole('button', { name: /^Drag checkpoint/ });
    const from = (await handle.boundingBox())!;
    const to = (await visit(page, ids[3]).locator('.route-visit').boundingBox())!;
    await expect(visit(page, ids[3])).toBeInViewport();
    const cdp = await context.newCDPSession(page);
    const point = (x: number, y: number) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x + 16, from.y + 22) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(from.x + 26, from.y + 22) });
    await expect(page.locator('.route-drag-preview')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(to.x + to.width / 2, to.y + to.height / 2) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => order(page)).toEqual([ids[1], ids[2], ids[3], ids[0]]);
  } finally { await context.close(); }
});

test('keeps inline selection through resizing and restores focus after phone activity forms', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const ids = await setup(page);
  const before = await state(page);
  await visit(page, ids[1]).locator('.checkpoint-open').focus();
  await page.keyboard.press('Enter');
  await expect(visit(page, ids[1]).locator('.checkpoint-open')).toBeFocused();
  await openCheckpoint(page, ids[0]);
  await expect(page.locator('.checkpoint-open[aria-expanded="true"]')).toHaveCount(1);
  await expect(page.locator('[data-activity-id]')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 1000 });
  const panel = visit(page, ids[0]).locator('#checkpoint-details');
  await expect(panel).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await panel.getByRole('button', { name: '+ Add activity', exact: true }).click();
  await expect(panel.getByRole('button', { name: '+ Add activity', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
  await page.getByLabel('Title', { exact: true }).fill('Discard this draft');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: '+ Add activity', exact: true })).toBeFocused();
  await panel.locator('[data-activity-id="trail"]').getByRole('button', { name: 'Add to calendar', exact: true }).click();
  await expect(panel.locator('[data-activity-id="trail"]').getByRole('button', { name: 'Add to calendar', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Date', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(panel.locator('[data-activity-id="trail"]').getByRole('button', { name: 'Add to calendar', exact: true })).toBeFocused();
  await panel.locator('[data-activity-id="walk"]').getByRole('button', { name: 'Move', exact: true }).click();
  await page.getByRole('dialog', { name: 'Move activity', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(panel.locator('[data-activity-id="walk"]').getByRole('button', { name: 'Move', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('body')).toHaveCSS('overflow', 'visible');
  await expect(panel.locator('[data-activity-id="walk"]').getByRole('button', { name: 'Move', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 1000 });
  await expect(panel).toBeVisible();
  await visit(page, ids[0]).locator('.checkpoint-open').focus();
  await page.keyboard.press('Space');
  await expect(panel).toHaveCount(0);
  await expect(visit(page, ids[0]).locator('.checkpoint-open')).toBeFocused();
  await visit(page, ids[1]).locator('.checkpoint-open').focus();
  await page.keyboard.press('Enter');
  await expect(visit(page, ids[1]).locator('#checkpoint-details')).toBeVisible();
  await visit(page, ids[2]).locator('.checkpoint-open').click();
  await expect(visit(page, ids[1]).locator('.checkpoint-open')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.checkpoint-open[aria-expanded="true"]')).toHaveCount(1);
  expect(await state(page)).toEqual(before);
});

test('keeps the selected checkpoint by ID when its route number changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const ids = await setup(page);
  await openCheckpoint(page, ids[0]);
  await drag(page, visit(page, ids[0]).getByRole('button', { name: /^Drag checkpoint/ }),
    visit(page, ids[3]).locator('.route-visit'));
  await expect.poll(() => order(page)).toEqual([ids[1], ids[2], ids[3], ids[0]]);
  await expect(page.locator('#checkpoint-details')).toHaveAttribute('data-checkpoint-id', ids[0]);
  await expect(visit(page, ids[0]).locator('.checkpoint-number')).toHaveText('4');
  await expect(page.locator('[data-activity-id]')).toHaveCount(2);
  await expect(async () => {
    await page.getByRole('button', { name: 'Undo move', exact: true }).click();
    await expect(visit(page, ids[0]).locator('.checkpoint-number')).toHaveText('1', { timeout: 250 });
  }).toPass({ timeout: 5000 });
});

test('saves an idea into the selected return checkpoint without merging same-name checkpoints', async ({ page }) => {
  const ids = await setup(page);
  await openCheckpoint(page, ids[3]);
  await page.getByText('Activity ideas', { exact: true }).click();
  await page.getByRole('button', { name: 'Save suggestion: Grand Place', exact: true }).click();
  await expect(page.locator('#checkpoint-details').getByRole('heading', { name: 'Grand Place', exact: true })).toBeVisible();
  await expect(visit(page, ids[0]).locator('.checkpoint-count')).toHaveText('2 activities');
  await expect(visit(page, ids[3]).locator('.checkpoint-count')).toHaveText('2 activities');
  const saved = (await state(page)).data.places.find(place => place.title === 'Grand Place');
  expect(saved?.cityId).toBe(ids[3]);
  await page.getByText('Find an activity', { exact: true }).click();
  await page.getByLabel('Search activities', { exact: true }).fill('Not in this checkpoint');
  await expect(page.locator('#checkpoint-details')).toContainText('No matching activities in this checkpoint.');
  await expect(visit(page, ids[3]).locator('.checkpoint-count')).toHaveText('2 activities');
});

test('handles 30 checkpoints and a long city name without sideways scrolling', async ({ page }) => {
  await setup(page);
  for (let i = 4; i < 30; i++) {
    await command(page, { type: 'visit.add', visit: { id: `limit-${i}`,
      name: i === 29 ? 'A long checkpoint name with a very long unbroken suffix '.padEnd(100, 'x') : `Checkpoint ${i + 1}`,
    }, beforeId: null });
  }
  await page.reload(); await places(page);
  await expect(page.getByRole('button', { name: 'Add checkpoint', exact: true })).toBeDisabled();
  await expect(page.locator('[data-visit-id]')).toHaveCount(30);
  await expect(page.locator('.route-insert:enabled')).toHaveCount(0);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
    await expect(visit(page, 'limit-29').locator('.checkpoint-count')).toHaveText('0 activities');
  }
  await openCheckpoint(page, 'limit-29');
  await expect(page.locator('#checkpoint-details')).toContainText('No activities yet.');
  await expect(page.getByRole('button', { name: '+ Add activity', exact: true })).toBeEnabled();
  await visit(page, 'limit-29').getByLabel(/Actions for checkpoint 30:/).click();
  await expect(page.getByRole('button', { name: 'Insert checkpoint before', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Insert checkpoint after', exact: true })).toBeDisabled();
});
