import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import type { TripCommand, TripSnapshot } from '../../shared/model';

async function read(page: Page): Promise<TripSnapshot> {
  const response = await page.request.get('/api/trip');
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function command(page: Page, command: TripCommand) {
  const state = await read(page);
  const response = await page.request.post('/api/commands', { data: { revision: state.revision, command } });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<TripSnapshot>;
}
async function setup(page: Page) {
  const response = await page.request.post('/api/trips', { data: { title: 'Nossa viagem', ownerName: 'Daniel',
    startDate: '2030-12-02', endDate: '2030-12-15', cities: ['Liège', 'Bruges', 'Liège', 'Cidade fora do mapa'] } });
  expect(response.ok()).toBeTruthy();
  const created = await response.json();
  const state = created.snapshot as TripSnapshot;
  const [first, bruges, back] = state.data.trip.cities;
  await command(page, { type: 'visit.dates', id: first.id, arrivalDate: '2030-12-03', departureDate: '2030-12-05' });
  await command(page, { type: 'visit.dates', id: bruges.id, arrivalDate: '2030-12-05', departureDate: '2030-12-06' });
  await command(page, { type: 'visit.dates', id: back.id, arrivalDate: '2030-12-08', departureDate: '2030-12-09' });
  const place = { id: randomUUID(), cityId: bruges.id, title: 'Subir a torre', category: 'sight' as const, status: 'idea' as const,
    description: 'Confirmar ingresso.', address: 'Markt', url: '', durationMinutes: 60, cost: '' };
  await command(page, { type: 'place.save', place });
  const event = { id: randomUUID(), cityId: bruges.id, title: 'Passear pelos canais', date: '2030-12-05', startTime: '14:00', endTime: '15:00',
    kind: 'activity' as const, status: 'tentative' as const, placeId: '', description: 'Passeio compartilhado.' };
  await command(page, { type: 'event.save', event });
  await command(page, { type: 'event.save', event: { ...event, id: randomUUID(), cityId: first.id, title: 'Sair de Liège', startTime: '09:00', endTime: '10:00', kind: 'transport' } });
  await command(page, { type: 'note.save', note: { id: randomUUID(), title: 'Hotel em Bruges', body: 'Ainda precisamos reservar.', visibility: 'trip', linkType: 'city', linkId: bruges.id } });
  await command(page, { type: 'note.save', note: { id: randomUUID(), title: 'Nota privada do Daniel', body: 'Não compartilhar.', visibility: 'private', linkType: 'day', linkId: '2030-12-05' } });
  await page.goto(`/#access=${created.ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Nossa viagem', exact: true })).toBeVisible();
  return { first, bruges, back, place, event };
}

test('map and date selection preserve visits, all day events, empty days and revision', async ({ page }) => {
  const { first, back } = await setup(page);
  const original = await read(page);
  await expect(page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button')).toHaveText(['Roteiro', 'Notas', 'Listas']);
  await page.getByRole('button', { name: 'Selecionar Bruges', exact: true }).click();
  await expect(page.getByLabel('Dia da viagem')).toHaveValue('2030-12-05');
  await expect(page.locator('.roteiro-event')).toHaveCount(2);
  await expect(page.locator('.roteiro-multi-city')).toContainText('Liège');
  await page.getByLabel('Parada da viagem').selectOption(back.id);
  await expect(page.getByLabel('Dia da viagem')).toHaveValue('2030-12-08');
  await page.getByLabel('Parada da viagem').selectOption(first.id);
  await expect(page.getByLabel('Dia da viagem')).toHaveValue('2030-12-03');
  await page.getByLabel('Dia da viagem').fill('2030-12-02');
  await expect(page.locator('.day-empty')).toContainText('Nada agendado');
  const unknown = original.data.trip.cities[3];
  await page.getByLabel('Parada da viagem').selectOption(unknown.id);
  await expect(page.locator('.roteiro-city-context')).toContainText('ainda não tem datas');
  expect((await read(page)).revision).toBe(original.revision);
  expect((await read(page)).data.events).toEqual(original.data.events);
});

test('the selected stop shows a distinct landmark or the generic illustration', async ({ page }) => {
  const cities = ['Bruges', 'Gent', 'Antwerpen', 'Bruxelles', 'Liege', 'Maastricht',
    'Eindhoven', 'Helmond', 'Asten', 'Valkenburg', 'Cidade fora do mapa'];
  const response = await page.request.post('/api/trips', { data: { title: 'Símbolos do roteiro', ownerName: 'Daniel',
    startDate: '2030-12-02', endDate: '2030-12-15', cities } });
  expect(response.ok()).toBeTruthy();
  const { ownerToken, snapshot } = await response.json() as { ownerToken: string; snapshot: TripSnapshot };
  await page.goto(`/#access=${ownerToken}`);

  const illustration = page.locator('.roteiro-city-heading .roteiro-illustration');
  const picker = page.getByLabel('Parada da viagem');
  await expect(illustration).toHaveAttribute('aria-hidden', 'true');
  await expect(illustration).toHaveAttribute('viewBox', '0 0 300 180');
  const generic = await illustration.innerHTML();
  const landmarks = new Set<string>();
  for (const city of snapshot.data.trip.cities.slice(0, -1)) {
    await picker.selectOption(city.id);
    await expect(illustration).toHaveAttribute('viewBox', '0 0 160 96');
    landmarks.add(await illustration.innerHTML());
  }
  expect(landmarks.size).toBe(10);
  await picker.selectOption(snapshot.data.trip.cities.at(-1)!.id);
  await expect(illustration).toHaveAttribute('viewBox', '0 0 300 180');
  expect(await illustration.innerHTML()).toBe(generic);
});

test('ideas remain separate, quick-add draft survives tabs, and scheduling persists', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Selecionar Bruges', exact: true }).click();
  await page.getByRole('button', { name: /Ideias da cidade/ }).click();
  const draft = page.locator('.checkpoint-quick-add input');
  await draft.fill('Tomar chocolate');
  await page.getByRole('button', { name: 'Atividades do dia', exact: true }).click();
  await page.getByRole('button', { name: /Ideias da cidade/ }).click();
  await expect(draft).toHaveValue('Tomar chocolate');
  await page.locator('.checkpoint-quick-add button[type=submit]').click();
  await expect(draft).toHaveValue('');
  let state = await read(page);
  const added = state.data.places.find(place => place.title === 'Tomar chocolate')!;
  expect(added).toBeTruthy();
  expect(state.data.events.some(event => event.placeId === added.id)).toBe(false);
  await page.locator(`[id="activity-schedule-${added.id}"]`).click();
  await expect(page.locator('input[name=date]')).toHaveValue('2030-12-05');
  await expect(page.locator('.places-form-fields input[name=startTime]')).toHaveValue('');
  await expect(page.locator('.places-form-fields input[name=endTime]')).toHaveValue('');
  await page.locator('.checkpoint-form-area .places-form-fields button[type=submit]').click();
  await expect(page.locator('.places-form-fields input[name=date]')).toHaveCount(0);
  state = await read(page);
  const scheduled = state.data.events.find(event => event.placeId === added.id);
  expect(scheduled).toMatchObject({ date: '2030-12-05', startTime: '', endTime: '' });
  await page.getByRole('button', { name: 'Atividades do dia', exact: true }).click();
  await expect(page.locator('.roteiro-event')).toContainText(['Sair de Liège', 'Passear pelos canais', 'Tomar chocolate']);
  await expect(page.getByRole('list', { name: 'Sem horário' })).toContainText('Tomar chocolate');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Notas', exact: true }).click();
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Roteiro', exact: true }).click();
  await expect(page.getByLabel('Dia da viagem')).toHaveValue('2030-12-05');
  await page.reload();
  await expect(page.getByLabel('Dia da viagem')).toHaveValue('2030-12-05');
  await expect(page.locator('.roteiro-event')).toHaveCount(3);
  await expect(page.getByRole('list', { name: 'Sem horário' })).toContainText('Tomar chocolate');

  await page.getByRole('button', { name: 'Editar Tomar chocolate', exact: true }).click();
  const form = page.locator('.calendar-form-fields');
  await form.locator('input[name=date]').fill('2030-12-04');
  await form.locator('input[name=startTime]').fill('12:00');
  await form.getByRole('button', { name: 'Salvar atividade' }).click();
  await expect(form.getByRole('alert')).toHaveText('Preencha o início e o fim.');
  await form.locator('input[name=endTime]').fill('13:00');
  await form.getByRole('button', { name: 'Salvar atividade' }).click();
  await expect(form).toHaveCount(0);
  await page.getByLabel('Dia da viagem').fill('2030-12-04');
  await expect(page.locator('.roteiro-event')).toContainText('Tomar chocolate');
  await expect(page.locator('.roteiro-event time')).toHaveText('12:00');
  await expect(page.getByRole('list', { name: 'Sem horário' })).toHaveCount(0);
  await expect(page.getByText('A ordem da rota difere', { exact: false })).toHaveCount(0);
  expect((await read(page)).data.events.find(event => event.id === scheduled!.id)).toMatchObject({
    date: '2030-12-04', startTime: '12:00', endTime: '13:00', placeId: added.id,
  });
});

