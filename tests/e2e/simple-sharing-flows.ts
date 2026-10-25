import { expect, test, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { join } from 'node:path';
import type { TripSnapshot } from '../../shared/model';

export function simpleSharingTests({
  create, snapshot,
}: {
  create: (page: Page, title?: string) => Promise<string>;
  snapshot: (page: Page) => Promise<TripSnapshot>;
}) {
  const navigate = async (page: Page, name: string) => {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click();
  };
  const share = async (page: Page) => {
    await navigate(page, 'Share');
    await expect(page.getByLabel('Trip invitation link', { exact: true })).toBeVisible();
    return page.getByLabel('Trip invitation link', { exact: true }).inputValue();
  };
  const joinTrip = async (page: Page, link: string, name: string) => {
    await page.goto(link);
    const pane = page.getByRole('dialog', { name: 'Join trip', exact: true });
    await expect(pane.getByLabel('Your name', { exact: true })).toBeFocused();
    await pane.getByLabel('Your name', { exact: true }).fill(name);
    await pane.getByRole('button', { name: 'Join trip', exact: true }).click();
    await expect(pane).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Your profile: ${name}, editor`, exact: true })).toBeVisible();
  };
  const note = async (page: Page, title: string) => {
    await navigate(page, 'Notes');
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill(title);
    await page.getByLabel('Note text', { exact: true }).fill('Synthetic private note');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  };

  // These workflows handle synthetic bearer credentials. Do not retain traces.
  test.use({ trace: 'off' });
  test.describe('simple sharing', () => {
    test('shows and copies the same invitation link after leaving Share and reloading', async ({ page, context }) => {
      await create(page, 'Reusable sharing trip');
      await expect(page.getByRole('button', { name: "I've saved it", exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Private owner recovery link', { exact: true })).toHaveCount(0);
      const link = await share(page);
      expect(new URL(link).hash).toMatch(/^#join=/);
      await expect(page.getByLabel('Recipient name', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('combobox', { name: 'Access role', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: "I've saved this link", exact: true })).toHaveCount(0);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.getByRole('button', { name: 'Copy link', exact: true }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
      await expect(page.getByRole('status')).toContainText('Link copied');
      await navigate(page, 'Itinerary');
      expect(await share(page)).toBe(link);
      await page.reload();
      expect(await share(page)).toBe(link);
    });

    test('lets travelers use one invitation with distinct names, editable plans and private notes', async ({ page, browser }) => {
      await create(page, 'Group sharing trip');
      const link = await share(page);
      const first = await browser.newContext(), second = await browser.newContext();
      try {
        const ana = await first.newPage(), bob = await second.newPage();
        await joinTrip(ana, link, 'Ana');
        await joinTrip(bob, link, 'Bob');
        const a = await snapshot(ana), b = await snapshot(bob);
        expect(a.session.id).not.toBe(b.session.id);
        expect(a.data.trip.id).toBe(b.data.trip.id);
        await ana.reload();
        await note(ana, 'Ana private note');
        await bob.reload();
        await note(bob, 'Bob private note');
        await ana.reload();
        await navigate(ana, 'Notes');
        await expect(ana.getByRole('heading', { name: 'Ana private note', exact: true })).toBeVisible();
        await expect(ana.getByRole('heading', { name: 'Bob private note', exact: true })).toHaveCount(0);
        await ana.getByRole('button', { name: 'Settings', exact: true }).click();
        await ana.getByLabel('Trip name', { exact: true }).fill('Group trip edited by Ana');
        await ana.getByRole('button', { name: 'Save trip details', exact: true }).click();
        await bob.reload();
        await expect(bob.getByRole('heading', { name: 'Group trip edited by Ana', exact: true })).toBeVisible();
        await bob.getByRole('button', { name: 'Your profile: Bob, editor', exact: true }).click();
        await expect(bob.getByRole('list', { name: 'Recorded changes' })).toContainText('Ana changed trip');
        await bob.getByRole('button', { name: 'Close Your profile', exact: true }).click();
        expect(await share(bob)).toBe(link);
        expect((await snapshot(page)).data.notes).toEqual([]);
      } finally { await first.close(); await second.close(); }
    });

    test('remembers joined travelers and reuses their identity when reopening the invitation', async ({ page, browser }) => {
      await create(page, 'Returning sharing trip');
      const owner = await snapshot(page), link = await share(page);
      const guestContext = await browser.newContext();
      try {
        const guest = await guestContext.newPage();
        await joinTrip(guest, link, 'Returning traveler');
        const identity = (await snapshot(guest)).session.id;
        await guest.goto(link);
        await expect(guest.getByRole('dialog', { name: 'Join trip', exact: true })).toHaveCount(0);
        await expect(guest.getByRole('button', { name: 'Your profile: Returning traveler, editor', exact: true })).toBeVisible();
        expect((await snapshot(guest)).session.id).toBe(identity);
        const fresh = await guestContext.newPage();
        await fresh.goto(link);
        await expect(fresh.getByRole('button', { name: 'Your profile: Returning traveler, editor', exact: true })).toBeVisible();
        expect((await snapshot(fresh)).session.id).toBe(identity);
        await guest.evaluate(() => sessionStorage.clear());
        await guest.goto('./');
        await expect(guest.getByRole('button', { name: 'Your profile: Returning traveler, editor', exact: true })).toBeVisible();
        expect((await snapshot(guest)).session.id).toBe(identity);
        await page.goto(link);
        await expect(page.getByRole('button', { name: /Your profile: .+, owner/ })).toBeVisible();
        expect((await snapshot(page)).session.id).toBe(owner.session.id);
        expect((await snapshot(page)).members).toHaveLength(2);
      } finally { await guestContext.close(); }
    });

    test('retries Share and join failures without losing the name or another remembered trip', async ({ page, browser }) => {
      await create(page, 'Invitation destination');
      await page.route('**/share', route => route.fulfill({ status: 503, json: { error: 'Temporary sharing failure' } }));
      await navigate(page, 'Share');
      await expect(page.getByRole('alert')).toHaveText('Temporary sharing failure');
      await page.unroute('**/share');
      await page.getByRole('button', { name: 'Retry loading link', exact: true }).click();
      const link = await page.getByLabel('Trip invitation link', { exact: true }).inputValue();
      const guestContext = await browser.newContext();
      try {
        const guest = await guestContext.newPage();
        await create(guest, 'Previous remembered trip');
        await guest.route('**/join/preview', route => route.fulfill({ status: 503, json: { error: 'Temporary preview failure' } }));
        await guest.goto(link);
        const pane = guest.getByRole('dialog', { name: 'Join trip', exact: true });
        await expect(pane.getByRole('alert')).toHaveText('Temporary preview failure');
        await guest.unroute('**/join/preview');
        await pane.getByRole('button', { name: 'Retry opening link', exact: true }).click();
        await pane.getByLabel('Your name', { exact: true }).fill('Keep this name');
        await guest.route('**/join', route => route.fulfill({ status: 503, json: { error: 'Temporary join failure' } }));
        await pane.getByRole('button', { name: 'Join trip', exact: true }).click();
        await expect(pane.getByRole('alert')).toHaveText('Temporary join failure');
        await expect(pane.getByLabel('Your name', { exact: true })).toHaveValue('Keep this name');
        guest.once('dialog', dialog => dialog.accept());
        await pane.getByRole('button', { name: 'Cancel', exact: true }).click();
        await guest.goto('./');
        await expect(guest.getByRole('heading', { name: 'Previous remembered trip', exact: true })).toBeVisible();
        await guest.unroute('**/join');
        await joinTrip(guest, link, 'Keep this name');
        await guest.getByRole('button', { name: 'Trips', exact: true }).click();
        await expect(guest.getByRole('list', { name: 'Remembered trips' }).getByRole('listitem')).toHaveCount(2);
      } finally { await guestContext.close(); }
    });

    test('opens a pasted invitation and keeps existing drafts protected', async ({ page, browser }) => {
      await create(page, 'Pasted invitation trip');
      const link = await share(page);
      const guestContext = await browser.newContext();
      try {
        const guest = await guestContext.newPage();
        await create(guest, 'Original drafting trip');
        await navigate(guest, 'Notes');
        await guest.getByRole('button', { name: 'New note', exact: true }).click();
        await guest.getByLabel('Title', { exact: true }).fill('Unsaved draft');
        guest.once('dialog', dialog => dialog.dismiss());
        await guest.getByRole('button', { name: 'Trips', exact: true }).click();
        await expect(guest.getByLabel('Title', { exact: true })).toHaveValue('Unsaved draft');
        await expect(guest.getByRole('dialog')).toHaveCount(0);
        guest.once('dialog', dialog => dialog.accept());
        await guest.getByRole('button', { name: 'Trips', exact: true }).click();
        guest.once('dialog', dialog => dialog.accept());
        await guest.getByRole('button', { name: 'Open trip link', exact: true }).click();
        await guest.getByLabel('Invitation or owner recovery link', { exact: true }).fill(link);
        await guest.getByRole('button', { name: 'Open trip', exact: true }).click();
        const pane = guest.getByRole('dialog', { name: 'Join trip', exact: true });
        await expect(pane).toContainText('Pasted invitation trip');
        await pane.getByLabel('Your name', { exact: true }).fill('Pasted link traveler');
        let release!: () => void;
        const wait = new Promise<void>(resolve => { release = resolve; });
        let requests = 0;
        await guest.route('**/join', async route => {
          requests += 1;
          await wait;
          await route.continue();
        });
        await pane.getByRole('button', { name: 'Join trip', exact: true }).click();
        await expect(pane.getByRole('button', { name: 'Joining…', exact: true })).toBeDisabled();
        await expect(pane.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
        release();
        await expect(pane).toHaveCount(0);
        expect(requests).toBe(1);
        await expect(guest.getByRole('heading', { name: 'Pasted invitation trip', exact: true })).toBeVisible();
      } finally { await guestContext.close(); }
    });

    test('selects the invitation for manual copying when the clipboard is unavailable', async ({ page }) => {
      await create(page, 'Manual copy trip');
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      });
      const link = await share(page);
      await page.getByRole('button', { name: 'Copy link', exact: true }).click();
      const field = page.getByLabel('Trip invitation link', { exact: true });
      await expect(field).toBeFocused();
      await expect(page.getByRole('status')).toContainText('Copy it using your browser or keyboard');
      expect(await field.evaluate((element: HTMLInputElement) => element.selectionEnd! - element.selectionStart!)).toBe(link.length);
    });

    test('keeps Share and joining accessible at mobile and desktop widths', async ({ page, browser }) => {
      await create(page, 'Accessible sharing trip');
      const link = await share(page);
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(violations.map(item => item.id)).toEqual([]);
        if (process.env.DELTA_SCRATCH_DIR && [320, 1440].includes(width)) {
          await page.screenshot({ path: join(process.env.DELTA_SCRATCH_DIR, `share-${width}.png`),
            fullPage: true, mask: [page.getByLabel('Trip invitation link', { exact: true })] });
        }
      }
      const guestContext = await browser.newContext();
      try {
        const guest = await guestContext.newPage();
        await guest.goto(link);
        const pane = guest.getByRole('dialog', { name: 'Join trip', exact: true });
        await expect(pane.getByLabel('Your name', { exact: true })).toBeFocused();
        for (const width of [320, 768, 1024, 1440]) {
          await guest.setViewportSize({ width, height: 1000 });
          expect(await guest.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
          const { violations } = await new AxeBuilder({ page: guest }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
          expect(violations.map(item => item.id)).toEqual([]);
        }
        await pane.getByLabel('Your name', { exact: true }).fill('  ');
        await pane.getByRole('button', { name: 'Join trip', exact: true }).click();
        await expect(pane.getByRole('alert')).toHaveText('Enter your name to join the trip.');
        await pane.getByLabel('Your name', { exact: true }).fill('Keyboard traveler');
        await pane.getByLabel('Your name', { exact: true }).press('Enter');
        await expect(pane).toHaveCount(0);
        await expect(guest.getByRole('button', { name: 'Your profile: Keyboard traveler, editor', exact: true })).toBeVisible();
      } finally { await guestContext.close(); }
    });
  });
}
