# Supabase online implementation plan

## Status and decisions

- D1: No charges. Use Supabase Free, not a paid plan's included allowance. No paid add-ons, trials, purchased domains or automatic upgrades.
- D2: GitHub Pages hosts only the built React frontend.
- D3: Supabase is the selected online backend. Firebase and Cloudflare are no longer deployment candidates for this plan.
- D4: Link-only access for the small travel group. No application accounts, Google/email sign-in, passwords or hidden Supabase Auth users.
- Online setup is requested. Both migrations, the Edge API, all feature commands, browser session transport, link rotation and a manual Pages workflow are implemented. Local database/API/browser and backup/restore checks pass. `task run` now uses local Supabase; `task run:sqlite` preserves the old application. Committing and pushing the source to the public GitHub repository on `main` is approved. Hosted deployment still waits for secure authentication and confirmation of the actual Free plan.

ADR-002 records the provider target and ADR-003 records link-only access. ADR-001 still describes the running local Node/SQLite application until cutover.

## Supplied deployment targets

| Setting | Value |
| --- | --- |
| Supabase project URL | `https://oljadunrwnagspncclha.supabase.co` |
| Supabase project reference | `oljadunrwnagspncclha` |
| GitHub repository | `https://github.com/danielvie/ferias-2026` |
| Planned default Pages URL | `https://danielvie.github.io/ferias-2026/` |
| Frontend repository base path | `/ferias-2026/` |
| Planned frontend origin | `https://danielvie.github.io` |

These public identifiers were supplied by the user. GitHub's public API confirms the repository is public and its default branch is `main`. Hosted Supabase plan/region, Pages build settings and deployment credentials have not been verified. The Pages URL is the expected app URL, not a claim that this implementation is deployed.

No database password, secret key or deployment token is needed in chat. Obtain the publishable frontend key through the project's Connect dialog when implementation reaches hosted configuration; keep all backend credentials in secure tooling.

## Preserved behavior and scope

Keep the Excalidraw layout, dashboard-first flow, inline trip details, owner/editor/viewer permissions, author-only private notes, restricted family views, independent departure checks and conflicting-edit protection.

The empty dashboard remains available immediately. Do not introduce a setup/login landing page or ask anyone to sign in when opening a trip or saving details. A valid private link is the credential for an existing trip.

File uploads, offline synchronization, expenses, voting and external booking integrations remain out of scope. Selecting Supabase does not add these features automatically.

## Target architecture

| Responsibility | Target |
| --- | --- |
| React UI and static assets | GitHub Pages |
| Member identity and sessions | Application-managed link capabilities and short-lived sessions; no Supabase Auth |
| Trip persistence | Supabase Postgres |
| Defense against direct browser database access | Deny-by-default grants and Row Level Security; trip access goes through the API |
| Existing commands, invitations and family projection | Supabase Edge Functions and narrowly scoped transactional database routines |
| Local development | Pinned Supabase CLI and a free Docker-compatible runtime |
| Source, checks and frontend publication | GitHub Actions, with explicit publication approval |

Keep `src/app/api.ts` as the feature modules' data boundary. Replace its local `/api` implementation and adapt `useTripSession`; do not put database SDK calls throughout the feature components or create a generic multi-provider framework.

The Node HTTP server and `node:sqlite` cannot run on GitHub Pages. Port reusable validation and permission logic, then retire the local-only server dependency after online verification. Preserve the original SQLite data as a private backup, not as a public site asset.

## Accepted link-only access model

### Link roles and identities

Use separate high-entropy, revocable links for owner, editor, viewer and family access. The owner can label a member link with a traveler's name for usability; the name is not a verified identity.

Each link resolves to a stable logical member ID and a server-stored role. Do not derive permissions or authorship from a supplied name, role or trip ID. Keep stable member IDs when rotating credentials so note ownership is preserved.

| Link | Allowed access |
| --- | --- |
| Owner | Manage trip content and other links, plus rotate the owner recovery link |
| Editor | Edit shared trip content, checklists and their own private notes |
| Viewer | Read member-visible content without editing |
| Family | Read only selected, redacted itinerary/place content |

