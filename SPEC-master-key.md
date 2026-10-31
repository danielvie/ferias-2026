# Master-key trip access

## Agreed behavior

One randomly generated master key works in local and hosted Supabase when the
operator configures the same key in both. Entering it lists that database's
trips. Selecting a trip opens its existing owner identity, exactly as its owner
recovery link does. Existing links keep working. No new admin identity, member
impersonation selector, data synchronization, or SQLite implementation is added.

The owner can see their own private notes, not another member's private notes.
Edits retain normal owner attribution and revision checks.

## Implementation and security

- React 19.3.1 and Vite 8.3.5 reuse the existing modal, trip list styling and
  remembered-session transport. The master key stays only in component memory
  until the picker closes; it never enters a URL or web storage.
- Migration 009 adds a private, disabled-by-default master-key hash and tagged
  owner sessions. PostgreSQL foreign-key deletion revokes those sessions when
  the key is replaced or disabled. Ordinary link-derived sessions are unaffected.
- The Edge API accepts POST `/master/trips` and `/master/open`, with the existing
  origin, body-size, no-cache, rate-limit and privacy rules. Only the service role
  can call their database routines; only the database operator can set the hash.
- The CLI generates 32 random bytes into a new owner-readable ignored file.
  Setup requires an explicit local or hosted target. Hosted setup additionally
  requires the exact project reference. Only the SHA-256 hash reaches SQL.
- Master access grants full owner capabilities. A holder can issue or replace
  independent trip links; replacing the master key does not revoke those links.
- No key is enabled by applying the migration. No hosted deployment or source
  publication is part of the implementation without separate approval.

## Files and style

Database access belongs in `supabase/migrations/`, HTTP handling in
`supabase/functions/trip-api/handler.ts`, UI/transport in `src/app/`, operator
tooling in `scripts/`, and tests in `tests/`. Follow existing typed intent APIs:

```ts
masterOpen: (key: string, tripId: string) =>
  exchangeSession('/master/open', { key, tripId }),
```

The editable UI source is `master-key-access.excalidraw`. Reuse current button,
field, list and modal styles. Include locked, listing, empty, failure and opening
states on phone and desktop. No new styling system or dependency.

## Verification

- `npm test -- tests/master-key.test.ts`: real migrations and Edge handler,
  invalid/disabled credentials, role grants, list projection, owner identity,
  private-note filtering, normal edits, key replacement and unchanged links.
- `npm test`: regression suite, including transport and operator-tool tests.
- `npm run build`: TypeScript and production build.
- `task online:check`: pinned Deno Edge typecheck.
- `TRIP_TEST_GREP='master key' node scripts/test-attribution.mjs`: browser
  workflows against an isolated local PostgreSQL database, never the hosted DB.
- `task attribution:check`: full native permission, concurrency and browser
  regression checks against the same disposable fixture.

The default Playwright headless-shell executable was unavailable on this machine.
Browser validation used the installed Chrome via
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'`.
The picker passed axe checks at 320, 768, 1024 and 1440 pixels. No live key was
generated or enabled during implementation.

Always preserve existing trips, identities, links and data. Never commit keys,
enable access by default, weaken browser database permissions, or use a
service-role key in the UI. Ask before deploying or publishing to shared main.

## Sources

- PostgreSQL 17 foreign keys and cascading deletion:
  https://www.postgresql.org/docs/17/ddl-constraints.html#DDL-CONSTRAINTS-FK
- React controlled password inputs and labels:
  https://react.dev/reference/react-dom/components/input