test('adds an activity without a time on mobile and only warns for overlapping times', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const { event } = await setup(page);
  await page.getByLabel('Dia da viagem').fill(event.date);
  await page.getByRole('button', { name: `Adicionar atividade em ${event.date}`, exact: true }).click();
  const form = page.locator('.calendar-form-fields');
  await form.getByLabel('Título').fill('Comprar chocolates');
  await form.getByRole('button', { name: 'Salvar atividade' }).click();
  await expect(page.getByRole('list', { name: 'Sem horário' })).toContainText('Comprar chocolates');
  await expect(page.locator('.roteiro-event-warning')).toHaveCount(0);

  await page.getByRole('button', { name: 'Editar Comprar chocolates', exact: true }).click();
  await form.locator('input[name=startTime]').fill('14:30');
  await form.locator('input[name=endTime]').fill('15:30');
  await expect(form.getByText(`Horário coincide com ${event.title}`, { exact: false })).toBeVisible();
  await form.getByRole('button', { name: 'Salvar atividade' }).click();
  await expect(page.getByRole('list', { name: 'Sem horário' })).toHaveCount(0);
  await expect(page.locator('.roteiro-event').filter({ hasText: 'Comprar chocolates' }).locator('time')).toHaveText('14:30');
});

test('saves provisional transport without hours in the day agenda', async ({ page }) => {
  const { event } = await setup(page);
  await page.getByLabel('Dia da viagem').fill(event.date);
  await page.getByRole('button', { name: `Adicionar atividade em ${event.date}`, exact: true }).click();
  const form = page.locator('.calendar-form-fields');
  await form.getByLabel('Título').fill('Trem para Bruges');
  await form.getByLabel('Tipo').selectOption('transport');
  await expect(form.getByLabel('Início')).toHaveAttribute('required', '');
  await form.getByLabel('Situação').selectOption('tentative');
  await expect(form.getByLabel('Início')).not.toHaveAttribute('required');
  await form.getByRole('button', { name: 'Salvar atividade' }).click();
  const row = page.getByRole('list', { name: 'Sem horário' }).getByRole('listitem').filter({ hasText: 'Trem para Bruges' });
  await expect(row).toContainText('Provisório · Transporte');
  expect((await read(page)).data.events.find(item => item.title === 'Trem para Bruges')).toMatchObject({
    kind: 'transport', status: 'tentative', startTime: '', endTime: '', date: event.date,
  });
});