Give each traveler a separate member link if their private notes must be separate. Anyone sharing the same link acts as the same member and can see that member's private notes. Revocation prevents future authorized requests; it cannot erase data already read or copied.

The owner must keep their recovery link private. There is no email/password recovery. Lost-owner-link recovery, if needed, is a project-admin operation with secure tooling, not a public recovery endpoint.

### Open-link flow

1. Put the random capability in the URL fragment so it is not sent to GitHub Pages in an HTTP request.
2. Capture it in browser memory and clear it from the address bar. Preserve the existing retry behavior if exchanging the link fails.
3. Exchange it with an Edge Function over HTTPS for a random, expiring application session. Store only hashes of capabilities and sessions in Postgres.
4. Associate the session with its parent link and logical member. Check that both remain active on every read and write.
5. Keep the derived session in app-scoped `sessionStorage` so a refresh in the same tab works; never persist the long-lived link in browser storage. A closed/new tab can reopen the original private link.

The browser sends the opaque session as an API credential rather than relying on cross-site cookies. The exact credential header and SDK behavior must be proven in O2, including CORS preflight. This is custom application authentication, not a Supabase user JWT.

Browser-held sessions can be read by scripts running on the same origin; they are not HttpOnly. Keep their lifetime bounded, avoid unnecessary third-party scripts, protect against XSS and do not log or embed credentials in analytics. Public project configuration does not grant trip access.

### Edge Function authorization

Custom capability/session endpoints do not require a Supabase account JWT. Configure the platform gate for this custom authentication deliberately, then require the application credential inside the handler. Disabling the platform JWT check is not permission to serve trip data publicly.

Bound unauthenticated trip creation and link exchanges with request/resource limits before public deployment. Creation returns a new owner capability once; knowing the create endpoint must not allow takeover of an existing trip. Include an operational way to disable new trip creation after setup without disabling existing trip links.

### Family projection

Family responses exclude notes, packing, transfers, activity, exact stays, event descriptions and confidential place fields. Trip title, full dates and city names remain included and previewed, as they are today. A family session uses this projection on every read and cannot mutate data.

## Database and transaction design

Use trips/revisions, logical members, access-link hashes, session hashes, cities, places, events, notes, packing and transfers. Do not create an `auth.users` dependency or treat a raw browser request as a trusted member. Note comments and departure items may stay nested under their parent when they share its permissions.

- Block direct table access and privileged routine execution for both Supabase client roles, `anon` and `authenticated`. Enable RLS as defense in depth and revoke unnecessary grants explicitly.
- Keep data access behind Edge Functions and restricted database routines. A publishable key or known trip ID alone must never authorize a request.
- A server-only database credential may bypass RLS. Therefore API/database routines must resolve the current capability/session and enforce all trip permissions themselves; `auth.uid()` cannot identify these link holders.
- Stamp authorship from the resolved logical member. Private notes are restricted to that member, even when another member owns the trip.
- Execute each command in one database transaction. Check session expiry, parent-link revocation, membership, role and expected revision with the write. Do not trust an earlier cached access check or a caller-supplied actor ID.
- Restrict routine execution to the backend role, keep internal helpers in a non-exposed schema and pin privileged routines' `search_path`.
- Shared itinerary changes must neither mutate private annotations nor fail because of hidden private references.
- Test all reads/writes with missing, forged, wrong-trip, expired and revoked credentials, including revocation while a request body or transaction is pending.

Never expose a secret/service-role key through `VITE_*`, build output, logs or the GitHub Pages repository. Do not forward the custom browser credential as the privileged database client's own authorization header.

## GitHub Pages and browser integration

- Set the Vite repository base path and generate owner/invitation/family links from that base, not `location.origin` alone.
- No OAuth return URLs, sign-in screens, email delivery or Supabase Auth account provisioning are needed.
- Use explicit custom session credentials for the Edge API, not the current same-origin cookie or a public key masquerading as a member credential.
- Handle Edge Function preflight requests and the browser-facing origin correctly. CORS is not a substitute for authorization.
- Preserve pending link exchanges and entered details through failed requests without publishing private content or credentials in request URLs.
- Avoid high-frequency full-trip polling. Start with refresh/on-focus and bounded authorized reads; add realtime only if a specific workflow needs it. Family views must not expose hidden activity through revision notifications.

