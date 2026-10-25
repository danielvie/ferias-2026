# ADR-001: Feature modules and server-enforced capability sharing

## Status

Accepted for the first implementation.

## Context

The repository started with a visual proposal and no application. The user requested parallel implementation with responsibilities assigned to modules and the strategy pattern where useful. Sharing must work between devices without exposing private notes or treating disabled buttons as authorization.

## Decision

Use React and TypeScript for the client, Vite for development and build, and Node's HTTP and SQLite APIs for the backend. Require Node 24 or later. SQLite is a single-server durable store, not a multi-region or serverless database.

Feature directories own forms and presentation. `shared/model.ts` owns data and mutation contracts. The app context owns loading, saves, refreshes and conflict handling. The server owns validation, authorization, privacy projections and persistence.

Use a strategy registry for two rules that genuinely vary:

- Packing requires items packed and remains checked throughout the trip. A departure checklist accepts done or explicitly skipped items and is copied anew for every transfer.
- Role permissions and response projections distinguish owner, editor, viewer and family access. Family responses are built from an explicit allowlist.

Use high-entropy, revocable invitation capabilities rather than introducing an unconfigured identity provider. Opening a fragment link exchanges its token for an HttpOnly cookie. Sharing a capability gives its holder that role; it does not prove their identity. Owners must retain their private recovery link. Links are not emailed automatically.

Send intent commands, not whole-state replacements. Optimistic revisions reject stale mutations. The client refreshes and preserves the form for review. No automatic overwrite or misleading offline-save claim.

Shared itinerary edits neither rewrite private notes nor fail because of their hidden references. Private notes retain their original city, place or day context if that destination is later removed. Authors choose a valid destination when editing the note again. Shared notes retain normal reference validation.

## Alternatives

Local storage is simpler but cannot provide real cross-device sharing or server-side access control. A hosted identity and database provider is a reasonable future choice but requires an account, credentials and deployment decisions. A generic plugin architecture adds complexity without helping these feature boundaries.

## Consequences

The app can be run locally without API keys. Sharing with other people requires a reachable server, HTTPS, `PUBLIC_ORIGIN`, and persistent disk. Each browser session opens one trip at a time. Invitation holders can forward their links. A revoked invite stops its existing sessions as well as new joins.

Server-backed saves do not imply offline availability. This release has no offline synchronization, file uploads, expense ledger, live train data or automatic booking integration. An authenticated identity provider and abuse controls should be considered before opening trip creation to the public.

## Official references

- [React context](https://react.dev/reference/react/useContext#passing-data-deeply-into-the-tree) supports feature modules sharing one app-owned state boundary.
- [Vite guide](https://vite.dev/guide/) documents the HTML entry, dev server and production build.
- [Node 24 SQLite API](https://nodejs.org/docs/latest-v24.x/api/sqlite.html#class-databasesync) documents the version-compatible synchronous database API and prepared statements. SQLite remains experimental in earlier Node 24 releases.
