import { expect, test, type Locator, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import type { TripCommand, TripSnapshot } from '../../shared/model';
import { selectTripDates } from './trip-dates';
import { recordDialogs } from './dialogs';

async function state(page: Page): Promise<TripSnapshot> {
  return (await page.request.get('/api/trip')).json();
}
async function command(page: Page, command: TripCommand) {
  const current = await state(page);
  const response = await page.request.post('/api/commands', { data: { revision: current.revision, command } });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<TripSnapshot>;
}
async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add trip details', exact: true }).click();
  await page.getByLabel('Trip name', { exact: true }).fill('Checklist trip');
  await page.getByLabel('Your name', { exact: true }).fill('Daniel');
  await selectTripDates(page, '2030-06-01', '2030-06-06');
  await page.getByRole('button', { name: 'Save trip details', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Checklists', exact: true }).click();
}
const editor = (page: Page, id: string) => page.locator(`[data-checklist-id="${id}"]`);
const itemRow = (page: Page, id: string) => page.locator(`[data-checklist-item-id="${id}"]`);
const itemOrder = (list: Locator) => list.locator('[data-checklist-item-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-checklist-item-id')));

async function dragItem(page: Page, handle: Locator, target: Locator) {
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
  const overlay = page.locator('.checklist-drag-preview');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS('background-color', 'rgb(36, 41, 51)');
  await expect(overlay).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
}

async function createList(page: Page, title: string) {
  await page.getByRole('button', { name: 'New checklist', exact: false }).click();
  await page.getByLabel('Checklist title', { exact: true }).fill(title);
  await page.getByLabel('Checklist title', { exact: true }).press('Enter');
  await expect(page.getByLabel(`New item for ${title}`, { exact: true })).toBeFocused();
  return (await state(page)).data.checklists!.find(list => list.title === title)!.id;
}

