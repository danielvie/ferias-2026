import { expect, test, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import type { TripSnapshot } from '../../shared/model';
import { selectTripDates } from './trip-dates';
import { recordDialogs } from './dialogs';

async function createTrip(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Itinerary', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add trip details', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill('Our Belgium trip');
  await page.getByLabel('Your name', { exact: true }).fill('Daniel');
  await selectTripDates(page, '2030-06-01', '2030-06-06');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Our Belgium trip', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trip details', exact: true })).toHaveCount(0);
}

async function navigate(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click();
}

async function snapshot(page: Page): Promise<TripSnapshot> {
  const response = await page.request.get('/api/trip');
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test('mobile identity is visible, editable, and credits separate collaborators', async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await createTrip(page);
  const original = await snapshot(page);
  const profile = page.getByRole('button', { name: 'Your profile: Daniel, owner', exact: true });
  await expect(profile).toBeVisible();
  await expect(profile).toContainText('owner');
  await profile.click();
  await expect(page.getByLabel('Your name', { exact: true })).toBeFocused();
  await page.getByLabel('Your name', { exact: true }).fill('Daniel Vieira');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your name is saved' })).toBeVisible();
  await page.getByRole('button', { name: 'Close Your profile', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Your profile: Daniel Vieira, owner' })).toBeFocused();
  await page.reload();
  expect((await snapshot(page)).session).toEqual({ ...original.session, name: 'Daniel Vieira' });
  const invited = await page.request.post('/api/invites', { data: { name: 'Editor', role: 'editor', eventIds: [], placeIds: [] } });
  const link = await invited.json();
  const context = await browser.newContext();
  try {
    const editor = await context.newPage();
    await editor.goto(`/#access=${link.token}`);
    await editor.getByRole('button', { name: 'Your profile: Editor, editor' }).click();
    await editor.getByLabel('Your name', { exact: true }).fill('Ana');
    await editor.getByRole('button', { name: 'Save name', exact: true }).click();
    await expect(editor.getByRole('status').filter({ hasText: 'Your name is saved' })).toBeVisible();
    await editor.getByRole('button', { name: 'Close Your profile', exact: true }).click();
    await navigate(editor, 'Places');
    await editor.locator('.checkpoint-open').first().click();
    await editor.getByRole('button', { name: 'Save suggestion: Grand Place', exact: true }).click();
    await expect(editor.getByRole('heading', { name: 'Grand Place', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Your profile: Daniel Vieira, owner' }).click();
    const history = page.getByRole('list', { name: 'Recorded changes' });
    await expect(history).toContainText('Ana added place');
    await expect(history).toContainText('Grand Place');
    await expect(history).toContainText('Daniel renamed member');
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    }
    await page.setViewportSize({ width: 320, height: 1000 });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(violations.map((violation) => violation.id)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('member-history-phone.png') });
    await page.getByRole('button', { name: 'Close Your profile', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('member-identity-phone.png') });
  } finally { await context.close(); }
});

test('profile drafts survive save failures and conflicts, and Escape closes without confirmation', async ({ page }) => {
  const dialogs = recordDialogs(page);
  await createTrip(page);
  await page.getByRole('button', { name: 'Your profile: Daniel, owner' }).click();
  await page.getByLabel('Your name', { exact: true }).fill('My draft name');
  await page.route('**/api/profile', (route) => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic save failure' }),
  }), { times: 1 });
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Synthetic save failure');
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('My draft name');
  const remote = await page.request.post('/api/profile', { data: { previousName: 'Daniel', name: 'Remote name' } });
  expect(remote.ok()).toBe(true);
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Someone changed');
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('My draft name');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your name is saved' })).toBeVisible();
  await page.getByLabel('Your name', { exact: true }).fill('Unsaved name');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot(page)).session.name).toBe('My draft name');
  expect(dialogs).toEqual([]);
});

test('viewer and family profiles support long names without enabling trip editing', async ({ page, browser }) => {
  await createTrip(page);
  for (const role of ['viewer', 'family']) {
    const invited = await page.request.post('/api/invites', { data: { name: role, role, eventIds: [], placeIds: [] } });
    const link = await invited.json();
    const context = await browser.newContext({ viewport: { width: 320, height: 1000 } });
    try {
      const guest = await context.newPage();
      await guest.goto(`/#access=${link.token}`);
      await guest.getByRole('button', { name: `Your profile: ${role}, ${role}` }).click();
      const name = `${role} ${'A'.repeat(90)}`;
      await guest.getByLabel('Your name', { exact: true }).fill(name);
      await guest.getByRole('button', { name: 'Save name', exact: true }).click();
      await expect(guest.getByRole('status').filter({ hasText: 'Your name is saved' })).toBeVisible();
      if (role === 'family') await expect(guest.getByRole('heading', { name: 'Change history', exact: true })).toHaveCount(0);
      else await expect(guest.getByRole('heading', { name: 'Change history', exact: true })).toBeVisible();
      await guest.getByRole('button', { name: 'Close Your profile', exact: true }).click();
      await expect(guest.getByRole('button', { name: 'Settings', exact: true })).toHaveCount(0);
      for (const width of [320, 768, 1024, 1440]) {
        await guest.setViewportSize({ width, height: 1000 });
        const identity = guest.getByRole('button', { name: `Your profile: ${name}, ${role}` });
        await expect(identity).toBeVisible();
        await expect(identity.locator('.member-role')).toBeVisible();
        expect(await guest.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      }
    } finally { await context.close(); }
  }
});

test('history loads older pages and retries errors without inventing old attribution', async ({ page }) => {
  await createTrip(page);
  let state = await snapshot(page);
  for (let i = 0; i < 52; i++) {
    const response = await page.request.post('/api/commands', { data: {
      revision: state.revision, command: { type: 'packing.add', title: `History item ${i}`, assignee: '' },
    } });
    expect(response.ok()).toBe(true);
    state = await response.json();
  }
  await page.route('**/api/history', (route) => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic history failure' }),
  }), { times: 1 });
  await page.getByRole('button', { name: 'Your profile: Daniel, owner' }).click();
  await expect(page.getByRole('alert')).toContainText('Synthetic history failure');
  await page.getByRole('button', { name: 'Reload history', exact: true }).click();
  const records = page.getByRole('list', { name: 'Recorded changes' }).getByRole('listitem');
  await expect(records).toHaveCount(50);
  await page.getByRole('button', { name: 'Load older changes', exact: true }).click();
  await expect(records).toHaveCount(53);
  await expect(records.last()).toContainText('Daniel added trip');
  await expect(page.getByRole('button', { name: 'Load older changes', exact: true })).toHaveCount(0);
});

test('the empty itinerary opens without a fabricated trip and setup uses a modal pane', async ({ page }, testInfo) => {
  let creates = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/trips') creates += 1;
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Itinerary', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Up next', exact: true })).toHaveCount(0);
  await expect(page.locator('form')).toHaveCount(0);
  await expect(page.locator('.sidebar, .trip-banner, .city-sketch')).toHaveCount(0);
  await expect(page.getByLabel('Start date', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('landing-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Add trip details', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Trip details' })).toBeVisible();
  await expect(page.getByLabel('Trip name', { exact: true })).toHaveValue('');
  await expect(page.getByRole('group', { name: 'Trip dates', exact: true })).toContainText('No dates selected');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('form')).toHaveCount(0);
  await navigate(page, 'Places');
  await expect(page.getByRole('heading', { name: 'Trip details', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Trip details' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('landing-phone.png'), fullPage: true });
  expect(creates).toBe(0);
});

test('the header selects sections with text weight and color and keeps them keyboard-accessible', async ({ page }) => {
  await createTrip(page);
  const header = page.getByRole('banner');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(header.getByRole('button', { name: 'Belgium, together', exact: true })).toBeVisible();
  await expect(header).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.keyboard.press('Tab');

  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ['Itinerary', 'Places', 'Notes', 'Checklists', 'Share']) {
      const button = navigation.getByRole('button', { name, exact: true });
      await button.hover();
      await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(button).toHaveCSS('color', 'rgb(44, 85, 162)');
      await button.focus();
      await expect(button).toBeFocused();
      await expect(button).toBeInViewport();
      await expect(button).toHaveCSS('outline-style', 'solid');
      await page.keyboard.press('Enter');
      await expect(button).toHaveAttribute('aria-current', 'page');
      await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(button).toHaveCSS('color', 'rgb(44, 85, 162)');
      await expect(button).toHaveCSS('font-weight', '650');
      await expect(button).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)');
      await expect(button).toHaveCSS('text-decoration-line', 'none');
      await expect(button).toHaveCSS('box-shadow', 'none');
      expect(await button.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
    }
    await expect(header.getByRole('button', { name: 'Settings', exact: true })).toBeInViewport();
    await expect(header.getByRole('button', { name: 'Refresh', exact: true })).toBeInViewport();
    await expect(header.getByRole('button', { name: 'Close this trip session', exact: true })).toBeInViewport();
  }
});

test('trip settings can be edited and cancelled without losing the trip', async ({ page }) => {
  await createTrip(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Trip settings' })).toBeVisible();
  await page.getByLabel('Trip name', { exact: true }).fill('Discard this title');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await snapshot(page)).data.trip.title).toBe('Our Belgium trip');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Trip name', { exact: true })).toHaveValue('Our Belgium trip');
  await page.getByLabel('Trip name', { exact: true }).fill('Belgium with friends');
  await selectTripDates(page, '2030-06-01', '2030-06-08');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  const state = await snapshot(page);
  expect(state.data.trip.title).toBe('Belgium with friends');
  expect(state.data.trip.endDate).toBe('2030-06-08');
  expect(state.data.trip.cities.map((city) => city.name)).toEqual(['Brussels', 'Ghent', 'Bruges']);
});

