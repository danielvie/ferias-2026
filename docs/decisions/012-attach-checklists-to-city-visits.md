# ADR-012: Attach checklists to city visits

## Status

Implemented in the worktree. Hosted deployment requires separate approval.

## Context

Checklists attached to an ordered pair of visits disappeared from the route when
the visits ceased to be adjacent. The intended use is preparing to arrive at or
leave one specific visit, even when the trip is reordered.

## Decision

A city checklist belongs to one visit and an `arriving` or `leaving` position.
Places shows controls before and after each visit, including the first and last.
An existing checklist can be copied as a new independent list with new item IDs
and pending status. Existing assignments are retained.

Legacy two-visit checklist records are interpreted as leaving their original
starting visit. Their stored fields and items are not rewritten by this change;
the shared position helper applies the same interpretation to Places, Checklists
and reference validation. This keeps checklist and item IDs, assignment and
completion intact, including when the former destination is no longer adjacent.
The legacy creation command remains accepted for older clients.

## Alternatives

Keeping a checklist on both ends of a journey makes its place in the route depend
on adjacency. Duplicating legacy lists into both cities would invent an arrival
checklist and duplicate completion. Rewriting existing records in bulk is not
necessary to interpret their ownership and would add a data migration.

## Consequences and rollout

New lists use `checklist.addCity` and store a city ID and position in the existing
checklist JSON payload. SQLite and Supabase therefore need no new schema migration,
but the Supabase Edge API must be updated before publishing a frontend that sends
the new command. Deployments and any data transfer require separate approval.
The older Edge API does not validate city-checklist references, and older clients
do not display the new placement. Avoid old writers after rollout; do not assume
that they enforce the new ownership rule.

Trip-wide checklists and transfer departure checks remain separate. Moving a
city does not change scheduled dates or checklist completion. A city referenced
by a checklist cannot be removed through trip settings until that checklist is
removed.
