# ADR-006: Straight checkpoint rail with inline activities

## Status

Implemented locally. Supersedes ADR-005's alternating route layout and separate checkpoint details presentation. Its identity, command and scheduling rules remain unchanged.

## Context

The owner rejected the zig-zag mobile route because it used too much space. The bottom sheet also separated activities from the checkpoint they belonged to. After comparing the current design with four mobile alternatives, the owner selected M2 in `checkpoint-mobile-directions.excalidraw`.

## Decision

Use one straight, numbered vertical rail. Compact checkpoint rows show the city and activity count, including zero. The numbered circle is the drag handle, with a 44-pixel-wide touch target. The rest of the row scrolls normally and toggles expansion.

Expand one checkpoint at a time, directly beneath its header and inside the same ordered-list item. Tapping again collapses it. Use the same structure at every viewport width rather than maintaining a separate phone sheet and desktop panel. Limit the desktop column width so city names and their disclosure controls remain easy to scan.

Use a heading containing a native button with `aria-expanded`; label the expanded region with that button and connect it with `aria-controls`. Enter and Space toggle it without moving focus away from the header. Resizing does not remount the region or change selection.

Move insertion and non-drag route controls into the expanded checkpoint's menu. Offer insertion both before and after, including the route ends, without placing large insertion controls between compact rows. Keep the page-level append button.

Keep activity details, Move and scheduling actions explicit. Keep filters and ideas collapsed beneath the activities. Existing forms and the Move dialog continue to return focus to their source controls; returning from a move can scroll to the destination activity now that it is inline. The page-level Undo remains accessible without a checkpoint backdrop.

## Alternatives

- The zig-zag and bottom sheet are superseded because they spend mobile width and separate the checkpoint from its activities.
- M1's full-width accordion is simpler visually, but M2 retains the route sequence as a continuous line.
- M3's nested activity disclosures show more checkpoints at once, at the cost of another tap for activity actions.
- M4's independently expanded cards support comparison, but allow several checkpoints to make the page long.

## Consequences

Expanded activities push later checkpoints down rather than covering them. Only the selected checkpoint mounts its activities, and checkpoint counts remain independent of activity filters. Repeated city names still refer to separate IDs.

No backend, schema or persisted trip data changes are required. Existing pointer, keyboard and touch sorting use the same dnd-kit vertical-list strategy.

## References

- `checkpoint-mobile-directions.excalidraw`, M2, compact and expanded states
- https://www.w3.org/WAI/ARIA/apg/patterns/accordion/
- https://docs.dndkit.com/api-documentation/sensors/pointer#touch-action
- https://docs.dndkit.com/presets/sortable#sorting-strategies
