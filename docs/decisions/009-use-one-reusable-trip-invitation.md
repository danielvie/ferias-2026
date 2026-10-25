# ADR-009: Use one reusable trip invitation with name-only joining

## Status

Accepted and implemented locally. Supersedes ADR-003's normal per-recipient
invitation workflow and one-time display policy for ordinary sharing.
Private member/owner links remain compatible and hashed. No hosted rollout.

## Context

The owner explicitly describes this as a disposable trusted-group app and finds
the existing sharing controls too complicated. They want Share to show a link
they can copy again, and travelers to enter their names and participate.
Role selection, family selection, named invitation setup and one-time secret
confirmations do not belong in that flow.

## Decision

Keep one random, non-expiring join token per trip, stored retrievably in a separate
private join-links table. Owners and editors can retrieve it through GET `/share`.
Create it lazily so old trips work without changing their data or identities.
This is an intentional exception to hashing all reusable credentials. It never
exposes private owner/member links or grants direct browser access to tables.

Use `#join=...` for the common invitation and retain `#access=...` for existing
identity-specific links. POST `/join/preview` returns only the trip ID and title.
Check remembered owner/editor access to that trip before offering registration.
An unavailable check is an error, not permission to create a duplicate identity.
Legacy usable cookies/tab sessions can also be adopted without registry metadata.

POST `/join` validates the name and creates a distinct editor, private underlying
member credential, session and attributed membership record transactionally.
Names may repeat. Never select an existing member by name. PostgreSQL uses the
same trip lock as mutations and access changes; SQLite uses its existing immediate
transaction. Session expiry, tab isolation and forgetting follow ADR-008.

Share is a compact link and Copy link, with selectable text if copying fails.
Private owner recovery lives in a collapsed Settings section, not a second link
on the ordinary creation/Share screen. It remains optional for normal joining.
Legacy access APIs remain; the old invitation-creation and family-selection UI
are removed from normal Share.

## Alternatives

Reusing one private editor link would make the group share one identity and its
private notes. Retaining a separate link per traveler would preserve the setup
the owner rejected. Accounts or matching members by name would either add
unwanted friction or let a label impersonate another identity.

## Consequences

Anyone with the common invitation can join, edit and pass the invitation onward.
There is no join-link rotation, expiry or account verification in this feature.
The owner accepts that policy for the trusted disposable app.

A new browser or cleared browser storage creates a new member on joining.
Entering an old name does not recover that identity or its private notes.
Author filtering is not privacy against the project administrator or an owner
who uses the retained identity-link replacement API.

Private backups now contain the retrievable common join credential. A backup
that excludes sessions cannot restore a self-joined member's original identity
merely by reopening the common invitation. Plan session-preserving backup/recovery
separately if needed; do not silently merge names or rewrite note authorship.

Deploy migration `20260717000600_simple_sharing.sql`, then the matching Edge API,
then the frontend. Keep the additive table and member rows when rolling back
the UI/API. Removing them would break new members and attribution.

## References

- `docs/simple-sharing-spec.md`
- https://react.dev/reference/react/useEffect#fetching-data-with-effects
- https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText
- https://www.postgresql.org/docs/17/sql-insert.html#SQL-ON-CONFLICT
