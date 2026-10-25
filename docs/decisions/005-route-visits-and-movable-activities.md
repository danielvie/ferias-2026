# ADR-005: Route visits and movable activities

## Status

Implemented locally. Hosted migration and deployment are not part of this change.

## Context

The agreed reference is `places-route-exploration.excalidraw`. Places becomes an ordered route of city visits with movable activity cards. Brussels can appear at both the start and end of a trip, with different activities in each visit.

Existing trips already have stable city and place IDs. Calendar entries, notes and family selections refer to those IDs. Replacing those entities would lose context or require a migration of every reference.

## Decision

Treat each existing city record as a city visit. Names can repeat; IDs cannot. Its position in the cities collection is the route position. Remove only the PostgreSQL unique-name index, retaining ID and position constraints. Existing rows are not rewritten by the migration.

Use the existing saved-place entity as a movable activity. Preserve the `places`, `cityId` and `placeId` wire fields for compatibility. Array order defines activity order within each visit. Keep the audit-log entry type separate from this domain activity.

Add `visit.add`, `visit.move` and `place.move` commands. A move identifies the entity and an optional next sibling; a null next sibling appends. Validate anchors and destination visits on the server. Both SQLite and the Supabase Edge API execute the same rules.

Moving an activity also updates the visit reference on its linked calendar entries. Dates, times, descriptions, notes, IDs and sharing selections stay unchanged. Saving an activity with a different visit follows the same rule. The route itinerary groups events by visit order, while Day and Agenda retain chronological ordering. Warn when those dates contradict route order.

The trip details form consumes each matching visit ID once, rather than looking up the first matching city name repeatedly. Repeated visits are labelled with their route stop number in selectors.

Use dnd-kit core 6.3.1 and sortable 10.0.0 with stable IDs, handle-only pointer activation, touch support, keyboard sensors and a drag overlay. Nested activity targets take precedence over visit drop areas. Non-drag move controls remain available. Filtering disables reordering because hidden siblings make drop positions ambiguous, but activity details and editing remain available.

Move undo sends the inverse narrow command. It is available only while the resulting revision is current, so it cannot restore a stale snapshot over someone else's changes. Failed saves do not optimistically replace the route.

## Alternatives

- A second activity collection would duplicate the existing place identity and split notes, calendar links and sharing permissions. Rejected.
- A geographic map would suggest dragging coordinates rather than editing sequence. Use a connected ordered path, horizontal on desktop and vertical on phones.
- Automatically shifting calendar dates would silently change bookings. Keep scheduling explicit.
- Native HTML drag-and-drop would need a separate touch interaction. Use the existing React state model with a small pinned drag library rather than maintaining pointer geometry and keyboard handling ourselves.

## Consequences

Existing trips need no content conversion. Apply `20260717000300_repeat_city_visits.sql` before using repeat names against Supabase. SQLite needs no schema migration.

Restoring the old unique-name index is safe only after repeat visits have been resolved. Do not reset the database or discard visits as a rollback shortcut.

The app still stores user-entered locations, not a geographic city catalogue. Moving between differently named cities asks the traveler to check addresses and bookings; it does not relocate the real attraction.

Local checkouts can isolate browser tests with `PLAYWRIGHT_PORT`. A separate Deno preview can set `TRIP_HTTP_HOST=127.0.0.1` and `TRIP_HTTP_PORT`, leaving Supabase's default bind unchanged when unset. `LOCAL_TRIP_API_URL` points the native HTTP check at that loopback handler; the check rejects non-local endpoints.

## References

- https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key
- https://docs.dndkit.com/presets/sortable
- https://docs.dndkit.com/api-documentation/sensors/pointer#touch-action
- https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms
- https://docs.deno.com/api/deno/~/Deno.serve
