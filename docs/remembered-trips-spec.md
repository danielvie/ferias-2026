# Spec: Remembered trips on this browser

## Status

Requirements confirmed in this thread. The owner selected automatic reopening,
browser-local trip switching and non-expiring access on trusted devices.
The proposed 30-day limit was explicitly rejected. Implemented locally;
verification is recorded in `docs/verification.md`. No push or deployment.

## Objective

Opening the root page resumes the last trip used in this browser without finding
its private link again. A Trips switcher opens other trips previously accessed
in this browser. There are no accounts or cross-device synchronization.

This is one remembered-access capability. Automatic resume, switching and
forgetting share the same saved access entries and authorization rules.

## Assumptions and scope

- Support the Supabase/Pages application and the retained SQLite runner.
- Remember access automatically after a successful creation, link opening or
  validation of an existing session. Do not require reopening a link merely to
  adopt an existing valid session.
- An entry identifies a trip and logical member together, not just a trip name.
  Reopening a viewer link must never silently select a saved owner identity.
- Remember only trips opened through this app in this browser profile. Do not
  discover trips from browser history, other browsers, devices or the server.
- No new dependency, account system, offline trip-data cache or paid service.
- This is a disposable personal app used on trusted devices. Saved access has
  no automatic timeout; do not add periodic reauthentication or inactivity expiry.
- Persisting browser access changes ADR-003's tab-only policy. Anyone using this
  browser profile can reopen remembered trips. Clearing site data removes them;
  private browsing cannot promise persistence after its last window closes.

## User-facing behavior

### Automatic resume

- A root-page visit in a new tab or after a browser restart automatically opens
  the last successfully selected trip and member identity, if access is valid.
- An explicit invitation or owner link takes priority over remembered access,
  including a fragment-only navigation. Existing draft guards still apply.
- Existing tabs stay on their own trip until explicitly switched. Another tab's
  selection must not change the credentials used by an in-flight read or write.
- Record recency when the user opens or switches a trip, not on background
  refreshes. Reloading an existing tab preserves its current trip.
- Check authorization with the server before showing trip contents. Cached
  metadata is a list label, never proof of access.

### Trips switcher

- Provide a Trips button from every trip, including viewer and family access.
- Reuse the existing accessible modal-pane pattern. List entries in recent-use
  order, showing trip title, travel dates, member name and role, and current state.
- Offer Open trip link and Create trip from the switcher as well as the empty
  state. Returning to another trip does not end the previous trip's session.
- Show a remembered list on the root page when there is no selected usable
  session. Do not silently open a different identity if auto-resume fails.
- Opening a trip starts at its itinerary. Restoring a feature tab, scroll
  position or unsaved draft is out of scope.
- Switching uses existing unsaved-change guards and save locks. A failed switch
  preserves the current trip, draft and credentials and offers retry.
- Reopening the same trip/member updates its entry rather than duplicating it.
  Different member identities remain distinguishable even when names repeat.

### Forgetting and Exit

- Each entry has Forget this trip, with confirmation explaining that only this
  browser's saved access is removed. It never deletes the trip or revokes the
  reusable member link.
- Forgetting another entry leaves the current trip open.
- Forgetting the current entry clears its saved/tab access and selection and
  shows the remembered list. Do not immediately auto-open another trip.
- Exit remains an explicit sign-out, not a trip-switching action. It ends and
  forgets the current session without removing other remembered entries.
- Honor forgetting in other open tabs. A stale response must not recreate
  forgotten credentials or resume writes with them. Do not erase unsaved draft
  text without the existing warning or explicit user action.
- Remove local saved access even if the network is unavailable. Report if the
  server session could not be ended; do not claim server revocation succeeded.

## Saved access without automatic expiry

- Store only the access needed for persistent resume and minimal validated list
  metadata. Do not persist reusable owner/invitation links, private notes,
  activity content or full snapshots.
- Scope saved entries to the website, base path and backend/project. Production,
  local previews and different Supabase projects must not exchange credentials.
- Retain SQLite's HttpOnly credential protection. Do not make its cookies
  script-readable as a shortcut to multiple remembered trips.
- Replace the online backend's current 24-hour limit and SQLite's 30-day limit
  for remembered access. Browser persistence alone is not sufficient: the server
  must continue accepting that saved access without an age or inactivity limit.
- Adopt existing valid sessions without asking for their links again. Do not
  revive already expired or revoked credentials.
- Browser restarts, new tabs and long periods without opening the app must not
  trigger a link prompt merely because time has passed.
- Access ends through explicit sign-out, forgetting, revocation, link replacement
  or removal of the trip. Clearing site data or losing the browser profile also
  removes this browser's ability to reopen it. Do not promise protection against
  browser storage eviction or private-browsing cleanup.