test('U1 creates, renames, completes and deletes named lists with persisted inline edits', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  const original = (await state(page)).data.packing;
  const id = await createList(page, 'Documents');
  const list = editor(page, id);
  const input = list.getByLabel('New item for Documents', { exact: true });
  await input.fill('Print tickets');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  const text = list.getByLabel('Item text: Print tickets', { exact: true });
  await text.fill('Download tickets');
  await expect(list.getByRole('checkbox')).toBeDisabled();
  await text.press('Enter');
  await expect(list.getByRole('checkbox', { name: 'Download tickets', exact: true })).toBeEnabled();
  await list.getByRole('checkbox', { name: 'Download tickets', exact: true }).check();
  await expect(list.getByText('1 completed item', { exact: true })).toBeFocused();
  await list.getByText('1 completed item', { exact: true }).click();
  await expect(list.getByRole('checkbox', { name: 'Download tickets', exact: true })).toBeChecked();
  await list.getByRole('checkbox', { name: 'Download tickets', exact: true }).uncheck();
  await expect(input).toBeFocused();
  await list.getByLabel('Checklist title: Documents', { exact: true }).fill('Travel documents');
  await list.getByLabel('Checklist title: Documents', { exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Go to checklist 2: Travel documents', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Checklists', exact: true }).click();
  await page.getByRole('button', { name: 'Go to checklist 2: Travel documents', exact: true }).click();
  await expect(list.getByRole('checkbox', { name: 'Download tickets', exact: true })).not.toBeChecked();
  expect((await state(page)).data.packing).toEqual(original);
  await list.getByLabel('Checklist actions for Travel documents', { exact: true }).click();
  await list.getByRole('button', { name: 'Delete checklist', exact: true }).click();
  await list.getByRole('button', { name: 'Keep checklist', exact: true }).click();
  await expect(list).toBeVisible();
  await list.getByLabel('Checklist actions for Travel documents', { exact: true }).click();
  await list.getByRole('button', { name: 'Delete checklist', exact: true }).click();
  await list.getByRole('button', { name: 'Confirm delete checklist', exact: true }).click();
  await expect(list).toHaveCount(0);
  expect((await state(page)).data.checklists).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('checklist drafts survive list switches, resizing, failed writes and real revision conflicts', async ({ page }) => {
  const dialogs = recordDialogs(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await page.getByRole('button', { name: 'New checklist', exact: false }).click();
  await page.getByLabel('Checklist title', { exact: true }).fill('Documents');
  await page.route('**/api/commands', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic checklist failure' }),
  }), { times: 1 });
  await page.getByRole('button', { name: 'Create checklist', exact: true }).click();
  await expect(page.getByLabel('Checklist title', { exact: true })).toHaveValue('Documents');
  await page.getByRole('button', { name: 'Retry creating checklist', exact: true }).click();
  await expect(page.getByLabel('New item for Documents', { exact: true })).toBeFocused();
  const id = (await state(page)).data.checklists![1].id;
  const list = editor(page, id);
  const input = list.getByLabel('New item for Documents', { exact: true });
  await input.fill('Keep this item draft');
  const nav = page.getByRole('navigation', { name: 'Checklist markers' });
  await nav.getByRole('button', { name: 'Go to checklist 1: Packing', exact: true }).click();
  await nav.getByRole('button', { name: 'Go to checklist 2: Documents', exact: true }).click();
  await expect(input).toHaveValue('Keep this item draft');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(input).toHaveValue('Keep this item draft');
  await page.route('**/api/commands', route => route.abort('failed'), { times: 1 });
  await input.press('Enter');
  await expect(list.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(input).toHaveValue('Keep this item draft');
  await list.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(input).toHaveValue('');
  const title = list.getByLabel('Checklist title: Documents', { exact: true });
  await title.fill('My retained title');
  await command(page, { type: 'checklist.rename', id: 'packing', title: 'Remote packing title' });
  await title.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Someone changed the trip');
  await expect(title).toHaveValue('My retained title');
  await list.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(list.getByLabel('Checklist title: My retained title', { exact: true })).toBeVisible();
  expect((await state(page)).data.checklists![0].title).toBe('Remote packing title');
  const retainedInput = list.getByLabel('New item for My retained title', { exact: true });
  await retainedInput.fill('Unsaved before leaving');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Itinerary', exact: true }).click();
  await expect(retainedInput).toHaveCount(0);
  expect(dialogs).toEqual([]);
  expect((await state(page)).data.checklists!.find(list => list.id === id)!.items.some(item => item.title === 'Unsaved before leaving')).toBe(false);
});

test('U1 jumps directly through touch markers and the named picker, tracks scroll and creates inline', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await open(page);
    for (const [id, title] of [['documents', 'Documents'], ['groceries', 'Groceries'], ['leaving', 'Before leaving']]) {
      await command(page, { type: 'checklist.add', id, title });
      await command(page, { type: 'checklist.item.add', checklistId: id, title: `First item in ${title}` });
    }
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    const markers = page.getByRole('navigation', { name: 'Checklist markers' });
    await markers.getByRole('button', { name: 'Go to checklist 2: Documents', exact: true }).tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(editor(page, 'documents')).toBeFocused();
    await expect(markers.getByRole('button', { name: 'Go to checklist 2: Documents', exact: true })).toHaveAttribute('aria-current', 'true');
    await page.getByRole('button', { name: 'All', exact: true }).tap();
    const picker = page.getByRole('dialog', { name: 'Choose a checklist' });
    await picker.getByRole('button', { name: '4 Before leaving', exact: true }).tap();
    await expect(picker).toHaveCount(0);
    await expect(editor(page, 'leaving')).toBeFocused();
    await editor(page, 'packing').evaluate(element => element.scrollIntoView({ block: 'start' }));
    await expect(markers.getByRole('button', { name: 'Go to checklist 1: Packing', exact: true })).toHaveAttribute('aria-current', 'true');
    await page.evaluate(() => window.scrollTo(0, 0));
    const id = await createList(page, 'Snacks');
    await expect(editor(page, id).getByLabel('New item for Snacks', { exact: true })).toBeFocused();
    await page.setViewportSize({ width: 390, height: 440 });
    const input = page.getByLabel('New item for Snacks', { exact: true });
    await input.fill('Fruit');
    await expect(input).toBeInViewport();
    await input.press('Enter');
    await expect(editor(page, id).getByRole('checkbox', { name: 'Fruit', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: testInfo.outputPath('checklists-U1-phone.png') });
  } finally { await context.close(); }
});

