# ADR-014: Record city visit dates

## Status

Implemented in the worktree. Hosted migration and deployment remain separate.

## Context

Travelers need to see when they plan to arrive in and leave each checkpoint.
Those dates must not silently change scheduled activities or bookings.

## Decision

Store optional arrival and departure dates on each city visit. Both endpoints
are inclusive. Stays can overlap, and repeated city names remain separate
visits. Newly entered dates must be within the trip. If trip dates are shortened
later, preserve city dates and warn when they fall outside the trip.

Places warns on an activity if any linked calendar entry falls outside a
complete city date range. It also shows a warning on the collapsed checkpoint.
Unscheduled activities and incomplete city ranges do not trigger this warning.
Moving a checkpoint or changing its dates leaves event dates unchanged.

The city date command follows the existing revision and permission rules.
Trip detail updates retain dates for surviving IDs, including updates from
older clients that do not send them. PostgreSQL's city storage adds nullable
columns, and its replacement routine preserves omitted fields. Family
projections omit city dates and calculate warnings only from visible data.

## Alternatives

Deriving city dates from activities would make unscheduled days impossible to
record and would change the stay when an activity moves. Automatically moving
activity dates would change bookings without an explicit scheduling action.
Both are rejected.

## Rollout

Apply the additive PostgreSQL migration before deploying the updated Edge API
and frontend. SQLite stores the optional fields in the existing trip JSON.
Hosted migration, deployment and landing require separate authorization.