test('the continuous itinerary follows the board with day previews and responsive activity rows', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await createTrip(page);
  let state = await snapshot(page);
  const [brussels, ghent] = state.data.trip.cities;
  for (const command of [
    { type: 'event.save', event: { id: 'layout-walk', title: 'Grand Place walk', cityId: brussels.id, date: '2030-06-01', startTime: '10:00', endTime: '11:30', kind: 'activity', status: 'planned', placeId: '', description: '' } },
    { type: 'event.save', event: { id: 'layout-museum', title: 'Magritte Museum', cityId: brussels.id, date: '2030-06-01', startTime: '14:00', endTime: '15:30', kind: 'activity', status: 'tentative', placeId: '', description: 'Keep this option for a rainy afternoon.' } },
    { type: 'transfer.add', fromCityId: brussels.id, toCityId: ghent.id, date: '2030-06-03', time: '09:00' },
    { type: 'note.save', note: { id: 'layout-note', title: 'Rainy afternoon', body: 'Keep a museum option in case it rains.', visibility: 'trip', linkType: 'trip', linkId: state.data.trip.id } },
  ]) {
    const response = await page.request.post('/api/commands', { data: { revision: state.revision, command } });
    expect(response.ok()).toBeTruthy();
    state = await response.json();
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Grand Place walk', exact: true })).toBeVisible();
  await expect(page.locator('[data-trip-day]')).toHaveCount(6);
  await expect(page.locator('.home-primary, .home-route, .home-note')).toHaveCount(0);
  const markers = page.getByRole('navigation', { name: 'Trip days' }).getByRole('button');
  await expect(markers).toHaveCount(6);
  const before = await page.evaluate(() => scrollY);
  await markers.nth(4).hover();
  await expect(page.getByRole('tooltip')).toContainText(/Wednesday,? 5 June/);
  await expect(page.getByRole('tooltip')).toContainText('Nothing planned yet.');
  await page.getByRole('tooltip').hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await markers.first().hover();
  await expect(page.getByRole('tooltip')).toContainText('Grand Place walk');
  await expect(page.getByRole('tooltip')).toContainText('Magritte Museum');
  await page.screenshot({ path: testInfo.outputPath('itinerary-preview.png') });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath('itinerary-desktop.png') });
  await markers.nth(4).click();
  await expect(page.locator('#day-2030-06-05')).toBeFocused();
  await expect(markers.nth(4)).toHaveAttribute('aria-current', 'date');
  await page.setViewportSize({ width: 320, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(markers.first()).toHaveAttribute('aria-current', 'date');
  await page.screenshot({ path: testInfo.outputPath('itinerary-phone.png') });
});