test('grip handles persist pointer and keyboard reordering while item details stay compact', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  const [passport, charger, jacket, medication, shoes] = (await state(page)).data.packing;
  await command(page, { type: 'packing.update', id: charger.id, status: 'pending', assignee: 'Ana' });
  for (const item of [medication, shoes]) await command(page, { type: 'packing.update', id: item.id, status: 'done', assignee: item.assignee });
  await command(page, { type: 'checklist.add', id: 'documents', title: 'Documents' });
  await command(page, { type: 'checklist.item.add', checklistId: 'documents', title: 'Tickets' });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const original = await state(page);
  const pending = editor(page, 'packing').getByRole('list', { name: 'Pending items in Packing', exact: true });
  await dragItem(page, itemRow(page, charger.id).getByRole('button', { name: 'Drag Phone charger', exact: true }), itemRow(page, jacket.id));
  await expect.poll(() => itemOrder(pending)).toEqual([passport.id, jacket.id, charger.id]);
  await page.reload();
  await expect.poll(() => itemOrder(pending)).toEqual([passport.id, jacket.id, charger.id]);
  const row = itemRow(page, charger.id);
  const summary = row.getByLabel('Options for Phone charger', { exact: true });
  const height = (await row.locator('.compact-item-line').boundingBox())!.height;
  await summary.click();
  expect(await summary.evaluate(node => getComputedStyle(node, '::before').content)).toBe('none');
  expect((await summary.boundingBox())!.height).toBe(44);
  expect((await row.locator('.compact-item-line').boundingBox())!.height).toBe(height);
  await page.screenshot({ path: testInfo.outputPath('checklist-item-details.png') });
  await row.getByRole('button', { name: 'Move earlier', exact: true }).click();
  await expect.poll(() => itemOrder(pending)).toEqual([passport.id, charger.id, jacket.id]);
  await editor(page, 'packing').getByText('2 completed items', { exact: true }).click();
  const completed = editor(page, 'packing').getByRole('list', { name: 'Completed items in Packing', exact: true });
  const handle = itemRow(page, medication.id).getByRole('button', { name: 'Drag Medication', exact: true });
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.checklist-drag-preview')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.screenshot({ path: testInfo.outputPath('checklist-dark-drag.png') });
  await page.keyboard.press('Space');
  await expect.poll(() => itemOrder(completed)).toEqual([shoes.id, medication.id]);
  await expect(handle).toBeFocused();
  const beforeCancel = (await state(page)).revision;
  await handle.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  await expect.poll(() => itemOrder(completed)).toEqual([shoes.id, medication.id]);
  expect((await state(page)).revision).toBe(beforeCancel);
  const next = await state(page);
  expect(new Map(next.data.packing.map(item => [item.id, item]))).toEqual(new Map(original.data.packing.map(item => [item.id, item])));
  expect(next.data.checklists!.find(list => list.id === 'documents')).toEqual(original.data.checklists!.find(list => list.id === 'documents'));
});

