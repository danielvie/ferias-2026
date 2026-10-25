import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { expect, it } from 'vitest';
import { createApp } from '../server/app';
import viteConfig from '../vite.config';

it('allows browser-origin trip creation through the development proxy without PUBLIC_ORIGIN', async () => {
  const api = createApp({ dbPath: ':memory:' });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const target = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const rule = viteConfig.server!.proxy!['/api'];
  let vite: ViteDevServer | undefined;
  try {
    vite = await createViteServer({
      ...viteConfig,
      configFile: false,
      plugins: [],
      optimizeDeps: { noDiscovery: true, include: [] },
      server: {
        ...viteConfig.server,
        host: '127.0.0.1',
        port: 0,
        hmr: false,
        ws: false,
        watch: null,
        proxy: { '/api': typeof rule === 'string' ? target : { ...rule, target } },
      },
    });
    await vite.listen();
    const origin = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`;
    const input = {
      title: 'Belgium proxy regression', ownerName: 'Traveler',
      startDate: '2030-06-01', endDate: '2030-06-06', cities: ['Brussels'],
    };
    const create = (requestOrigin: string) => fetch(`${origin}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: requestOrigin },
      body: JSON.stringify(input),
    });
    const response = await create(origin);
    expect(response.status, await response.clone().text()).toBe(201);
    expect((await response.json()).snapshot.data.trip.title).toBe(input.title);
    expect((await create('https://unrelated.example')).status).toBe(403);
  } finally {
    await vite?.close();
    api.closeAllConnections();
    await new Promise<void>((resolve, reject) => api.close((error) => error ? reject(error) : resolve()));
  }
}, 15_000);
