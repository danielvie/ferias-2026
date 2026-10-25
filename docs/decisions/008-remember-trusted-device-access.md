# ADR-008: Remember trusted-device trip access without expiry

## Status

Implemented and deployed to Supabase/Pages after separate owner approval.
Supersedes ADR-003's expiring, tab-only session policy. Hosted migration 005 and
the matching API/frontend are live; see `docs/verification.md`.

## Context

The owner wants the root page to reopen the last trip, and a Trips switcher for
other trips already opened on this browser. This is a disposable personal app
used on trusted devices. The owner explicitly rejected both automatic expiry
and a proposed 30-day limit.

## Decision

Remember derived access, not reusable invitation/owner links or full snapshots.
Keep separate browser entries for each trip/member identity, scoped by backend,
project and base path. The website origin provides the outer storage boundary.
Keep the active credential tab-local and the last-selected pointer browser-local.
Explicit links take precedence; background refresh does not change recency.

Use independent entry keys rather than rewriting a whole registry. React's
`useSyncExternalStore` subscribes to local changes and cross-tab storage events.
Capture the credential and access generation before every request. Reject stale
responses, protect newer saved credentials from older 401s, and retain forgetting
markers so a late response cannot recreate removed access.

Online credentials remain script-readable, as before, but now persist across
browser restarts. PostgreSQL represents non-expiring sessions with `infinity`,
preserving existing authorization predicates. Adopt only still-valid sessions,
and remove the older per-member session-count eviction. Revocation, rotation and
sign-out remain authoritative.

SQLite retains HttpOnly cookies, using one cookie slot per trip/member. The
public `X-Trip-Identity` selector chooses its slot, never authorizes by itself.
A missing selected cookie cannot fall back to another tab's identity. Keep the
legacy current cookie for existing clients and session adoption. Zero denotes
non-expiring server access; valid legacy sessions are adopted at startup.
Refresh persistent cookies on use within browser-imposed lifetime limits.

Forget locally before contacting the server, and report unconfirmed server
sign-out if offline. Preserve an open draft when another tab forgets access,
but disable its workspace controls and writes until access is restored.

## Consequences

Anyone using the trusted browser profile can reopen its remembered identities.
This is intentional, not verified-person authentication. Clearing site data,
browser storage eviction and private-browsing cleanup can still lose saved access.
Keep private links for recovery and first access from another browser.

The online rollout requires migration `20260717000500_remembered_sessions.sql`
before publishing the frontend. SQLite must run the matching Node API before
serving the new client; do not downgrade the API while keeping that client live.

## References

- `docs/remembered-trips-spec.md`
- https://react.dev/reference/react/useSyncExternalStore#subscribing-to-a-browser-api
- https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
- https://www.postgresql.org/docs/current/datatype-datetime.html#DATATYPE-DATETIME-SPECIAL-VALUES
