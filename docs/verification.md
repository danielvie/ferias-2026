# Implementation verification

## Environment

Validated locally on Node 25.6.0 and npm 11.8.0, using the installed Google Chrome executable for Playwright. The supported runtime baseline is Node 24. The SQLite module prints an experimental API warning on the tested Node release.

## Checks

- `npm run build` includes the full TypeScript check and production Vite build.
- `npm test` runs 88 tests across domain, date handling, client rendering, environment preparation, local database networking, SQL migration, online API, validation and HTTP/storage boundaries.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e` runs eleven integrated browser workflows.
- `npm audit` reports zero vulnerabilities in the locked dependency tree.
- An actual `npm start` production smoke with temporary SQLite storage verifies built HTML, its JavaScript asset and the JSON 401 authentication boundary.

## Covered workflows

1. Add trip details from the dashboard, save a suggested place, schedule it, add a shared note, pack an item, assign its owner and create independent departures. Reload preserves the itinerary.
2. Create a family link through the UI, open it in another browser context, confirm server-side redaction and read-only access, then revoke the active session.
3. Reject a stale save, retain the form draft and allow an explicit retry.
4. Warn on draft-discarding navigation and preserve a local owner draft through a remote change and refresh.
5. Retry a failed invitation exchange without returning its token to the address bar.
6. Prevent navigation while invitation creation is pending and focus the resulting one-time link.
7. Show trip-creation failures next to the submit button on phones without losing the entered values.
8. Check all six modules at 320, 768, 1024 and 1440 pixels for horizontal overflow. Run axe WCAG A/AA checks on the six initial module states at desktop width and capture phone/desktop screenshots.
9. Open directly on the empty dashboard, with no form, fabricated trip or create request. Open and cancel inline details without leaving the main page.
10. Edit and cancel existing trip details on the main page, then verify saved changes after reload.
11. Verify the populated dashboard geometry against the reference: top navigation, side-by-side plan/departure cards, a horizontal city route and the shared-note strip below. Check that the cards stack on phones.

Focused HTTP tests also cover author-only private notes, invisible private references, revocation during a delayed request, invitation permissions, cookie flags, cross-origin writes, request validation, database reopening, hashed credentials, family revision privacy and safe static file serving.

## Development proxy regression

A reported failure at `http://127.0.0.1:5173` exposed an origin mismatch. Vite's string proxy shorthand enables `changeOrigin`, which replaced the browser-facing Host with the API's port. The API correctly rejected browser writes. The previous browser setup's explicit `PUBLIC_ORIGIN` hid that mismatch.

The proxy now explicitly preserves Host, and the default browser setup no longer supplies `PUBLIC_ORIGIN`. `tests/dev-proxy.test.ts` failed with 403 before the fix, then passed trip creation with 201 while still rejecting unrelated origins with 403.

For this fix, `task check` passed all 42 tests and the build. All eight browser workflows passed using `task test:e2e -- --config <temporary-config>` with isolated ports, the project's actual Vite proxy options and in-memory SQLite. The temporary configuration avoided stopping the user's running development servers or modifying their trip database. The running site was also checked with an invalid create payload: it now reaches validation with 422 instead of failing the origin check with 403.

## Reference layout update

The separate welcome/setup page, sidebar, editorial heading and decorative trip banner were replaced with the Excalidraw's compact top navigation and dashboard layout. Trip creation and editing use inline panels under the dashboard heading. The backend schema and existing stored trip data are unchanged.

For this update, `task check` passed the production build, typecheck and all 46 tests. Eleven Chrome workflows passed using `task test:e2e -- --config <temporary-config>`. The isolated-port setup preserves the user's running server and trip database. Empty and populated desktop/phone screenshots were inspected alongside the reference. Automated geometry checks cover the layout, rather than checking only for horizontal overflow.

## Local Supabase environment preparation

The ignored `.env.local` and tracked `.env.example` prepare public configuration without migrating trip storage. `task env:setup` was tested to create a missing file and leave an existing file unchanged. Git ignore checks confirm local env files are excluded while the template remains shareable.

Eight environment tests cover missing/public/privileged values, redacted output, Vite file precedence and URL validation. Two connection tests cover public metadata requests and HTTP rejection without printing response bodies or credentials.

With the user's supplied publishable key, `task supabase:check` passed and `task supabase:ping` received HTTP 200 from `/auth/v1/settings`. This is a read-only project/key probe: no account was created, no sign-in occurred and no table rows were queried or modified. Schema introspection is not used because that endpoint requires a backend secret.

`task check` passed the build, typecheck and all 56 tests. Browser workflows were not rerun for this configuration-only change. The Supabase trip tables, transactional routines and Edge Functions are still unimplemented; this check does not prove application persistence or access policies on Supabase.

## Supabase database foundation

Added the initial trip/city/member/access-link/session migration, backend-only SQL routines and a pinned local CLI. The running frontend and SQLite database were not changed.

`task check` passed the production build, typecheck and all 73 tests. Seventeen new tests execute the actual migration against PGlite's embedded PostgreSQL 18.6. They cover browser-role denial, RLS flags, backend table/helper denial, no-account creation, credential exchange, expiry, stale revisions, transaction rollback, role permissions, cross-trip isolation and revocation. `npm audit` reported zero vulnerabilities. `task --list` and Git ignore checks passed.

