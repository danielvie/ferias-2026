import type { Page } from '@playwright/test';

export async function showTripMonth(page: Page, date: string) {
  const picker = page.getByRole('group', { name: 'Trip dates', exact: true });
  await picker.getByLabel('Calendar year', { exact: true }).fill(String(Number(date.slice(0, 4))));
  await picker.getByLabel('Calendar month', { exact: true }).selectOption(date.slice(5, 7));
  return picker.getByRole('grid', { name: 'Trip dates', exact: true });
}

export async function selectTripDates(page: Page, start: string, end: string) {
  const clear = page.getByRole('button', { name: 'Clear dates', exact: true });
  if (await clear.isEnabled()) await clear.click();
  const startGrid = await showTripMonth(page, start);
  await startGrid.locator(`button[data-date="${start}"]`).click();
  const endGrid = start.slice(0, 7) === end.slice(0, 7) ? startGrid : await showTripMonth(page, end);
  await endGrid.locator(`button[data-date="${end}"]`).click();
}
