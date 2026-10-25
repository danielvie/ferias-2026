# Implementation tasks

- [x] 1. Foundation and shared contract. Defined types, client hook API and checklist strategies. Three strategy tests and focused TypeScript checks pass. Full-project checks follow integration.
- [x] 2. Backend slice. Trip creation, persisted commands, validation and filtered snapshots verified by HTTP/storage tests. Depends on 1.
- [x] 3. Calendar and places slice. CRUD, overlap warnings and scheduling verified by typecheck, focused tests and browser workflow. Depends on 1.
- [x] 4. Notes slice. Private/shared notes, links and comments implemented; author isolation verified by HTTP tests and note creation by browser workflow. Depends on 1 and 2.
- [x] 5. Checklist slice. Packing ownership and independent departure checks verified by strategies, HTTP and browser tests. Depends on 1 and 2.
- [x] 6. Sharing slice. Owner invitations, family preview, redaction and active-session revocation verified across browser contexts. Depends on 1 and 2.
- [x] 7. Shell and dashboard. Creation, navigation, route, time-aware summaries, errors and conflicts implemented. Build, responsive and browser checks pass. Depends on 1.
- [x] 8. Integration checkpoint. All worker changes merged. Separate reviews completed and findings fixed with regression checks.
- [x] 9. Handoff. Setup, architecture, access-link risks, deployment limits and actual results recorded in README and docs/verification.md.

## Reference layout update

- [x] Replace the sidebar and hero with top navigation, paired plan/departure cards, a horizontal route and a shared-note strip.
- [x] Make the dashboard the first screen. Add or edit trip details inline without creating a fabricated trip on load.
- [x] Preserve saved trips, invitation/recovery flows, permissions, checklists and conflict handling.
- [x] Verify with `task check`, 46 passing tests and eleven Chrome workflows on isolated ports. Compare empty and populated desktop/phone screenshots with the reference.

## Supabase online plan

`tasks/online-plan.md` defines acceptance criteria, file boundaries, dependencies and checkpoints. Supabase Free, no charges, a GitHub Pages frontend and link-only access are confirmed. The backend and frontend are deployed and hosted synthetic-data validation passed. Real-trip setup, the optional import decision and two-device acceptance remain pending.

- [x] O1. Confirm link-only member/family access without enabling billing.
  - [x] Select Supabase Free and GitHub Pages.
  - [x] Record the provider decision and no-charge constraints.
  - [x] Resolve Q3: private links for every role, without application accounts or sign-in.
- [x] O2. Prove the Supabase trip flow locally.
  - [x] O2a. Configure pinned local CLI/container setup and safe Taskfile lifecycle.
    - [x] Prepare ignored public env configuration, a template, non-overwriting setup and safe validation/read-only project checks.
    - [x] Pin CLI 2.122.0, add local configuration and data-preserving database lifecycle tasks.
    - [x] Verify native start/stop with Docker running, loopback-only ports and persisted trip/member/session data.
  - [x] O2b. Create initial migrations, explicit grants/RLS and allow/deny tests.
    - [x] Implement trip/city/member/link/session migration and backend-only create/open/read/save/logout/revoke routines.
    - [x] Pass 17 embedded PostgreSQL tests, including role denial, rollback, expiry, conflicts and revocation.
    - [x] Pass 37 native pgTAP assertions and four native concurrency tests on local Supabase PostgreSQL 17.
  - [x] O2c. Prove no-sign-in creation, owner-link exchange, derived-session reload and atomic conflicts through the Edge API/browser.
  - [x] Checkpoint A. Self-review auth/grants, prove cross-origin transport and reauthorization at the commit boundary.
- [x] O3. Migrate calendar and places while preserving shared validation and conflicts.
  - [x] O3a. Places persistence and access tests.
  - [x] O3b. Calendar/scheduling persistence and conflict tests.
- [x] O4. Migrate private/shared notes with link-derived member access tests.
  - [x] O4a. Notes, trusted authorship and private-reference isolation.
  - [x] O4b. Comments and inherited note permissions.
- [x] O5. Migrate packing and independent departure checks.
  - [x] O5a. Packing persistence and ownership.
  - [x] O5b. Transfer templates and independent checklists.
  - [x] Checkpoint B. Shared command rules, PostgreSQL persistence and local API tests pass.
- [x] O6. Preserve controlled invitations, membership revocation and family redaction.
  - [x] O6a. Owner-issued member links, credential rotation and revocation of derived sessions.
  - [x] O6b. Family projection, revision-probe denial and link revocation.
  - [x] Checkpoint C. Local privacy/revocation and multi-browser tests pass before hosting.
