# Belgium trip implementation plan

## Scope

Implement the first version in `belgium-trip-proposal.excalidraw`. A traveler can create a trip, plan dates and places, keep private or shared notes, pack, check each departure, and share a controlled view. This is a self-hosted website, not a local-storage mockup.

Offline synchronization, ticket files, expenses, voting, forecasts and external calendar integration remain later work.

## Architecture and parallel ownership

- React + TypeScript + Vite provide the responsive client. Native form controls, forest green and warm paper colors follow the proposal.
- A Node HTTP server persists trips in SQLite. Production serves the built client and API from the same origin. Development proxies `/api` to Node.
- `shared/model.ts` owns the vocabulary and command contract. Feature modules do not implement their own persistence.
- `shared/checklists.ts` uses packing and departure strategies. Packing persists for the trip; every transfer gets an independent copy of the departure template.
- Authorization strategies run on the server, not merely in UI controls. Owner manages access, editor changes plans, viewer reads member content, and family sees an explicitly selected and redacted projection.
- Invitation links are bearer capabilities. Anyone holding one gets its role. Tokens travel in URL fragments, are exchanged for HttpOnly cookies, are stored hashed, and can be revoked. No email service or fabricated login system.
- Mutations carry a revision. A stale client receives a conflict rather than silently overwriting another traveler's changes.

| Owner | Files | Deliverable |
| --- | --- | --- |
| Parent | project config, `shared/*`, `src/app/*`, `src/components/*`, `src/styles.css`, docs and browser tests | Contracts, strategies, shell, dashboard, integration and verification |
| Backend worker | `server/*`, `tests/server*` | Durable storage, command validation, authorization, sharing and HTTP tests |
| Itinerary worker | `src/features/calendar/*`, `src/features/places/*` | Calendar CRUD, overlap warnings, saved places and scheduling |
| Collaboration worker | `src/features/notes/*`, `src/features/checklists/*`, `src/features/sharing/*` | Notes, departure and packing flows, invitations and family preview |

Workers start only after the shared types and client hook contract exist. They may read other files but should not edit another owner's area.

## Verification checkpoints

1. Type contract and checklist strategy tests pass before feature integration.
2. Backend tests prove persistence, validation, role enforcement, private-note isolation, revocation, stale-write rejection and family redaction.
3. Integrate each worker's feature module, then typecheck and build.
4. Browser workflows prove trip creation, place scheduling, private/shared notes, independent departure checks and link access.
5. Inspect desktop and phone screenshots. Verify no horizontal overflow and accessible form labels.

## Assumptions and deployment limits

One trip per browser session is enough for the first release; creating another trip does not delete the first. The owner must save their private recovery link. A server and durable disk are required for sharing across devices. HTTPS and a configured public origin are required before public deployment. This work does not deploy or publish the application.

## Planned online target

Supabase Free is selected for the backend and GitHub Pages for the frontend, with no charges permitted. Access uses private links for every role, without application accounts or sign-in. See `tasks/online-plan.md` for the migration slices and ADR-002/ADR-003 in `docs/decisions/` for the provider and access decisions. The running local architecture and data remain unchanged; planning does not authorize implementation, cloud resource creation, billing changes or publication.

## Approved continuous-itinerary redesign

The user approved implementing `belgium-itinerary-layout-v2.excalidraw` and selected one continuous itinerary, not one-day pagination. Use the board as the visual specification, with A / Daylight as the starting theme. This section supersedes the original dashboard layout, not the persistence/access decisions. Existing online rollout tasks remain separate.

1. Replace the dashboard/calendar split with one continuous itinerary. Include empty days, chronological activities, existing edit/delete actions and departure-checklist links. Keep `calendar` as an internal navigation alias so feature callers retain their behavior.
2. Add a fixed, compact day rail that scales to fit every trip day without its own scrolling. Hover/focus expands tick widths with halfway neighbor growth and 20% neighbor color; ordinary thickness stays fixed. The selected tick follows the same width effect while remaining thicker and accent colored. Weekday initials use option 1 from `weekday-badge-options.excalidraw`, with colored, bold weekends and no containers or edge bar. Marker numbers default to the day of the month; **Days** toggles calendar-date and ordinal trip-day numbering. Hover/focus previews the date, cities and up to three activities; clicking scrolls and focuses the day heading. Touch uses a preview sheet and an explicit jump; a separate calendar button opens a full-size date chooser for precise selection. Active markers track itinerary scrolling; Escape dismisses previews; reduced motion is respected. Draft guards still apply.
3. Move creation, trip settings and link-opening forms into native modal panes. Edit the trip name/dates and individual ordered city rows. Preserve city IDs during renames/reordering, keep drafts through conflicts and keep backend rejection of orphaned plans.
4. Apply the quiet white/slate/blue palette across the existing modules. Use a system font stack with Source Sans 3 when locally available, avoiding a runtime font service or new dependency.

Verify each slice with focused tests, then `task check`, `task test:e2e` and `task online:e2e`. Browser checks cover settings focus/scroll restoration, rail keyboard/touch behavior, conflicts, role filtering, responsive widths and axe. No database/schema changes, hosted writes, import, push or deployment are part of this redesign.
