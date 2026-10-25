# Handoff 1: Belgium trip planner

## Current point

The first version is implemented. During publication, remote `main` was found to already contain a newer implementation at `ed22ff2631e126df74b9c31c85dbf05450a6858e`, including the Taskfile, reference-layout updates, Supabase support and a manual GitHub Pages workflow. This worktree was synchronized to that existing commit rather than overwriting it with the earlier SQLite-only snapshot.

The user explicitly authorized pushing this change to remote `main`. This publication adds the missing handoff document; the existing application and Taskfile are preserved. Hosted deployment and real-data import remain pending according to the remote runbook. Source-push approval is not approval to run those operations.

The current branch is `main`, tracking `origin/main`. The earlier local implementation was preserved in the local-only branch `backup/belgium-trip-before-remote-sync` at `d1e7593`. Do not force-push that older snapshot over the remote. No database, environment file or deployment credentials were changed during synchronization.

The local implementation workers and reviewers have finished. Development ports 3001 and 5173 were not listening when this handoff was initially prepared; that observation is not a permanent service-status guarantee.

## What has been done

- Created an editable [Excalidraw proposal](../belgium-trip-proposal.excalidraw) covering the app's screens and suggested later additions.
- Implemented the first version with three parallel workers, shared contracts and separate feature directories. It includes a dashboard, calendar, saved places, private/shared notes with comments, packing, per-transfer departure checks and controlled sharing.
- Added durable SQLite storage, server-side authorization and privacy filtering, revocable invitation links, revision conflict handling and protection against losing drafts during navigation. Separate client and backend reviews were completed; findings were fixed and regression-tested. The remote subsequently added Supabase persistence and link-derived browser sessions, while retaining SQLite as a separate runner.
- Added a [Taskfile](../Taskfile.yml#L1). Every task has `desc`; the default runs `task --list`. In the current remote version, `task run` starts the client and local Supabase Edge API with Docker; `task run:sqlite` starts the original Node/SQLite app. `task clean` and its `task clear` alias remove only generated build/test artifacts, not trip data or dependencies.
- Recorded setup, architecture, verification and first-version completion in the existing artifacts below.

Do not reconstruct the design or repeat the original implementation plan. Those decisions and results are already documented.

## Read these first

| Artifact | Purpose |
| --- | --- |
| [README](../README.md) | Setup, commands, persistence, access-link risks and deployment requirements |
| [Implementation plan](../tasks/plan.md) | Scope, module ownership and parallel work boundaries |
| [Completed task list](../tasks/todo.md) | First-version acceptance checklist; checked items do not mean the later roadmap is implemented |
| [Architecture decision](../docs/decisions/001-module-boundaries-and-sharing.md) | Stack, strategies, command contract and capability-sharing trade-offs |
| [Verification report](../docs/verification.md) | Tests, reviewed workflows and explicit limits of validation |
| [Backend notes](../server/README.md) | Server interface and operating details |
| [Online setup](../docs/online-setup.md) | Hosted setup, owner actions and deployment limits |
| [Supabase notes](../supabase/README.md) | Local database/API lifecycle and access boundaries |
| [Online plan](../tasks/online-plan.md) | Supabase rollout checkpoints and remaining work |
| [Domain glossary](../CONTEXT.md) | Trip, event, place, transfer and note terminology |

## How to resume

Node 24 or later and the Go Task CLI are required. Start Docker before the current default runner. Dependencies and generated outputs are not tracked, so a new machine or checkout may need installation.

```sh
task install
task
task run
```

Open http://127.0.0.1:5173. `task run` now uses local Supabase and does not automatically import SQLite data. To resume the original SQLite app instead, stop any existing frontend and use `task run:sqlite`; its Node API listens on port 3001. Follow the current README for online configuration and separate online test tasks.

```sh
task check
npx playwright install chromium
task test:e2e
```

`task check` builds, typechecks and runs the non-browser test suite. Browser tests are separate. To use an existing browser, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its actual executable on the current machine. Do not copy the previous machine's macOS Chrome path onto Windows.

`task start` is the Node production runner, not a hosted Pages deployment command; follow the README's SQLite backend build configuration when using it. `task clean` or `task clear` removes `dist/`, `playwright-report/` and `test-results/`. It deliberately leaves `data/` and `node_modules/` alone.

## Validation status

The original SQLite implementation verification in this thread passed:

- Production build and TypeScript checking.
- 41 automated tests.
- Seven integrated Chrome browser workflows.
- No horizontal overflow across the six module screens at 320, 768, 1024 and 1440 pixels.
- Automated axe accessibility checks on the six initial module states at desktop width.
- `npm audit` with zero reported vulnerabilities.
- An actual production-start smoke checking built HTML, a JavaScript asset and the API authentication boundary.

The subsequent Taskfile change was verified with the default listing, dry-run inspection, `task check` with all 41 tests passing, and an actual `task run` client/API smoke. Cleanup and the `clear` alias were executed in an isolated fixture to verify that data and dependencies survive. The `task test:e2e` wrapper was dry-run inspected, not used for a new complete browser run.

Those implementation and Taskfile checks ran on the previous macOS environment with Node 25.6.0. This handoff was prepared on Windows with Node 24.15.0, npm 11.0.0 and Task 3.50.0. Git status, tool availability and listener state were checked here; the application build and tests were not rerun on this machine during documentation or publication.

The newer remote [verification report](../docs/verification.md) records 88 automated tests, eleven SQLite browser workflows, three online browser workflows and native database/API/backup checks. Those are recorded upstream results, not fresh runs by this thread. Read that report for scope and limitations. Public hosting, TLS, load testing and a full assistive-technology audit remain unverified.

## Important rules to preserve

- Packing remains checked for the trip. Every transfer gets a fresh departure checklist. The [checklist strategy registry](../shared/checklists.ts#L11) owns these differences.
- Authorization belongs on the server, not just in disabled controls. See [role strategies](../server/permissions.ts#L10) and the shared [data/command contract](../shared/model.ts#L1).
- Private notes are excluded from other member links. Anyone holding the author's link acts as that author; link-only access does not protect against the link issuer or database administrator. Shared itinerary edits must not rewrite private notes or be blocked by their hidden references.
- Family mode always shares the trip title, full dates and city names, plus the owner's selected events and places. Preview disclosures must match the server's filtered response. It excludes stays, notes, checklists and private activity.
- Invitation and owner links grant their role to anyone holding them. Do not place tokens, cookies, trip databases or real personal details in source files or handoff documents.
- Owners must save their private recovery link. The app has no password/account recovery if both the link and session are lost.
- Saves use revision checks. A conflict must preserve the form and require review, not silently overwrite another person's changes.

## What needs to happen next

These are recommendations and open decisions, not approved implementation tasks.

1. **Review the app with real trip requirements.** Run locally, choose the actual dates/cities and exercise owner, editor, viewer and family access in separate browser contexts. The current tests use synthetic data; no real itinerary or booking was entered.
2. **Finish and verify source publication.** The application is already committed remotely; this handoff is the missing addition. The user approved publishing it on `main`. Preserve the newer remote implementation and verify the pushed commit without rewriting remote history.
3. **Finish the online rollout only with the required approval.** The remote selected Supabase Free and GitHub Pages. Follow the online plan for optional SQLite import and hosted preview/deployment. Preserve the no-charge constraint and do not alter hosted data or deploy merely because source publication was approved.
4. **Verify the intended public exposure.** Link-only access is the recorded design, not an unresolved choice. Confirm hosted permissions, backups and two-device access before real use. A localhost invitation cannot be opened remotely.
5. **Choose one next feature.** The proposal prioritizes offline access, a booking wallet, shared expenses, then group choices and rain plans. File uploads, voting, forecasts, reminders and calendar export are not implemented. Do not treat the proposal as authorization to build all of them.

No test failure was left unresolved in this thread's last verified environment. Consult the current upstream verification report before extending that claim to the newer implementation. Hosted deployment and current-machine execution remain separate from this documentation-only publication.

## Suggested skills

A continuing agent should invoke:

- `clear-explanations` and `unslop` for updates and documentation.
- `documentation-and-adrs` when changing the recorded architecture or deployment decisions.
- `planning-and-task-breakdown` and `incremental-implementation` after the next scope is agreed.
- `frontend-ui-engineering` for UI changes, plus `source-driven-development` for framework-specific decisions.
- `domain-modeling` if trip terminology or rules change.
- `excalidraw-design` and `excalidraw-diagram-generator` if updating the visual proposal.

The earlier implementation explicitly authorized parallel subagents. Re-check the current request and delegation policy before spawning agents for new work.
