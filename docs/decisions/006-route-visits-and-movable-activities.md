# ADR-006: Route visits and movable activities

## Status

Implemented locally. Hosted migration and deployment are not part of this change.

ADR-007 supersedes the zig-zag layout and sheet/panel presentation below. The identity, command and scheduling decisions still apply.

## Context

The agreed reference is `places-route-exploration.excalidraw`. Places becomes an ordered route of city visits with movable activity cards. Brussels can appear at both the start and end of a trip, with different activities in each visit.

Later owner feedback replaces activity drag-and-drop with a contextual Move popup and adds Compact/Details city-card views. Long-distance activity drags are awkward when the destination is far down the route.

The owner then rejected the horizontal layout's space use and selected option 2 in `checkpoint-route-directions.excalidraw`. This replaces the Compact/Details toggle with a compact alternating vertical route and click-open details. The UI calls each city visit a checkpoint; this is the same entity, not another domain record.

Existing trips already have stable city and place IDs. Calendar entries, notes and family selections refer to those IDs. Replacing those entities would lose context or require a migration of every reference.

## Decision

Treat each existing city record as a city visit. Names can repeat; IDs cannot. Its position in the cities collection is the route position. Remove only the PostgreSQL unique-name index, retaining ID and position constraints. Existing rows are not rewritten by the migration.

Use the existing saved-place entity as a movable activity. Preserve the `places`, `cityId` and `placeId` wire fields for compatibility. Array order defines activity order within each visit. Keep the audit-log entry type separate from this domain activity.

Add `visit.add`, `visit.move` and `place.move` commands. A move identifies the entity and an optional next sibling; a null next sibling appends. Validate anchors and destination visits on the server. Both SQLite and the Supabase Edge API execute the same rules.

Moving an activity also updates the visit reference on its linked calendar entries. Dates, times, descriptions, notes, IDs and sharing selections stay unchanged. Saving an activity with a different visit follows the same rule. Preserve main's continuous itinerary and compact day rail, rather than restoring the old Route/Day/Agenda views. The itinerary's route summary follows visit order, while its days and timed activities remain chronological. Warn when those dates contradict route order.

Use main's stable-ID city rows in the trip settings pane. Remove the obsolete comma-separated name reconciliation; repeated names are allowed and each row keeps its own ID. Repeated visits are labelled with their route stop number in selectors.

Use dnd-kit core 6.3.1 and sortable 10.0.0 for city visits only, with stable IDs, handle-only pointer activation, touch support, keyboard sensors and a drag overlay. The initial Details/Compact views are superseded by the selected checkpoint layout.

Keep every checkpoint compact and alternate its position down a vertical zig-zag. Show the city name, route number, total visible activity count, handle and menu. Use the vertical-list sorting strategy and Up/Down keyboard moves; visual alternation does not change the underlying list order. Clicking the body selects one checkpoint by ID. Desktop details open beside the route, with a capped row offset and sticky panel so a long route remains usable. Below 1000px, reuse the native modal sheet. Resize without losing selection, return focus on close, and temporarily replace the sheet when opening existing edit/scheduling forms or the Move popup.

Activity filters and ideas live inside the selected checkpoint. Filters do not affect counts, hide checkpoints or block route reordering. Ideas save to that checkpoint, including a return to the same city. Successful activity moves select the destination; undo selects the original checkpoint. Selection and disclosure do not write trip data.

Activities have a Move button instead of a drag handle or drop area. Reuse the native modal pane to show the activity's source visit, an ordered destination list with stop numbers, and its position before another activity or at the end. This also supports reordering within the current visit. A different-city warning asks the traveler to check addresses and bookings. The popup states that calendar dates and times stay unchanged. Failed/conflicting saves retain the destination and position for review and retry.

Move undo sends the inverse narrow command. It is available only while the resulting revision is current, so it cannot restore a stale snapshot over someone else's changes. Failed saves do not optimistically replace the route.

## Alternatives

- A second activity collection would duplicate the existing place identity and split notes, calendar links and sharing permissions. Rejected.
- A geographic map would suggest dragging coordinates rather than editing sequence. Use a connected ordered path. The earlier horizontal desktop layout was rejected for wasted space and sideways scrolling; the selected vertical zig-zag grows down the page.
- Automatically shifting calendar dates would silently change bookings. Keep scheduling explicit.
- Native HTML drag-and-drop would need a separate touch interaction. Use the existing React state model with a small pinned drag library rather than maintaining pointer geometry and keyboard handling ourselves.

## Consequences

Existing trips need no content conversion. Apply `20260717000300_repeat_city_visits.sql` before using repeat names against Supabase. SQLite needs no schema migration.

Restoring the old unique-name index is safe only after repeat visits have been resolved. Do not reset the database or discard visits as a rollback shortcut.

The app still stores user-entered locations, not a geographic city catalogue. Moving between differently named cities asks the traveler to check addresses and bookings; it does not relocate the real attraction. The initial drawing's activity drag handles are superseded by the later Move-popup interaction.

Local checkouts can isolate browser tests with `PLAYWRIGHT_PORT`. A separate Deno preview can set `TRIP_HTTP_HOST=127.0.0.1` and `TRIP_HTTP_PORT`, leaving Supabase's default bind unchanged when unset. The attribution runner's `TRIP_BIND_HOST` remains a hostname fallback when `TRIP_HTTP_HOST` is unset. `LOCAL_TRIP_API_URL` points the native HTTP check at that loopback handler; the check rejects non-local endpoints.

## References

- https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key
- https://docs.dndkit.com/presets/sortable
- https://docs.dndkit.com/presets/sortable#sorting-strategies
- https://docs.dndkit.com/api-documentation/sensors/pointer#touch-action
- https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms
- https://developer.mozilla.org/en-US/docs/Web/API/MediaQueryList/change_event
- https://docs.deno.com/api/deno/~/Deno.serve
