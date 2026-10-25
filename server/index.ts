import { resolve } from 'node:path';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be a valid TCP port.');
const host = process.env.HOST ?? '127.0.0.1';
const server = createApp({
  dbPath: process.env.DB_PATH ?? 'data/trips.sqlite',
  publicOrigin: process.env.PUBLIC_ORIGIN,
  distPath: process.env.NODE_ENV === 'production' ? resolve('dist') : undefined,
});
server.listen(port, host, () => {
  console.log(`Trip server listening on ${host}:${(server.address() as { port: number }).port}`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { server.close(); });
}
