# Spec: City dates in Places

## Status

Implementation requested. Deployment and landing remain separate.

## Objective

Let travelers scan Places to see their city checkpoints in route order, the
planned arrival and departure dates for each checkpoint, and its checklists.
Editors can set the dates from a calendar in Places. A scheduled activity
outside its checkpoint's dates is easy to spot.

A checkpoint is one visit, not a unique city name. Repeated visits to the same
city have separate dates, activities and checklists.

## Agreed behavior

- Show each checkpoint's arrival and departure dates in the Places overview,
  including when its activity details are collapsed. Show an unset state when
  dates have not been planned.
- Owners and editors can set, change and clear dates using a calendar in
  Places. Dates are optional. Viewers cannot edit them.
- Allow overlapping city stays, including arrival and departure on the same
  day and visits to multiple cities on the same day.
- Keep activities attached to their checkpoint when the route is reordered.
  Changing city dates or route order does not reschedule activities or bookings.
- When both dates are set, highlight an activity if any of its scheduled
  calendar entries falls outside the stay. Show a warning on the collapsed
  checkpoint too. Unscheduled activities do not produce a date warning.
- Keep the existing city checklist slot and checklist behavior.

## Proposed details for review

These are assumptions, not decisions already made by the user.

- Treat both arrival and departure dates as inclusive. For example, an activity
  on the departure date is within the stay.
- Accept a same-day stay. Reject a departure before arrival. Allow a user to
  clear the dates again without changing activities.
- Permit each endpoint to be unset independently, but only evaluate mismatches
  when both endpoints are present. Show whichever date has been set.
- Restrict entered dates to the trip's date range. If the trip is shortened
  past saved city dates, preserve them and show a warning.
- Base activity warnings on calendar entries linked by `placeId`. An activity
  with multiple scheduled entries is warned if at least one is out of range.
  The checkpoint warning counts affected activities, not individual entries.
- Show warnings as text or an accessible icon with an explanation, not color
  alone. Keep the checkpoint warning visible even if activity filters hide the
  affected activity.

## Persistence and access

- Store dates on the individual checkpoint, preserving its stable ID and route
  order. Existing checkpoints start without dates; do not infer dates from
  activities or alter existing records' other data.
- Use a narrow, revision-checked command with the existing server-side
  validation, permission and history mechanisms. Preserve date edits through
  trip settings, checkpoint insertion, reordering and activity moves.
- Support both the SQLite server and Supabase Edge API. Changes to the
  normalized Supabase city storage must be additive and preserve existing
  trips. Check older-client write paths so they cannot silently erase dates.
- Respect family-link privacy. Warning indicators and counts must not reveal
  activities or calendar entries excluded from the viewer's snapshot.
  City dates are not included in family-link snapshots.
- Keep failed saves and revision conflicts visible and retain the user's date
  draft for retry. Do not replace a full trip snapshot from the client.

## Interface and accessibility

- Keep the route compact on desktop and mobile. Show dates, warning state and
  checklist controls without opening a separate page.
- A separate calendar button in each city row opens the anchored range picker
  without expanding the checkpoint or moving its checklist and activities.
  Saved dates appear beside the same button. The picker overlays the route,
  keeps the date draft until Save, and supports independent endpoints.
- Use a keyboard-accessible date picker with explicit arrival and departure
  labels, visible focus and an accessible way to clear dates. Ensure touch
  targets are at least 44 px.
- Preserve the existing checkpoint selection, reorder and checklist controls.
  A warning must identify the affected activity and explain the mismatch.
- Share the proposed and selected UI states in an editable root-level
  `.excalidraw` file before implementation, consistent with project rules.

## Implementation context

- React 19, TypeScript, Vite, and the existing CSS tokens and components.
- `shared/` owns trip types and shared date rules; `server/` owns commands,
  validation, permissions and SQLite persistence.
- `supabase/` owns online storage and migrations. `src/features/places/` owns
  the Places presentation. Calendar entries already link to activities by
  `placeId`.
- Follow the project's discriminated command style. For example, an existing
  command is `{ type: 'place.move', id, cityId, beforeId }`; the exact date
  command and storage representation are implementation decisions.
- Unit and API tests live in `shared/` and `tests/`; browser tests live in
  `tests/e2e/`.

## Verification

- `npm test` covers date validation, warning boundaries, multiple scheduled
  entries, empty dates, persistence, permissions, revision conflicts and
  existing data compatibility.
- `npm run build` typechecks the contracts and builds the client.
- `npm run test:e2e -- tests/e2e/places-route.spec.ts` covers setting, changing
  and clearing dates; collapsed and expanded warnings; moving a checkpoint;
  overlapping stays; keyboard operation; and reload persistence.
- Check 320, 768, 1024 and 1440 px widths, long names and accessible warning
  labels. Verify SQLite and Supabase persistence using isolated test data.
- Verify settings edits and older write paths preserve dates. Test family
  projections against hidden-activity and hidden-event leaks.

## Boundaries

- Always preserve activities, bookings, checklist content, existing IDs and
  permissions. Do not automatically shift scheduled dates.
- Ask before hosted database migration, deployment, publication or landing on
  a shared branch. Spec approval is not deployment or landing authorization.
- Never reset existing trip data, commit credentials or expose hidden data in
  warnings.

## Access assumption

Family-link viewers do not see city dates until their sharing scope is agreed.