test('item moves reject failed or stale writes, retain drafts and block repeated saves', async ({ page }) => {
  await open(page);
  const original = (await state(page)).data.packing.map(item => item.id);
  const pending = editor(page, 'packing').getByRole('list', { name: 'Pending items in Packing', exact: true });
  const row = itemRow(page, original[2]);
  await page.route('**/api/commands', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic move failure' }),
  }), { times: 1 });
  await row.getByLabel('Options for Rain jacket', { exact: true }).click();
  await row.getByRole('button', { name: 'Move earlier', exact: true }).click();
  await expect(editor(page, 'packing').getByText("Couldn't save the new order.", { exact: false })).toBeVisible();
  await expect.poll(() => itemOrder(pending)).toEqual(original);
  await command(page, { type: 'packing.add', title: 'Remote item', assignee: '' });
  await row.getByLabel('Options for Rain jacket', { exact: true }).click();
  await row.getByRole('button', { name: 'Move earlier', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Someone changed the trip');
  const refreshed = (await state(page)).data.packing.map(item => item.id);
  await expect.poll(() => itemOrder(pending)).toEqual(refreshed);
  const text = row.getByLabel('Item text: Rain jacket', { exact: true });
  await text.fill('Keep this unsaved item text');
  await expect(pending.getByRole('button', { name: /^Drag / }).first()).toBeDisabled();
  await text.press('Escape');
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/api/commands', async route => { requests++; await waiting; await route.continue(); }, { times: 1 });
  await row.getByLabel('Options for Rain jacket', { exact: true }).click();
  await row.getByRole('button', { name: 'Move earlier', exact: true }).click();
  await expect(pending.getByRole('button', { name: /^Drag / }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'New checklist', exact: true })).toBeDisabled();
  expect(requests).toBe(1);
  release();
  await expect.poll(() => itemOrder(pending)).toEqual([refreshed[0], refreshed[2], refreshed[1], ...refreshed.slice(3)]);
});

test('touch reordering uses only the grip and leaves the rest of the row scrollable', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await open(page);
    const items = (await state(page)).data.packing;
    const handle = itemRow(page, items[0].id).getByRole('button', { name: 'Drag Passport / ID', exact: true });
    await expect(handle).toHaveCSS('touch-action', 'none');
    await expect(itemRow(page, items[0].id).getByRole('textbox')).not.toHaveCSS('touch-action', 'none');
    const from = (await handle.boundingBox())!;
    const to = (await itemRow(page, items[2].id).boundingBox())!;
    const cdp = await context.newCDPSession(page);
    const points = (x: number, y: number) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from.x + 22, from.y + 22) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(from.x + 32, from.y + 22) });
    await expect(page.locator('.checklist-drag-preview')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(to.x + to.width / 2, to.y + to.height / 2) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const pending = editor(page, 'packing').getByRole('list', { name: 'Pending items in Packing', exact: true });
    await expect.poll(() => itemOrder(pending)).toEqual([items[1].id, items[2].id, items[0].id, ...items.slice(3).map(item => item.id)]);
  } finally { await context.close(); }
});

