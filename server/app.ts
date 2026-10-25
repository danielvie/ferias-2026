import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Store } from './store';
import { check, commandInput, createTripInput, historyInput, HttpError, id, inviteInput, object, profileInput, text } from './validation';

export interface AppOptions {
  /** ':memory:' is supported for tests. File-backed databases create their parent directory. */
  dbPath?: string;
  /** Canonical external origin. Required behind a reverse proxy; enables Secure cookies for HTTPS. */
  publicOrigin?: string;
  /** Only this built-client directory is public. Omit to disable static serving. */
  distPath?: string;
}

const COOKIE = 'trip_session';
const BODY_LIMIT = 128 * 1024;

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function cookie(req: IncomingMessage) {
  const value = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

function setCookie(res: ServerResponse, value: string, secure: boolean, expired = false) {
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${expired ? 0 : 2592000}${secure ? '; Secure' : ''}`);
}

function protectWrite(req: IncomingMessage, publicOrigin?: string) {
  const origin = req.headers.origin;
  let expected: string;
  try {
    expected = publicOrigin ?? new URL(`http://${req.headers.host}`).origin;
  } catch { throw new HttpError(400, 'Invalid request host.'); }
  if ((origin && origin !== expected) || req.headers['sec-fetch-site'] === 'cross-site') {
    throw new HttpError(403, 'Cross-origin writes are not allowed.');
  }
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'Use Content-Type: application/json.');
  }
}

function json(req: IncomingMessage): Promise<unknown> {
  if (Number(req.headers['content-length']) > BODY_LIMIT) {
    req.resume();
    return Promise.reject(new HttpError(413, 'The request body is too large.'));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0, failed = false;
    req.on('data', (chunk: Buffer) => {
      if (failed) return;
      size += chunk.length;
      if (size > BODY_LIMIT) {
        failed = true;
        chunks.length = 0;
        reject(new HttpError(413, 'The request body is too large.'));
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'Malformed JSON.')); }
    });
    req.on('error', () => reject(new HttpError(400, 'The request body could not be read.')));
    req.on('aborted', () => reject(new HttpError(400, 'The request was aborted.')));
  });
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const PRIVATE = new Set(['server', 'src', 'shared', 'tests', 'tasks', 'scripts', 'data', 'node_modules', 'package.json', 'package-lock.json']);

function contained(root: string, path: string) {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, path: string, distPath: string) {
  const segments = path.split('/').filter(Boolean);
  if (segments.some((part) => part.startsWith('.') || PRIVATE.has(part)) || path.includes('\\') || path.includes('\0')) {
    throw new HttpError(404, 'Not found.');
  }
  let root: string;
  try { root = await realpath(distPath); } catch { throw new HttpError(404, 'The built client is not available.'); }
  let file = resolve(root, `.${path}`);
  if (!contained(root, file)) throw new HttpError(404, 'Not found.');
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
  } catch {
    // Only extensionless client routes fall back to the SPA, never missing assets or private files.
    if (extname(path)) throw new HttpError(404, 'Not found.');
    file = resolve(root, 'index.html');
  }
  let real: string;
  try { real = await realpath(file); } catch { throw new HttpError(404, 'Not found.'); }
  if (!contained(root, real) || !MIME[extname(real)]) throw new HttpError(404, 'Not found.');
  const body = await readFile(real);
  res.writeHead(200, {
    'Content-Type': MIME[extname(real)], 'Content-Length': body.length, 'Cache-Control': 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

/**
 * Returns an unbound native HTTP server. Call listen() to start it and close() to
 * release both HTTP and SQLite resources. Each instance owns one SQLite connection.
 */
export function createApp(options: AppOptions = {}) {
  let publicOrigin: string | undefined;
  if (options.publicOrigin) {
    const url = new URL(options.publicOrigin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a path or credentials.');
    }
    publicOrigin = url.origin;
  }
  const secure = publicOrigin?.startsWith('https:') ?? false;
  const store = new Store(options.dbPath ?? 'data/trips.sqlite');
  const server = createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 16384 }, (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    void (async () => {
      const rawPath = (req.url ?? '/').split('?')[0];
      let path: string;
      try { path = decodeURIComponent(rawPath); } catch { throw new HttpError(400, 'Invalid request path.'); }
      if (!path.startsWith('/') || path.startsWith('//')) throw new HttpError(400, 'Invalid request path.');
      if (path !== '/api' && !path.startsWith('/api/')) {
        if (options.distPath && (req.method === 'GET' || req.method === 'HEAD')) {
          return serveStatic(req, res, path, options.distPath);
        }
        throw new HttpError(404, 'Not found.');
      }

      const method = req.method;
      const revoke = method === 'DELETE' && /^\/api\/invites\/[^/]+$/.test(path);
      const known = (method === 'GET' && ['/api/trip', '/api/invites'].includes(path)) ||
        (method === 'POST' && ['/api/trips', '/api/session', '/api/commands', '/api/invites', '/api/profile', '/api/history'].includes(path)) ||
        (method === 'DELETE' && path === '/api/session') || revoke;
      if (!known) throw new HttpError(404, 'API route not found.');
      const oldSession = cookie(req);
      if (method !== 'GET') protectWrite(req, publicOrigin);
      if (method === 'POST' && path === '/api/trips') {
        const result = store.create(createTripInput(await json(req)), oldSession);
        setCookie(res, result.sessionToken, secure);
        return send(res, 201, { snapshot: result.snapshot, ownerToken: result.ownerToken });
      }
      if (method === 'POST' && path === '/api/session') {
        const body = object(await json(req));
        const result = store.join(text(body.token, 'Token', 200), oldSession);
        setCookie(res, result.sessionToken, secure);
        return send(res, 200, result.snapshot);
      }
      if (method === 'DELETE' && path === '/api/session') {
        store.logout(oldSession);
        setCookie(res, '', secure, true);
        return send(res, 200, { ok: true });
      }

      const access = store.authenticate(oldSession);
      if (method === 'GET' && path === '/api/trip') return send(res, 200, store.snapshot(access));
      if (method === 'GET' && path === '/api/invites') return send(res, 200, store.invites(access));
      if (method === 'POST' && path === '/api/invites') {
        const input = inviteInput(await json(req));
        return send(res, 201, store.invite(store.authenticate(oldSession), input));
      }
      if (revoke) return send(res, 200, store.revoke(access, id(path.slice('/api/invites/'.length))));
      if (method === 'POST' && path === '/api/history') {
        const before = historyInput(await json(req));
        return send(res, 200, store.history(store.authenticate(oldSession), before));
      }
      if (method === 'POST' && path === '/api/profile') {
        const input = profileInput(await json(req));
        return send(res, 200, store.rename(store.authenticate(oldSession), input.previousName, input.name));
      }
      const body = object(await json(req));
      check(typeof body.revision === 'number' && Number.isSafeInteger(body.revision) && body.revision >= 0, 'Invalid revision.');
      // The body can arrive slowly. An invite may have been revoked while awaiting it.
      return send(res, 200, store.command(store.authenticate(oldSession), body.revision, commandInput(body.command)));
    })().catch((error: unknown) => {
      // Deliberately do not log request bodies, tokens, cookies, or database exceptions.
      if (!res.headersSent) send(res, error instanceof HttpError ? error.status : 500, {
        error: error instanceof HttpError ? error.message : 'An internal server error occurred.',
      });
      else res.destroy();
      req.resume();
    });
  });
  server.once('close', () => store.close());
  return server;
}
