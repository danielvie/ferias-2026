import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import type { TripSnapshot } from '../../shared/model';

const trips = new Set<string>();
const sql = (input: string) => execFileSync('docker', [
  'exec', '-i', 'supabase_db_ferias-2026', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
], { input, encoding: 'utf8' }).trim();
let originallyEnabled: boolean;
test.beforeAll(() => {
  originallyEnabled = sql('select creation_enabled from trip_private.settings where singleton;') === 't';
  sql('update trip_private.settings set creation_enabled = true; delete from trip_private.request_limits;');
});
test.afterEach(() => {
  for (const id of trips) sql(`delete from trip_private.trips where id = '${id}';`);
  trips.clear();
});
test.afterAll(() => { sql(`update trip_private.settings set creation_enabled = ${originallyEnabled};`); });

async function navigate(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click();
}
async function create(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add trip details', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill('Online Belgium trip');
  await page.getByLabel('Your name', { exact: true }).fill('Daniel');
  await page.getByLabel('Start date', { exact: true }).fill('2030-06-01');
  await page.getByLabel('End date', { exact: true }).fill('2030-06-06');
  const response = page.waitForResponse((r) => r.url().endsWith('/trip-api/trips') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  const result = await (await response).json();
  expect(result.snapshot?.data.trip.id).toMatch(/^[0-9a-f-]{36}$/);
  trips.add(result.snapshot.data.trip.id);
  const link = await page.getByLabel('Private owner recovery link', { exact: true }).inputValue();
  expect(new URL(link).pathname).toBe('/ferias-2026/');
  await page.getByRole('button', { name: "I've saved it", exact: true }).click();
  return link;
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
  await navigate(page, 'Share');
  await page.getByLabel('Recipient name', { exact: true }).fill(name);
  await page.getByRole('combobox', { name: /Access role/ }).selectOption(role);
  await page.getByRole('button', { name: 'Create invitation link', exact: true }).click();
  const link = await page.getByLabel('Invitation link', { exact: true }).inputValue();
  expect(new URL(link).pathname).toBe('/ferias-2026/');
  await page.getByRole('button', { name: "I've saved this link", exact: true }).click();
  return link;
}
async function snapshot(page: Page): Promise<TripSnapshot> {
  return page.evaluate(async () => {
    const key = Object.keys(sessionStorage).find((key) => key.startsWith('belgium-together:session:'));
    const session = key ? sessionStorage.getItem(key) || '' : '';
    const response = await fetch('http://127.0.0.1:54321/functions/v1/trip-api/trip', { headers: { 'X-Trip-Session': session } });
    if (!response.ok) throw new Error(`Snapshot failed with ${response.status}`);
    return response.json();
  });
}

test('Pages-path creation, derived-session reload and separate link-only identities work across browsers', async ({ page, browser }) => {
  const ownerLink = await create(page);
  await note(page, 'Owner private note');
  const editorLink = await invite(page, 'Editor online', 'editor');
  const editorContext = await browser.newContext();
  try {
    const editor = await editorContext.newPage();
    await editor.goto(editorLink);
    await expect(editor.getByRole('heading', { name: /Good (morning|afternoon|evening), Editor online\./ })).toBeVisible();
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
    await expect(blank.getByRole('button', { name: 'Add trip details', exact: true })).toBeVisible();
    await blank.close();
    expect((await snapshot(editor)).data.notes[0].title).toBe('Editor private note');
  } finally { await editorContext.close(); }
});

test('family UI is redacted and revoked links stop working', async ({ page, browser }) => {
  await create(page);
  await note(page, 'Never share this note');
  const familyLink = await invite(page, 'Family online', 'family');
  const familyContext = await browser.newContext();
  try {
    const family = await familyContext.newPage();
    await family.goto(familyLink);
    await expect(family.getByRole('heading', { name: 'Trip overview', exact: true })).toBeVisible();
    const visible = await snapshot(family);
    expect(visible.data.notes).toEqual([]);
    expect(visible.data.packing).toEqual([]);
    expect(visible.revision).toBe(0);
    await expect(family.getByRole('navigation').getByRole('button', { name: 'Notes', exact: true })).toHaveCount(0);
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Family online', exact: true }) });
    await card.getByRole('button', { name: 'Revoke access', exact: true }).click();
    await card.getByRole('button', { name: 'Confirm revoke', exact: true }).click();
    await expect(card).toHaveCount(0);
    await family.reload();
    await expect(family.getByRole('alert')).toBeVisible();
    await expect(family.getByRole('button', { name: 'Add trip details', exact: true })).toBeVisible();
  } finally { await familyContext.close(); }
});

test('owner-link replacement preserves notes, invalidates the previous link and saves a new session', async ({ page, browser }) => {
  const previous = await create(page);
  await note(page, 'Kept after rotation');
  const memberId = (await snapshot(page)).session.id;
  await navigate(page, 'Share');
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
    await expect(other.getByRole('heading', { name: /Good (morning|afternoon|evening), Daniel\./ })).toBeVisible();
    expect((await snapshot(other)).session.id).toBe(memberId);
  } finally { await otherContext.close(); }
});
