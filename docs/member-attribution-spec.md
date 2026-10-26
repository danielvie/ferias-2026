# Spec: Member attribution

## Status

Approved for implementation in this thread. Implemented in the worktree;
verification results are recorded in `docs/verification.md`. Source publication
is approved. Hosted migrations and deployment have not been requested or performed.

## Objective

Trip collaborators can recognize their current member identity, edit their own
display name, and see who added or changed trip data. Attribution must survive
renames, deleted items, and revoked links.

This is a record of actions, not a financial ledger. A future expense feature
must distinguish the person entering a payment from its payer and beneficiaries.
Payments and bill settlement will be planned separately.

## Assumptions

- Keep link-only access. One private member link represents one logical member,
  not a verified personal account. People sharing a link share an identity.
- Reuse existing member IDs. A rename changes a label, not permissions, credentials,
  note ownership, or membership.
- Support both the Supabase application and the retained SQLite runner.
- Record actions from this feature's introduction onward. Do not infer authors
  from names in old activity messages or assign existing data to the current user.
- Add no dependencies, paid services, or account sign-in.

## User-facing behavior

### Current identity and name editing

- Show the current name and role on every page at mobile and desktop widths.
  On mobile, place the identity beneath the application brand instead of hiding it.
- Make the identity an accessible button opening the existing modal-pane pattern.
  The pane offers a labeled name field, Save, and Cancel.
- Every authenticated member can rename themselves, including viewers and family
  members. This does not permit them to edit trip content or another member.
- Apply the existing name rules: trim surrounding whitespace, require a nonempty
  value, allow at most 100 characters, and reject invalid control characters.
  Names need not be unique. IDs, never names, distinguish members.
- Update the header and current member list after a confirmed save. Preserve the
  draft and show an inline error if saving fails. Preserve focus and
  conflicting-edit protection. Closing a profile does not prompt to discard edits.
- Explain that sharing the private link also shares this identity and access.

### Change history

- Make history available from the member pane to owners, editors, and viewers.
  Family members can edit their name but cannot read trip history.
- Show newest records first, with the actor's name at the time, the action,
  the affected item, and a timestamp displayed in the trip timezone.
- Load history in bounded pages with an explicit way to load older records.
  Handle empty, loading, failed, and expired-session states.
- Keep records readable after a name changes, an item is deleted, or a member's
  access is revoked. Retain the stable member ID and the name recorded at the time.
- Cover trip creation/details, places, itinerary events, notes/comments, packing,
  departures/checks, member renames, and link creation/revocation/rotation where
  the backend supports those operations.
- Record successful writes only. Failed validation, denied access, stale saves,
  and failed transactions must not produce a successful-action record.
- The history identifies actions and targets. Full before/after content,
  field-by-field diffs, undo, search, and task assignment are not part of this change.

## Attribution and persistence rules

The existing `Activity` collection is a recent feed of at most 50 text messages.
It is not durable attribution storage. Do not parse those messages as identities,
or extend the full-trip snapshot with an ever-growing history array.

Each new history record has:

- A server-generated record ID and committed ordering.
- A server-generated operation ID grouping related changes from the same write.
- The trip ID.
- The authenticated actor's stable member ID and name at the time.
- An action identifying the successful operation.
- The affected entity type and ID, with parent context for nested checklist items
  and comments.
- A server-generated timestamp.
- Enough access metadata to enforce private-note history restrictions.

Persist the record atomically with the data change. The API must never accept an
actor ID, actor name, timestamp, or replacement history supplied by the browser.
Revalidate session access and the expected revision inside the final transaction,
including concurrent renames and revocations.

Keep history separate from the replaceable feature collections. Ordinary saves,
the 50-message feed limit, and member revocation must not erase earlier records.
History is append-only through the application API, not tamper-proof against a
database administrator. Retention is for the lifetime of the trip; no background
pruning or paid storage is introduced.

For an action that also updates related items, preserve its causal connection.
For example, scheduling a saved place can change both an event and the place's
status. Do not attribute the related change to a different member.

## Privacy and authorization

- Missing, expired, forged, wrong-trip, or revoked sessions cannot rename members
  or read history. A supplied member ID cannot choose the rename target.
- The server filters history before responding. Client-side hiding is insufficient.
- Private-note activity is visible only to the note's author. Do not expose note
  titles, bodies, comment text, or private activity through shared history.
- Changing a shared note to private must also restrict its earlier related
  history. Deletion must not widen the visibility of retained note history.
