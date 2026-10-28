import { expect, test, type Locator, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import type { Place, TripCommand, TripSnapshot } from '../../shared/model';
import { recordDialogs } from './dialogs';

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
  const startScroll = await page.evaluate(() => scrollY);
  expect(from).not.toBeNull(); expect(to).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2 + 10, from!.y + from!.height / 2, { steps: 3 });
  await expect(page.locator('.route-drag-preview')).toBeVisible();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 20 });
  // Auto-scrolling can move the target while the pointer is travelling.
  if (await page.evaluate(() => scrollY) !== startScroll) {
    const current = await target.boundingBox();
    if (current) await page.mouse.move(current.x + current.width / 2, current.y + current.height / 2);
  }
  await page.mouse.up();
}

test('sets city dates and warns about scheduled activities without moving them', async ({ page }, testInfo) => {
  const ids = await setup(page);
  const first = visit(page, ids[0]);
  await page.setViewportSize({ width: 320, height: 844 });
  const trigger = first.getByRole('button', { name: /Set dates for Brussels/ });
  const before = await visit(page, ids[1]).boundingBox();
  const triggerBefore = await trigger.boundingBox();
  const chevronBefore = await first.locator('.checkpoint-chevron').boundingBox();
  await trigger.click();
  const picker = page.getByRole('dialog', { name: /Dates for Brussels/ });
  await expect(picker).toBeVisible();
  await expect(page.locator('#checkpoint-details')).toHaveCount(0);
  expect((await visit(page, ids[1]).boundingBox())!.y).toBe(before!.y);
  await expect(picker.getByRole('button', { name: 'Arrival: Not set' })).toBeFocused();
  await expect(picker.getByRole('button', { name: 'Arrival: Not set' })).toHaveText('Arrival');
  await expect(picker.getByRole('button', { name: 'Departure: Not set' })).toHaveText('Departure');
  await expect(picker.getByRole('button', { name: 'Arrival: Not set' })).toHaveCSS('color', 'rgb(100, 112, 130)');
  await expect(picker.getByRole('button', { name: 'Departure: Not set' })).toHaveCSS('color', 'rgb(100, 112, 130)');
  await expect(picker).toHaveCSS('padding-left', '8px');
  await expect(picker).toHaveCSS('border-left-width', '2px');
  await page.screenshot({ path: testInfo.outputPath('city-dates-empty-mobile.png'), fullPage: true });
  await picker.locator('[data-date="2030-06-03"]').click();
  await picker.locator('[data-date="2030-06-04"]').click();
  await expect(picker.getByRole('button', { name: 'Arrival: 3 Jun' })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Departure: 4 Jun' })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Arrival: 3 Jun' })).toHaveText('3 Jun');
  await expect(picker.getByRole('button', { name: 'Departure: 4 Jun' })).toHaveText('4 Jun');
  await expect(picker.getByText('Choose an arrival or departure date.')).toHaveClass('visually-hidden');
  await expect(picker.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
  const daySize = await picker.locator('[data-date="2030-06-03"]').boundingBox();
  // Seven 44 px-wide cells cannot fit alongside padding and screen margins
  // in a 320 px viewport; retain at least 40 px per day.
  expect(daySize!.width).toBeGreaterThanOrEqual(40);
  expect(daySize!.height).toBeGreaterThanOrEqual(44);
  const pickerA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(pickerA11y.violations.map(violation => violation.id)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('city-dates-editor-mobile.png'), fullPage: true });
  await picker.getByRole('button', { name: 'Done' }).click();
  await expect(first.getByRole('button', { name: /Edit dates for Brussels/ })).toBeFocused();
  expect((await first.getByRole('button', { name: /Edit dates for Brussels/ }).boundingBox())!.x).toBe(triggerBefore!.x);
  expect((await first.locator('.checkpoint-chevron').boundingBox())!.x).toBe(chevronBefore!.x);
  await expect(first.getByText('1 activity outside city dates')).toBeVisible();
  await openCheckpoint(page, ids[0]);
  await expect(first.locator('[data-activity-id="walk"]')).toContainText('Scheduled outside city dates');
  await expect(first.locator('[data-activity-id="trail"]')).not.toContainText('Scheduled outside city dates');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations.map(violation => violation.id)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('city-dates-warning-mobile.png'), fullPage: true });
  await closeCheckpoint(page);
  await expect(first.getByText('1 activity outside city dates')).toBeVisible();
  await page.reload(); await places(page);
  await expect(first.getByText('1 activity outside city dates')).toBeVisible();
  const current = await state(page);
  expect(current.data.events.find(event => event.id === 'booking')?.date).toBe('2030-06-02');
  await command(page, { type: 'trip.update', trip: { ...current.data.trip, endDate: '2030-06-03' } });
  await page.reload(); await places(page);
  await expect(first.getByText('Outside trip dates')).toBeVisible();
  await first.getByRole('button', { name: /Edit dates for Brussels/ }).click();
  await picker.getByRole('button', { name: 'Clear arrival date' }).click();
  await picker.getByRole('button', { name: 'Clear departure date' }).click();
  await picker.getByRole('button', { name: 'Done' }).click();
  await expect(first.getByRole('button', { name: /Set dates for Brussels/ })).toBeVisible();
  await expect(first.getByText('1 activity outside city dates')).toHaveCount(0);
});

test('keeps city date drafts after a failed save', async ({ page }) => {
  const ids = await setup(page);
  const first = visit(page, ids[0]);
  await first.getByRole('button', { name: /Set dates for Brussels/ }).click();
  const picker = page.getByRole('dialog', { name: /Dates for Brussels/ });
  await picker.locator('[data-date="2030-06-03"]').click();
  await picker.locator('[data-date="2030-06-04"]').click();
  await page.route('**/api/commands', route => route.abort());
  await picker.getByRole('button', { name: 'Done' }).click();
  await expect(picker.getByRole('alert')).toContainText('Could not save city dates');
  await expect(picker.getByRole('button', { name: 'Arrival: 3 Jun' })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Departure: 4 Jun' })).toBeVisible();
  await page.unroute('**/api/commands');
  await picker.getByRole('button', { name: 'Done' }).click();
  await expect(first.getByRole('button', { name: /Edit dates for Brussels/ })).toBeFocused();
  await expect(first.getByText('1 activity outside city dates')).toBeVisible();
});

test('supports partial dates, keyboard dismissal, and trip date limits', async ({ page }) => {
  const ids = await setup(page);
  const first = visit(page, ids[0]);
  const trigger = first.getByRole('button', { name: /Set dates for Brussels/ });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const picker = page.getByRole('dialog', { name: /Dates for Brussels/ });
  await expect(picker.locator('[data-date="2030-06-11"]')).toHaveAttribute('aria-disabled', 'true');
  await picker.getByRole('button', { name: 'Departure: Not set' }).click();
  await picker.locator('[data-date="2030-06-04"]').click();
  await picker.getByRole('button', { name: 'Done' }).click();
  await expect(first.getByRole('button', { name: /Edit dates for Brussels/ })).toContainText('Until 4 Jun');
  await page.reload(); await places(page);
  const edit = first.getByRole('button', { name: /Edit dates for Brussels/ });
  await edit.click();
  await expect(picker.getByRole('button', { name: 'Departure: 4 Jun' })).toBeVisible();
  await picker.getByRole('button', { name: 'Clear departure date' }).click();
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();
  await expect(edit).toContainText('Until 4 Jun');
});

test('keeps the calendar within the viewport without moving the route', async ({ page }) => {
  const ids = await setup(page);
  const first = visit(page, ids[0]);
  const trigger = first.getByRole('button', { name: /Set dates for Brussels/ });
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await trigger.scrollIntoViewIfNeeded();
    const cityBefore = await first.boundingBox();
    const nextBefore = await visit(page, ids[1]).boundingBox();
    await trigger.click();
    const picker = page.getByRole('dialog', { name: /Dates for Brussels/ });
    const box = (await picker.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 8);
    expect(box.y).toBeGreaterThanOrEqual(8);
    expect(box.y + box.height).toBeLessThanOrEqual(836);
    expect((await first.boundingBox())!.y).toBe(cityBefore!.y);
    expect((await visit(page, ids[1]).boundingBox())!.y).toBe(nextBefore!.y);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
});

test('adds a fresh checklist to each city and keeps their checks independent', async ({ page }, testInfo) => {
  const ids = await setup(page);
  await command(page, { type: 'checklist.add', id: 'documents', title: 'Check documents' });
  await command(page, { type: 'checklist.item.add', checklistId: 'documents', title: 'Passport' });
  await page.reload();
  await places(page);
  const first = visit(page, ids[0]).locator('.city-checklist');
  const add = first.getByRole('button', { name: /Add checklist for/ });
  await expect(add.locator('svg')).toHaveCount(1);
  await expect(add).toHaveText('Checklist');
  await expect(add.locator('svg')).toHaveCSS('width', '14px');
  await expect(add).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  expect((await add.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(add).toHaveAttribute('aria-expanded', 'true');
  await first.getByRole('group', { name: /Choose a checklist/ }).getByRole('button', { name: 'Check documents Trip checklist', exact: true }).click();
  await expect(first.getByRole('checkbox', { name: 'Passport' })).not.toBeChecked();
  await first.getByRole('checkbox', { name: 'Passport' }).check();
  await expect(first.getByText('All checks complete')).toBeVisible();
  await first.getByRole('button', { name: 'Close Check documents' }).click();
  const checklistIcon = first.getByRole('button', { name: /Open Check documents/ });
  await expect(checklistIcon).toBeVisible();
  await expect(checklistIcon.locator('svg')).toHaveCSS('width', '14px');
  await expect(checklistIcon).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  expect((await checklistIcon.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  expect((await checklistIcon.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: testInfo.outputPath('transition-icons-desktop.png'), fullPage: true });

  const second = visit(page, ids[1]).locator('.city-checklist');
  await second.getByRole('button', { name: /Add checklist for/ }).click();
  await second.getByRole('group', { name: /Choose a checklist/ }).getByRole('button', { name: 'Check documents Trip checklist', exact: true }).click();
  await expect(second.getByRole('checkbox', { name: 'Passport' })).not.toBeChecked();
  await page.reload();
  await places(page);
  await first.getByRole('button', { name: /Open Check documents/ }).click();
  await expect(first.getByText('All checks complete')).toBeVisible();
  await second.getByRole('button', { name: /Open Check documents/ }).click();
  await expect(second.getByRole('checkbox', { name: 'Passport' })).not.toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('transition-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map(violation => violation.id)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('transition-mobile.png'), fullPage: true });
});

test('creates a new city checklist and adds a check', async ({ page }) => {
  const ids = await setup(page);
  const connector = visit(page, ids[0]).locator('.city-checklist');
  await connector.getByRole('button', { name: /Add checklist for/ }).click();
  const picker = connector.getByRole('group', { name: /Choose a checklist/ });
  await expect(picker.getByRole('button').last()).toHaveText('+ Add new');
  await picker.getByRole('button', { name: 'Add new' }).click();
  const title = connector.getByRole('textbox', { name: 'Checklist title: Untitled checklist' });
  await expect(title).toBeFocused();
  await title.fill('Check documents');
  await title.press('Enter');
  await expect(connector.getByText('No checks yet')).toBeVisible();
  await connector.getByRole('textbox', { name: 'New item for Check documents' }).fill('Passport');
  await connector.getByRole('textbox', { name: 'New item for Check documents' }).press('Enter');
  await expect(connector.getByRole('checkbox', { name: 'Passport' })).not.toBeChecked();
  await expect(connector.getByText('1 check left')).toBeVisible();
});

test('deletes transition items directly and confirms checklist deletion', async ({ page }, testInfo) => {
  const ids = await setup(page);
  await command(page, { type: 'checklist.add', id: 'source', title: 'Travel checks' });
  await command(page, { type: 'checklist.item.add', checklistId: 'source', title: 'Passport' });
  await command(page, { type: 'checklist.item.add', checklistId: 'source', title: 'Tickets' });
  await page.reload();
  await places(page);
  const connector = visit(page, ids[0]).locator('.city-checklist');
  await connector.getByRole('button', { name: /Add checklist for/ }).click();
  await connector.getByRole('button', { name: 'Travel checks Trip checklist' }).click();
  const deleteItem = connector.getByRole('button', { name: 'Delete item Passport' });
  const deleteList = connector.getByRole('button', { name: 'Delete checklist Travel checks' });
  const close = connector.getByRole('button', { name: 'Close Travel checks' });
  await expect(connector.locator('.transition-card')).toHaveCSS('background-color', 'rgb(238, 243, 252)');
  await expect(deleteList.locator('svg')).toHaveCount(1);
  await expect(close.locator('svg')).toHaveCount(1);
  await deleteList.hover();
  await expect(deleteList).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect((await deleteItem.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  await deleteItem.focus();
  await expect(deleteItem).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('transition-actions-desktop.png'), fullPage: true });
  await page.keyboard.press('Enter');
  await expect(connector.getByRole('checkbox', { name: 'Passport' })).toHaveCount(0);
  await expect(connector.getByRole('textbox', { name: 'New item for Travel checks' })).toBeFocused();
  await connector.getByRole('checkbox', { name: 'Tickets' }).check();
  await connector.getByText('1 completed item').click();
  await connector.getByRole('button', { name: 'Delete item Tickets' }).click();
  await expect(connector.getByText('No checks yet')).toBeVisible();
  const source = (await state(page)).data.checklists!.find(list => list.id === 'source');
  expect(source?.items.map(item => item.title)).toEqual(['Passport', 'Tickets']);
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map(violation => violation.id)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('transition-actions-mobile.png'), fullPage: true });
  await deleteList.click();
  const confirm = connector.getByRole('group', { name: 'Delete checklist Travel checks' });
  await confirm.getByRole('button', { name: 'Keep checklist' }).click();
  await expect(confirm).toHaveCount(0);
  await deleteList.click();
  await confirm.getByRole('button', { name: 'Confirm delete checklist' }).click();
  await expect(connector.getByRole('button', { name: /Open Travel checks/ })).toHaveCount(0);
  await expect(connector.getByRole('button', { name: /Add checklist for/ })).toBeFocused();
  expect((await state(page)).data.checklists!.some(list => list.id === 'source')).toBeTruthy();
});

test('keeps a checklist selection for retry when a response is lost', async ({ page }, testInfo) => {
  const ids = await setup(page);
  const connector = visit(page, ids[0]).locator('.city-checklist');
  const add = connector.getByRole('button', { name: /Add checklist for/ });
  await add.click();
  const picker = connector.getByRole('group', { name: /Choose a checklist/ });
  const packing = picker.getByRole('button', { name: 'Packing Trip checklist', exact: true });
  await expect(packing).toBeVisible();
  await expect(picker).toHaveCSS('background-color', 'rgb(245, 247, 251)');
  await expect(picker).toHaveCSS('border-radius', '0px');
  await packing.hover();
  await expect(packing).toHaveCSS('background-color', 'rgb(238, 243, 252)');
  const hovered = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(hovered.violations.map(violation => violation.id)).toEqual([]);
  await packing.focus();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(add).toBeFocused();
  await add.click();
  await page.screenshot({ path: testInfo.outputPath('picker-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
  const addBox = (await add.boundingBox())!, pickerBox = (await picker.boundingBox())!;
  expect(pickerBox.x).toBeGreaterThanOrEqual(addBox.x + addBox.width);
  expect(Math.abs(pickerBox.y - addBox.y)).toBeLessThanOrEqual(1);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations.map(violation => violation.id)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('picker-mobile.png'), fullPage: true });
  await page.route('**/api/commands', async route => {
    await route.fetch();
    await route.abort();
  });
  await packing.click();
  await expect(picker.getByRole('alert')).toContainText("Couldn't add the checklist");
  await page.unroute('**/api/commands');
  await picker.getByRole('button', { name: 'Retry' }).click();
  await expect(connector.getByRole('textbox', { name: 'Checklist title: Packing' })).toBeVisible();
  const matching = (await state(page)).data.checklists!.filter(list => list.city?.cityId === ids[0]);
  expect(matching).toHaveLength(1);
  expect(matching[0].city).toEqual({ cityId: ids[0] });
  expect(matching[0].items.every(item => item.status === 'pending')).toBeTruthy();
});

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
  await expect(page.getByLabel('New activity', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Full form', exact: true }).click();
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
  await expect.poll(() => order(page)).toEqual([first.id, ...ids]);
  await expect(visit(page, first.id).getByLabel('New activity', { exact: true })).toBeVisible();
  await openCheckpoint(page, ids[3]);
  await visit(page, ids[3]).getByLabel('Actions for checkpoint 5: Brussels', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Move later', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Insert checkpoint after', exact: true }).click();
  await expect(form).toContainText('Add to the end of your route.');
  await form.getByLabel('City name', { exact: true }).fill('Leuven');
  await form.getByRole('button', { name: 'Add checkpoint', exact: true }).click();
  await expect(form).toHaveCount(0);
  const last = (await state(page)).data.trip.cities.at(-1)!;
  expect(last.name).toBe('Leuven');
  await expect.poll(() => order(page)).toEqual([first.id, ...ids, last.id]);
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

test('aligns the drag preview with the grabbed city, including an open checklist', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const ids = await setup(page);
  await command(page, { type: 'checklist.addCity', id: 'arrival', title: 'Hotel',
    cityId: ids[1], phase: 'arriving', sourceId: null });
  await page.reload();
  await places(page);
  const checklists = visit(page, ids[1]).locator('.city-checklist');
  await checklists.getByRole('button', { name: 'Open Hotel, Ghent' }).click();
  for (const id of [ids[0], ids[1]]) {
    const handle = visit(page, id).getByRole('button', { name: /Drag checkpoint/ });
    await handle.scrollIntoViewIfNeeded();
    const box = (await handle.boundingBox())!;
    const pointer = { x: box.x + box.width / 2 + 10, y: box.y + box.height / 2 };
    await page.mouse.move(pointer.x - 10, pointer.y);
    await page.mouse.down();
    await page.mouse.move(pointer.x, pointer.y, { steps: 3 });
    const preview = page.locator('.route-drag-preview');
    await expect(preview).toBeVisible();
    await expect.poll(async () => {
      const bounds = await preview.boundingBox();
      return bounds && pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height;
    }).toBeTruthy();
    if (id === ids[1]) await page.screenshot({ path: testInfo.outputPath('aligned-city-drag.png') });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(preview).toHaveCount(0);
  }
  expect(await order(page)).toEqual(ids);
});

test('reorders checkpoints without route warnings while preserving dates and checklists', async ({ page }) => {
  const ids = await setup(page);
  await command(page, { type: 'event.save', event: {
    id: 'later-event', title: 'Later event', cityId: ids[1], placeId: '', date: '2030-06-03',
    startTime: '10:00', endTime: '11:00', kind: 'activity', status: 'planned', description: '',
  } });
  await command(page, { type: 'checklist.addTransition', id: 'first-leg', title: 'First leg',
    fromCityId: ids[0], toCityId: ids[1], sourceId: null });
  await command(page, { type: 'checklist.addTransition', id: 'second-leg', title: 'Second leg',
    fromCityId: ids[1], toCityId: ids[2], sourceId: null });
  const before = await state(page);
  await page.reload();
  await places(page);
  await openCheckpoint(page, ids[1]);
  await visit(page, ids[1]).getByLabel('Actions for checkpoint 2: Ghent', { exact: true }).click();
  await visit(page, ids[1]).getByRole('button', { name: 'Move earlier', exact: true }).click();
  await expect.poll(() => order(page)).toEqual([ids[1], ids[0], ids[2], ids[3]]);
  await expect(page.getByText('Some scheduled dates run against your route order', { exact: false })).toHaveCount(0);
  await expect(page.getByText('checkpoints that are no longer adjacent', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Review dates', { exact: true })).toHaveCount(0);
  const after = await state(page);
  expect(after.data.events).toEqual(before.data.events);
  expect(after.data.checklists).toEqual(before.data.checklists);
  await page.getByRole('button', { name: 'Undo move', exact: true }).click();
  await expect.poll(() => order(page)).toEqual(ids);
  await expect(visit(page, ids[0]).getByRole('button', { name: /Open First leg/ })).toBeVisible();
  await expect(visit(page, ids[1]).getByRole('button', { name: /Open Second leg/ })).toBeVisible();
});

test('keeps legacy checklists in one city slot when reordered', async ({ page }, testInfo) => {
  const ids = await setup(page);
  await command(page, { type: 'checklist.addTransition', id: 'legacy', title: 'Old journey',
    fromCityId: ids[0], toCityId: ids[1], sourceId: null });
  await command(page, { type: 'checklist.item.add', checklistId: 'legacy', title: 'Tickets' });
  const legacyItem = (await state(page)).data.checklists!.find(list => list.id === 'legacy')!.items[0];
  await command(page, { type: 'checklist.item.update', checklistId: 'legacy', id: legacyItem.id, status: 'done', assignee: 'Daniel' });
  await command(page, { type: 'checklist.addCity', id: 'arrival', title: 'Hotel',
    cityId: ids[1], phase: 'arriving', sourceId: null });
  await command(page, { type: 'checklist.addCity', id: 'leaving', title: 'Bags',
    cityId: ids[1], phase: 'leaving', sourceId: null });
  await page.reload();
  await places(page);
  const first = visit(page, ids[0]);
  const second = visit(page, ids[1]);
  const legacy = first.locator('.city-checklist');
  const checklists = second.locator('.city-checklist');
  await expect(first.locator('.city-checklist')).toHaveCount(1);
  await expect(second.locator('.city-checklist')).toHaveCount(1);
  await expect(visit(page, ids[3]).locator('.city-checklist').getByRole('button', { name: /Add checklist for/ })).toBeVisible();
  await expect(legacy.getByRole('button', { name: /Open Old journey, Brussels/ })).toBeVisible();
  await expect(checklists.getByRole('button', { name: 'Open Hotel, Ghent' })).toBeVisible();
  await expect(checklists.getByRole('button', { name: 'Open Bags, Ghent' })).toBeVisible();
  await expect(legacy.locator('.transition-checklists')).toHaveCSS('background-color', 'rgb(245, 247, 251)');
  const departureBox = (await legacy.locator('.transition-checklists').boundingBox())!;
  const cityBox = (await first.locator('.route-visit').boundingBox())!;
  expect(departureBox.y - (cityBox.y + cityBox.height)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('city-checklist-desktop.png'), fullPage: true });
  await openCheckpoint(page, ids[1]);
  await second.getByLabel('Actions for checkpoint 2: Ghent', { exact: true }).click();
  await second.getByRole('button', { name: 'Move later', exact: true }).click();
  await expect.poll(() => order(page)).toEqual([ids[0], ids[2], ids[1], ids[3]]);
  await expect(checklists.getByRole('button', { name: 'Open Hotel, Ghent' })).toBeVisible();
  await expect(checklists.getByRole('button', { name: 'Open Bags, Ghent' })).toBeVisible();
  await legacy.getByRole('button', { name: /Open Old journey, Brussels/ }).click();
  await expect(legacy.getByText('All checks complete', { exact: false })).toBeVisible();
  const after = (await state(page)).data.checklists!.find(list => list.id === 'legacy')!;
  expect(after.items[0]).toEqual({ ...legacyItem, status: 'done', assignee: 'Daniel' });
  await page.reload();
  await places(page);
  await expect(checklists.getByRole('button', { name: 'Open Hotel, Ghent' })).toBeVisible();
  await expect(checklists.getByRole('button', { name: 'Open Bags, Ghent' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map(violation => violation.id)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('city-checklist-mobile.png'), fullPage: true });
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

test('shows compact unfilled checkpoint rows with inline quick add without overflow or accessibility violations', async ({ page }, testInfo) => {
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
    const number = visit(page, ids[0]).locator('.checkpoint-number');
    await expect(number).toHaveCSS('font-weight', '700');
    await expect(number).toHaveCSS('border-left-width', '0px');
    await expect(number).toHaveCSS('border-radius', '0px');
    await visit(page, ids[0]).locator('.route-drag-handle').hover();
    await expect(number).toHaveCSS('border-left-width', '0px');
    const boxes = await page.locator('.route-visit').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y };
    }));
    expect(boxes.every(box => box.x === boxes[0].x)).toBeTruthy();
    expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
    const heights = await page.locator('.route-visit').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
    expect(heights.every(height => height <= 60)).toBeTruthy();
    const borders = await page.locator('.route-visit-item').evaluateAll(nodes =>
      nodes.map(node => getComputedStyle(node).borderBottomWidth));
    expect(borders.every(width => width === '0px')).toBeTruthy();
    await expect(page.locator('.transition-connector').first()).toHaveCSS('border-left-width', '2px');
    await expect(page.locator('.transition-add')).toHaveCount(8);
    await expect(page.locator('.city-checklist')).toHaveCount(8);
    const itemHeights = await page.locator('.route-visit-item').evaluateAll(nodes =>
      nodes.map(node => node.getBoundingClientRect().height));
    expect(itemHeights.every(height => height <= 110)).toBeTruthy();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(violation => violation.id)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`places-${width}.png`), fullPage: true });
    await openCheckpoint(page, ids[1]);
    await expect(page.locator('[data-activity-id]')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Gravensteen', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(visit(page, ids[1]).locator('#checkpoint-details')).toBeVisible();
    const selected = visit(page, ids[1]);
    await expect(selected.locator('.checkpoint-open')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await selected.locator('.checkpoint-open').hover();
    await expect(selected.locator('.checkpoint-open')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(selected.locator('.checkpoint-name')).toHaveCSS('font-weight', '700');
    await expect(selected.locator('.checkpoint-name')).toHaveCSS('color', 'rgb(52, 94, 194)');
    await expect(selected.locator('.checkpoint-number')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(selected.locator('.checkpoint-number')).toHaveCSS('font-weight', '700');
    await expect(selected.locator('.checkpoint-number')).toHaveCSS('border-left-width', '0px');
    await expect(page.locator('#checkpoint-details')).toHaveCSS('border-left-width', '0px');
    expect(await selected.evaluate(element => getComputedStyle(element, '::before').content)).toBe('none');
    const full = selected.getByRole('button', { name: 'Full form', exact: true });
    const add = selected.getByRole('button', { name: 'Add', exact: true });
    expect((await full.boundingBox())!.height).toBe(width >= 768 ? 32 : 44);
    expect((await add.boundingBox())!.height).toBe(width >= 768 ? 32 : 44);
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
    await expect(reader.locator('.route-drag-handle, .route-insert, .checkpoint-quick-add')).toHaveCount(0);
    await expect(reader.getByRole('button', { name: 'Add checkpoint', exact: true })).toHaveCount(0);
    await expect(reader.getByRole('button', { name: 'Move', exact: true })).toHaveCount(0);
    await openCheckpoint(reader, ids[0]);
    await expect(reader.getByRole('heading', { name: 'Grand Place walk', exact: true })).toBeVisible();
    await expect(reader.locator('.checkpoint-quick-add, .checkpoint-ideas, .route-menu')).toHaveCount(0);
  } finally { await context.close(); }
});

test('supports keyboard visit dragging and cancels a failed save without changing the board', async ({ page }) => {
  const ids = await setup(page);
  const handle = visit(page, ids[0]).getByRole('button', { name: /Drag checkpoint/ });
  await handle.focus(); await page.keyboard.press('Space');
  const preview = page.locator('.route-drag-preview');
  await expect(preview).toBeVisible();
  const handleBox = (await handle.boundingBox())!;
  const previewBox = (await preview.boundingBox())!;
  expect(Math.abs(previewBox.y - handleBox.y)).toBeLessThanOrEqual(2);
  // dnd-kit's keyboard sensor installs its key listener in a timer after pickup.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[role="status"]').filter({ hasText: `droppable area visit:${ids[1]}` })).toBeAttached();
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
    const preview = page.locator('.route-drag-preview');
    await expect(preview).toBeVisible();
    const previewBox = (await preview.boundingBox())!;
    expect(from.y + 22).toBeGreaterThanOrEqual(previewBox.y);
    expect(from.y + 22).toBeLessThanOrEqual(previewBox.y + previewBox.height);
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
  await panel.getByRole('button', { name: 'Full form', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Full form', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
  await page.getByLabel('Title', { exact: true }).fill('Discard this draft');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Full form', exact: true })).toBeFocused();
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
  await expect(page.getByLabel('New activity', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Full form', exact: true })).toBeEnabled();
  await visit(page, 'limit-29').getByLabel(/Actions for checkpoint 30:/).click();
  await expect(page.getByRole('button', { name: 'Insert checkpoint before', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Insert checkpoint after', exact: true })).toBeDisabled();
});

test('quick adds unscheduled ideas to the selected return checkpoint and keeps input focus', async ({ page }) => {
  const ids = await setup(page);
  const before = await state(page);
  await openCheckpoint(page, ids[3]);
  const form = page.getByRole('form', { name: 'Add activity to Brussels', exact: true });
  const input = form.getByRole('textbox', { name: 'New activity', exact: true });
  const add = form.getByRole('button', { name: 'Add', exact: true });
  await expect(add).toBeDisabled();
  await input.fill('   ');
  await expect(add).toBeDisabled();
  await input.fill('  Return walk  ');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(form.getByRole('status')).toContainText('Return walk saved as an idea');
  await expect(visit(page, ids[3]).locator('.checkpoint-count')).toHaveText('2 activities');
  const saved = await state(page);
  expect(saved.data.places.find(place => place.title === 'Return walk')).toMatchObject({
    cityId: ids[3], status: 'idea', category: 'sight', durationMinutes: 60,
    description: '', address: '', url: '', cost: '',
  });
  expect(saved.data.places.filter(place => place.cityId === ids[0])).toEqual(
    before.data.places.filter(place => place.cityId === ids[0]));
  expect(saved.data.events).toEqual(before.data.events);
  await input.fill('Coffee by the canal');
  await add.click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(visit(page, ids[3]).locator('.checkpoint-count')).toHaveText('3 activities');
  await page.reload(); await places(page); await openCheckpoint(page, ids[3]);
  await expect(page.getByRole('heading', { name: 'Return walk', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Coffee by the canal', exact: true })).toBeVisible();
});

test('carries the quick-add draft into the full form, preserves it on cancel and clears it on save', async ({ page }) => {
  const ids = await setup(page);
  await openCheckpoint(page, ids[1]);
  const quick = page.getByRole('form', { name: 'Add activity to Ghent', exact: true });
  const input = quick.getByRole('textbox', { name: 'New activity', exact: true });
  const full = quick.getByRole('button', { name: 'Full form', exact: true });
  await input.fill('Canal walk');
  await full.click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Canal walk');
  await expect(page.getByLabel('Checkpoint', { exact: true })).toHaveValue(ids[1]);
  await expect(input).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(full).toBeFocused();
  await expect(input).toHaveValue('Canal walk');
  await full.click();
  await page.getByLabel('Title', { exact: true }).fill('Evening canal walk');
  await page.getByRole('button', { name: 'Save activity', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evening canal walk', exact: true })).toBeVisible();
  await expect(full).toBeFocused();
  await expect(input).toHaveValue('');
  expect((await state(page)).data.places.filter(place => place.title.includes('canal walk'))).toHaveLength(1);
});

test('keeps a quick-add draft through errors and conflicts and retries a lost response without duplicates', async ({ page }) => {
  const ids = await setup(page);
  await openCheckpoint(page, ids[1]);
  const quick = page.getByRole('form', { name: 'Add activity to Ghent', exact: true });
  const input = quick.getByRole('textbox', { name: 'New activity', exact: true });
  const add = quick.getByRole('button', { name: 'Add', exact: true });
  await input.fill('Retry this walk');
  await page.route('**/api/commands', route => route.abort());
  await add.click();
  await expect(quick.getByRole('alert')).toContainText('draft is kept');
  await expect(input).toHaveValue('Retry this walk');
  await page.unroute('**/api/commands');
  await command(page, { type: 'visit.move', id: ids[0], beforeId: null });
  await add.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Someone changed the trip' })).toBeVisible();
  await expect(input).toHaveValue('Retry this walk');
  await page.route('**/api/commands', async route => {
    await route.fetch();
    await route.abort();
  });
  await add.click();
  await expect(quick.getByRole('alert')).toBeVisible();
  await expect(input).toHaveValue('Retry this walk');
  await page.unroute('**/api/commands');
  await add.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Someone changed the trip' })).toBeVisible();
  await add.click();
  await expect(input).toHaveValue('');
  const saved = await state(page);
  expect(saved.data.places.filter(place => place.title === 'Retry this walk')).toHaveLength(1);
  await expect(visit(page, ids[1]).locator('.checkpoint-count')).toHaveText('2 activities');
});

test('blocks repeated quick-add submissions and other checkpoint writes while saving', async ({ page }) => {
  const ids = await setup(page);
  await openCheckpoint(page, ids[3]);
  const quick = page.getByRole('form', { name: 'Add activity to Brussels', exact: true });
  await quick.getByLabel('New activity', { exact: true }).fill('Only once');
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let posts = 0;
  await page.route('**/api/commands', async route => {
    posts++;
    await pending;
    await route.continue();
  });
  try {
    await quick.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(quick.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
    await expect(quick.getByLabel('New activity', { exact: true })).toBeDisabled();
    await expect(quick.getByRole('button', { name: 'Full form', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save suggestion: Grand Place', exact: true })).toBeDisabled();
    await expect(visit(page, ids[0]).locator('.checkpoint-open')).toBeDisabled();
    await quick.evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(posts).toBe(1);
  } finally { release(); }
  await expect(quick.getByLabel('New activity', { exact: true })).toHaveValue('');
  expect((await state(page)).data.places.filter(place => place.title === 'Only once')).toHaveLength(1);
});

test('replaces the empty state with quick add and keyboard-saveable idea chips on phones and desktop', async ({ page }, testInfo) => {
  await setup(page);
  await command(page, { type: 'visit.add', visit: { id: 'empty-ghent', name: 'Ghent' }, beforeId: null });
  await page.reload(); await places(page); await openCheckpoint(page, 'empty-ghent');
  const panel = page.locator('#checkpoint-details');
  const input = panel.getByLabel('New activity', { exact: true });
  const suggestion = panel.getByRole('button', { name: 'Save suggestion: Gravensteen', exact: true });
  const before = await state(page);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(input).toHaveValue('');
    await expect(panel.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
    await expect(suggestion).toBeVisible();
    await expect(panel.getByText('No activities yet.', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
    expect((await suggestion.boundingBox())!.height).toBe(width >= 768 ? 32 : 44);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(violation => violation.id)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`places-quick-add-empty-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await suggestion.focus();
  await suggestion.press('Enter');
  await expect(panel.getByRole('heading', { name: 'Gravensteen', exact: true })).toBeVisible();
  await expect(input).toBeFocused();
  await expect(panel.getByRole('status').filter({ hasText: 'Gravensteen saved as an idea.' })).toBeVisible();
  await expect(suggestion).toHaveCount(0);
  const saved = await state(page);
  expect(saved.data.places.find(place => place.cityId === 'empty-ghent')).toMatchObject({
    title: 'Gravensteen', status: 'idea', durationMinutes: 120,
  });
  expect(saved.data.events).toEqual(before.data.events);
});

test('leaves an unsaved quick-add draft without confirmation after the main rebase', async ({ page }) => {
  const ids = await setup(page);
  const dialogs = recordDialogs(page);
  await openCheckpoint(page, ids[1]);
  await page.getByLabel('New activity', { exact: true }).fill('Unsaved quick idea');
  expect(await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Our Belgium route', exact: true })).toBeVisible();
  expect((await state(page)).data.places.some(place => place.title === 'Unsaved quick idea')).toBe(false);
  expect(dialogs).toEqual([]);
});