- [ ] O7. Prepare and verify an optional local-trip import.
- [x] O8. Prepare CI and verify an approved preview deployment.
  - [x] Prepare a manual Pages workflow, production env guard and base-aware private links.
  - [x] Pass three online Chrome workflows under `/ferias-2026/`; retain eleven SQLite browser regressions.
  - [x] Verify manual private-note/authorship backup/restore on disposable local databases.
  - [x] Authenticate, verify the Free plan, approve source publication and test the hosted deployment.
- [ ] O9. Deploy and migrate production data only after explicit approval.
  - [x] Deploy the reviewed migrations, custom-auth API and Pages frontend after owner approval and Free-plan confirmation.
  - [x] Validate hosted role isolation, privacy, conflicts, revocation and recovery with synthetic data; delete fixtures and close creation.
  - [ ] Decide whether to create the real trip fresh or request a local-data import.
  - [ ] Verify the intended trip and private links on two physical devices before wider sharing.

## Continuous-itinerary redesign

Approved visual contract and scope are in `belgium-itinerary-layout-v2.excalidraw` and the final section of `tasks/plan.md`.

- [x] L1. Build the continuous day agenda and date grouping; preserve event commands and family filtering. Date/render tests and typecheck passed.
- [x] L2. Add the accessible day rail and touch preview sheet. Follow-up compacts the rail, scales all markers to fit without scrolling, and adds a full-size date chooser. Browser tests passed for hover growth, focus, scroll tracking, empty days, a 93-day index and draft protection. Depends on L1.
- [x] L3. Add modal trip settings with ordered city editing and stable IDs. Save/cancel, focus/scroll restoration, linked-plan rejection and conflict-draft tests passed.
- [x] L4. Apply the Daylight shell and responsive styles. Desktop/phone screenshots inspected; 320/768/1024/1440 overflow and axe checks passed. Depends on L1–L3.
- [x] L5. `task check` passed 91 tests/build/typecheck; standalone `task test:e2e` passed 16 workflows; `task online:e2e` passed four. Results and limits recorded in `docs/verification.md`. Not deployed. Depends on L4.
  - Compact-rail follow-up: `task check` passed again; all 17 browser workflows passed with a temporary isolated-port configuration and in-memory SQLite, preserving the user's running app.

## Member attribution

Approved scope: `docs/member-attribution-spec.md`. Implementation order and
decisions: final section of `tasks/plan.md`. Source publication approved;
hosted deployment is not authorized.

- [x] A1. Structured records and transactional SQLite history. Verify actor/target,
  automatic effects, private transitions, paging, rollback and restart persistence.
- [x] A2. Additive Supabase storage/routines and Edge integration. Depends on A1.
  Verify real SQL, privileges, revocation/rename races and backend parity.
- [x] A3. Self-service profile and history pane. Depends on A1–A2. Verify mobile
  identity, rename/reload, cancellation, conflicts, pagination and family restrictions.
- [x] A4. Regression/accessibility checks and deployment documentation. Depends on
  A3. Run available repository commands and report skipped checks explicitly.
  - `task check`: 106 tests/build/typecheck. Edge typecheck and backup/restore pass.
  - `task attribution:check`: 37 native assertions, six races and five online browser workflows pass.
  - Isolated `task test:e2e`: 24 workflows pass, including accessibility/responsive checks.
  - Initial validation left the shared schema untouched. The subsequent requested
    preview recovered the missing migration source, applied attribution locally,
    and restarted the app. No tests rerun for that rebase; no push or deployment.

## Route-first Places

- [x] R1. Preserve visit/activity identities, support repeated names, and validate insert/move commands in both backends. Migration applied locally; 39 native database assertions and four concurrency checks pass.
- [x] R2. Build the reference-led route board, insertion form, activity moves, accessible alternatives and move undo. Pointer, keyboard and touch workflows pass.
- [x] R3. Reflect route order in the itinerary summary, disambiguate repeat visits, and flag date conflicts without shifting bookings. Preserve main's continuous itinerary and stable-ID settings.
- [x] R4. Rebased onto `origin/main` at `6bfb82f`. Production build, 102 unit/API tests, 29 browser workflows and Deno typecheck pass. Earlier native database/API proofs remain recorded separately. Updated header, itinerary, settings and responsive Places preview verified.
- [x] R5. Add Compact/Details city-card views and replace activity drag-and-drop with a contextual Move popup. Build, 102 unit/API tests and all 32 browser workflows pass, including compact city pointer/touch dragging, long-distance activity moves, placement, failure/conflict retry and Undo.
