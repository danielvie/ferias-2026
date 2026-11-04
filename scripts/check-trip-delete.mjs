// Checks only disposable trips created here. Requires a local Supabase/Vite preview.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.TRIP_DELETE_TEST_URL || 'http://127.0.0.1:5180/';
const password = process.env.TRIP_MANAGEMENT_PASSWORD?.trim();
assert(password, 'Defina TRIP_MANAGEMENT_PASSWORD com a senha do ambiente local.');
const local = hostname => ['127.0.0.1', 'localhost', '[::1]'].includes(hostname);
assert(local(new URL(url).hostname), 'Use uma prévia local.');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : { channel: 'chrome' }) });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const created = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
// A local frontend may point at a hosted API. Never send test mutations there.
await page.route('**/*', route => local(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
const entries = () => page.evaluate(() => Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
  .filter(key => key.startsWith('belgium-together:trips:v1:') && key.includes(':entry:'))
  .map(key => JSON.parse(localStorage.getItem(key)).id));
const list = () => page.evaluate(async key => (await import('/src/app/api.ts')).api.masterTrips(key), password);
async function manage() {
  const menu = page.locator('.trip-menu');
  if (!await menu.evaluate(element => element.open)) await menu.locator('summary').click();
  await page.getByRole('button', { name: 'Minhas viagens', exact: true }).click();
  await page.getByRole('button', { name: 'Gerenciar todas as viagens', exact: true }).click();
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ver viagens', exact: true }).click();
  await page.getByRole('list', { name: 'Viagens salvas no banco' }).waitFor();
}
async function remove(trip, accept) {
  page.once('dialog', async dialog => {
    assert.equal(dialog.type(), 'confirm');
    assert(dialog.message().includes(trip.title));
    await (accept ? dialog.accept() : dialog.dismiss());
  });
  await page.locator(`[data-trip-id="${trip.id}"]`).getByRole('button', { name: /^Excluir / }).click();
}
try {
  await page.goto(url);
  assert(await page.evaluate(async () => (await import('/src/app/api.ts')).isOnlineBackend), 'A prévia deve usar Supabase local.');
  const before = (await list()).map(trip => trip.id).sort();
  const suffix = Date.now();
  for (const name of ['Excluir', 'Manter']) {
    const result = await page.evaluate(async title => (await import('/src/app/api.ts')).api.create({
      title, ownerName: 'Teste de exclusão', startDate: '2030-12-02', endDate: '2030-12-05', cities: ['Bruges'],
    }), `Teste descartável ${name} ${suffix}`);
    created.push({ id: result.snapshot.data.trip.id, title: result.snapshot.data.trip.title, token: result.ownerToken });
  }
  const [target, keep] = created;
  await page.evaluate(async ({ target, keep }) => {
    const { api, rememberedTrips } = await import('/src/app/api.ts');
    await api.join(target.token);
    rememberedTrips.setPage(rememberedTrips.capture().id, 'notes');
    const editor = await api.invite({ name: 'Outro acesso de teste', role: 'editor', eventIds: [], placeIds: [] });
    await api.join(editor.token);
    await api.join(keep.token);
  }, { target, keep });
  await page.reload();
  await page.getByRole('heading', { name: keep.title, exact: true }).waitFor();
  await manage();
  await remove(target, false);
  assert((await list()).some(trip => trip.id === target.id));
  assert.equal((await entries()).filter(id => id.startsWith(target.id + ':')).length, 2);

  const endpoint = '**/functions/v1/trip-api/master/delete';
  await page.route(endpoint, route => route.fulfill({ status: 503, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': new URL(url).origin }, body: JSON.stringify({ error: 'Falha simulada.' }) }));
  await remove(target, true);
  await page.getByRole('dialog').getByRole('alert').waitFor();
  assert((await list()).some(trip => trip.id === target.id));
  assert.equal((await entries()).filter(id => id.startsWith(target.id + ':')).length, 2);
  await page.unroute(endpoint);

  await remove(target, true);
  await page.locator(`[data-trip-id="${target.id}"]`).waitFor({ state: 'detached' });
  assert(!(await list()).some(trip => trip.id === target.id));
  assert(!(await entries()).some(id => id.startsWith(target.id + ':')));
  assert((await entries()).some(id => id.startsWith(keep.id + ':')));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'Fechar Gerenciar todas as viagens', exact: true }).click();
  await page.getByRole('heading', { name: keep.title, exact: true }).waitFor();

  await manage();
  await remove(keep, true);
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.deepEqual(await entries(), []);
  await page.reload();
  await page.getByRole('heading', { name: 'Roteiro', exact: true }).waitFor();
  assert.deepEqual(await entries(), []);
  assert.deepEqual((await list()).map(trip => trip.id).sort(), before);
  assert.deepEqual(errors, []);
  console.log('OK: cancelar, falhar sem apagar o acesso, excluir do banco e navegador, fechar a viagem ativa e recarregar.');
} finally {
  // Explicit IDs from this test only; an already-deleted ID is safe to retry.
  for (const trip of created) {
    await page.unroute('**/functions/v1/trip-api/master/delete');
    await page.evaluate(async ({ id, key }) => (await import('/src/app/api.ts')).api.masterDelete(key, id), { id: trip.id, key: password });
  }
  await browser.close();
}