The initial `task db:start` and `task db:test` attempts were blocked by the stopped Docker daemon. After the user started Docker, `task db:start` applied the migration successfully and `task db:test` passed all 37 native pgTAP assertions on Supabase PostgreSQL 17.

Added three multi-connection tests to `task db:test`. All pass: a waiting stale writer receives `PT409`; a write already waiting when its link is revoked receives `PT401` even with the anticipated revision; and a waiting read receives `PT401` when its session expires before lock acquisition. Rejected writes leave the expected title/revision intact. Only test-created trips are deleted during cleanup.

Startup exposed a CLI default that published development ports on all interfaces. The project startup task now creates a loopback-only Docker bridge network or refuses an unsafe existing one. After restart, Docker inspection confirmed ports 54321–54324 bind to `127.0.0.1`. The CLI's generic `0.0.0.0` warning is still printed but does not reflect those verified mappings. Three network-helper unit tests pass. The final `task check` passed the build, typecheck and all 76 tests.

A separate synthetic lifecycle check saved a trip, stopped local Supabase without deleting volumes, restarted it, and read back the same trip/member/session. The fixture was removed afterward. No global Docker settings were edited.

No hosted database was accessed or changed in this increment. `.env.local` was preserved. No existing trip was imported. Edge Functions, the browser adapter and the remaining feature schemas are still pending. Browser workflows were not rerun because application runtime behavior is unchanged.

## Review

### Online integration

Implemented the feature-row migration, custom-auth Edge API, browser-held derived sessions, base-aware private links, owner/member credential replacement and refresh-on-focus. SQLite remains available through a separate runner; no real trip was imported. A manual Pages workflow and guided owner deployment runbook are prepared but have not run on GitHub.

The online API tests execute both migrations against embedded PostgreSQL. They cover field validation, persistence, comments/authorship, hidden note references, database-level private-note protection, family redaction, viewer denial, rotation, creation controls and request bounds. A self-review caught a revision oracle in the initial read-only command path. Role permission is now checked before comparing a hidden global revision, and multiple family revision guesses consistently return 403.

Native HTTP testing caught two integration differences not represented by the embedded tests: void PostgREST routines return 204, and local Kong can answer OPTIONS with a wildcard before the handler. The RPC client handles 204 explicitly. Real cross-origin browser requests work without cookies, while the handler rejects unrelated origins on actual requests.

Four native concurrency tests now include a full-state commit staged after an earlier read and before revocation. The final transaction rejects it with 401 and persists no packing item.

Three online Chrome workflows cover `/ferias-2026/` assets/links, creation, session reload, fresh-tab isolation, separate private-note identities, restricted family views, revocation and owner recovery rotation. Opening a different access fragment in the same tab now reboots through a real reload, retaining the existing beforeunload draft protections.

The eleven original Chrome workflows also passed with `task test:e2e -- --config <temporary-config>` on isolated ports 3002/5199 and in-memory SQLite. They did not stop the user's development server or touch its saved trip.

`task backup:check` restored a synthetic trip and private note into a separate disposable database, preserved logical authorship and excluded sessions/settings. Both test databases were deleted afterward. This proves the restore procedure locally, not hosted backup access.

The final validation commands and current totals are recorded above and in the thread. Hosted API permissions, GitHub Actions execution and two-device public access remain unverified until deployment authentication/approval.

Final online setup checks passed:

- `VITE_BACKEND=supabase VITE_BASE_PATH=/ferias-2026/ npm test`: 88 tests, including deployment-mode rendering and production environment safeguards.
- `task online:check`: pinned Deno entrypoint typecheck.
- `task db:test`: 37 pgTAP assertions and four native concurrency tests.
- `task online:test`: the actual local Edge/PostgREST HTTP integration.
- `task online:e2e` with installed Chrome: three workflows, owner-sharing overflow checks at 320/768/1024/1440 pixels and axe WCAG A/AA checks.
- `task test:e2e -- --config <temporary-config>`: eleven legacy workflows on isolated ports and in-memory SQLite.
- `task backup:check`: synthetic private-note/authorship backup and restore.
- `task online:build`: production-mode env validation, TypeScript and the Pages-path build. Asset inspection confirmed the repository base and no backend-secret markers in browser JavaScript.
- `npm audit`: zero vulnerabilities in the current lockfile.

One synthetic fixture left by an interrupted browser run was removed using its exact timestamp and test-data fingerprint. No user trip was deleted. The user's existing server on port 5173 was not stopped; the new default runner was syntax/status-checked, while its API and frontend were exercised separately on isolated test/preview ports.

### Original implementation

Three implementation workers owned backend, itinerary and collaboration modules. Separate client and backend reviewers reported correctness issues. The integrated fixes include navigation guards, recoverable link exchange, matching family-preview disclosures, stable checklist keys, same-day time filtering, post-body authorization and private-note reference isolation.

Desktop and phone screenshots were inspected. Packing rows were made more compact on phones, and low-contrast secondary text was corrected following the accessibility check.

## Not verified or delivered

No public deployment, TLS/reverse-proxy configuration, hosted persistence, email delivery, load test or full assistive-technology audit was performed. Automated accessibility checks are not a WCAG certification. Offline synchronization and the proposal's later additions are not implemented. Browser tests use synthetic trip data, not real bookings.