test('checklist hover and keyboard focus use itinerary tick growth and a live item summary', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  for (const [id, title] of [['documents', 'Documents'], ['groceries', 'Groceries'], ['leaving', 'Before leaving'], ['bookings', 'Bookings']]) {
    await command(page, { type: 'checklist.add', id, title });
  }
  await command(page, { type: 'checklist.item.add', checklistId: 'documents', title: 'Tickets' });
  const saved = await command(page, { type: 'checklist.item.add', checklistId: 'documents', title: 'Insurance' });
  const item = saved.data.checklists!.find(list => list.id === 'documents')!.items[0];
  await command(page, { type: 'checklist.item.update', checklistId: 'documents', id: item.id, status: 'done', assignee: '' });
  await command(page, { type: 'checklist.item.add', checklistId: 'leaving', title: 'Lock windows' });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const revision = (await state(page)).revision;
  const nav = page.getByRole('navigation', { name: 'Checklist markers' });
  const markers = nav.getByRole('button');
  const ticks = nav.locator('.rail-tick');
  const widths = () => ticks.evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().width * 10) / 10));
  const documents = markers.nth(1);
  await expect.poll(widths).toEqual([7, 7, 7, 7, 7]);
  const numberX = (await documents.locator('span').boundingBox())!.x;
  await documents.hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toContainText('Documents');
  await expect(tooltip).toContainText('2 items');
  await expect(documents).toHaveAttribute('aria-describedby', (await tooltip.getAttribute('id'))!);
  await expect.poll(widths).toEqual([11.7, 16.4, 11.7, 7, 7]);
  expect((await documents.locator('span').boundingBox())!.x).toBe(numberX);
  const card = (await tooltip.locator('.checklist-preview-card').boundingBox())!;
  expect(card.width).toBeLessThanOrEqual(256);
  expect(card.height).toBeLessThanOrEqual(80);
  await expect(ticks.nth(0)).toHaveCSS('height', '3px');
  await expect(ticks.nth(1)).toHaveCSS('height', '2px');
  expect(await ticks.nth(2).evaluate(node => getComputedStyle(node).getPropertyValue('--tick-tint').trim())).toBe('0.2');
  await expect(markers.first()).toHaveAttribute('aria-current', 'true');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('checklist-hover-summary.png') });
  await tooltip.hover();
  await expect(tooltip).toBeVisible();
  await page.getByRole('heading', { name: 'Checklists', exact: true }).hover();
  await expect(tooltip).toHaveCount(0);
  await expect.poll(widths).toEqual([7, 7, 7, 7, 7]);
  await documents.hover();
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await expect.poll(widths).toEqual([7, 7, 7, 7, 7]);
  await documents.focus();
  await expect(tooltip).toContainText('Documents');
  await page.keyboard.press('ArrowDown');
  await expect(markers.nth(2)).toBeFocused();
  await expect(tooltip).toContainText('Groceries');
  await expect(tooltip).toContainText('0 items');
  await page.keyboard.press('ArrowDown');
  await expect(tooltip).toContainText('Before leaving');
  await expect(tooltip).toContainText('1 item');
  await page.keyboard.press('Enter');
  await expect(editor(page, 'leaving')).toBeFocused();
  await expect(tooltip).toHaveCount(0);
  await documents.hover();
  await expect(ticks.nth(3)).toHaveCSS('width', '7px');
  await expect(ticks.nth(3)).toHaveCSS('height', '3px');
  await markers.nth(2).hover();
  await expect.poll(async () => (await ticks.nth(3).boundingBox())!.width).toBeCloseTo(11.69, 1);
  await expect(ticks.nth(3)).toHaveCSS('height', '3px');
  await markers.nth(3).hover();
  await expect.poll(async () => (await ticks.nth(3).boundingBox())!.width).toBeCloseTo(16.38, 1);
  await expect(ticks.nth(3)).toHaveCSS('height', '3px');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(tooltip).toHaveCount(0);
  await page.getByRole('button', { name: 'Close Choose a checklist', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await documents.hover();
  await expect(ticks.nth(1)).toHaveCSS('transition-duration', '0s');
  expect((await state(page)).revision).toBe(revision);
});