GitHub Free requires a public Pages repository. It may contain only built frontend assets; this does not authorize making a private application-source repository public. The project URL and publishable key are frontend configuration, not trip credentials. Deny direct database access even when those public values are known.

## Free-plan operations

Use one hosted Free project and local Supabase for development. Do not attach this app to a paid organization.

Relevant published Free allowances currently include 500 MB database size per project, 5 GB egress and 500,000 Edge Function invocations/month. Supabase Auth and file storage are not part of this deployment. Confirm the active plan and allowances again before provisioning.

Low-activity Free projects may pause after seven days and require restoration from the Supabase dashboard. Include a pre-trip availability check and an owner runbook for restoring service. Do not assume artificial keep-alive traffic removes this limit or guarantees availability.

Free automatic database backups are not included. Document a private manual backup/export and a tested restore procedure. Never put real trip exports, database dumps or private notes in Git.

Quota or pause failures must show an explicit unavailable/retry state, retain local form drafts and never be interpreted as permission to upgrade or as proof that saved trips were deleted.

## Implementation sequence and task ownership

Tasks remain under O1–O9 in `tasks/todo.md`; IDs are retained from the earlier proposal. Subtasks are small implementation slices, normally three to five files each. The listed paths are intended ownership areas, not permission to modify them during planning.

### O1. Access decision resolved

Q3 is resolved: links only for all roles, with no accounts or sign-in. Provider, cost, frontend and access choices must not be reopened by implementation agents. Q4 only blocks real-data import, not local development. This resolves the plan, not authorization to provision or deploy.

### O2. Prove one complete local trip flow

| Slice | Acceptance criteria | Verification | Likely files | Depends on |
| --- | --- | --- | --- | --- |
| O2a | A pinned CLI starts/stops a local Supabase stack without cloud credentials. Stop/clean preserve stored data. | Local start/stop; setup instructions; existing `task check`. | `package.json`, lockfile, `supabase/config.toml`, `Taskfile.yml` | O1 |
| O2b | Migrations create trip/member/link/session records. Direct client access is denied; only the backend can execute the credential-aware routines. | `supabase test db`, missing/forged/expired/revoked-link tests and unchanged-row assertions. | Initial migration, `supabase/tests/` policy tests, synthetic fixtures | O2a |
| O2c | Create a trip without sign-in, return its owner link, open it in another browser and reload using a derived session. Stale writes reject atomically; failed exchanges retain a retry and no link leaks into logs. | Local create/open/reload/conflict tests, raw-database denial tests and typecheck/build. | `src/app/api.ts`, session adapter, trip Edge Function, transactional routine and focused tests | O2b |

**Checkpoint A:** Review the auth, grants and transaction proof before migrating all features.

### O3–O5. Migrate independent feature slices

| Slice | Acceptance criteria | Verification | Likely files | Depends on |
| --- | --- | --- | --- | --- |
| O3a | Places CRUD respects membership, city references and safe URLs. | Existing validation cases and local API/browser tests. | Places migration, command module and focused tests | O2c |
| O3b | Calendar CRUD/scheduling preserves date ranges, place links and conflicts. | Scheduling, overlap and concurrent-save tests. | Calendar migration, command module and focused tests | O3a |
| O4a | Notes have immutable link-derived authorship. A different member/owner link cannot read or modify a private note. Copies of the same link share that identity, as disclosed. Hidden references cannot block itinerary edits. | Capability/API tests across links and raw SDK denial tests. | Notes migration, command module and focused tests | O2c |
| O4b | Comments retain note visibility and trusted authorship. | Private/shared comment permission and browser tests. | Note-comment routine/handler and focused tests | O4a |
| O5a | Packing items persist across sessions with ownership and status updates. | Existing packing strategy and two-browser tests. | Packing migration, command module and focused tests | O2c |
| O5b | Every transfer gets independent pending checks; completing one move leaves the next untouched. | Existing departure strategy and browser tests. | Transfer migration, command module and focused tests | O5a |

**Checkpoint B:** Run the full migrated command suite. Confirm no feature writes directly around validation/revision checks and no unrelated/private data is returned.