- Server revocation and link replacement still invalidate associated access
  immediately. Updating saved credentials must preserve logical member IDs,
  private-note ownership and role restrictions.
- A 401 marks that entry as needing a link and removes its unusable credential.
  Keep its label available to explain what happened and allow forgetting.
- A timeout, offline response or server failure keeps saved access and offers
  retry. It is not a signal to discard access or switch to another trip.
- Handle blocked storage and malformed entries without crashing. Explain when
  access cannot be remembered, while preserving usable current-tab access where
  possible. Do not issue a new one-time credential before required storage checks.
- Never put credentials in logs, query strings, analytics, screenshots, exports
  or committed test artifacts.

## Stack, structure and style

Use the current React 19.3.1, TypeScript 5.9.3 and Vite 8.3.5 application.
Vitest 4.1.12 and Playwright 1.64.1 provide focused checks.

- `src/app/`: remembered-access storage, API transport, session coordination and
  the Trips pane. Keep storage and presentation separate.
- `src/styles.css`: existing white/slate/blue tokens, compact rows and responsive
  controls. Keep keyboard operation, focus return and 44-pixel touch targets.
- `server/` and `supabase/functions/trip-api/`: authenticated resume/sign-out
  behavior where transport changes are needed. Do not weaken either backend.
- `tests/` and `tests/e2e/`: persistence, backend authorization and browser flows.
- `docs/`: this specification, the later access-policy decision and evidence.

Follow existing two-space indentation, single-quoted strings, stable ID keys,
native buttons and local React state. For example:

```tsx
<button type="button" className="button secondary" disabled={busy}
  onClick={() => onOpen(entry.id)}>Open trip</button>
```

## Testing and commands

Run only related tests, plus the production build. These are the implemented
checks; actual results and limits are recorded in `docs/verification.md`.

```sh
npm run build
npm test -- src/app/remembered-trips.test.ts src/app/api.test.ts tests/remembered-migration.test.ts tests/remembered-sessions.test.ts tests/server.test.ts tests/online-api.test.ts
PLAYWRIGHT_PORT=5197 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe' VITE_BACKEND=sqlite npm run test:e2e -- tests/e2e/remembered-trips.spec.ts
npx --no-install deno check supabase/functions/trip-api/index.ts
```

Run matching cases in `tests/e2e/online.spec.ts` through an isolated native
PostgreSQL/PostgREST/Deno fixture at the Pages base path:

```sh
TRIP_TEST_GREP='remembered|resume|switch|forget' PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe' node scripts/test-attribution.mjs
```

Use synthetic trips only. Use an isolated local fixture when the shared local
Supabase service cannot be tested without changing another participant's state.
Report unavailable checks rather than substituting hosted writes.

Acceptance checks cover:

1. Root-page auto-resume after closing a tab and after restoring a browser
   profile with no sessionStorage, without retaining a reusable link.
2. Two trips switched repeatedly without pasting links or ending prior access.
3. Explicit-link precedence, repeated member names and separate role identities.
4. Concurrent tabs, delayed reads/writes, owner-link replacement and forgetting
   without cross-trip writes or stale-response credential restoration.
5. Revoked/invalid access, already-expired legacy sessions, network failure and
   failed switching. Legacy invalid access must not be revived.
6. Forgetting current/other entries, cancellation, Exit and browser-site-data reset.
7. Adoption of existing valid sessions, malformed/blocked storage and project/base
   path isolation.
8. Server-enforced permissions, cookie protection and successful resume after
   advancing time beyond both previous session limits, without inactivity expiry.
9. Draft guards, keyboard/focus behavior, axe checks and no overflow at
   320/768/1024/1440 pixels. Inspect screenshots of the Trips pane and empty state.

## Boundaries

- Always validate access server-side, preserve identities and private data,
  protect drafts, and test the actual browser restart and switching workflows.
- The owner authorizes removing automatic expiry for remembered access.
  Implementation may include the local source migrations required by that policy.
- Ask before unrelated schema changes, adding dependencies, changing CI or
  introducing a different credential-storage policy.
- Never persist reusable links, publish credentials, change real trip data,
  weaken authorization, push/merge to main or deploy without separate approval.

## Open questions

None within the confirmed product scope. Remembered access does not expire
automatically. This does not authorize a hosted migration or deployment.

## References

- `docs/decisions/003-link-only-supabase-access.md`
- `src/app/api.ts` and `src/app/useTripSession.ts`, current tab-only online access
- `server/app.ts` and `server/store.ts`, current SQLite cookie and session behavior
- `supabase/migrations/20260717000100_trip_access_foundation.sql`, online expiry
- https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event