test('a traveler saves a place, schedules it, writes a note and checks separate departures', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await createTrip(page);
  await navigate(page, 'Places');
  await page.locator('.checkpoint-open').first().click();
  await page.getByRole('button', { name: 'Save suggestion: Grand Place', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Grand Place', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
  await page.getByLabel('Date', { exact: true }).fill('2030-06-01');
  await page.getByLabel('Start time', { exact: true }).fill('10:00');
  await page.getByLabel('End time', { exact: true }).fill('11:30');
  await page.getByRole('group', { name: 'Visit date and time' }).getByRole('button', { name: 'Add to calendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Schedule Grand Place', exact: true })).toHaveCount(0);
  await navigate(page, 'Itinerary');
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
  await page.getByText('1 completed item', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Passport / ID', exact: true })).toBeChecked();
  const packingRow = page.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: 'Passport / ID', exact: true }) });
  await packingRow.getByLabel('Options for Passport / ID', { exact: true }).click();
  await packingRow.getByRole('combobox', { name: 'Owner for Passport / ID', exact: true }).fill('Daniel');
  await packingRow.getByRole('button', { name: 'Save owner', exact: true }).click();
  await expect(packingRow.getByText('Owner: Daniel', { exact: true })).toHaveText('Owner: Daniel');
  await packingRow.getByLabel('Options for Passport / ID', { exact: true }).click();
  await expect(packingRow.getByText('Owner: Daniel', { exact: true })).toBeVisible();
  await packingRow.getByLabel('Options for Passport / ID', { exact: true }).press('Escape');
  await page.getByText('Departures', { exact: true }).click();
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
  await navigate(page, 'Itinerary');
  await expect(page.getByRole('heading', { name: 'Grand Place', exact: true })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('legacy family sharing stays redacted, read-only and revocable across browser sessions', async ({ page, browser }) => {
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
  const response = await page.request.post('/api/invites', { data: { name: 'Family', role: 'family', eventIds: [event.id], placeIds: [] } });
  expect(response.status()).toBe(201);
  const invitation = await response.json();
  const link = new URL(page.url());
  link.hash = new URLSearchParams({ access: invitation.token }).toString();
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(link.href);
  await expect(guestPage.getByRole('heading', { name: 'Our Belgium trip', exact: true })).toBeVisible();
  expect(new URL(guestPage.url()).hash).toBe('');
  const guestState = await snapshot(guestPage);
  expect(guestState.data.events.map((item) => item.title)).toEqual(['Walk in Brussels']);
  expect(guestState.data.events[0].description).toBe('');
  expect(guestState.data.notes).toEqual([]);
  expect(guestState.data.packing).toEqual([]);
  expect(JSON.stringify(guestState)).not.toContain('PRIVATE');
  await navigate(guestPage, 'Itinerary');
  await expect(guestPage.getByRole('button', { name: 'Add event', exact: true })).toHaveCount(0);
  expect((await guestPage.request.post('/api/commands', { data: { revision: guestState.revision, command: { type: 'event.delete', id: event.id } } })).status()).toBe(403);
  expect((await page.request.delete(`/api/invites/${invitation.id}`, { headers: { 'Content-Type': 'application/json' } })).status()).toBe(200);
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

test('navigation leaves a note without confirmation and refresh retains a locally edited owner', async ({ page }) => {
  const dialogs = recordDialogs(page);
  await createTrip(page);
  await navigate(page, 'Notes');
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Keep this draft');
  await navigate(page, 'Itinerary');
  await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0);
  expect((await snapshot(page)).data.notes).toHaveLength(0);
  await navigate(page, 'Checklists');
  const row = page.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: 'Passport / ID', exact: true }) });
  await row.getByLabel('Options for Passport / ID', { exact: true }).click();
  await row.getByRole('combobox', { name: 'Owner for Passport / ID', exact: true }).fill('My unsaved owner');
  const state = await snapshot(page);
  const item = state.data.packing.find((candidate) => candidate.title === 'Passport / ID')!;
  expect((await page.request.post('/api/commands', { data: { revision: state.revision,
    command: { type: 'packing.update', id: item.id, status: item.status, assignee: 'Remote owner' } } })).ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await row.getByLabel('Options for Passport / ID', { exact: true }).click();
  await expect(row.getByText('Owner: Remote owner', { exact: true })).toBeVisible();
  await expect(row.getByRole('combobox', { name: 'Owner for Passport / ID', exact: true })).toHaveValue('My unsaved owner');
  await row.getByRole('button', { name: 'Save owner', exact: true }).click();
  await expect(row.getByText('Owner: My unsaved owner', { exact: true })).toHaveText('Owner: My unsaved owner');
  expect(dialogs).toEqual([]);
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
  await expect(guest.getByRole('heading', { name: 'Our Belgium trip', exact: true })).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Share trip', exact: true })).toHaveCount(0);
  await context.close();
});

test('a delayed shared invitation does not block navigation or restore a stale Share screen', async ({ page }) => {
  await createTrip(page);
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/share', async (route) => {
    const response = await route.fetch();
    await delayed;
    await route.fulfill({ response });
  });
  await navigate(page, 'Share');
  await expect(page.getByRole('status')).toHaveText('Loading your trip link…');
  await navigate(page, 'Itinerary');
  await expect(page.getByRole('heading', { name: 'Our Belgium trip', exact: true })).toBeVisible();
  const completed = page.waitForResponse(response => response.url().endsWith('/api/share'));
  release();
  await completed;
  await page.unroute('**/api/share');
  await navigate(page, 'Share');
  await expect(page.getByLabel('Trip invitation link', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy link', exact: true })).toBeEnabled();
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
  await selectTripDates(page, '2030-06-01', '2030-06-06');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toHaveText('The server is unavailable. Please try again.');
  await expect(alert).toBeInViewport();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Daniel');
  await expect(page.getByRole('group', { name: 'Trip dates', exact: true })).toContainText('1 Jun 2030 to 6 Jun 2030');
  await expect(page.getByRole('button', { name: 'Save trip details', exact: true })).toBeEnabled();
});

