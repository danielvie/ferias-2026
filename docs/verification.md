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

## Windows validation

Verified on Windows with Node 24.15.0, npm 11.0.0, Task 3.50.0, Docker 28.0.1 and Playwright's downloaded Chromium. Initial Supabase startup failed when C: ran out of space. After space was freed and Docker restarted, startup and both migrations succeeded. Docker inspection confirmed the published ports bind to `127.0.0.1`.

Two Windows blockers were fixed:

- `task run` failed with `spawnSync npx ENOENT`. The runner now invokes the pinned Supabase and Vite JavaScript entrypoints with `process.execPath`, without npm/npx shell wrappers. Vite refuses an occupied port rather than silently changing the configured frontend origin. Launch failures stop sibling processes; Windows cleanup targets each owned process tree.
- The static-file security fixture required privileged file-symlink creation. It now uses a directory junction on Windows and a directory symlink elsewhere. The test proves the linked private file exists, then requires GET and HEAD to reject access outside the built-client directory. No security test is skipped.

Checks passed:

- `task check`: production build, TypeScript and all 90 tests, including two new runner regressions.
- `task test:e2e`: all eleven SQLite browser workflows.
- `task online:e2e`: all three local Supabase browser workflows.
- An actual `task run` browser smoke: frontend startup, synthetic trip creation through local Supabase, owner recovery-link display and session reload. The fixture was deleted and the smoke-test process tree stopped afterward.
- Before the runner/test changes, `task db:test` passed 37 pgTAP assertions and four concurrency tests; `task online:test` and `task backup:check` also passed.

These checks used synthetic data only. No hosted deployment or real-data import was performed. Runner cleanup has automated regression coverage; an interactive Ctrl+C shutdown was not manually verified.

## Hosted validation

After the owner authorized publication, logged in through secure tooling and supplied a dashboard screenshot confirming the Free organization, project `oljadunrwnagspncclha` was verified active on PostgreSQL 17. Inspection found no application tables in `public` or `trip_private`. The migration dry-run listed only the two reviewed migrations. Both were applied, `TRIP_ALLOWED_ORIGINS` was set to `https://danielvie.github.io`, and `trip-api` was deployed with its application-managed authorization.