test('checklist summaries wrap long names and stay within the viewport', async ({ page }, testInfo) => {
  await open(page);
  const title = 'Travel documents, reservations and emergency contacts for everyone in our group, including all confirmations for the return journey';
  await command(page, { type: 'checklist.add', id: 'long-title', title });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  for (const [width, height] of [[320, 440], [768, 700], [1440, 700]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('navigation', { name: 'Checklist markers' })
      .getByRole('button', { name: `Go to checklist 2: ${title}`, exact: true }).hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toContainText(title);
    await expect(tooltip.getByText('0 items', { exact: true })).toBeInViewport();
    const box = (await tooltip.boundingBox())!;
    const header = (await page.getByRole('banner').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    if (height - header.y - header.height >= box.height + 32) {
      expect(box.y).toBeGreaterThanOrEqual(header.y + header.height);
    }
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(violations.map(violation => violation.id)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`checklist-summary-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);
  }
});

test('U1 uses continuous desktop lists, keeps drafts through resizing and shares mobile navigation', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  for (const [id, title] of [['documents', 'Documents'], ['groceries', 'Groceries']]) {
    await command(page, { type: 'checklist.add', id, title });
    await command(page, { type: 'checklist.item.add', checklistId: id, title: `Item in ${title}` });
  }
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Checklist navigator' })).toHaveCount(0);
  await expect(page.locator('[data-checklist-id][hidden]')).toHaveCount(0);
  for (const id of ['packing', 'documents', 'groceries']) await expect(editor(page, id)).toBeVisible();
  expect((await page.locator('.checklist-editors').boundingBox())!.width).toBeLessThanOrEqual(760);
  const markers = page.getByRole('navigation', { name: 'Checklist markers' });
  const documents = markers.getByRole('button', { name: 'Go to checklist 2: Documents', exact: true });
  await documents.click();
  await expect(editor(page, 'documents')).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(documents).toHaveAttribute('aria-current', 'true');
  const draft = editor(page, 'documents').getByLabel('New item for Documents', { exact: true });
  await draft.fill('Keep this desktop draft');
  const titleSize = await editor(page, 'documents').locator('.inline-list-title textarea').evaluate(node => getComputedStyle(node).fontSize);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(draft).toHaveValue('Keep this desktop draft');
  await expect(documents).toHaveAttribute('aria-current', 'true');
  await expect(editor(page, 'documents').locator('.inline-list-title textarea')).toHaveCSS('font-size', titleSize);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(draft).toHaveValue('Keep this desktop draft');
  await expect(documents).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a checklist' });
  await picker.getByRole('button', { name: '3 Groceries', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(editor(page, 'groceries')).toBeFocused();
  await editor(page, 'groceries').getByRole('checkbox', { name: 'Item in Groceries', exact: true }).check();
  await expect(editor(page, 'groceries').getByText('1 completed item', { exact: true })).toBeFocused();
  await expect(markers.getByRole('button', { name: 'Go to checklist 3: Groceries', exact: true })).toHaveAttribute('aria-current', 'true');
  await expect(draft).toHaveValue('Keep this desktop draft');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: 'Close Choose a checklist', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All', exact: true })).toBeFocused();
  await editor(page, 'packing').evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await expect(markers.getByRole('button', { name: 'Go to checklist 1: Packing', exact: true })).toHaveAttribute('aria-current', 'true');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('checklists-U1-desktop.png') });
});

test('a lost creation response resolves to the saved checklist without duplicates', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'New checklist', exact: false }).click();
  await page.getByLabel('Checklist title', { exact: true }).fill('Documents');
  await page.route('**/api/commands', async route => {
    const saved = await route.fetch();
    expect(saved.ok()).toBe(true);
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic lost response' }) });
  }, { times: 1 });
  await page.getByRole('button', { name: 'Create checklist', exact: true }).click();
  await expect(page.getByLabel('Checklist title', { exact: true })).toHaveValue('Documents');
  await page.getByRole('button', { name: 'Retry creating checklist', exact: true }).click();
  await expect(page.getByLabel('New item for Documents', { exact: true })).toBeFocused();
  expect((await state(page)).data.checklists!.filter(list => list.title === 'Documents')).toHaveLength(1);
});

test('remote completion and deletion never unmount unsaved checklist text', async ({ page }) => {
  const dialogs = recordDialogs(page);
  await open(page);
  const id = await createList(page, 'Documents');
  const list = editor(page, id);
  await list.getByLabel('New item for Documents', { exact: true }).fill('Tickets');
  await list.getByLabel('New item for Documents', { exact: true }).press('Enter');
  const text = list.getByLabel('Item text: Tickets', { exact: true });
  await text.fill('My unsaved ticket details');
  const item = (await state(page)).data.checklists!.find(entry => entry.id === id)!.items[0];
  await command(page, { type: 'checklist.item.update', checklistId: id, id: item.id, status: 'done', assignee: '' });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(text).toHaveValue('My unsaved ticket details');
  await command(page, { type: 'checklist.item.delete', checklistId: id, id: item.id });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(text).toHaveValue('My unsaved ticket details');
  await text.press('Enter');
  await expect(list.getByText("Couldn't save. Your draft is still here.", { exact: true })).toBeVisible();
  await expect(text).toHaveValue('My unsaved ticket details');
  await command(page, { type: 'checklist.delete', id });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(list.getByText('This checklist was removed elsewhere.', { exact: false })).toBeVisible();
  await expect(text).toHaveValue('My unsaved ticket details');
  await list.getByRole('button', { name: 'Discard retained drafts', exact: true }).click();
  await expect(list).toHaveCount(0);
  expect(dialogs).toEqual([]);
});

test('checklists wrap long content at all target widths and remain accessible and read-only for viewers', async ({ page, browser }, testInfo) => {
  await open(page);
  await command(page, { type: 'checklist.add', id: 'long-list', title: 'Documents and reservations for our complete Belgium journey' });
  await command(page, { type: 'checklist.item.add', checklistId: 'long-list',
    title: 'Download the entire reservation confirmation, including the booking reference and the emergency contact telephone number' });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect(page.getByRole('navigation', { name: 'Checklist navigator' })).toHaveCount(0);
    await expect(page.locator('[data-checklist-id][hidden]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const create = await page.getByRole('button', { name: 'New checklist', exact: true }).boundingBox();
    const dial = await page.getByRole('complementary', { name: 'Checklist dial' }).boundingBox();
    const header = await page.getByRole('banner').boundingBox();
    expect(create!.x + create!.width).toBeLessThanOrEqual(dial!.x);
    expect(dial!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    expect((await page.locator('.checklist-editors').boundingBox())!.width).toBeLessThanOrEqual(760);
    const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations;
    expect(violations.map(violation => `${violation.id}: ${violation.nodes.map(node => node.target).join(',')}`)).toEqual([]);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: testInfo.outputPath(`checklists-${width}.png`) });
  }
  const invite = await (await page.request.post('/api/invites', { data: { name: 'Viewer', role: 'viewer', eventIds: [], placeIds: [] } })).json();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const viewer = await context.newPage();
    await viewer.goto(`/#access=${invite.token}`);
    await viewer.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Checklists', exact: true }).click();
    await expect(viewer.getByText('Read-only access.', { exact: false })).toBeVisible();
    await expect(viewer.getByRole('checkbox')).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: /^Drag / })).toHaveCount(0);
    await expect(viewer.getByRole('textbox')).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'New checklist', exact: false })).toHaveCount(0);
    expect((await state(viewer)).data.checklists).toHaveLength(2);
  } finally { await context.close(); }
});

test('long dials keep 44px markers, scroll independently and support keyboard jumps at every width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await open(page);
  for (let i = 1; i <= 24; i++) await command(page, { type: 'checklist.add', id: `list-${i}`, title: `Checklist ${i}` });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 700 });
    const nav = page.getByRole('navigation', { name: 'Checklist markers' });
    await expect(nav.getByRole('button')).toHaveCount(25);
    expect(await nav.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    const first = nav.getByRole('button').first();
    expect((await first.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await first.focus();
    await page.keyboard.press('End');
    const last = nav.getByRole('button').last();
    await expect(last).toBeFocused();
    await expect(last).toBeInViewport();
    await expect(page.getByRole('tooltip')).toContainText('Checklist 24');
    await page.keyboard.press('Enter');
    await expect(editor(page, 'list-24')).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(last).toHaveAttribute('aria-current', 'true');
  }
});