test('settings preserve city identities and reject removal or dates that orphan linked activities', async ({ page }) => {
  await createTrip(page);
  const original = await snapshot(page);
  const city = original.data.trip.cities[0];
  expect((await page.request.post('/api/commands', { data: { revision: original.revision, command: {
    type: 'event.save', event: { id: 'city-linked-walk', title: 'Linked city walk', cityId: city.id,
      date: '2030-06-01', startTime: '10:00', endTime: '11:00', kind: 'activity', status: 'planned', placeId: '', description: '' },
  } } })).ok()).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('City 1', { exact: true }).fill('Brussels Central');
  await page.getByRole('button', { name: 'Move Brussels Central down', exact: true }).click();
  await expect(page.getByLabel('City 2', { exact: true })).toHaveValue('Brussels Central');
  await page.getByRole('button', { name: '+ Add city', exact: true }).click();
  await expect(page.getByLabel('City 4', { exact: true })).toBeFocused();
  await page.getByLabel('City 4', { exact: true }).fill('Antwerp');
  await page.getByRole('button', { name: 'Remove Bruges', exact: true }).click();
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved = await snapshot(page);
  expect(saved.data.trip.cities.map((item) => item.name)).toEqual(['Ghent', 'Brussels Central', 'Antwerp']);
  expect(saved.data.trip.cities[1].id).toBe(city.id);
  expect(saved.data.events[0].cityId).toBe(city.id);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Brussels Central', exact: true }).click();
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  expect((await snapshot(page)).data.trip.cities).toEqual(saved.data.trip.cities);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await selectTripDates(page, '2030-06-02', '2030-06-06');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Trip dates', exact: true })).toContainText('2 Jun 2030 to 6 Jun 2030');
  expect((await snapshot(page)).data.trip.startDate).toBe('2030-06-01');
});

test('settings retain a conflicting draft, trap focus and return to the same itinerary position', async ({ page }, testInfo) => {
  await createTrip(page);
  await page.getByRole('navigation', { name: 'Trip days' }).getByRole('button').nth(4).click();
  await expect(page.locator('#day-2030-06-05')).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.getElementById('day-2030-06-05')!.getBoundingClientRect().top)).toBeLessThan(150);
  const scroll = await page.evaluate(() => scrollY);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Trip name', { exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Save trip details', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('settings-desktop.png') });
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((item) => item.id)).toEqual([]);
  await page.getByLabel('Trip name', { exact: true }).fill('A draft worth keeping');
  const state = await snapshot(page);
  expect((await page.request.post('/api/commands', { data: { revision: state.revision,
    command: { type: 'packing.add', title: 'Remote change', assignee: 'Shared' } } })).ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Someone changed the trip');
  await expect(page.getByLabel('Trip name', { exact: true })).toHaveValue('A draft worth keeping');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
  expect(Math.abs((await page.evaluate(() => scrollY)) - scroll)).toBeLessThan(4);
  expect((await snapshot(page)).data.trip.title).toBe('A draft worth keeping');
});

test('day markers support keyboard previews and leave activity drafts without confirmation', async ({ page }) => {
  const dialogs = recordDialogs(page);
  await createTrip(page);
  const markers = page.getByRole('navigation', { name: 'Trip days' }).getByRole('button');
  await markers.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(markers.nth(1)).toBeFocused();
  await expect(page.getByRole('tooltip')).toContainText(/Sunday,? 2 June/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('#day-2030-06-02')).toBeFocused();
  await page.getByRole('button', { name: 'Add activity on 2030-06-02', exact: true }).click();
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2030-06-02');
  await page.getByLabel('Title', { exact: true }).fill('Keep my activity draft');
  await markers.nth(4).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0);
  await expect(page.locator('#day-2030-06-05')).toBeFocused();
  expect(dialogs).toEqual([]);
});

