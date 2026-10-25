import { expect, test, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import type { TripSnapshot } from '../../shared/model';

async function createTrip(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add trip details', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill('Our Belgium trip');
  await page.getByLabel('Your name', { exact: true }).fill('Daniel');
  await page.getByLabel('Start date', { exact: true }).fill('2030-06-01');
  await page.getByLabel('End date', { exact: true }).fill('2030-06-06');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Daniel\./ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trip details', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: "I've saved it", exact: true }).click();
}

async function navigate(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click();
}

async function snapshot(page: Page): Promise<TripSnapshot> {
  const response = await page.request.get('/api/trip');
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test('the dashboard is the landing page and trip details are an optional inline panel', async ({ page }, testInfo) => {
  let creates = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/trips') creates += 1;
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Up next', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Before the next move', exact: true })).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
  await expect(page.locator('.sidebar, .trip-banner, .city-sketch')).toHaveCount(0);
  await expect(page.getByLabel('Start date', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('landing-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Add trip details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByLabel('Trip name', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Start date', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('form')).toHaveCount(0);
  await navigate(page, 'Calendar');
  await expect(page.getByRole('heading', { name: 'Trip details', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('landing-phone.png'), fullPage: true });
  expect(creates).toBe(0);
});

test('trip details can be edited and cancelled on the main page without losing the trip', async ({ page }) => {
  await createTrip(page);
  await page.getByRole('button', { name: 'Edit trip details', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Daniel\./ })).toBeVisible();
  await page.getByLabel('Trip name', { exact: true }).fill('Discard this title');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await snapshot(page)).data.trip.title).toBe('Our Belgium trip');
  await page.getByRole('button', { name: 'Edit trip details', exact: true }).click();
  await expect(page.getByLabel('Trip name', { exact: true })).toHaveValue('Our Belgium trip');
  await page.getByLabel('Trip name', { exact: true }).fill('Belgium with friends');
  await page.getByLabel('End date', { exact: true }).fill('2030-06-08');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trip details', exact: true })).toHaveCount(0);
  await page.reload();
  const state = await snapshot(page);
  expect(state.data.trip.title).toBe('Belgium with friends');
  expect(state.data.trip.endDate).toBe('2030-06-08');
  expect(state.data.trip.cities.map((city) => city.name)).toEqual(['Brussels', 'Ghent', 'Bruges']);
});