The Windows fixes were published at source commit `26ba75994a17f7c2ef9eb5388775ff1f770fd5d8`. The [manual Pages workflow](https://github.com/danielvie/ferias-2026/actions/runs/40212635375) passed, including all 90 tests, Edge typechecking and the production build. Only public frontend configuration was added to GitHub build variables. The HTTPS site is live at https://danielvie.github.io/ferias-2026/.

Hosted checks passed:

- API health returned 200; missing/invalid sessions returned 401 and unrelated origins returned 403.
- The publishable key could not access the private schema, direct trip table or privileged RPC, returning 406, 404 and 401 respectively.
- A separate Chromium smoke against the actual Pages site and hosted API verified creation, persistence after reload, base-aware recovery/invitation links and isolated owner/editor/viewer/family browser contexts.
- Owner/editor private notes remained isolated. Viewer mutation returned 403, stale writes returned 409, family responses excluded private content and revocation invalidated the family session.
- Owner-link replacement preserved identity/private notes, rejected the previous link and reopened access through the replacement.
- The sharing screen had no horizontal overflow at 320, 768, 1024 and 1440 pixels and no axe WCAG A/AA violations in the checked state.

The final synthetic trip was deleted and public trip creation was disabled again. A database check confirmed zero trips, thirteen private tables and RLS enabled on all thirteen. No real trip, booking or local database was imported. Separate browser contexts ran on one machine, not two physical devices. Hosted backup/export access and restore were not exercised; the earlier disposable local backup/restore proof remains the evidence for that procedure.

## Continuous-itinerary redesign

Implemented the approved `belgium-itinerary-layout-v2.excalidraw` direction locally, using the Daylight palette and a system font stack with Source Sans 3 when locally installed. No font service or new package dependency is required.

- A continuous itinerary replaces the dashboard/calendar split. Empty days remain present, activities stay chronological, and existing calendar callers navigate to the same itinerary.
- The fixed day rail previews on hover/focus, tracks scrolling and jumps to/focuses a day heading. Touch users get a native preview sheet with an explicit jump action. Escape dismisses previews; reduced-motion preferences disable smooth jumps.
- Native modal panes provide inert backgrounds, keyboard focus containment and focus restoration. Settings save/cancel preserves the itinerary scroll position. Save, Cancel and any save error remain visible while the pane scrolls.
- Trip settings edit dates/name and ordered city rows. Renaming/reordering retains stable city IDs. Server validation still rejects city removal/date changes that orphan plans. Conflicting saves preserve the draft for review.
- The existing event, note, sharing and checklist workflows remain available. Viewer/family views use the same server-filtered snapshots; settings and edit actions are not offered to read-only roles.

Final local validation:

- `task check`: production build, TypeScript and 91 tests passed.
- `task test:e2e`: 16 Chromium workflows passed. New coverage includes empty days, hover/focus previews, preview hover persistence, keyboard jumps, rejected draft navigation, touch sheets, settings save/cancel, city identity preservation, linked-plan validation, conflict-draft retention, focus/scroll restoration and a 93-day independently scrollable marker list.
- `task online:e2e`: four workflows passed against local Supabase under `/ferias-2026/`, including settings/city identity persistence after reload.
- No horizontal overflow at 320, 768, 1024 and 1440 pixels across the five module screens. Axe checks passed on desktop module states, desktop/phone settings and the phone preview sheet. Desktop/phone itinerary, preview and settings screenshots were inspected against the board.

Some runs performed concurrently with the build/unit suite lost the Vite development server mid-run and then reported connection refusals. The cause was not established. A diagnostic standalone run and the final standalone `task test:e2e` run both passed all sixteen workflows; the final four online workflows also passed. These reruns do not establish that concurrent execution is reliable on this Windows setup.

No schema migration, hosted-data edit, import or deployment was part of this local redesign validation. Tests use isolated SQLite fixtures and synthetic local Supabase trips. Cross-browser, physical-device, full assistive-technology and extreme date-range performance testing remain outside this validation. Source publication was requested separately after these checks.

### Compact day-rail follow-up

The owner found the 44-pixel-per-day rail too tall and requested a smaller scale-to-fit strip with no scrolling. The rail now uses evenly distributed grid rows in a strip capped at 160 CSS pixels, or less on short viewports. Ticks are 7 pixels wide at rest and expand to 22 pixels on hover/focus without changing row positions. Both scrollbars and the active-marker auto-scroll logic were removed.

All markers remain keyboard-navigable. A full-size **Days** button opens a native date chooser and activity summary, providing a precise alternative to dense marker targets on touch screens and longer trips. Existing preview sheets and draft guards remain in place.

`task check` passed the build/typecheck and all 91 tests. `task test:e2e -- --config <temporary-config>` passed all 17 browser workflows on isolated ports 3002/5199 with in-memory SQLite. The temporary config imports the project's actual Vite configuration and changes only the test server/proxy addresses and backend selection. New assertions cover all fourteen days fitting in a compact strip, hover growth without neighbor movement, zero horizontal/vertical rail scrolling, all 93 markers fitting a longer trip, and full-size date selection on a phone-sized viewport. The fourteen-day screenshot was inspected against the owner's reference.

The user's development server on port 5173 was left running, and its trip data was not changed. The local Supabase browser suite was not rerun for this rail-only follow-up. No hosted deployment was performed.

### Three-tick day-rail emphasis

The broad cosine wave felt exaggerated. The owner specified discrete emphasis instead: the hovered tick gets full growth and 100% hover color, immediate neighbors get halfway growth and 20% hover color, and every other tick stays at rest. Size and color now use separate weights; fractional pointer tracking and the radius calculation were removed. Oklab `color-mix()` blends each tick's normal color into the hover accent. Following another visual review, the maximum now shares its width/height tokens with the selected-day indicator: 14 pixels wide by 2 pixels high. Ordinary neighboring ticks are halfway between the normal 7-pixel width and that maximum, at 10.5 pixels. The current itinerary day retains its resting indicator. Keyboard focus uses the same rule; leaving/dismissing resets it, and reduced-motion preferences remove the transitions. Tick positions and the non-scrolling rail dimensions do not change.

`task check` passed the build/typecheck and 93 tests, including two emphasis-profile tests. All 17 Chromium workflows passed with a temporary isolated configuration on ports 3002/5199 and in-memory SQLite. Browser assertions verify that no tick exceeds the selected-day width, exact halfway neighbor widths, both neighbors matching the rendered 20% color mix and differing from both pure gray and pure blue, full hover color, unchanged distant ticks, stable emphasis within a row, fixed positions, reset on exit and disabled transitions under reduced motion. The rendered three-tick screenshot was inspected. The user's running app/data were left untouched; the local Supabase browser suite and hosted deployment were not rerun.

### Weekday badges

Each day marker now has a weekday initial to its right. Saturday and Sunday use warm outlined, heavier-weight badges and an edge mark, and their accessible labels explicitly say "weekend." Classification and initials use UTC date-only formatting rather than the device timezone. Tick sizes and gray-to-blue emphasis are unchanged.

The rail still fits without scrolling. A resize observer checks whether initials would overlap. On dense rails or short viewports, only the previewed/focused badge is shown, or the current day's badge when not previewing; weekend edge marks remain visible for all weekend rows. The full-size date chooser remains available.

`task check` passed build/typecheck and 94 tests. A diagnostic run of `task test:e2e -- --config <temporary-config>` passed all 18 Chromium workflows on isolated ports 3002/5199 with in-memory SQLite. Added coverage checks fourteen weekday initials, exact weekend dates, badge positioning to the right of ticks, distinct weekend styling/labels, phone layout, dense 93-day rails and short viewports. The initial isolated run lost its Vite server mid-suite; the targeted badge tests and full diagnostic rerun passed, without establishing the cause of the server exit. The screenshot was inspected. No hosted deployment or local Supabase browser rerun was performed, and the user's development server/data were not changed.

### Reference-led badge revision and uniform ticks

The owner selected a reference with outlined weekday badges and filled slate weekend badges, then requested identical line widths. Every tick is now 14 by 2 CSS pixels at rest, while selected, and on hover/focus. The size-growth model was removed rather than masked by CSS; only the full hover color and 20% immediate-neighbor color remain.

Weekdays use slate outlines on white. Weekends use slate fill and white initials. Current weekdays have blue outlines; hovered/focused badges fill blue, and selected weekends remain filled. The earlier warm styling and extra weekend edge bar were removed. Badge boxes are 14 pixels square with 16-pixel row spacing, so a fourteen-day rail is 240 pixels high including edge padding. The entire strip is capped at 256 pixels or the available viewport height, without scrolling. Dense rails retain the current/previewed badge fallback and full-size date chooser.

`task check` passed the build/typecheck and all 94 tests. All 18 Chromium workflows passed with a temporary isolated configuration on ports 3002/5199 and in-memory SQLite. Assertions cover weekday outlines, slate weekend fills, blue selected/hovered states, absence of edge shadows, identical tick lengths/thicknesses, retained neighbor color interpolation, dense/short viewport behavior and accessibility/overflow checks. The screenshot was inspected against the supplied reference. The user's trip data and Edge API were not modified or restarted. The local Supabase browser suite was not rerun and no deployment was performed. The runtime wall-clock/early-termination warnings supplied in the conversation were not diagnosed by this visual change.

### Color-only initials, width effect and thicker selection

The owner clarified that hover should vary line width, not thickness, and chose Excalidraw option 1 with bold weekends. Ticks are 7 pixels wide at rest, 10.5 pixels beside the hovered/focused tick, and 14 pixels when hovered/focused. Ordinary ticks remain 2 pixels thick. The selected day follows the same width effect while retaining its 3-pixel thickness and accent blue color. An initial fixed-width override on the selected tick was removed after review. The normalized profile separates width and color; neighbors still receive 20% of the hover color.

Badge containers were removed. Weekday initials remain plain gray; weekend initials use option 1's warm text color and weight 700. Neither selected nor hovered initials gain a fill, outline or shadow. Selection is conveyed by the tick/ordinal rather than another badge treatment. Existing dense-rail fallback and accessible weekend labels remain.

`task check` passed build/typecheck and all 94 tests. A diagnostic `task test:e2e -- --config <temporary-config>` run passed all 19 Chromium workflows on isolated ports 3002/5199 with in-memory SQLite. Assertions cover restored width/neighbor-color changes, invariant ordinary thickness, selected-tick width growth and reset without losing its thicker accent state, keyboard jumps, plain unboxed initials, bold colored weekends, responsive layouts and accessibility. The screenshot was inspected. The user's development server, trip data and Edge API were not changed; the local Supabase browser suite and hosted deployment were not rerun.

### Calendar-date and trip-day numbering

Marker numbers now default to the day of the month, formatted with the existing UTC date-only helper. **Days** toggles between that and ordinal trip-day numbering starting at 1, with an accessible pressed state and a tooltip describing the current mode. An icon beside the label switches between a calendar and a numbered list to show the current mode. It uses the existing local SVG icon component, not an external icon service. The setting is local to the itinerary view and returns to calendar dates after reload. Switching modes does not move the selected day, scroll the itinerary, discard a form or write trip data.

The existing full-size date chooser is preserved on a separate calendar-icon button below the strip. The rail's available-height calculation reserves room for that button on short phone viewports.

`task check` passed build/typecheck and all 94 tests. A diagnostic `task test:e2e -- --config <temporary-config>` run passed all 20 Chromium workflows on isolated ports 3002/5199 with in-memory SQLite. New assertions cover a trip crossing May/June, calendar-date defaults, toggling both ways, mode-icon changes, stable selection/scroll, the separate chooser, its visibility on a short phone viewport and calendar-date defaults after reload. The user's running app and trip data were not changed. The local Supabase browser suite and hosted deployment were not rerun.

### Source publication

The owner requested committing and pushing the reviewed redesign to `origin/main` after local validation. The publication includes source, tests, documentation and the two editable Excalidraw boards, not environment files, trip databases, browser traces or private links. The Pages workflow is manual, so this source push does not deploy the frontend or change the hosted API/database.

## Member attribution

Implemented the approved specification in `docs/member-attribution-spec.md`.
The header now exposes an editable identity on mobile and desktop. The member
pane includes durable paginated history, with stable IDs and names at the time.
Both backends stamp records transactionally; related changes share an operation
ID. Private transitions restrict earlier note/comment history, and family links
cannot read it. Note content is never copied into history.

Final checks passed on Node 24.15.0 with the pinned project tools:

- `task check`: production build, TypeScript, and 106 tests in 20 files.
- `task online:check`: Deno typecheck of the actual Edge entry point.
- `task attribution:check`: 37 native pgTAP assertions, six multi-connection
  tests, and all five online Chromium workflows under `/ferias-2026/`.
- `task backup:check`: restored private notes and durable history with the same
  member IDs; sessions excluded and fixture creation disabled on restore.
- `DEBUG=pw:webserver task test:e2e -- --config <temporary-config>`: all 24
  Chromium workflows with isolated ports 3002/5199 and in-memory SQLite.
- `git diff --check`: no whitespace errors.

Coverage includes distinct members with the same name, add/edit/delete targets,
automatic related changes and grouping, server-stamped actor names before/after a
rename, retained history after revocation/deletion/restart, more than 50 records,
cursor paging, failed/stale-save rollback, profile-only permissions, forged input,
and shared-to-private note history transitions. Native races verify that a
pending rename cannot finish after revocation, and a content save staged before
a rename cannot record stale attribution.

Browser checks cover mobile name visibility, all roles, long names at
320/768/1024/1440 pixels, two collaborators, rename/reload, focus restoration,
Escape/discard guards, failed/conflicting saves retaining drafts, history errors
and pagination. Axe checks pass for the profile/history pane and existing modules;
phone screenshots were inspected.

No source push, hosted migration, or deployment was performed. The standard
`task online:test` and `task online:e2e` gateway-backed paths were not run for this
change; the isolated Deno/PostgREST route below is a distinct check. No physical
device, full assistive-technology, hosted rollout, or load test was performed.

The initial default `task db:test` attempt found three failures in its 37
foundation assertions because the shared local database already has
`repeat_city_visits`, which removes the original unique-city-name rule. This is
unrelated schema drift, not an attribution migration failure. `task db:migrate`
was a no-op before the version collision was discovered. The feature's migration
was renumbered to `20260717000400`; no attribution schema was applied to that
database, no trip data were reset, and its existing Edge process was not restarted.

`task attribution:check` provides a repeatable isolated native check. It uses the
existing local Supabase PostgreSQL container and PostgREST image, creates a fresh
fixture database/login, applies this worktree's migrations, then runs pgTAP,
native multi-connection tests, and the online browser suite through the actual
Deno entry point. Fixture services bind loopback and are cleaned up. This is not
the Supabase gateway/function-bundling path, and is not a hosted deployment test.

## Rebase and local preview

At the user's request, moved the work onto `origin/main` at `6bfb82f` and reapplied
the uncommitted attribution changes. Resolved the header conflicts by keeping
main's soft-blue `aria-current` selection and the profile button beneath the
brand. Narrow-screen spacing keeps the session actions alongside the identity.

Local startup initially refused the missing `20260717000300_repeat_city_visits`
source. Recovered its exact recorded SQL from the local migration history, without
repairing that history or resetting data. The native duplicate-city rollback
fixture now uses duplicate visit IDs, which remain invalid when names may repeat.
Applied `20260717000400_member_attribution.sql` locally and restarted the
worktree's development server on `http://127.0.0.1:5173/`.

No tests were run for this rebase, as requested. Only startup availability was
checked: the frontend, profile modules and local Edge health endpoint return 200.
The validation results above predate this rebase and were not rerun. Existing
local trip data were preserved; no hosted migration or deployment was performed.

### Attribution source publication

The owner subsequently requested committing and pushing the rebased attribution
feature to `origin/main`. Reviewed the source file list for credentials, private
links, databases and generated artifacts before publication. No tests were rerun
for publication, following the user's instruction. The local preview remains
available; source publication does not run the manual Pages workflow or deploy
the hosted database/API.

## Route-first Places

Initial implementation, before rebasing onto the continuous-itinerary redesign:

Implemented from `places-route-exploration.excalidraw`, the agreed reference. Existing city IDs are visit identities and saved-place IDs are movable activity identities. Repeat names, path insertion, whole-visit moves, activity reordering and cross-visit moves persist. Route-grouped itinerary ordering uses the same cities array. Scheduled dates and times remain unchanged.

Checks passed on Windows with Node 24.15.0 and installed Chrome:

- `npm run build`: TypeScript and production frontend build.
- `npm test`: 97 tests, including an upgrade of a populated PostgreSQL trip, identity preservation, private references, move validation and optimistic conflicts.
- `PLAYWRIGHT_PORT=5187 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<installed Chrome> VITE_BACKEND=sqlite npm run test:e2e`: all 19 workflows, including the eleven existing regressions. New checks cover insertion, repeated names, creating activities, pointer/keyboard/touch dragging, move undo, failed saves, conflict recovery, read-only access, filtering and itinerary grouping after reload.
- Browser layouts at 320, 768, 1024 and 1440px have no document overflow and no axe WCAG A/AA violations in the checked populated state. Desktop and phone screenshots were inspected.
- `npx --no-install deno check supabase/functions/trip-api/index.ts`: Edge entrypoint types.
- `task db:migrate`: applied only the repeat-city migration to local Supabase. It drops the name index without rewriting rows.
- `task db:test`: 39 pgTAP assertions and four native concurrency tests pass.
- `LOCAL_TRIP_API_URL=http://127.0.0.1:54328/functions/v1/trip-api task online:test`: repeat visits, route/activity moves, scheduling preservation, privacy, family redaction, revocation and owner rotation against the current Deno entrypoint and real local PostgREST/PostgreSQL.
- A separate browser smoke against the new Deno/PostgreSQL preview verified trip creation with repeated city names, all activity forms, move/undo, route itinerary grouping and refresh without browser errors.
- `git diff --check`: clean.

The existing server on 5173 and its older mounted Edge runtime were not stopped. A separate frontend on 5187 and Deno handler on 54328 were left running for review, with an explicitly synthetic trip. Process IDs and that synthetic trip ID are recorded in ignored `data/places-preview-processes.json`; no server credentials or invitation tokens are written there. Server credentials remain only in the API process environment.

The initial default HTTP check reached the old mounted runtime and rejected the new command. The fresh-handler check above replaces that result for this worktree's code, not for the old runtime. Hosted deployment and a fresh run inside Supabase's managed Edge sandbox remain unverified. The pre-existing Windows `npx` fallback in the integration script also needs a separate runner fix when no API is already available; this pass used the running isolated handler.

No real booking or trip content was changed. No hosted migration, publication or real-data import was performed. The local schema migration and synthetic preview fixture are intentional review state.

### Rebase onto the latest main design

Rebased the Places feature onto `origin/main` at `6bfb82f`. Preserve the soft-selection header, white/slate/blue palette, stable-ID settings pane, continuous chronological itinerary and compact day rail. The itinerary route summary and visit labels reflect route order; no legacy Route/Day/Agenda views were restored. The settings pane now allows repeated city names without changing its identity-preserving rows, so the old name-reconciliation helper was removed.

`npm run build`, all 102 unit/API tests, the Deno entrypoint typecheck and all 29 Chromium workflows passed. The browser suite ran standalone with `PLAYWRIGHT_PORT=5197`, installed Chrome and SQLite, leaving the preview on 5187 and the user's server on 5173 running. A separate smoke against the existing Deno/PostgreSQL preview confirmed the new header, continuous itinerary/day rail, repeat-name settings save and updated Places colors. Desktop, phone and itinerary screenshots were inspected.

### Compact city cards and contextual activity moves

The owner found expanded city cards too large to drag on a phone and rejected long-distance activity dragging. Places now has local Details/Compact controls. Details retains activities and planning controls; Compact renders only city names, route numbers, city drag handles and city menus. Sample phone cards measured 62 CSS pixels high, with all four visits visible together. Entering Compact clears activity filters and hides activity filters/suggestions; switching views does not write trip data.

Activity drag handles, sortable registrations and drop zones were removed. A Move button opens the existing native modal pane with the activity's current visit, a numbered destination list and a position selector. It distinguishes return visits, supports reordering inside the same visit, warns about different cities and preserves dates, times, details and links. Failed/conflicting saves retain the choices for retry, and successful moves retain single-level Undo.

`npm run build` and all 102 unit/API tests passed. The standalone browser suite passed all 32 workflows with `PLAYWRIGHT_PORT=5197`, installed Chrome and SQLite. Coverage includes both views at 320/768/1024/1440px with axe checks, no writes from view toggles, pointer and touch dragging from the first compact city to the last, keyboard city dragging, moving an activity to an offscreen return visit through the popup, destination positioning, Cancel, unchanged bookings, failed/conflicting saves, retry, Undo and read-only access.

Keyboard collision detection retains the active visit, following the standard sortable behavior; excluding it made the coordinate getter skip the adjacent visit. Tests wait for the rendered keyboard movement before dropping and retry immediate post-pointer actions through the library's short click-suppression interval rather than using fixed sleeps.

The live Deno/PostgreSQL preview was inspected on desktop and phone, including the move popup and its axe check, without saving changes to its sample plans. The backend command contract and database schema did not change in this iteration, so native database and managed Edge-runtime suites were not rerun. Nothing was pushed or deployed.

### Alternating checkpoint route, design 2

The owner selected option 2 in `checkpoint-route-directions.excalidraw` after rejecting the horizontal route's space use. Places now uses always-compact checkpoints alternating down a vertical zig-zag. Each shows its number, city and activity count, including zero. The Compact/Details toggle and horizontal route scrolling are removed. Clicking one checkpoint opens its activities beside the route at desktop widths, or in a native bottom sheet below 1000px.

Selection follows the checkpoint ID through reordering and live resizing. Close restores focus to the checkpoint; opening and cancelling existing activity forms returns to the source control, including after the phone sheet is recreated. Search, category/status filters and suggestions belong to the selected checkpoint and do not change route counts. Suggestions can save into a return checkpoint without merging it with the first visit. Moves open their destination; Undo opens the original checkpoint. The phone sheet includes Undo because its backdrop makes the page-level action unavailable.

Final checks passed:

- `npm run build`, including TypeScript.
- `npm test`: 102 tests across 21 files.
- `PLAYWRIGHT_PORT=5197 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe' VITE_BACKEND=sqlite npm run test:e2e`: all 36 Chromium workflows. This includes 15 checkpoint workflows and 21 itinerary/settings/sharing regressions.
- Closed and open states at 320/768/1024/1440px, axe WCAG A/AA checks, no document overflow, and no trip writes from selection/closing/resizing. Selected checkpoint counts use the darker secondary navigation color to meet contrast on the blue fill.
- Pointer, keyboard and touch reordering; stable selection after renumbering; empty and repeated checkpoints; count updates; filters; activity Move/Cancel, position, retry, Undo and unchanged booked times; read-only access; 30 checkpoints and a 100-character wrapping city name.
- Live local Deno/PostgreSQL preview on 5187: desktop details, phone sheet, Move/Cancel and Escape/focus. Axe reported no violations in the checked desktop/phone details states. The inspection made no POST requests after loading the trip and produced no browser errors. Screenshots were inspected.

The backend command contract and database schema are unchanged. Native database/concurrency and managed Edge-runtime suites were not repeated for this UI change. Existing local services and sample trip data were left intact. No hosted migration, push or deployment was performed.

## Not verified or delivered

No two-physical-device acceptance check, hosted backup/restore, custom-domain/reverse-proxy configuration, email delivery, load test or full assistive-technology audit was performed. Automated accessibility checks are not a WCAG certification. Offline synchronization and the proposal's later additions are not implemented. Browser tests use synthetic trip data, not real bookings.
