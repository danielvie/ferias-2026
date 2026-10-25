# Supabase migration

## Current state

The database migrations, Edge API and browser transport are implemented and locally verified. They preserve calendar, places, notes/comments, checklists, family redaction and link-only roles without Supabase Auth users or application sign-in.

`task run` starts the online-target stack locally. The separate `task run:sqlite` runner preserves the original application. Hosted deployment is pending owner authentication, the Free-plan check and publication approval. See `docs/online-setup.md`.

Existing SQLite data and `.env.local` are unchanged. This migration does not import the existing trip.

## Run the local database

Use Node 24 or later and an already installed, running Docker-compatible runtime. The Supabase CLI is pinned in `package.json`, not installed globally.

```sh
npm ci
task db:start
task db:test
```

`db:start` prepares a project-scoped, loopback-only Docker network, starts the local stack and applies pending migrations. The first run downloads container images. Local Studio opens at http://127.0.0.1:54323. The API and database use ports 54321 and 54322. The published ports bind to `127.0.0.1`, without changing Docker's global settings.

The CLI still prints a generic warning that its ports bind to `0.0.0.0`. Docker's actual port mappings were verified as loopback-only. If an existing project network lacks that restriction, the startup helper refuses to continue. Stop it with `task db:stop`, then use `task db:start` to recreate the network safely.

These tasks do not sign in, link to the hosted project, use `.env.local`, or require cloud credentials. Supabase Auth, Storage and Analytics are disabled in this local configuration. The CLI can print generated local development keys; do not copy backend keys into frontend env files or share terminal captures containing them.

After adding another migration:

```sh
task db:migrate
task db:test
```

Stop without deleting data:

```sh
task db:stop
```

`task clean` does not remove database volumes, SQLite data or env files. There is no reset/drop task. Do not use `supabase db reset` or `supabase stop --no-backup` on a database you want to keep.

## Access boundary

The thirteen tables live in the non-exposed `trip_private` schema. All have RLS enabled with no browser policies. Schema/table privileges are explicitly revoked from `anon`, `authenticated` and `service_role`. Only the migration owner can access them directly.

The fifteen public routines are executable only by the server-side `service_role`. They use `SECURITY DEFINER`, an empty `search_path`, and fully qualified application objects. The Edge Function validates requests and calls them with its injected server key. The publishable key alone cannot execute them.

| Routine | Purpose |
| --- | --- |
| `trip_create` | Create trip details, ordered cities, an owner, a link hash and a session hash atomically |
| `trip_open` | Exchange an active link hash for a new session hash while preserving member identity |
| `trip_read` | Read trip metadata, the resolved member and revision using an active session |
| `trip_update_details` | Save trip details for an owner/editor with an expected-revision check |
| `trip_end_session` | End one derived session without revoking the reusable link |
| `trip_revoke_link` | Owner-only revocation of another member's link and all its derived access |
| `trip_rate_limit` | Bound global creation, exchange and command request rates |
| `trip_state` | Read raw state for the trusted handler, never directly for a browser |
| `trip_commit` | Reauthorize and compare the revision before atomically saving a validated command result |
| `trip_create_online` | Create a complete trip with packing seeds, subject to the creation switch and trip limit |
| `trip_open_online` | Exchange a link, clean expired sessions and cap retained sessions |
| `trip_invitations` | List active non-owner links for an owner |
| `trip_invite` | Issue a role-bound link with validated family selections |
| `trip_revoke_member` | Revoke the current link for a logical member |
| `trip_rotate` | Replace a credential while preserving identity and private-note authorship |

`trip_read` remains the foundation metadata contract. The Edge handler uses `trip_state`, applies the shared privacy projection, and returns a full `TripSnapshot`. Family responses have revision `0`, including when a caller tries to infer revisions through rejected commands. Trip title, dates and city names remain shared with family.

The Edge handler generates independent cryptographically random 32-byte link/session tokens and hashes them with SHA-256 before calling these routines. They accept lowercase hex hashes, not raw bearer credentials. Session expiry defaults to 24 hours and is checked against the database clock. The browser keeps only the derived session in app-scoped `sessionStorage` and sends it as `X-Trip-Session`, with cross-site cookies omitted.

Reads, saves, exchanges and revocations lock the trip row before checking current credentials. A save checks the role and expected revision under the same lock. Future access-changing routines must follow that lock order and recheck credentials after waiting. Do not authorize a write from a previously cached member record.

Owner revocation is deliberately rejected; use **Replace owner link** in Share instead. Do not add a public recovery endpoint or grant browser roles execute access as a shortcut. The app defaults to disabled creation until explicitly enabled. `task run` enables it only in the local Docker database.

## Tests and limits

- `npm test -- tests/supabase-migration.test.ts` runs 17 tests against embedded PostgreSQL 18.6 via PGlite. It executes the actual migration, not a mocked SQL implementation. It covers creation, role/grant checks, link exchange, expiry, rollback, stale revisions, cross-trip isolation and revocation.
- `task db:test` runs 37 pgTAP assertions and four multi-connection tests against local Supabase PostgreSQL 17. The pgTAP fixtures roll back. The concurrency tests delete only the synthetic trips they create.
- `task online:check` checks the Edge entrypoint with pinned Deno.
- `task online:test` runs the real local Edge runtime through PostgREST, including void RPC responses and gateway CORS.
- `task online:e2e` tests browser sessions, isolated identities, family revocation and owner rotation under `/ferias-2026/`.
- `task backup:check` verifies private-note/authorship restoration using synthetic data in disposable databases.

Both suites passed. The native concurrency tests confirm stale-write rejection, revocation while a write waits on the trip lock, and expiry while a read waits on that lock. A separate lifecycle check confirmed a synthetic trip, member and session survive `db:stop` followed by `db:start`; its fixture was removed afterward.

Three unit tests cover creation/reuse of the loopback-only network and refusal of an unsafe existing network. Studio's local SQL snippets are ignored by Git because they can contain private queries.

The Edge and browser checks prove local cross-origin transport, not the hosted deployment. Hosted permissions, project status and two-device access must still be checked after publication. The local Kong gateway can answer OPTIONS with `*`; cookie-free browser requests work and the handler still rejects unrelated origins on actual requests.

## Hosted application and rollback

Apply both migrations in order and deploy the Edge Function as described in `docs/online-setup.md`. Publishing only the static frontend does not create the backend.

Deployment will need authenticated Supabase CLI access through secure tooling. A publishable key is not a migration credential. Never send a database password, secret/service-role key or CLI access token in chat.

The owner has approved saving the source to the public GitHub repository. Hosted cutover still needs authentication and confirmation of the actual Free plan. No hosted writes or data imports have happened. The import decision is still open.

To pause local work, stop the stack and use `task run:sqlite` for the old trip. Preserve both stores rather than deleting volumes. There is no automatic synchronization or fallback between them.

## Sources

- Pinned CLI and local lifecycle: https://supabase.com/docs/guides/local-development/cli/getting-started
- Database policy tests: https://supabase.com/docs/guides/database/testing
- Grants and RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Transaction row locks: https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS
- Project-scoped port binding: https://docs.docker.com/engine/network/drivers/bridge/#default-host-binding-address
- pgTAP assertions: https://pgtap.org/documentation.html
