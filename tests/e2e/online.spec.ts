import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import type { TripSnapshot } from '../../shared/model';
import { simpleSharingTests } from './simple-sharing-flows';

const trips = new Set<string>();
const database = process.env.TRIP_TEST_DATABASE || 'postgres';
if (database !== 'postgres' && !/^trip_attribution_[0-9a-f]+$/.test(database)) throw new Error('Invalid disposable test database.');
const apiBase = process.env.TRIP_TEST_API_URL || 'http://127.0.0.1:54321/functions/v1/trip-api';
if (!/^http:\/\/127\.0\.0\.1:\d+\/functions\/v1\/trip-api$/.test(apiBase)) throw new Error('Online tests must use a loopback API.');
const sql = (input: string) => execFileSync('docker', [
  'exec', '-i', 'supabase_db_ferias-2026', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1',
], { input, encoding: 'utf8' }).trim();
let originallyEnabled: boolean;
test.beforeAll(() => {
  originallyEnabled = sql('select creation_enabled from trip_private.settings where singleton;') === 't';
  sql('update trip_private.settings set creation_enabled = true; delete from trip_private.request_limits;');
});
test.beforeEach(() => { sql('delete from trip_private.request_limits;'); });
test.afterEach(() => {
  for (const id of trips) sql(`delete from trip_private.trips where id = '${id}';`);
  trips.clear();
});
test.afterAll(() => { sql(`update trip_private.settings set creation_enabled = ${originallyEnabled};`); });

async function navigate(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click();
}
async function create(page: Page, title = 'Online Belgium trip', another = false) {
  if (another) {
    await page.getByRole('button', { name: 'Trips', exact: true }).click();
    await page.getByRole('dialog', { name: 'Your trips', exact: true }).getByRole('button', { name: 'Create trip', exact: true }).click();
  } else {
    await page.goto('./');
    await page.getByRole('button', { name: 'Add trip details', exact: true }).click();
  }
  await page.getByLabel('Trip name', { exact: true }).fill(title);
  await page.getByLabel('Your name', { exact: true }).fill('Daniel');
  await page.getByLabel('Start date', { exact: true }).fill('2030-06-01');
  await page.getByLabel('End date', { exact: true }).fill('2030-06-06');
  const response = page.waitForResponse((r) => r.url().endsWith('/trip-api/trips') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  const created = await response;
  expect(created.status()).toBe(201);
  const result = await created.json();
  expect(result.snapshot?.data.trip.id).toMatch(/^[0-9a-f-]{36}$/);
  trips.add(result.snapshot.data.trip.id);
  const link = new URL(page.url());
  link.hash = new URLSearchParams({ access: result.ownerToken }).toString();
  expect(link.pathname).toBe('/ferias-2026/');
  return link.href;
}
async function note(page: Page, title: string) {
  await navigate(page, 'Notes');
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Note text', { exact: true }).fill('A private browser test note.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
async function invite(page: Page, name: string, role: string) {
  // Retained private-member links are compatibility fixtures, not the new UI.
  const token = await page.evaluate(async ({ base, name, role }) => {
    const key = Object.keys(sessionStorage).find(key => key.startsWith('belgium-together:session:'));
    const response = await fetch(`${base}/invites`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Trip-Session': key ? sessionStorage.getItem(key) || '' : '',
    }, body: JSON.stringify({ name, role, eventIds: [], placeIds: [] }) });
    if (!response.ok) throw new Error(`Legacy invitation failed with ${response.status}`);
    return (await response.json()).token as string;
  }, { base: apiBase, name, role });
  const link = new URL(page.url());
  link.hash = new URLSearchParams({ access: token }).toString();
  expect(link.pathname).toBe('/ferias-2026/');
  return link.href;
}
async function snapshot(page: Page): Promise<TripSnapshot> {
  return page.evaluate(async (base) => {
    const key = Object.keys(sessionStorage).find((key) => key.startsWith('belgium-together:session:'));
    const session = key ? sessionStorage.getItem(key) || '' : '';
    const response = await fetch(`${base}/trip`, { headers: { 'X-Trip-Session': session } });
    if (!response.ok) throw new Error(`Snapshot failed with ${response.status}`);
    return response.json();
  }, apiBase);
}

