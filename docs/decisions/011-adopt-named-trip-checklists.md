# ADR-011: Adopt packing into named trip checklists

## Status

Implemented in the worktree. Not deployed or applied to the shared local database.
The approved scope is `SPEC-checklists.md`, now using U1 from
`checklists-focused-layout.excalidraw` at every width.

## Context

The checklist page used large per-item controls and offered only one trip-wide
packing list. The user selected named, directly editable lists with compact rows,
a desktop navigator and a mobile dial. City/departure interactions are deferred.
Existing packing content, assignment and history must survive. The user later
selected U1 to remove the visual split between desktop and mobile.

## Decision

Store one ordered collection of named checklists, each with stable identity, title
and nested items. A trip starts with checklist `packing`. Adopting an existing
packing list copies its items without changing IDs, status or assignment.

SQLite adopts old documents on load and writes the canonical collection on the
next mutation. New writes omit the old packing array. Supabase migration 007
creates an RLS-protected checklist table and adopts all existing packing rows in
order. It retains the retired packing table rather than dropping user data.

The snapshot's `packing` field is derived from checklist `packing`, and old
packing commands operate on that same list. This preserves existing consumers
without two editable copies. Deleting that checklist produces an empty legacy
projection and never resurrects old rows. Historical packing-item targets keep
their existing type/IDs; new lists and items use separate checklist targets.

Use the existing validated commands, revision conflicts, role projection and
transactional history. Owners/editors can mutate, viewers read, and family
snapshots contain no checklists. Each trip has at most 100 lists and each list
uses the existing 2000-item limit.

Keep editors mounted when switching desktop lists or changing screen width.
Pin dirty item editors through remote completion/deletion and retain a removed
list while it has drafts. While Checklists stays open, explicit discard removes
those retained drafts. Leaving the page or cancelling a draft follows main's
deletion-only confirmation policy and does not prompt. Pending saves still block
in-app navigation. The dial jumps directly and respects reduced motion. It does
not copy the itinerary's touch preview step.

U1 uses that same continuous page and dial on desktop. There is no named sidebar,
hidden selected editor or responsive component replacement. The desktop reading
column is capped at 760 px; controls keep the mobile styling and 44 px targets.
Width changes re-anchor the active list without moving focus. Height-only changes
do not jump, so a software keyboard can resize the viewport normally. At the page
bottom, a chosen short checklist remains active while its heading is visible,
even when it cannot scroll far enough to align with the header.

The itinerary and checklist dials share a tick-emphasis helper and CSS growth
formula. Checklist amplitude is independently tuned to 16.38 px at full growth,
with 7 px rest width, halfway neighbors and unchanged thickness. A content-sized
summary shows the list title and total count. It is dismissible and hoverable,
and keyboard focus exposes the same summary without changing direct touch jumps.

Item reordering uses the installed dnd-kit sortable preset with activator listeners
only on a six-dot grip. Each completion section has its own context, so sorting
cannot change completion. The narrow `checklist.item.move` intent inserts an item
before a sibling or at the end; it preserves all item fields and rejects
cross-section targets. SQLite and Supabase already persist the ordered nested
array, so no additional migration is needed. Relative order changes of surviving
items record one parent-list history change; additions/deletions retain their
existing per-item records without duplicate parent history.

## Alternatives

Adding custom lists alongside a separate packing editor would retain two
different editing/data rules. Duplicating packing into a new editable collection
would create competing sources of truth. Replacing every old command/history
target at once would needlessly break existing consumers and attribution.
Browser-only lists would not be shared or durable.

## Consequences and rollout

The database must reject older writers even when they can read the new state:
an old handler edits only the derived packing array. Migration 007 therefore
requires an explicit `p_checklist_version: 1` capability on `trip_commit`.
Missing checklist data or capability fails closed without changing the trip.

After separate target/deployment approval, back up, apply migration 007 after
001–006, deploy the matching Edge API, then publish the frontend. Avoid writes
between the migration and API update; older API content saves fail during that
window. Do not roll back to an API that lacks checklist support. Do not reset or
drop the database to make versions match.

SQLite needs no schema reset. Its next successful write adopts a legacy document.
Do not roll back to a pre-checklist writer after canonical documents are saved.

## Sources

- React 19 refs for focus, measurement and scroll access:
  https://react.dev/learn/manipulating-the-dom-with-refs
- Stable component positions and keys preserve draft state:
  https://react.dev/learn/preserving-and-resetting-state
- Browser scrolling and fixed-header offsets:
  https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView
- Native modal behavior reused by the full-name picker:
  https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal
- Measured tooltip placement before paint:
  https://react.dev/reference/react/useLayoutEffect#measuring-layout-before-the-browser-repaints-the-screen
- Handle-based sortable lists and pointer/touch constraints for the installed
  dnd-kit core 6/sortable 10 packages:
  https://docs.dndkit.com/presets/sortable
  https://docs.dndkit.com/api-documentation/sensors/pointer
