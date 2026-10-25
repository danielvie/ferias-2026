# ADR-004: Share commands with the Edge API

## Status

Implemented and locally verified. Hosted deployment is pending.

## Context

The SQLite application already validates commands, stamps authorship, handles private notes and constructs family-safe snapshots. Rewriting those rules in SQL would introduce a second permission model. Supabase RPC calls also cannot hold a database transaction open while TypeScript runs in the Edge Function.

## Decision

Reuse `server/commands.ts`, `server/validation.ts`, `server/permissions.ts` and `shared/checklists.ts` directly from the Edge Function. They use explicit TypeScript imports and Web Crypto so Node and Deno execute the same domain rules.

Store each feature collection in separate private rows with an ID, ordered JSON payload and trip foreign key. Comments and departure items remain nested under their parent. Trip details, cities, logical members, capability hashes and sessions have separate relational tables. No browser role can read these tables or execute the privileged routines.

The Edge API loads a consistent raw state through a server-only RPC, validates and applies one command, then submits that state with the original revision. The commit RPC locks the trip, resolves the session again, checks expiry/revocation/role and compares the revision before persisting anything. If the state changed between those RPCs, the whole write fails with 409. A revoked credential fails with 401 even if the earlier read succeeded.

The commit also rejects changes to another member's private note or its authorship. Before responding, the Edge handler always runs the shared snapshot projection. Raw state is not a browser API response.

Use `X-Trip-Session` for the browser's opaque derived credential. Keep it in project/base-path-scoped `sessionStorage`, never the long-lived private link. The privileged database request uses only the Edge Function's injected server key, not the incoming browser credential. Supabase Auth is not initialized.

## Alternatives

- Duplicating every domain command in PL/pgSQL would keep validation inside one RPC but create two implementations to maintain. Rejected for this small application.
- Replacing one broad trip JSON document would require fewer tables but obscure domain boundaries. Separate feature rows preserve those boundaries without translating every nested form field into SQL columns.
- Calling tables directly from the browser would expose private data or require another custom authorization mechanism inside every policy. Rejected.

## Consequences

Each save uses an optimistic read/apply/commit sequence. Permission and revision checks in the final transaction are mandatory, not optional optimizations. Future writers and access changes must use the same trip lock.

The raw state RPC is privileged. Do not grant it to `anon` or `authenticated`, or return it without projection. The service role intentionally has routine execution but no direct private-schema privileges.

The old SQLite runner remains available only to preserve existing local data during rollout. There is no automatic import or fallback from a failing Supabase request to SQLite.

Default operational limits are ten trips, twenty active links per trip, twenty retained sessions per member after exchange, a 24-hour session lifetime, a 128 KiB request body and a 2 MiB saved trip payload. Creation is disabled by default. Global creation/exchange/write limits reduce accidental growth but do not protect a public function from all quota-exhaustion attacks.

## Verification

The real local Supabase HTTP integration covers the Edge runtime, PostgREST void responses, CORS, feature commands, privacy and link rotation. Native concurrent tests cover stale writes and revocation between reading state and committing. Browser tests exercise cross-origin transport and a non-root Pages path.

## References

- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/functions/cors
- https://docs.postgrest.org/en/stable/references/api/functions.html
- https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS
