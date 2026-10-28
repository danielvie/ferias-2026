# ADR-013: Use one checklist slot per city

## Status

Implemented in the worktree. Supersedes the direction-specific placement in
ADR-012. Deployment remains separate.

## Context

Separate arriving and leaving controls made empty checkpoints unnecessarily
tall and required a distinction the trip does not need.

## Decision

Places shows one compact checklist slot below each checkpoint. All checklists
belonging to that visit appear there, with a control to add another. The slot
moves with its visit. A copied checklist remains independent of its source.

New city checklists have a city ID without a direction. Existing arriving and
leaving records appear together without rewriting their stored data. Legacy
between-city checklists still belong to their original starting visit. Their
IDs, items, completion and assignments are preserved.

The API continues to accept the legacy phase field for older clients, but the
current interface ignores it. The Edge API must be deployed before a frontend
that sends the new phase-free command. Older clients cannot reliably display
phase-free checklists; avoid old writers after rollout.

## Alternatives

Keeping two empty slots preserves direction at the cost of extra space and
unnecessary choices. Rewriting existing records adds migration risk without
changing ownership or the displayed result.