test('agenda shows edit and delete without expanding activity details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const { event } = await setup(page);
  await page.getByLabel('Dia da viagem').fill(event.date);
  const row = page.locator('.roteiro-event').filter({ hasText: event.title });
  const details = row.locator('details');
  const edit = row.getByRole('button', { name: `Editar ${event.title}`, exact: true });
  const remove = row.getByRole('button', { name: `Excluir ${event.title}`, exact: true });
  await expect(details).toHaveJSProperty('open', false);
  await expect(edit).toBeVisible();
  await expect(remove).toBeVisible();
  const toggle = details.locator('.roteiro-event-toggle');
  await edit.hover();
  await expect(edit).toHaveCSS('background-color', 'rgb(232, 238, 224)');
  await toggle.hover();
  await expect(toggle).toHaveCSS('background-color', 'rgb(232, 238, 224)');
  await toggle.click();
  await expect(details).toHaveJSProperty('open', true);
  await expect(toggle.locator('svg')).toHaveCSS('transform', 'matrix(-1, 0, 0, -1, 0, 0)');
  await details.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveJSProperty('open', false);
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Editar atividade', exact: true })).toBeVisible();
  await expect(page.locator('.calendar-form-fields input[name=title]')).toHaveValue(event.title);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(edit).toBeFocused();
  await expect(details).toHaveJSProperty('open', false);
  const confirm = row.getByRole('button', { name: `Confirmar exclusão de ${event.title}`, exact: true });
  const cancel = row.getByRole('button', { name: `Cancelar exclusão de ${event.title}`, exact: true });
  await remove.click();
  await toggle.hover();
  await expect(confirm).toHaveCSS('background-color', 'rgb(163, 60, 43)');
  await expect(cancel).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(row.locator('.roteiro-event-controls')).toHaveCSS('column-gap', '8px');
  expect((await read(page)).data.events.some(item => item.id === event.id)).toBe(true);
  await cancel.click();
  await expect(edit).toBeVisible();
  await expect(remove).toBeVisible();
  await remove.click();
  await confirm.click();
  await expect(row).toHaveCount(0);
  expect((await read(page)).data.events.some(item => item.id === event.id)).toBe(false);
});

test('event editing retains conflict drafts and prevents changing context until closed', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Selecionar Bruges', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar atividade em 2030-12-05' }).click();
  await page.locator('.calendar-form-fields input[name=title]').fill('Novo passeio');
  await expect(page.getByLabel('Dia da viagem')).toBeDisabled();
  await command(page, { type: 'packing.add', title: 'Mudança remota', assignee: '' });
  await page.locator('.calendar-form-fields button[type=submit]').click();
  await expect(page.getByRole('alert')).toContainText('Someone changed the trip');
  await expect(page.locator('.calendar-form-fields input[name=title]')).toHaveValue('Novo passeio');
  await page.locator('.calendar-form-fields button[type=submit]').click();
  await expect(page.locator('.calendar-form-fields')).toHaveCount(0);
  await expect(page.getByLabel('Dia da viagem')).toBeEnabled();
  expect((await read(page)).data.events.some(event => event.title === 'Novo passeio')).toBe(true);
});

test('context notes use current permissions; modal supports Escape and restores focus', async ({ page, browser }) => {
  const { event } = await setup(page);
  await page.getByRole('button', { name: 'Selecionar Bruges', exact: true }).click();
  const note = page.locator('.roteiro-notes').getByRole('button', { name: /Hotel em Bruges/ });
  await note.click();
  await expect(page.getByRole('dialog')).toContainText('Ainda precisamos reservar');
  await page.keyboard.press('Escape');
  await expect(note).toBeFocused();
  for (const role of ['viewer', 'family'] as const) {
    const invite = await page.request.post('/api/invites', { data: { name: role, role, eventIds: [event.id], placeIds: [] } });
    expect(invite.ok()).toBeTruthy();
    const { token } = await invite.json();
    const context = await browser.newContext();
    const guest = await context.newPage();
    await guest.goto(`/#access=${token}`);
    await guest.getByRole('button', { name: 'Selecionar Bruges', exact: true }).click();
    await expect(guest.getByRole('button', { name: /Adicionar atividade em/ })).toHaveCount(0);
    await expect(guest.locator('.roteiro-event-controls')).toHaveCount(0);
    await expect(guest.locator('body')).not.toContainText('Nota privada do Daniel');
    if (role === 'family') {
      await expect(guest.locator('.roteiro-notes')).toHaveCount(0);
      await expect(guest.locator('.roteiro-city-checklists')).toHaveCount(0);
      await expect(guest.locator('.roteiro-event')).toHaveCount(1);
    }
    await context.close();
  }
});

test('organizer preserves visit selection and existing route operations', async ({ page }) => {
  const { bruges } = await setup(page);
  const original = await read(page);
  await page.getByRole('button', { name: 'Selecionar Bruges', exact: true }).click();
  await page.getByRole('button', { name: 'Organizar rota', exact: true }).click();
  await expect(page.locator('#places-route')).toBeVisible();
  await page.locator('.checkpoint-open').filter({ hasText: 'Bruges' }).click();
  await expect(page.locator('#checkpoint-details')).toContainText('Subir a torre');
  await page.locator('.route-menu summary').click();
  await page.getByRole('button', { name: 'Mover para antes', exact: true }).click();
  await expect(page.locator('.route-visit-item').first()).toHaveAttribute('data-visit-id', bruges.id);
  expect((await read(page)).data.events).toEqual(original.data.events);
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  expect((await read(page)).data.trip.cities).toEqual(original.data.trip.cities);
  await page.getByRole('button', { name: 'Voltar ao roteiro', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Organizar rota', exact: true })).toBeFocused();
  await expect(page.getByLabel('Dia da viagem')).toHaveValue('2030-12-05');
});

test('phone map starts collapsed and returns focus after selecting a city', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  const map = page.locator('.roteiro-map-disclosure');
  await expect(map).not.toHaveAttribute('open');
  await map.locator('summary').click();
  await page.getByRole('button', { name: 'Selecionar Bruges', exact: true }).click();
  await expect(map).not.toHaveAttribute('open');
  await expect(map.locator('summary')).toBeFocused();
  await expect(page.getByLabel('Dia da viagem')).toHaveValue('2030-12-05');
});

test('moving an idea keeps its identity and linked notes', async ({ page }) => {
  const { place, back } = await setup(page);
  await command(page, { type: 'note.save', note: { id: randomUUID(), title: 'Nota da torre', body: 'Conferir o horário.', visibility: 'private', linkType: 'place', linkId: place.id } });
  await page.reload();
  await page.getByRole('button', { name: 'Selecionar Bruges', exact: true }).click();
  await page.getByRole('button', { name: /Ideias da cidade/ }).click();
  await page.locator(`[id="activity-move-${place.id}"]`).click();
  await page.getByLabel('Parada de destino', { exact: true }).selectOption(back.id);
  await page.getByRole('button', { name: 'Mover atividade', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const state = await read(page);
  expect(state.data.places.find(item => item.id === place.id)?.cityId).toBe(back.id);
  expect(state.data.notes.find(note => note.title === 'Nota da torre')?.linkId).toBe(place.id);
  await expect(page.getByLabel('Parada da viagem')).toHaveValue(back.id);
});

test('desktop and phone layouts keep map, agenda, ideas and notes accessible', async ({ page }, testInfo) => {
  await setup(page);
  await page.getByRole('button', { name: 'Selecionar Bruges', exact: true }).click();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole('button', { name: 'Atividades do dia', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(scan.violations.map(item => item.id)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`roteiro-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: /Ideias da cidade/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
