# ADR-010: Inline activity quick add without selected-row fills

## Status

Implemented locally. Refines ADR-007's presentation without changing checkpoint identity, sorting, expansion or scheduling.

## Context

The owner rejected the vertical bar beside checkpoint details, the selected-row background and oversized buttons. After comparing four alternatives in `checkpoint-details-options.excalidraw`, the owner selected option 4, inline quick add.

## Decision

Replace the editable empty-state message and large Add activity button with a labelled title input, Add and Full form. Enter and Add save an unscheduled idea through the existing `place.save` command and `newPlace` defaults. Clear and refocus the input after success. Keep its ID and title after failure so a retry cannot create a second activity after a lost response.

Full form receives the same draft. Cancelling leaves the quick-add title intact; a successful full-form save clears it. Existing activity details, Move and calendar actions remain available.

Remove the continuous route line, detail-side border and checkpoint background highlights. Use accent color, bold text and thicker number-circle and chevron strokes for the open checkpoint. Keep native keyboard focus outlines distinct from selection.

Move the checkpoint menu to its heading. Show activity ideas as compact save buttons, and place the collapsible filters before the saved list. Use 32-pixel desktop action buttons only with a fine pointer at desktop widths. Keep touch targets at least 44 pixels high.

## Alternatives

The compact accordion, split activities-and-ideas body and tabbed details reduce spacing without changing activity entry. The selected option also lets travelers collect title-only ideas without opening a full form.

## Consequences

There is one inline layout at all widths, with stacked entry controls on phones. Read-only users do not receive quick-add, suggestion or checkpoint-edit controls. Scheduled events are never created by quick add or saving a suggestion.

There are no API, database or dependency changes.

## References

- `checkpoint-details-options.excalidraw`, option 4
- https://react.dev/reference/react-dom/components/input#controlling-an-input-with-a-state-variable
- https://react.dev/reference/react/useRef#manipulating-the-dom-with-a-ref
- https://www.w3.org/WAI/ARIA/apg/patterns/accordion/
