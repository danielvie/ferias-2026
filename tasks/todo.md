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

`tasks/online-plan.md` defines acceptance criteria, file boundaries, dependencies and checkpoints. Supabase Free, no charges, a GitHub Pages frontend and link-only access are confirmed. Local migration implementation is authorized and the foundation schema is prepared. The full backend cutover and publication remain pending.

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
- [ ] O8. Prepare CI and verify an approved preview deployment.
  - [x] Prepare a manual Pages workflow, production env guard and base-aware private links.
  - [x] Pass three online Chrome workflows under `/ferias-2026/`; retain eleven SQLite browser regressions.
  - [x] Verify manual private-note/authorship backup/restore on disposable local databases.
  - [ ] Authenticate, verify the Free plan, approve source publication and test the hosted deployment.
- [ ] O9. Deploy and migrate production data only after explicit approval.