### O6. Migrate sharing

| Slice | Acceptance criteria | Verification | Likely files | Depends on |
| --- | --- | --- | --- | --- |
| O6a | Only owner links issue editor/viewer links. Revoke/rotate links while preserving member identity; revoke derived sessions with their parent. No account claim is required. | Multi-browser role, private-note isolation, owner rotation and delayed-request revocation tests. | Link/session routines, Edge handler, client sharing adapter and tests | O3–O5 |
| O6b | Family links return only selected/redacted content. Revocation stops subsequent reads, and direct database access remains denied for every browser client. | Existing family-projection tests plus direct SDK/Edge tests. | Family grant routine, snapshot projection and focused tests | O6a |

**Checkpoint C:** Privacy and revocation tests must pass before any hosted deployment.

### O7. Import existing data only if requested

Create a dry-run importer that preserves logical member/note relationships, validates dates and reports counts. Do not assign every private note to the trip owner. Issue fresh online links for imported members and deliver them securely; exclude old sessions, token hashes and recovery credentials from the import. Test against local Supabase first and retain an untouched SQLite backup.

Likely files: import/export script, mapping/validation module, fixtures/tests and migration runbook. Depends on O6 and Q4.

### O8. Prepare publication without publishing automatically

Build the frontend for a non-root Pages path and test navigation, owner links, invitations, derived-session refresh and tab-close/reopen behavior there. Add a manual GitHub Actions deployment workflow and configure only public frontend values in the build. Keep all real deployment credentials in the appropriate secret store, never in source files.

Extend the Taskfile for local database start/stop, database policy tests and Edge Function tests. After cutover, `task run` must run the online-target local stack. Keep `task clean` non-destructive. Document CLI/container prerequisites and avoid installing a paid container product or deleting volumes.

Verification: `task check`, `task db:test` and `task test:e2e`, with the new task implementations added during this slice. Test a hosted preview only after explicit approval. Depends on Checkpoint C.

### O9. Production cutover requires a separate approval

After the owner creates the intended Free project and authorizes deployment: apply reviewed migrations, configure custom-auth endpoints and allowed origins, deploy functions and the frontend, import approved data, and verify link-only access on two devices. Check actual plan status, private-note isolation, revocation, owner-link recovery/rotation, pause/error handling and rollback.

The user must authenticate through secure tooling, not chat or committed files. The current request authorizes preparing online setup. Do not enable billing or change repository visibility. Confirm the Free plan, inspect the migration target and obtain specific source/push/publication approval before hosted cutover. `docs/online-setup.md` records the owner steps. No hosted writes or publication have happened.

## Parallel work after the shared proof

Once O2c fixes the API/identity/transaction contracts, O3, O4 and O5 can run independently with separate migration and test files. A coordinator owns the common Edge Function gateway, client adapter and migration order. Sharing follows the privacy-sensitive feature work. CI/runbook preparation can proceed alongside feature migration, but publishing cannot.

## Open questions

- Q1 resolved: no charges; Supabase Free only.
- Q2 resolved: GitHub Pages frontend.
- Q3 resolved: link-only access for owner, editor, viewer and family roles. No application accounts or sign-in.
- Q4 open: import the existing local trip or start fresh online? If importing, preserve logical authors/members and issue fresh online links before touching real data.
- Q5 resolved: Supabase selected.

## Official sources

- Supabase Free allowances: https://supabase.com/pricing
- Free-plan cost controls: https://supabase.com/docs/guides/platform/fair-use-policy
- Quota restrictions: https://supabase.com/docs/guides/platform/billing-faq
- Inactivity pausing and backup limits: https://supabase.com/docs/guides/platform/going-into-prod#availability
- RLS, grants, privileged access and policy tests: https://supabase.com/docs/guides/database/postgres/row-level-security
- Edge Function custom authentication and privileged clients: https://supabase.com/docs/guides/functions/auth
- Browser preflight handling: https://supabase.com/docs/guides/functions/cors
- Local CLI and container setup: https://supabase.com/docs/guides/local-development/cli/getting-started
- Vite Pages base paths: https://vite.dev/guide/static-deploy.html#github-pages