simpleSharingTests({ create, snapshot });

test('mobile profile and durable history work through the deployed-path Edge transport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await create(page);
  const previous = await snapshot(page);
  await page.getByRole('button', { name: 'Your profile: Daniel, owner' }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Daniel online');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your name is saved' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Recorded changes' })).toContainText('Daniel renamed member');
  await page.getByRole('button', { name: 'Close Your profile', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Your profile: Daniel online, owner' })).toBeVisible();
  expect((await snapshot(page)).session).toEqual({ ...previous.session, name: 'Daniel online' });
});

test('remembered Pages-path access resumes in a fresh tab and isolates link-only identities', async ({ page, browser }) => {
  const ownerLink = await create(page);
  await note(page, 'Owner private note');
  const editorLink = await invite(page, 'Editor online', 'editor');
  const editorContext = await browser.newContext();
  try {
    const editor = await editorContext.newPage();
    await editor.goto(editorLink);
    await expect(editor.getByRole('heading', { name: 'Online Belgium trip', exact: true })).toBeVisible();
    await expect(editor).not.toHaveURL(/access=/);
    await note(editor, 'Editor private note');
    await expect(editor.getByRole('heading', { name: 'Owner private note', exact: true })).toHaveCount(0);
    await page.reload();
    await navigate(page, 'Notes');
    await expect(page.getByRole('heading', { name: 'Owner private note', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Editor private note', exact: true })).toHaveCount(0);
    const ownerToken = new URL(ownerLink).hash.slice('#access='.length);
    const storage = await page.evaluate(() => JSON.stringify({ session: { ...sessionStorage }, local: { ...localStorage } }));
    expect(storage.includes(ownerToken)).toBe(false);
    expect(Object.keys(await page.evaluate(() => ({ ...sessionStorage })))).toHaveLength(1);
    const blank = await page.context().newPage();
    await blank.goto('./');
    await expect(blank.getByRole('heading', { name: 'Online Belgium trip', exact: true })).toBeVisible();
    expect((await snapshot(blank)).session.id).toBe((await snapshot(page)).session.id);
    await blank.close();
    expect((await snapshot(editor)).data.notes[0].title).toBe('Editor private note');
  } finally { await editorContext.close(); }
});

test('remembered family access stays redacted and revoked access requires a new link', async ({ page, browser }) => {
  await create(page);
  await note(page, 'Never share this note');
  const familyLink = await invite(page, 'Family online', 'family');
  const familyContext = await browser.newContext();
  try {
    const family = await familyContext.newPage();
    await family.goto(familyLink);
    await expect(family.getByRole('heading', { name: 'Online Belgium trip', exact: true })).toBeVisible();
    const visible = await snapshot(family);
    expect(visible.data.notes).toEqual([]);
    expect(visible.data.packing).toEqual([]);
    expect(visible.revision).toBe(0);
    await expect(family.getByRole('navigation').getByRole('button', { name: 'Notes', exact: true })).toHaveCount(0);
    const revoked = await page.evaluate(async ({ base, id }) => {
      const key = Object.keys(sessionStorage).find(key => key.startsWith('belgium-together:session:'));
      return (await fetch(`${base}/invites/${id}`, { method: 'DELETE',
        headers: { 'X-Trip-Session': key ? sessionStorage.getItem(key) || '' : '' } })).status;
    }, { base: apiBase, id: visible.session.id });
    expect(revoked).toBe(200);
    await family.reload();
    await expect(family.getByRole('alert')).toBeVisible();
    await expect(family.getByRole('heading', { name: 'Your trips', exact: true })).toBeVisible();
    await expect(family.getByRole('list', { name: 'Remembered trips' })).toContainText('Access is no longer valid');
  } finally { await familyContext.close(); }
});

test('remembered owner access follows link replacement without retaining the reusable link', async ({ page, browser }) => {
  const previous = await create(page);
  await note(page, 'Kept after rotation');
  const memberId = (await snapshot(page)).session.id;
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.owner-recovery > summary').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Replace owner link', exact: true }).click();
  const replacement = await page.getByLabel('Private owner link', { exact: true }).inputValue();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);
  await page.getByRole('button', { name: "I've saved this link", exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Close Trip settings', exact: true }).click();
  await page.reload();
  expect((await snapshot(page)).session.id).toBe(memberId);
  await navigate(page, 'Notes');
  await expect(page.getByRole('heading', { name: 'Kept after rotation', exact: true })).toBeVisible();
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await other.goto(previous);
    await expect(other.getByRole('alert')).toBeVisible();
    await other.goto(replacement);
    await expect(other).not.toHaveURL(/access=/);
    await expect(other.getByRole('heading', { name: 'Online Belgium trip', exact: true })).toBeVisible();
    expect((await snapshot(other)).session.id).toBe(memberId);
  } finally { await otherContext.close(); }
});

test('online trip settings preserve city IDs and update the continuous day index after reload', async ({ page }) => {
  await create(page);
  const original = await snapshot(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('City 1', { exact: true }).fill('Brussels Central');
  await page.getByRole('button', { name: 'Move Brussels Central down', exact: true }).click();
  await page.getByLabel('End date', { exact: true }).fill('2030-06-08');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  const saved = await snapshot(page);
  expect(saved.data.trip.cities[1]).toEqual({ id: original.data.trip.cities[0].id, name: 'Brussels Central' });
  expect(saved.data.trip.endDate).toBe('2030-06-08');
  await expect(page.getByRole('navigation', { name: 'Trip days' }).getByRole('button')).toHaveCount(8);
});

test('remembered trips switch at the Pages path and resume from persistent storage without sessionStorage', async ({ page, browser }) => {
  const firstLink = await create(page, 'Online Alpha');
  await create(page, 'Online Beta', true);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const pane = page.getByRole('dialog', { name: 'Your trips', exact: true });
  await expect(pane.getByRole('listitem')).toHaveCount(2);
  await pane.getByRole('button', { name: 'Open Online Alpha as Daniel, owner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Online Alpha', exact: true })).toBeVisible();
  const firstCredential = new URL(firstLink).hash.slice('#access='.length);
  const serialized = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(serialized).not.toContain(firstCredential);
  const restored = await browser.newContext({ storageState: await page.context().storageState() });
  try {
    const fresh = await restored.newPage();
    await fresh.goto(new URL('./', page.url()).href);
    await expect(fresh.getByRole('heading', { name: 'Online Alpha', exact: true })).toBeVisible();
    await expect(fresh).not.toHaveURL(/access=/);
    await fresh.getByRole('button', { name: 'Trips', exact: true }).click();
    await fresh.getByRole('button', { name: 'Open Online Beta as Daniel, owner', exact: true }).click();
    await expect(fresh.getByRole('heading', { name: 'Online Beta', exact: true })).toBeVisible();
    await fresh.getByRole('button', { name: 'Close this trip session', exact: true }).click();
    await expect(fresh.getByRole('heading', { name: 'Your trips', exact: true })).toBeVisible();
    await expect(fresh.getByRole('list', { name: 'Remembered trips' }).getByRole('listitem')).toHaveCount(1);
  } finally { await restored.close(); }
});

test('remembered trip credentials stay tab-local while another online trip is selected', async ({ page, context }) => {
  await create(page, 'Online Alpha');
  const other = await context.newPage();
  await other.goto(new URL('./', page.url()).href);
  await expect(other.getByRole('heading', { name: 'Online Alpha', exact: true })).toBeVisible();
  await create(other, 'Online Beta', true);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill('Online Alpha edited');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Online Alpha edited', exact: true })).toBeVisible();
  await other.reload();
  await expect(other.getByRole('heading', { name: 'Online Beta', exact: true })).toBeVisible();
  const fresh = await context.newPage();
  await fresh.goto(new URL('./', page.url()).href);
  await expect(fresh.getByRole('heading', { name: 'Online Beta', exact: true })).toBeVisible();
});