test('touch markers open a preview sheet before jumping to the day', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await createTrip(page);
    const marker = page.getByRole('navigation', { name: 'Trip days' }).getByRole('button').nth(4);
    const before = await page.evaluate(() => scrollY);
    await marker.tap();
    const sheet = page.getByRole('dialog', { name: /Wednesday,? 5 June/ });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Nothing planned yet.');
    await page.screenshot({ path: testInfo.outputPath('day-preview-phone.png') });
    expect(await page.evaluate(() => scrollY)).toBe(before);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(violations.map((item) => item.id)).toEqual([]);
    await sheet.getByRole('button', { name: 'Go to 5 June', exact: true }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('#day-2030-06-05')).toBeFocused();
    await expect(marker).toHaveAttribute('aria-current', 'date');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    await expect(page.getByLabel('Trip name', { exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Save trip details', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('settings-phone.png') });
    const paneScan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(paneScan.violations.map((item) => item.id)).toEqual([]);
    await page.getByRole('button', { name: 'Cancel', exact: true }).tap();
  } finally { await context.close(); }
});

test('longer trips scale every marker into a compact rail without scrolling', async ({ page }) => {
  await createTrip(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await selectTripDates(page, '2030-06-01', '2030-09-01');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const rail = page.getByRole('navigation', { name: 'Trip days' });
  const markers = rail.getByRole('button');
  await expect(markers).toHaveCount(93);
  await expect(rail).toHaveAttribute('data-dense', 'true');
  await expect(rail.locator('.weekday-badge:visible')).toHaveCount(1);
  expect((await rail.boundingBox())!.height).toBeLessThanOrEqual(256);
  const bounds = await rail.boundingBox();
  expect((await markers.first().boundingBox())!.y).toBeGreaterThanOrEqual(bounds!.y);
  const last = await markers.last().boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
  await markers.first().focus();
  await page.keyboard.press('End');
  await expect(markers.last()).toBeFocused();
  await expect(markers.last().locator('.weekday-badge')).toBeVisible();
  await expect(page.getByRole('tooltip')).toContainText(/Sunday,? 1 September/);
  expect(await rail.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('#day-2030-09-01')).toBeFocused();
  await expect(markers.last()).toHaveAttribute('aria-current', 'date');
});

test('weekday badges sit to the right of the dial and distinguish weekends without overcrowding', async ({ page }, testInfo) => {
  await createTrip(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await selectTripDates(page, '2030-06-01', '2030-06-14');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const rail = page.getByRole('navigation', { name: 'Trip days' });
  const markers = rail.getByRole('button');
  await expect(rail.locator('.weekday-badge:visible')).toHaveCount(14);
  expect(await rail.locator('.weekday-badge').allTextContents()).toEqual(['S', 'S', 'M', 'T', 'W', 'T', 'F', 'S', 'S', 'M', 'T', 'W', 'T', 'F']);
  expect(await rail.locator('[data-weekend]').evaluateAll((items) => items.map((item) => item.getAttribute('data-date'))))
    .toEqual(['2030-06-01', '2030-06-02', '2030-06-08', '2030-06-09']);
  await expect(markers.first()).toHaveAttribute('aria-label', /Saturday.*weekend/);
  await expect(markers.nth(2)).not.toHaveAttribute('data-weekend', 'true');
  const weekend = await markers.nth(1).locator('.weekday-badge').evaluate((badge) => {
    const style = getComputedStyle(badge);
    return { background: style.backgroundColor, color: style.color, border: style.borderWidth, weight: style.fontWeight, shadow: style.boxShadow };
  });
  const weekday = await markers.nth(2).locator('.weekday-badge').evaluate((badge) => {
    const style = getComputedStyle(badge);
    return { background: style.backgroundColor, color: style.color, border: style.borderWidth, weight: style.fontWeight, shadow: style.boxShadow };
  });
  expect(weekend.background).toBe(weekday.background);
  expect(weekend.color).not.toBe(weekday.color);
  expect(Number(weekend.weight)).toBeGreaterThan(Number(weekday.weight));
  expect(weekend.border).toBe('0px');
  expect(weekday.border).toBe('0px');
  expect(weekend.shadow).toBe('none');
  expect(weekday.shadow).toBe('none');
  expect(await markers.nth(1).evaluate((marker) => getComputedStyle(marker).boxShadow)).toBe('none');
  expect(await markers.evaluateAll((buttons) => buttons.every((button) =>
    button.querySelector('.weekday-badge')!.getBoundingClientRect().left >= button.querySelector('.marker-tick')!.getBoundingClientRect().right))).toBe(true);
  await markers.nth(2).click();
  await expect(markers.nth(2)).toHaveAttribute('aria-current', 'date');
  const selectedBadge = await markers.nth(2).locator('.weekday-badge').evaluate((badge) => {
    const style = getComputedStyle(badge);
    return { background: style.backgroundColor, color: style.color, border: style.borderWidth };
  });
  expect(selectedBadge.background).toBe(weekday.background);
  expect(selectedBadge.border).toBe('0px');
  expect(selectedBadge.color).toBe(weekday.color);
  await markers.nth(7).hover();
  await expect(page.getByRole('tooltip')).toContainText(/Saturday,? 8 June/);
  await expect(markers.nth(7).locator('.weekday-badge')).toHaveCSS('background-color', weekend.background);
  await expect(markers.nth(7).locator('.weekday-badge')).toHaveCSS('color', weekend.color);
  await page.screenshot({ path: testInfo.outputPath('weekday-badges.png') });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await expect(rail.locator('.weekday-badge:visible')).toHaveCount(14);
  await page.setViewportSize({ width: 375, height: 360 });
  await expect(rail).toHaveAttribute('data-dense', 'true');
  await expect(rail.locator('.weekday-badge:visible')).toHaveCount(1);
  await markers.last().focus();
  await expect(markers.last().locator('.weekday-badge')).toBeVisible();
  expect(await rail.evaluate((element) => [element.scrollTop, element.scrollLeft])).toEqual([0, 0]);
});

test('dial widths animate with neighbor colors while ordinary thickness stays fixed', async ({ page }, testInfo) => {
  await createTrip(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await selectTripDates(page, '2030-06-01', '2030-06-14');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const rail = page.getByRole('navigation', { name: 'Trip days' });
  const markers = rail.getByRole('button');
  await expect(markers).toHaveCount(14);
  const normal = await markers.nth(5).locator('.marker-tick').boundingBox();
  const selected = await rail.locator('[aria-current="date"] .marker-tick').boundingBox();
  expect(normal!.width).toBe(selected!.width);
  expect(normal!.height).toBe(2);
  expect(selected!.height).toBe(3);
  const neighbor = await markers.nth(6).boundingBox();
  await markers.nth(5).hover();
  await markers.nth(5).locator('.marker-tick').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });
  const rendered = await rail.locator('.marker-tick').evaluateAll((ticks) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    function rgb(color: string) {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    }
    const probe = document.createElement('span');
    probe.style.color = 'color-mix(in oklab, var(--muted), var(--accent) 20%)';
    document.body.append(probe);
    const neighborColor = rgb(getComputedStyle(probe).color);
    probe.remove();
    return { neighborColor, ticks: ticks.map((tick) => ({
      width: tick.getBoundingClientRect().width, height: tick.getBoundingClientRect().height,
      color: rgb(getComputedStyle(tick).backgroundColor),
    })) };
  });
  const samples = rendered.ticks;
  expect(samples[5].width).toBe(14);
  expect(samples[5].color).toEqual(samples[0].color); // Same full accent as the current-day indicator.
  for (const index of [4, 6]) {
    expect(samples[index].width).toBeCloseTo((normal!.width + samples[5].width) / 2);
    expect(samples[index].color).toEqual(rendered.neighborColor);
    expect(samples[index].color).not.toEqual(samples[3].color);
    expect(samples[index].color).not.toEqual(samples[5].color);
  }
  for (let index = 0; index < samples.length; index++) {
    expect(samples[index].width).toBeLessThanOrEqual(samples[5].width);
    expect(samples[index].height).toBe(index === 0 ? selected!.height : normal!.height);
  }
  for (const index of [1, 2, 3, 7, 8, 9, 10, 11, 12, 13]) {
    expect(samples[index].width).toBe(normal!.width);
    expect(samples[index].color).toEqual(samples[3].color);
  }
  expect((await markers.nth(6).boundingBox())!.y).toBe(neighbor!.y);
  expect((await rail.boundingBox())!.height).toBeLessThanOrEqual(256);
  await page.screenshot({ path: testInfo.outputPath('day-rail-emphasis.png') });
  const strength = () => markers.nth(6).evaluate((element) =>
    Number(element.style.getPropertyValue('--tick-tint')));
  expect(await strength()).toBe(.2);
  const hovered = await markers.nth(5).boundingBox();
  await page.mouse.move(hovered!.x + hovered!.width / 2, hovered!.y + hovered!.height * .7);
  expect(await strength()).toBe(.2);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await markers.nth(5).locator('.marker-tick').evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await markers.nth(5).locator('.marker-tick').boundingBox())!.width).toBe(normal!.width);
  await rail.evaluate((element) => { element.scrollTop = 500; element.scrollLeft = 500; });
  expect(await rail.evaluate((element) => [element.scrollTop, element.scrollLeft])).toEqual([0, 0]);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Choose a trip day', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a trip day' });
  await expect(page.getByLabel('Trip date', { exact: true })).toBeFocused();
  await page.getByLabel('Trip date', { exact: true }).fill('2030-06-14');
  await chooser.getByRole('button', { name: 'Go to day', exact: true }).click();
  await expect(chooser).toHaveCount(0);
  await expect(page.locator('#day-2030-06-14')).toBeFocused();
  await expect(markers.last()).toHaveAttribute('aria-current', 'date');
});

test('the selected day animates its width while keeping its thicker accent indicator', async ({ page }) => {
  await createTrip(page);
  const markers = page.getByRole('navigation', { name: 'Trip days' }).getByRole('button');
  const selected = markers.first().locator('.marker-tick');
  const ordinary = markers.nth(3).locator('.marker-tick');
  await expect(selected).toHaveCSS('width', '7px');
  await expect(selected).toHaveCSS('height', '3px');
  await expect(ordinary).toHaveCSS('width', '7px');
  await expect(ordinary).toHaveCSS('height', '2px');
  const accent = await selected.evaluate((tick) => getComputedStyle(tick).backgroundColor);
  await markers.first().hover();
  await expect(selected).toHaveCSS('width', '14px');
  await expect(selected).toHaveCSS('height', '3px');
  await expect(selected).toHaveCSS('background-color', accent);
  await markers.nth(1).hover();
  await expect(selected).toHaveCSS('width', '10.5px');
  await expect(selected).toHaveCSS('height', '3px');
  await expect(selected).toHaveCSS('background-color', accent);
  await markers.last().focus();
  await expect(markers.last().locator('.marker-tick')).toHaveCSS('width', '14px');
  await expect(markers.last().locator('.marker-tick')).toHaveCSS('height', '2px');
  await expect(selected).toHaveCSS('width', '7px');
  await page.keyboard.press('Enter');
  await expect(markers.last()).toHaveAttribute('aria-current', 'date');
  await expect(markers.last().locator('.marker-tick')).toHaveCSS('width', '7px');
  await expect(markers.last().locator('.marker-tick')).toHaveCSS('height', '3px');
  await expect(markers.last().locator('.marker-tick')).toHaveCSS('background-color', accent);
  await expect(selected).toHaveCSS('height', '2px');
  await markers.last().hover();
  await expect(markers.last().locator('.marker-tick')).toHaveCSS('width', '14px');
  await expect(markers.last().locator('.marker-tick')).toHaveCSS('height', '3px');
  await markers.nth(4).hover();
  await expect(markers.last().locator('.marker-tick')).toHaveCSS('width', '10.5px');
  await expect(markers.last().locator('.marker-tick')).toHaveCSS('background-color', accent);
  await page.mouse.move(0, 0);
  await expect(markers.last().locator('.marker-tick')).toHaveCSS('width', '7px');
  await expect(markers.last().locator('.marker-tick')).toHaveCSS('height', '3px');
});

