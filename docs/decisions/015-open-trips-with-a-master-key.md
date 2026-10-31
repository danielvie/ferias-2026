# ADR-015: Open trips with a master key

## Status

Implemented in the worktree. Enabling a key and deploying online remain separate.

## Context

The operator needs to find and open trips without keeping each recovery link.
The user explicitly chose the same key for local and hosted Supabase, and asked
for normal owner access rather than a separate administrative workspace.

## Decision

An operator-generated 32-byte random key lists trips and exchanges for a normal
session belonging to the selected trip's existing owner. It does not create a
member, rotate the owner's link, or change trip content or revision. Edits and
history continue to use the owner's identity. The owner can read their own
private notes, but cannot read another author's private notes through this flow.

Each database stores only SHA-256 of the key in a private, RLS-protected table.
Both databases accept the same raw key when provisioned from the same private
file. Applying the migration alone enables nothing.

The key is sent only in POST JSON over the app's existing HTTPS or loopback API.
The picker holds it in memory until it closes; it never enters URLs, local
storage, session storage or remembered-trip entries. Only the derived per-trip
session is remembered, following existing trusted-browser behavior.

Master-derived sessions reference the configured key. Replacing or disabling
it deletes those sessions without revoking ordinary links or ordinary sessions.
Configuration locks the key and affected trips before deletion; a waiting
operation must reauthorize after revocation. Opening locks the key before the
trip so key replacement cannot race a new grant. Reapplying the same key is a
no-op and preserves sessions.

This is full owner access, not a restricted recovery role. A key holder can
replace owner links or issue other links using the existing application. Key
revocation does not undo those actions or revoke independently issued links.

## Alternatives

Separate environment keys would reduce the effect of a local leak, but the user
explicitly chose one key. Any leak therefore requires replacement in both
environments; their configuration updates are not a distributed transaction.

A new admin identity would change note ownership and history attribution.
Returning owner links would expose persistent credentials and bypass scoped
session revocation. Both conflict with the requested normal-owner experience.
Supabase service-role keys never belong in a browser or this workflow.

## Rollout

Apply migration 009, then deploy the matching Edge API and frontend. Only then
provision the chosen key. Existing clients and links continue working throughout.
Hosted deployment and publication require separate approval. See
[master-key setup](../master-key.md).

The selected UI uses the existing modal and list styles, with locked, listed,
empty and error states in
[master-key-access.excalidraw](../../master-key-access.excalidraw).

## Sources

- https://www.postgresql.org/docs/17/ddl-constraints.html#DDL-CONSTRAINTS-FK
- https://www.postgresql.org/docs/17/explicit-locking.html
- https://react.dev/reference/react-dom/components/input
