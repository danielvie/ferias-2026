# ADR-005: Record member attribution outside the recent feed

## Status

Implemented. Source publication approved; hosted deployment is not part of it.

## Context

Collaborators need to recognize their current identity, change its name, and
identify who added or edited trip data. The existing activity feed holds only 50
text messages. Names are editable and not unique, so neither messages nor names
can identify a person reliably.

Future expenses will need stable member references, but recording an edit is not
evidence that its editor paid or owes money. Payments remain a separate feature.

## Decision

Keep link-derived logical member IDs. Expose self-only name editing through
`POST /profile` with `{ previousName, name }`. Resolve the target from the session,
never a supplied member ID or role. Compare the previous name inside the write
transaction. Every role may edit its own label, without gaining content access.
Increment the trip revision so a content write staged before a rename conflicts
rather than recording a stale actor name. Family responses still expose revision
zero and only their restricted projection.

Use separate SQLite and private Postgres history tables, not a new unbounded
collection in trip snapshots. The shared `changesBetween` function compares full
trusted states and identifies changed entities, nested checks/comments, and
automatic related updates. No-op data saves create no history record.

Append history in the same transaction as persistence. The final authorized
writer stamps the member ID, name at the time, timestamp, random record ID and
operation ID. Records from one content write share an operation ID, including
indirect changes such as marking a scheduled place planned. Edge-computed change
targets pass only through the privileged RPC; browser-supplied attribution is
ignored.

Keep actor IDs independent of member foreign-key deletion. History survives
revocation and deletion of its affected item. Labels describe non-note targets as
they were at the time; never copy note/comment titles or content into history.
There is no invented backfill for old trips.

`POST /history` accepts `{ before: string | null }` and returns up to 50 records
plus an optional older-page cursor. Cursors are visible record UUIDs, resolved
within the authorized trip. Internal sequence counters and restricted records
never reach the browser. Owners, editors and viewers can read permitted history;
family links cannot. Record details disclose stable IDs on demand instead of
filling the main list with identifiers.

Private-note records belong only to the note author. Making a note private also
restricts its earlier note/comment records. These restrictions persist through
deletion and later resharing. History payloads are append-only through the API;
access metadata can tighten. New note activity is omitted from the old global
feed because even a generic message reveals private activity and its timing.

## Alternatives

- Keeping more text messages still loses structured identities, target references
  and privacy control. Rejected.
- Appending all history to the full snapshot grows every load/save and exposes
  counters for hidden actions. Rejected.
- Requiring accounts would change the agreed access model. Separate member links
  remain necessary to distinguish people.
- Full before/after snapshots, an event-sourced trip, or a financial ledger would
  retain unnecessary private content and expand the feature. Rejected.

## Consequences

The attribution record is not tamper-proof against database administrators.
Retention lasts for the trip's lifetime; there is no automatic pruning or paid
storage. Existing private-link trust and recovery limits remain.

The new public commit routine requires server-computed changes. Its unaudited
predecessor is moved behind the private schema. Old Edge writers fail closed
until the matching API is deployed. Coordinate a brief no-edit window, apply the
reviewed migration, deploy the matching API, then publish the frontend. Retain
the audited API/database when rolling back the frontend; do not drop history or
restore an unaudited writer as a shortcut.

Migration `20260717000400_member_attribution.sql` follows the existing
`20260717000300_repeat_city_visits` version from other work. Its missing source
was recovered from the local database's recorded migration SQL when preparing
the rebased preview. No migration history was rewritten and no trip data were
reset. Reconcile migration history before applying to any existing target.

Initial validation did not migrate the shared local database. The later local
preview applies the additive attribution migration through normal startup.
`task attribution:check` creates and
cleans a disposable database/login and loopback PostgREST process using the
existing Docker images. It runs pgTAP, native races, and Pages-path workflows
through the actual Deno entry point. `TRIP_BIND_HOST=127.0.0.1` keeps that standalone
entry point local; the Supabase container's default listener is unchanged.

## References

- `docs/member-attribution-spec.md`
- ADR-003 and ADR-004 for link identity and transactional authorization.
- https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS
- https://react.dev/reference/react-dom/components/input#controlling-an-input-with-a-state-variable
- https://docs.deno.com/api/deno/~/Deno.ServeTcpOptions#property_hostname