test('the populated dashboard follows the reference layout on desktop and stacks on phones', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await createTrip(page);
  let state = await snapshot(page);
  const [brussels, ghent] = state.data.trip.cities;
  for (const command of [
    { type: 'event.save', event: { id: 'layout-walk', title: 'Grand Place walk', cityId: brussels.id, date: '2030-06-01', startTime: '10:00', endTime: '11:30', kind: 'activity', status: 'planned', placeId: '', description: '' } },
    { type: 'transfer.add', fromCityId: brussels.id, toCityId: ghent.id, date: '2030-06-03', time: '09:00' },
    { type: 'note.save', note: { id: 'layout-note', title: 'Rainy afternoon', body: 'Keep a museum option in case it rains.', visibility: 'trip', linkType: 'trip', linkId: state.data.trip.id } },
  ]) {
    const response = await page.request.post('/api/commands', { data: { revision: state.revision, command } });
    expect(response.ok()).toBeTruthy();
    state = await response.json();
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Grand Place walk', exact: true })).toBeVisible();
  const primary = await page.locator('.home-primary').boundingBox();
  const next = await page.locator('.home-next').boundingBox();
  const departure = await page.locator('.home-departure').boundingBox();
  const navigation = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox();
  expect(Math.abs(next!.y - departure!.y)).toBeLessThan(2);
  expect(departure!.x).toBeGreaterThan(next!.x);
  expect(navigation!.y + navigation!.height).toBeLessThan(primary!.y);
  const stops = await page.locator('.route-stop').evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect(); return { x: box.x, y: box.y };
  }));
  expect(stops).toHaveLength(3);
  expect(new Set(stops.map((stop) => Math.round(stop.y))).size).toBe(1);
  expect(stops[1].x).toBeGreaterThan(stops[0].x);
  const route = await page.getByRole('region', { name: 'Your route' }).boundingBox();
  const note = await page.getByRole('region', { name: 'Latest shared note' }).boundingBox();
  expect(route!.y).toBeGreaterThan(next!.y + next!.height);
  expect(note!.y).toBeGreaterThan(route!.y + route!.height);
  await page.screenshot({ path: testInfo.outputPath('dashboard-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 1000 });
  const phoneNext = await page.locator('.home-next').boundingBox();
  const phoneDeparture = await page.locator('.home-departure').boundingBox();
  expect(phoneDeparture!.y).toBeGreaterThan(phoneNext!.y + phoneNext!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
  await page.screenshot({ path: testInfo.outputPath('dashboard-phone.png'), fullPage: true });
});

test('a traveler saves a place, schedules it, writes a note and checks separate departures', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await createTrip(page);
  await navigate(page, 'Places');
  await page.getByRole('button', { name: 'Save suggestion: Grand Place', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Grand Place', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
  await page.getByLabel('Date', { exact: true }).fill('2030-06-01');
  await page.getByLabel('Start time', { exact: true }).fill('10:00');
  await page.getByLabel('End time', { exact: true }).fill('11:30');
  await page.getByRole('group', { name: 'Visit date and time' }).getByRole('button', { name: 'Add to calendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Schedule Grand Place', exact: true })).toHaveCount(0);
  await navigate(page, 'Calendar');
  await expect(page.getByRole('heading', { name: 'Grand Place', exact: true })).toBeVisible();

  await navigate(page, 'Notes');
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Our rainy afternoon');
  await page.getByLabel('Note text', { exact: true }).fill('Keep a museum option and a cafe nearby.');
  await expect(page.getByRole('combobox', { name: 'Visibility', exact: true })).toHaveValue('private');
  await page.getByRole('combobox', { name: 'Visibility', exact: true }).selectOption('trip');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByRole('heading', { name: 'Our rainy afternoon' })).toBeVisible();

  await navigate(page, 'Checklists');
  await page.getByRole('checkbox', { name: 'Passport / ID', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Passport / ID', exact: true })).toBeChecked();
  const packingRow = page.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: 'Passport / ID', exact: true }) });
  await packingRow.getByText('Owner: Shared', { exact: true }).click();
  await packingRow.getByRole('combobox', { name: 'Owner for Passport / ID', exact: true }).fill('Daniel');
  await packingRow.getByRole('button', { name: 'Save owner', exact: true }).click();
  await expect(packingRow.getByText('Owner: Daniel', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New departure', exact: true }).click();
  const initial = await snapshot(page);
  await page.getByRole('combobox', { name: 'From city', exact: true }).selectOption(initial.data.trip.cities[0].id);
  await page.getByRole('combobox', { name: 'To city', exact: true }).selectOption(initial.data.trip.cities[1].id);
  await page.getByLabel('Departure date').fill('2030-06-03');
  await page.getByLabel('Departure time, Brussels').fill('09:00');
  await page.getByRole('button', { name: 'Create departure', exact: true }).click();
  await page.getByRole('combobox', { name: 'Status for Passport + wallet with me', exact: true }).selectOption('done');
  await expect(page.getByRole('combobox', { name: 'Status for Passport + wallet with me', exact: true })).toHaveValue('done');
  await page.getByRole('button', { name: 'New departure', exact: true }).click();
  await page.getByRole('combobox', { name: 'From city', exact: true }).selectOption(initial.data.trip.cities[1].id);
  await page.getByRole('combobox', { name: 'To city', exact: true }).selectOption(initial.data.trip.cities[2].id);
  await page.getByLabel('Departure date').fill('2030-06-05');
  await page.getByLabel('Departure time, Brussels').fill('09:00');
  await page.getByRole('button', { name: 'Create departure', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Choose departure', exact: true }).locator('option')).toHaveCount(2);
  const updated = await snapshot(page);
  await page.getByRole('combobox', { name: 'Choose departure', exact: true }).selectOption(updated.data.transfers[1].id);
  await expect(page.getByRole('combobox', { name: 'Status for Passport + wallet with me', exact: true })).toHaveValue('pending');
  await expect(page.getByRole('checkbox', { name: 'Passport / ID', exact: true })).toBeChecked();
  await page.reload();
  await navigate(page, 'Calendar');
  await expect(page.getByRole('heading', { name: 'Grand Place', exact: true })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('family sharing is selected, redacted, read-only and revocable across browser sessions', async ({ page, browser }) => {
  await createTrip(page);
  let state = await snapshot(page);
  const { trip } = state.data;
  const event = {
    id: 'family-walk', title: 'Walk in Brussels', cityId: trip.cities[0].id, date: trip.startDate,
    startTime: '10:00', endTime: '11:00', kind: 'activity', status: 'planned', placeId: '',
    description: 'PRIVATE BOOKING REFERENCE',
  };
  const saved = await page.request.post('/api/commands', { data: { revision: state.revision, command: { type: 'event.save', event } } });
  expect(saved.ok()).toBeTruthy();
  state = await saved.json();
  const note = { id: 'private-note', title: 'Private detail', body: 'PRIVATE NOTE BODY', visibility: 'private', linkType: 'trip', linkId: trip.id };
  expect((await page.request.post('/api/commands', { data: { revision: state.revision, command: { type: 'note.save', note } } })).ok()).toBeTruthy();
  await page.reload();
  await navigate(page, 'Share');
  await page.getByLabel('Recipient name', { exact: true }).fill('Family');
  await page.getByRole('combobox', { name: 'Access role', exact: true }).selectOption('family');
  await page.getByRole('checkbox', { name: /Walk in Brussels/ }).check();
  await page.getByRole('button', { name: 'Create invitation link' }).click();
  const link = await page.getByLabel('Invitation link', { exact: true }).inputValue();
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(link);
  await expect(guestPage.getByRole('heading', { name: 'Trip overview', exact: true })).toBeVisible();
  expect(new URL(guestPage.url()).hash).toBe('');
  const guestState = await snapshot(guestPage);
  expect(guestState.data.events.map((item) => item.title)).toEqual(['Walk in Brussels']);
  expect(guestState.data.events[0].description).toBe('');
  expect(guestState.data.notes).toEqual([]);
  expect(guestState.data.packing).toEqual([]);
  expect(JSON.stringify(guestState)).not.toContain('PRIVATE');
  await navigate(guestPage, 'Calendar');
  await expect(guestPage.getByRole('button', { name: 'Add event', exact: true })).toHaveCount(0);
  expect((await guestPage.request.post('/api/commands', { data: { revision: guestState.revision, command: { type: 'event.delete', id: event.id } } })).status()).toBe(403);
  await page.getByRole('button', { name: 'Revoke access', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm revoke', exact: true }).click();
  await expect(page.getByText('Access revoked for Family.', { exact: true })).toBeVisible();
  expect((await guestPage.request.get('/api/trip')).status()).toBe(401);
  await guest.close();
});

test('a conflicting save keeps the draft and lets the traveler review before retrying', async ({ page }) => {
  await createTrip(page);
  await navigate(page, 'Notes');
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Draft worth keeping');
  await page.getByLabel('Note text', { exact: true }).fill('Do not lose this when someone else saves.');
  const state = await snapshot(page);
  expect((await page.request.post('/api/commands', { data: { revision: state.revision, command: { type: 'packing.add', title: 'Umbrella', assignee: 'Shared' } } })).ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByRole('alert')).toContainText('Someone changed the trip');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Draft worth keeping');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByRole('heading', { name: 'Draft worth keeping', exact: true })).toBeVisible();
});

test('navigation warns before discarding a note and retains a locally edited owner after refresh', async ({ page }) => {
  await createTrip(page);
  await navigate(page, 'Notes');
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Keep this draft');
  page.once('dialog', (dialog) => dialog.dismiss());
  await navigate(page, 'Calendar');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep this draft');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await navigate(page, 'Checklists');
  const row = page.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: 'Passport / ID', exact: true }) });
  await row.getByText('Owner: Shared', { exact: true }).click();
  await row.getByRole('combobox', { name: 'Owner for Passport / ID', exact: true }).fill('My unsaved owner');
  const state = await snapshot(page);
  const item = state.data.packing.find((candidate) => candidate.title === 'Passport / ID')!;
  expect((await page.request.post('/api/commands', { data: { revision: state.revision,
    command: { type: 'packing.update', id: item.id, status: item.status, assignee: 'Remote owner' } } })).ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(row.getByText('Owner: Remote owner', { exact: true })).toBeVisible();
  await expect(row.getByRole('combobox', { name: 'Owner for Passport / ID', exact: true })).toHaveValue('My unsaved owner');
  await row.getByRole('button', { name: 'Save owner', exact: true }).click();
  await expect(row.getByText('Owner: My unsaved owner', { exact: true })).toBeVisible();
});

test('a failed link exchange can be retried without exposing its token in the address bar', async ({ page, browser }) => {
  await createTrip(page);
  const response = await page.request.post('/api/invites', { data: { name: 'Guest', role: 'viewer', eventIds: [], placeIds: [] } });
  expect(response.ok()).toBeTruthy();
  const { token } = await response.json();
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.route('**/api/session', (route) => route.abort('failed'));
  await guest.goto(`/#access=${token}`);
  await expect(guest.getByRole('button', { name: 'Retry opening trip' })).toBeVisible();
  expect(new URL(guest.url()).hash).toBe('');
  await guest.unroute('**/api/session');
  await guest.getByRole('button', { name: 'Retry opening trip' }).click();
  await expect(guest.getByRole('heading', { name: /Good (morning|afternoon|evening), Guest\./ })).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Share trip', exact: true })).toHaveCount(0);
  await context.close();
});

test('invitation creation blocks navigation until the one-time link can be saved', async ({ page }) => {
  await createTrip(page);
  await navigate(page, 'Share');
  await page.getByLabel('Recipient name', { exact: true }).fill('Alex');
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/invites', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    await delayed;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Create invitation link' }).click();
  await expect(page.getByRole('button', { name: 'Create invitation link' })).toBeDisabled();
  page.once('dialog', (dialog) => dialog.dismiss());
  await navigate(page, 'Calendar');
  await expect(page.getByRole('heading', { name: 'Sharing', exact: true })).toBeVisible();
  release();
  await expect(page.getByLabel('Invitation link', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: "I've saved this link", exact: true }).click();
  await expect(page.getByLabel('Recipient name', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Recipient name', { exact: true })).toHaveValue('');
  await navigate(page, 'Calendar');
  await expect(page.getByRole('heading', { name: 'Make room for Belgium' })).toBeVisible();
});

test('trip creation failures stay visible next to the submit button without losing the form', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.route('**/api/trips', (route) => route.fulfill({
    status: 503, json: { error: 'The server is unavailable. Please try again.' },
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Add trip details', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill('Our Belgium trip');
  await page.getByLabel('Your name', { exact: true }).fill('Daniel');
  await page.getByLabel('Start date', { exact: true }).fill('2030-06-01');
  await page.getByLabel('End date', { exact: true }).fill('2030-06-06');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toHaveText('The server is unavailable. Please try again.');
  await expect(alert).toBeInViewport();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Daniel');
  await expect(page.getByLabel('Start date', { exact: true })).toHaveValue('2030-06-01');
  await expect(page.getByRole('button', { name: 'Save trip details', exact: true })).toBeEnabled();
});

test('all modules fit phone, tablet and desktop widths', async ({ page }, testInfo) => {
  await createTrip(page);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const module of ['Today', 'Calendar', 'Places', 'Notes', 'Checklists', 'Share']) {
      await navigate(page, module);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, `${module} overflows at ${width}px`).toBeFalsy();
      await expect(page.locator('main h1')).toBeVisible();
      if (width === 1440) {
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(violations.map((violation) => ({ rule: violation.id, targets: violation.nodes.map((node) => node.target) })), `${module} accessibility violations`).toEqual([]);
      }
      if (width === 320 || width === 1440) {
        await page.screenshot({ path: testInfo.outputPath(`${module}-${width}.png`), fullPage: true });
      }
    }
  }
});