test('Days toggles calendar dates and trip-day numbers without changing selection or scrolling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await createTrip(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await selectTripDates(page, '2030-05-29', '2030-06-04');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const rail = page.getByRole('navigation', { name: 'Trip days' });
  const markers = rail.getByRole('button');
  const toggle = page.getByRole('button', { name: 'Use trip day numbers', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle.locator('svg')).toBeVisible();
  const calendarPath = await page.getByRole('button', { name: 'Choose a trip day', exact: true }).locator('path').getAttribute('d');
  expect(await toggle.locator('path').getAttribute('d')).toBe(calendarPath);
  expect(await rail.locator('.marker-number').allTextContents()).toEqual(['29', '30', '31', '1', '2', '3', '4']);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await toggle.locator('path').getAttribute('d')).not.toBe(calendarPath);
  await expect(toggle).toHaveAttribute('title', /Showing trip day numbers/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await rail.locator('.marker-number').allTextContents()).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  await markers.nth(3).click();
  await expect(markers.nth(3)).toHaveAttribute('aria-current', 'date');
  await expect(markers.nth(3).locator('.marker-number')).toHaveText('4');
  const scroll = await page.evaluate(() => scrollY);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await toggle.locator('path').getAttribute('d')).toBe(calendarPath);
  await expect(markers.nth(3).locator('.marker-number')).toHaveText('1');
  await expect(markers.nth(3)).toHaveAttribute('aria-current', 'date');
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  await page.getByRole('button', { name: 'Choose a trip day', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a trip day' });
  await expect(chooser).toBeVisible();
  await expect(page.getByLabel('Trip date', { exact: true })).toHaveValue('2030-06-01');
  await chooser.getByRole('button', { name: 'Close Choose a trip day', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 360 });
  await expect(page.getByRole('button', { name: 'Choose a trip day', exact: true })).toBeInViewport();
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await rail.locator('.marker-number').allTextContents()).toEqual(['29', '30', '31', '1', '2', '3', '4']);
});

test('all modules fit phone, tablet and desktop widths', async ({ page }, testInfo) => {
  await createTrip(page);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const module of ['Itinerary', 'Places', 'Notes', 'Checklists', 'Share']) {
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
