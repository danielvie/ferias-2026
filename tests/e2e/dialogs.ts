import type { Page } from '@playwright/test';

export function recordDialogs(page: Page) {
  const messages: string[] = [];
  page.on('dialog', async dialog => {
    messages.push(dialog.message());
    await dialog.dismiss();
  });
  return messages;
}
