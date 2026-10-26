# Checklists: U1 shared dial

## Status

Implemented in the worktree. U1 in `checklists-focused-layout.excalidraw`
supersedes the earlier desktop G/mobile M1.A split. The user approved one
continuous checklist page and one dial at every width. The persistence scope
is unchanged. Hosted migration, deployment and landing remain separate.

## Objective

Let trip members create and edit named checklists without the large cards and
repeated controls of the current page. Use compact, Google Keep-style rows.
City-transition behavior is deferred.

## Selected interaction

- Desktop and mobile show all checklists in one continuous page with a right-edge
  dial. There is no desktop sidebar or hidden selected-list editor.
  Tapping a marker jumps directly to its checklist, without a preview or a
  separate detail screen. The active marker follows scrolling.
- Desktop uses a reading column no wider than 760 px. Rows, titles, completion
  controls and dial targets use the same styling at every width.
- The dial uses checklist order, not trip dates. An All control opens a picker
  showing full checklist names. A long dial scrolls rather than shrinking its
  touch targets.
- Hover or keyboard focus grows the tick and grows immediate neighbors halfway,
  using the itinerary's shared emphasis rule. Checklist widths are 7 px at rest,
  16.38 px at full growth and 11.69 px for neighbors. Numbers stay fixed.
- A content-sized summary card shows the title and total item count, including
  completed items. It has 10/12 px padding and a 256 px width cap. Escape, leaving
  the rail/card, or jumping dismisses it. Touch still jumps directly.
- New checklist creates an inline title draft. Saving the title creates the
  checklist and focuses its first item. It appends to the page at every width.
- Members edit titles and item text directly. Enter adds an item and keeps the
  next-item field ready for typing.
- Pending items stay compact. Completed items have checked boxes and struck
  text in a collapsible section.
- Grip handles reorder saved items within their pending/completed section.
  Pointer, touch and keyboard work; options also offer Move earlier/Move later.
  Reordering preserves IDs, text, assignments and completion. A dark overlay with
  light text identifies only the dragged row. Failed moves show the saved order.
- Desktop and mobile use the same saved checklist identities and selection.
  Width changes retain the active list and draft editors. Height-only keyboard
  changes must not re-anchor the page.

## Data and access

- Named checklists belong to the trip and are shared, not private or linked to
  a city, date or departure.
- Owners and editors can create, rename and delete checklists and their items.
  Deleting a saved checklist requires confirmation.
- Viewers can read but cannot mutate checklists. Family links exclude them.
- Preserve the existing packing list and every item's identity, status and
  assignment. Do not reset or silently recreate saved content.
- Existing departure checks remain available with their independent completion
  and skipped states. Do not change transfer creation or city relationships.
- Use the existing revision-checked command, permission and change-history
  mechanisms. Do not save full client snapshots or use browser-only persistence.
- SQLite and Supabase must both persist the new data. Any schema migration must
  be additive and preserve existing trips.

## Editing and accessibility

- Failed saves and revision conflicts keep title/item drafts available for retry.
  Never clear a draft merely because a request was sent.
- Switching lists within Checklists keeps drafts. Leaving the page or cancelling
  a draft follows main's confirmation-only-for-deletion rule and does not prompt.
  Pending saves block in-app navigation without a popup.
- Do not rearrange or move focus away from an item while its text is being edited.
- Support keyboard navigation, named dial buttons, focus after jumping, reduced
  motion, wrapping text and touch targets at least 44 px high.
- Keep the title, item field and save feedback usable with the mobile keyboard.
- Show empty, read-only, saving and failure states without introducing a separate
  list-index screen on mobile.

## Stack and ownership

React 19.3.1, TypeScript 5.9.3 and Vite 8.3.5, using the existing CSS tokens and
component conventions. No new dependencies are needed.

- `shared/model.ts` owns the persisted types and intent commands.
- `server/` owns validation, permissions, command handling, history and SQLite.
- `supabase/` owns online persistence and additive migrations.
- `src/features/checklists/` owns presentation, editing and local navigation.
- Feature tests stay beside their components; API/browser tests stay in `tests/`.

Match the existing discriminated command style:

```ts
{ type: 'packing.add', title: 'Rain jacket', assignee: '' }
```

## Verification

- `npm test`: cover named-list isolation, validation, permissions, compatibility
  with existing packing/departure data, history and failed-save draft retention.
- `npm run build`: typecheck all contracts and build the production client.
- `npm run test:e2e`: cover create, rename, add, edit, complete, reopen and delete;
  desktop navigation; mobile dial jumps and full-name picker; read-only access;
  persistence after reload; and keyboard interaction.
- Check layout at 320, 768, 1024 and 1440 px, including long titles and item text.
- Test Supabase migrations against a disposable local database before deployment.
  Report separately if the local Supabase environment is unavailable.

## Boundaries

- Always preserve saved data, assignments, permissions and revision conflicts.
- Apply the approved persistence scope without changing city/departure semantics.
- Ask separately before any hosted migration, deployment, publication or landing
  on a shared branch. This design selection does not authorize those operations.
- Never reset existing trips, expose checklist data to family links, add city
  coupling, commit credentials or overwrite unrelated open work.
