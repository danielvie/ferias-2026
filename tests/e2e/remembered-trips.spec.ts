import { chromium, expect, test, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

async function create(page: Page, title: string, first = false) {
  if (first) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add trip details', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Trips', exact: true }).click();
    await page.getByRole('dialog', { name: 'Your trips', exact: true }).getByRole('button', { name: 'Create trip', exact: true }).click();
  }
  const form = page.getByRole('dialog', { name: first ? 'Trip details' : 'New trip', exact: true });
  await form.getByLabel('Trip name', { exact: true }).fill(title);
  await form.getByLabel('Your name', { exact: true }).fill('Daniel');
  await form.getByLabel('Start date', { exact: true }).fill('2030-06-01');
  await form.getByLabel('End date', { exact: true }).fill('2030-06-05');
  await form.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const link = await page.getByLabel('Private owner recovery link', { exact: true }).inputValue();
  await page.getByRole('button', { name: "I've saved it", exact: true }).click();
  return link;
}

async function open(page: Page, title: string, name = 'Daniel', role = 'owner') {
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await page.getByRole('dialog', { name: 'Your trips', exact: true })
    .getByRole('button', { name: `Open ${title} as ${name}, ${role}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('remembers multiple trips and resumes the last one in new tabs without a link', async ({ page, context }) => {
  await create(page, 'Trip Alpha', true);
  await create(page, 'Trip Beta');
  await open(page, 'Trip Alpha');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Trip Alpha', exact: true })).toBeVisible();
  const fresh = await context.newPage();
  await fresh.goto('/');
  await expect(fresh.getByRole('heading', { name: 'Trip Alpha', exact: true })).toBeVisible();
  await fresh.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(fresh.getByRole('list', { name: 'Remembered trips' }).getByRole('listitem')).toHaveCount(2);
});

test('resumes after closing and restarting a persistent browser profile', async ({ baseURL }, testInfo) => {
  const profile = testInfo.outputPath('trusted-browser');
  const options = { baseURL, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH };
  const first = await chromium.launchPersistentContext(profile, options);
  try { await create(await first.newPage(), 'Restarted trip', true); }
  finally { await first.close(); }
  const restored = await chromium.launchPersistentContext(profile, options);
  try {
    const page = await restored.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Restarted trip', exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/access=/);
  } finally { await restored.close(); }
});

test('keeps two tabs attached to their own trips and writes to the selected trip only', async ({ page, context }) => {
  await create(page, 'Trip Alpha', true);
  const other = await context.newPage();
  await other.goto('/');
  await create(other, 'Trip Beta');
  await expect(page.getByRole('heading', { name: 'Trip Alpha', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill('Trip Alpha edited');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Trip Alpha edited', exact: true })).toBeVisible();
  await other.reload();
  await expect(other.getByRole('heading', { name: 'Trip Beta', exact: true })).toBeVisible();
  const fresh = await context.newPage();
  await fresh.goto('/');
  await expect(fresh.getByRole('heading', { name: 'Trip Beta', exact: true })).toBeVisible();
});

test('preserves the current trip on a failed switch and can retry', async ({ page }) => {
  await create(page, 'Trip Alpha', true);
  await create(page, 'Trip Beta');
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const pane = page.getByRole('dialog', { name: 'Your trips', exact: true });
  await page.route('**/api/trip', route => route.abort());
  await pane.getByRole('button', { name: 'Open Trip Alpha as Daniel, owner', exact: true }).click();
  await expect(pane.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trip Beta', exact: true })).toBeVisible();
  await expect(pane.getByRole('listitem').filter({ hasText: 'Trip Beta' })).toContainText('Current trip');
  await page.unroute('**/api/trip');
  await pane.getByRole('button', { name: 'Open Trip Alpha as Daniel, owner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trip Alpha', exact: true })).toBeVisible();
  await expect(pane).toHaveCount(0);
});

test('forgets saved access without deleting the trip or disturbing another trip', async ({ page, browser }) => {
  const link = await create(page, 'Trip Alpha', true);
  await create(page, 'Trip Beta');
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const pane = page.getByRole('dialog', { name: 'Your trips', exact: true });
  page.once('dialog', dialog => dialog.dismiss());
  await pane.getByRole('button', { name: 'Forget Trip Alpha as Daniel, owner', exact: true }).click();
  await expect(pane.getByRole('listitem')).toHaveCount(2);
  page.once('dialog', dialog => dialog.accept());
  await pane.getByRole('button', { name: 'Forget Trip Alpha as Daniel, owner', exact: true }).click();
  await expect(pane.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Trip Beta', exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await pane.getByRole('button', { name: 'Forget Trip Beta as Daniel, owner', exact: true }).click();
  await expect(pane).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add trip details', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add trip details', exact: true })).toBeVisible();
  const separate = await browser.newContext();
  try {
    const reader = await separate.newPage();
    await reader.goto(link);
    await expect(reader.getByRole('heading', { name: 'Trip Alpha', exact: true })).toBeVisible();
  } finally { await separate.close(); }
});

test('Exit forgets only the current trip and does not auto-open a different trip', async ({ page }) => {
  await create(page, 'Trip Alpha', true);
  await create(page, 'Trip Beta');
  await page.getByRole('button', { name: 'Close this trip session', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your trips', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Remembered trips' }).getByRole('listitem')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your trips', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open Trip Alpha as Daniel, owner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trip Alpha', exact: true })).toBeVisible();
});

test('explicit member links take precedence without losing the saved owner identity', async ({ page }) => {
  await create(page, 'Trip Alpha', true);
  const response = await page.request.post('/api/invites', { data: { name: 'Reader', role: 'viewer', eventIds: [], placeIds: [] } });
  expect(response.ok()).toBeTruthy();
  const invitation = await response.json();
  const link = new URL(page.url());
  link.hash = new URLSearchParams({ access: invitation.token }).toString();
  await page.goto(link.href);
  await expect(page.getByRole('button', { name: 'Your profile: Reader, viewer', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toHaveCount(0);
  await expect(page).not.toHaveURL(/access=/);
  await open(page, 'Trip Alpha');
  await expect(page.getByRole('button', { name: 'Your profile: Daniel, owner', exact: true })).toBeVisible();
});

test('keeps an open draft when another tab forgets its access and blocks further writes', async ({ page, context }) => {
  await create(page, 'Trip Alpha', true);
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('heading', { name: 'Trip Alpha', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Keep this draft');
  await page.getByLabel('Note text', { exact: true }).fill('Unsaved private text');
  await other.getByRole('button', { name: 'Trips', exact: true }).click();
  other.once('dialog', dialog => dialog.accept());
  await other.getByRole('button', { name: 'Forget Trip Alpha as Daniel, owner', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your open draft is kept');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep this draft');
  let writes = 0;
  page.on('request', request => { if (request.url().endsWith('/api/commands')) writes += 1; });
  await expect(page.getByRole('button', { name: 'Save note', exact: true })).toBeDisabled();
  expect(writes).toBe(0);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep this draft');
});

test('keeps drafts when trip switching is cancelled', async ({ page }) => {
  await create(page, 'Trip Alpha', true);
  await create(page, 'Trip Beta');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Do not discard');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Do not discard');
});

test('Trips fits mobile and desktop, passes axe checks and returns keyboard focus', async ({ page }, testInfo) => {
  await create(page, 'A longer trip title for our summer holiday in Belgium', true);
  await create(page, 'Trip Beta');
  await page.getByRole('button', { name: 'Trips', exact: true }).focus();
  await page.keyboard.press('Enter');
  const pane = page.getByRole('dialog', { name: 'Your trips', exact: true });
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(pane).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(violation => violation.id)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`trips-${width}.png`) });
  }
  await page.keyboard.press('Escape');
  await expect(pane).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Trips', exact: true })).toBeFocused();
});

test('keeps current-tab access usable when persistent browser storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
  });
  await create(page, 'Tab-only trip', true);
  await expect(page.getByRole('status').filter({ hasText: 'Enable browser storage' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tab-only trip', exact: true })).toBeVisible();
});

test('forgets locally while offline without reviving the forgotten trip on reload', async ({ page, context }) => {
  await create(page, 'Trip Alpha', true);
  await create(page, 'Trip Beta');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Forget Trip Beta as Daniel, owner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your trips', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('server sign-out could not be confirmed');
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your trips', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open Trip Alpha as Daniel, owner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trip Alpha', exact: true })).toBeVisible();
});

test('invalid saved access shows the trip list instead of falling back to another trip', async ({ page }) => {
  await create(page, 'Trip Alpha', true);
  await create(page, 'Trip Beta');
  const revoked = await page.request.delete('/api/session', { headers: { 'Content-Type': 'application/json' } });
  expect(revoked.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your trips', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Trip Beta' })).toContainText('Access is no longer valid');
  await expect(page.getByRole('button', { name: 'Open Trip Beta as Daniel, owner', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Open Trip Alpha as Daniel, owner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trip Alpha', exact: true })).toBeVisible();
});
