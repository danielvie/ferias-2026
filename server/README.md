# Trip server

Run with Node >=24 and `npx tsx server/index.ts`. The installed Node 25.6 runtime still emits an experimental warning for `node:sqlite`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | HTTP bind address |
| `PORT` | `3001` | HTTP port |
| `DB_PATH` | `data/trips.sqlite` | SQLite file on durable disk |
| `PUBLIC_ORIGIN` | Request origin derived from `Host` | Canonical external HTTP(S) origin; set explicitly behind a proxy |
| `NODE_ENV` | unset | `production` enables serving the built `dist` directory |

Use HTTPS and set `PUBLIC_ORIGIN` before public deployment. HTTPS origins enable the session cookie's `Secure` attribute. Cookies are always `HttpOnly` and `SameSite=Strict`. JSON writes must have a matching `Origin` when present; requests marked cross-site are rejected. Clients without an `Origin` header can use the API, but they must still send `Content-Type: application/json`, including on DELETE requests.

## Embedding and tests

```ts
import { createApp } from './app';

const server = createApp({
  dbPath: ':memory:',
  publicOrigin: 'http://127.0.0.1:5173',
  // distPath: '/absolute/path/to/dist',
});
server.listen(3001, '127.0.0.1');
// server.close(callback) also closes this instance's SQLite connection.
```

`createApp` returns an unbound native `http.Server`. Omit `distPath` to disable static serving. Only built assets are public. Source, database files, dotfiles and symlinks escaping `distPath` return JSON 404s. Extensionless client routes fall back to `index.html`; API routes never do.

## Data and authorization rules

- A trip is one JSON document with a revision in SQLite. Members and sessions have separate tables. Foreign keys delete every session for a revoked member. `BEGIN IMMEDIATE` transactions protect revision checks and writes across connections.
- Share returns one stable, retrievable 256-bit join token per trip. A new visitor supplies a name and receives a distinct editor identity. The common join token cannot open an existing member's identity. Private member/owner tokens and session tokens remain SHA-256 hashes in storage. Access has no automatic expiry; signing out or revoking a member invalidates its sessions. Creating/joining another trip preserves earlier access.
- Every command carries the last observed revision. Stale writes return 409. Invitation creation and revocation also increment the revision, so reload the trip after changing access.
- Unknown JSON fields never become domain fields. Bad schemas or references return 422, malformed JSON returns 400, oversized bodies return 413, and non-JSON writes return 415. Request bodies are limited to 128 KiB.
- Owners and editors mutate trip content and retrieve the common join link. Only owners manage legacy private invitations. Viewers and family links are read-only. A private note is visible and mutable only to its author, including when another member is the owner. Shared notes are editable by owners and editors; only the author can make a shared note private.
- Note titles, bodies and comments never enter the global activity log. This also prevents older activity from leaking content when a shared note becomes private. Activities describe the operation and actor and retain only the newest 50 entries.
- Family snapshots contain only explicitly selected places and non-stay events. Descriptions and booking fields are blank, links to unselected places are cleared, and all notes, packing, departures and activity are empty. The member list contains only the session member. Required trip IDs, city IDs and the fixed timezone remain for compatibility with the shared snapshot schema.
- Changing trip dates or cities is rejected if it would invalidate any event, departure or note link. Deleting a place clears event links and moves linked notes to the trip. Scheduling a place marks it planned. New departures get fresh strategy checklist items and IDs.

The database contains unencrypted trip content and private notes. Keep its directory and backups private, on durable storage. The default directory is created with mode `0700`. Application privacy rules do not protect against someone who can read the server's disk. This server does not log request bodies or credentials.

## Runtime sources

The implementation uses the Node 24 baseline APIs verified in the official documentation:

- [DatabaseSync, bound statements, in-memory databases and close](https://nodejs.org/docs/latest-v24.x/api/sqlite.html#class-databasesync).
- [Native HTTP server and request streams](https://nodejs.org/docs/latest-v24.x/api/http.html#httpcreateserveroptions-requestlistener).

It does not rely on newer `StatementSync.close()` or tag-store APIs.
