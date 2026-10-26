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

## Approved member attribution

Implement `docs/member-attribution-spec.md`. Preserve the unrelated pending online
acceptance tasks above.

1. Define structured change records and compare full before/after domain state,
   including nested checks/comments and automatic related changes. SQLite appends
   records transactionally outside the recent feed. Verify with focused store tests.
2. Add a private Supabase history table and backend-only commit/profile/history
   routines. Stamp actors/times from the final authorized transaction. Preserve
   history on revocation and tighten old note-history visibility when made private.
   Verify actual migrations through the Edge handler and database tests.
3. Add self-only profile and paginated history transport. Renames compare the
   previous name, increment the trip revision, and preserve IDs/credentials.
   Family profile responses retain revision zero and their filtered projection.
4. Put an identity button below the brand and add profile/history in a modal pane.
   Reuse navigation guards and save/error patterns. Test two members, rename/reload,
   pagination, mobile widths, keyboard focus and accessibility.
5. Run `task check`, Edge checks and available isolated/local Supabase workflows.
   Record actual evidence and deployment order. Do not push or deploy.

History uses random IDs as page cursors, not exposed sequence counters that would
reveal gaps from hidden private-note records. Public record payloads contain no
note content. Private transitions restrict earlier note/comment records; deletion
retains the last restriction. The older recent feed stops receiving note activity.

## Route-first Places

Reference: `places-route-exploration.excalidraw`, confirmed by the owner in this thread.

1. Preserve existing city IDs as visit identities and place IDs as activity identities. Allow repeated city names. Add narrow insert/move commands, preserving notes, sharing selections and scheduled dates. Verify through shared rules, SQLite and the Edge API with embedded PostgreSQL.
2. Build the connected visit board with grouped activities, path insertion, independent drag handles, non-drag move controls and single-level move undo. Keep forms, scheduling, permissions, conflicts and saved-place details.
3. Reflect visit order in the continuous itinerary's route summary. Keep its chronological days and compact day rail. Disambiguate repeated visits and warn when scheduled dates contradict the route rather than shifting bookings.
4. Verify persistence, pointer/touch/keyboard movement, repeated names, undo, failed/conflicting writes and read-only access. Check 320, 768, 1024 and 1440px layouts and accessibility.

Use the current white/slate/blue design tokens and soft-selection header from main. Desktop uses a horizontally scrollable connected route, phones use a vertical route. Do not restore the old dashboard/calendar tabs, replace the page with a geographic map, create a second activity store, shift dates, deploy hosted changes or import real trip data.

## Remembered trips on trusted devices

Approved specification: `docs/remembered-trips-spec.md`. Implement without another
product approval gate; the owner explicitly requested implementation.

1. Remove server timeouts without reviving invalid legacy access. Use PostgreSQL
   infinity and SQLite's zero-expiry sentinel. Keep SQLite credentials HttpOnly
   in identity-specific cookies, with a public selector per tab and no fallback
   to another identity. Verify server/API tests before browser integration.
2. Add a browser-local registry scoped to backend/project/base path. Keep one
   entry per trip/member, a last-selected pointer and tab-local active access.
   Use separate entry keys so different tabs do not overwrite whole registries.
   Guard stale responses and forgotten entries; test storage and API behavior.
3. Add the Trips pane and root fallback using existing UI patterns. Preserve
   draft guards, role isolation and failed-switch state. Add creation from the
   switcher without signing out the current trip.
4. Verify browser restart, switching, invalidation, forgetting, offline recovery,
   concurrent tabs and responsive accessibility. Record actual results and
   rollout requirements. Do not push, deploy or migrate shared/hosted services.

## Simple trip sharing

Approved scope: `docs/simple-sharing-spec.md`. Keep all unfinished online import
and physical-device acceptance tasks above. The owner confirmed implementation
of one reusable join link, name-only registration and editor participation.

1. Add a separate, retrievable trip join token. Keep private identity links hashed.
   SQLite creates its table additively; Supabase adds migration 006 with private
   RLS-protected storage and backend-only share/preview/register routines.
   Lazily create the token so existing trips work without data replacement.
2. Expose GET `/share`, POST `/join/preview` and POST `/join`. Preview returns only
   trip ID/title. Registration creates a distinct editor, link-derived session and
   history record under the trip lock. Preserve legacy endpoints and cookie rules.
3. Connect join URLs using `#join=...`, while retaining `#access=...` compatibility.
   Preview before registering, validate matching remembered owner/editor access,
   and activate new access only on success. Do not equate names with identities.
4. Replace ordinary Share with a selectable link and Copy link. Reuse native
   modal panes for joining, and keep owner recovery separate in Settings.
   Retain the existing compact style, draft guards and current-browser sessions.
5. Verify related unit/API suites and actual multi-browser SQLite/online flows.
   Test repeated copying, separate identities/private notes, failed joins,
   remembered return, old links, keyboard/focus and responsive accessibility.
   Record the policy decision and rollout order. No shared/hosted migration.

The common token is deliberately retrievable for this trusted disposable app.
It permits new membership, never reopening somebody else's identity. The
alternative of persisting original member links would retain the wrong shared
identity model and is rejected. A public trip ID alone is still not a credential.

### Approved release

The owner subsequently authorized merging into `main`, pushing, and deploying
both Supabase and Pages, and reconfirmed the Free plan. This supersedes the
implementation-only publication limits above for this release. Migration 005/006,
the matching API and Pages were deployed in that order after a private backup.
See `docs/verification.md` for the exact application commit, workflow and hosted
integrity/browser evidence. Future unrelated releases still need authorization.

## Named checklists: desktop G and mobile M1.A

Approved scope: `SPEC-checklists.md`. Apply without another approval gate. Preserve
the unrelated optional import and physical-device acceptance work.

1. Add one canonical collection of named checklists with nested items. Adopt the
   existing packing items as checklist `packing`, without changing their IDs,
   assignments or status. Keep the legacy packing commands and snapshot field as
   compatibility adapters, not a second editable store. Verify SQLite persistence,
   access, history and stale revisions before building the new editor.
2. Add an RLS-protected Supabase collection and migrate packing into it. Update the
   private writer and state/create routines, preserving authorization, atomic
   history and private-note checks. Reject old writers missing checklist data.
   Exercise actual SQL using disposable embedded PostgreSQL.
3. Build compact inline title/item editing and creation with retained failed
   drafts, assignment controls and confirmed deletion. Desktop selects one editor;
   mobile keeps all editors on the page with direct dial jumps and a named picker.
   Keep drafts mounted across selection and breakpoint changes. Leave departure
   semantics unchanged and place their existing tools in a separate disclosure.
4. Verify the full suites, production build, migration upgrade, reload, conflict
   retry, role restrictions, responsive layouts, focus, dial scrolling and axe.
   Record evidence and the migration/API/client rollout order. Do not deploy.

### Approved U1 shared dial follow-up

Replace the desktop-only navigator and selected editor with the same continuous
lists and right-edge dial used on phones. Use one scroll/focus rule, retain keyed
editors and drafts across resizing, and cap the desktop reading width at 760 px.
Keep the named picker and 44 px targets at every width. Validate short trailing
lists, keyboard navigation, draft retention, mobile keyboard height changes,
responsive accessibility and the running isolated preview. No backend, database,
permission or city-transition changes are required.
