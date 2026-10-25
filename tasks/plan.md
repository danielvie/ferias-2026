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