- Keep family responses free of history, private activity counts, and unrelated
  mutation timing. Family profile editing must preserve the restricted projection.
- Block direct browser database access to new history storage and privileged
  routines, following the existing deny-by-default grants and RLS rules.
- Do not store links, session tokens, credentials, or full request bodies in history.

## Stack and project structure

The repository uses React 19.3.1, TypeScript 5.9.3, Vite 8.3.5, Node 24,
Supabase CLI 2.122.0, and Deno 2.9.6. The hosted database uses PostgreSQL 17.

- `shared/`: shared domain types and pure rules.
- `server/`: shared command validation/permissions and the SQLite API/store.
- `supabase/functions/trip-api/`: the Edge API, reusing shared domain rules.
- `supabase/migrations/`: additive database migrations and restricted routines.
- `src/app/`: session transport, application shell, and member-pane integration.
- `src/components/`: existing accessible modal-pane components.
- `tests/` and colocated `*.test.*`: API, SQL, domain, and component tests.
- `tests/e2e/`: browser workflows.
- `docs/decisions/` and `CONTEXT.md`: persistent architecture and domain terminology.

## Code style

Reuse existing explicit TypeScript command types, input validation, and small
React forms. Do not add a general audit framework or duplicate domain rules in
each backend. Construct trusted input from known fields, as existing validation does:

```ts
return {
  name: text(v.name, 'Name', 100),
};
```

Use the established white/slate/blue design tokens and native modal behavior.
Identity editing is separate from owner/editor-only trip settings.

## Commands and testing strategy

Use the repository's existing commands:

```sh
task check
task online:check
task attribution:check
task db:migrate
task db:test
task online:test
task online:e2e
task test:e2e
```

- Vitest and API tests cover input validation, self-only renaming, stable IDs,
  action targets, rename/revocation survival, and rollback without phantom records.
- Embedded PostgreSQL tests cover migration semantics, restricted grants, history
  persistence beyond 50 actions, paging, and privacy transitions.
- Native local Supabase tests cover transactional races, revoked sessions,
  Edge transport, and parity with SQLite.
- `task attribution:check` uses a disposable database in the local Supabase
  PostgreSQL container, native concurrency checks, and the actual Deno entry point
  with an isolated PostgREST process. It runs the online browser suite without
  migrating the database used by the running app. This is not a hosted or
  Supabase gateway/bundling check.
- Playwright covers mobile identity visibility, name editing/reload, two distinct
  collaborators, chronological history, older pages, privacy, and family restrictions.
- Check keyboard focus, cancellation/error drafts, and axe accessibility. Inspect
  widths of 320, 768, 1024, and 1440 pixels with ordinary and long display names.
- Use isolated synthetic data and unused ports. Do not reset local or hosted trip
  data or interrupt the user's running application to run these checks.
- Report unavailable checks explicitly; a substituted check is not the same result.

## Boundaries

- Always: enforce identity and privacy server-side, preserve old data, keep writes
  atomic, and document migration/deployment order.
- Ask first: source publication, hosted migrations, deployment, any destructive
  operation, new dependencies, or changes to link-only authentication.
- Never: infer old authorship, use names as financial identifiers, commit secrets
  or real trip data, introduce payments, or change hosted billing/creation settings.

## Success criteria

1. A member can see and edit their own identity on a 320-pixel-wide screen.
2. Renaming preserves the member ID, role, link, existing sessions, and private-note
   ownership. Later actions use the new name; earlier records preserve the old name.
3. Two members changing the same item produce distinct, correctly ordered records
   identifying the actual authenticated actor and affected item.
4. History survives more than 50 subsequent actions, item deletion, link revocation,
   application restart, and page reload.
5. Failed or conflicting writes change neither the data nor successful-action history.
6. Owners cannot use history to learn another member's private-note activity.
   Family sessions cannot read history, including by calling the API directly.
7. Existing trips remain usable, with no invented attribution for older data.
8. Both backends pass the applicable tests, and unrun checks are recorded.

## Open questions

No remaining product questions within the approved scope. ADR-005 records the
storage/API decisions and coordinated deployment requirements.

## References

- Existing access model: `CONTEXT.md` and ADR-003.
- Existing command/transaction boundary: ADR-004.
- React controlled inputs and labels:
  https://react.dev/reference/react-dom/components/input#controlling-an-input-with-a-state-variable
- PostgreSQL 17 row locks and transaction lifetime:
  https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS
