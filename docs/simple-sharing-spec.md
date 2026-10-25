# Spec: One reusable link to join a trip

## Status

Approved by the owner in this thread. This replaces the normal per-recipient
invitation workflow, not the remembered-trips feature. Implementation and
focused verification are authorized; publication and deployment are not.
The implementation is in the worktree; evidence is in `docs/verification.md`.

## Objective

Share shows one reusable trip link with a Copy link button. A traveler opens it,
enters their own name and joins the trip as an editor. There are no accounts,
passwords, owner-entered recipient names or permission choices in this flow.

The app is disposable and used by a trusted group. Easy sharing takes priority
over one-time secret display and per-recipient invitation management.

## Assumptions and scope

- Owners and editors can open Share and copy the same trip join link again.
- The link has no automatic expiry and survives page and server restarts.
- Anyone holding it can join and edit trip plans, notes and checklists.
- Joining creates a distinct member identity, not a shared identity for everyone
  using the link. Names are unverified display labels and may repeat.
- Existing remembered owner/editor access to that trip can be reused without
  registering again. Opening another trip's join link must not overwrite access
  to the current trip before joining succeeds.
- A new browser enters a name and gets a new identity. Entering an existing
  member's name does not recover or impersonate that member.
- Remember successful access with the existing browser-local Trips behavior.
- Preserve existing trips, members, owner access, private-note ownership and
  change attribution. Existing private member links continue working.
- Support both the Supabase/Pages app and the retained SQLite runner.

## User-facing behavior and acceptance criteria

1. Open Share and see the trip join link, a Copy link button and a short
   explanation that anyone with the link can join and edit.
2. Copy it, leave Share, reload or return later, and copy the same link again.
   No "I've saved it" confirmation is needed for sharing.
3. A first-time visitor opens the link and sees a name field and Join trip.
   They do not need to provide an email, password or invitation code.
4. Blank names are rejected. Joining has a pending state, prevents duplicate
   submission, and preserves the entered name when a request fails.
5. Two travelers opening the same link obtain separate member IDs. Their edits
   appear under their respective names, and private notes remain author-only.
6. After joining, refreshes and later root-page visits resume that browser's
   member through remembered access. Returning to the join link does not create
   another member when usable owner/editor access to this trip is remembered.
7. A failed or invalid join does not discard another trip's saved access or
   unsaved work. Existing navigation guards still apply.
8. Normal Share no longer requires creating named invitations, choosing roles,
   selecting family content, saving one-time secrets or managing invitations.
   Private owner recovery is separate from this ordinary sharing flow.
9. Existing trips receive the same reusable sharing capability without being
   recreated. Private member and owner links are never substituted for the
   common join link.
10. Copy failure leaves a selectable link and a useful manual-copy message.
    Loading and retry states are visible and keyboard accessible.

## Terms

- **Trip join link**: A reusable URL allowing each visitor to join a trip under
  their own member identity. It does not identify an existing member.
- **Trip member**: A named participant with a stable identity within a trip.
  A name is not a verified account or a means of identity recovery.
- **Member link** and **owner link** retain their existing identity-specific
  meaning for compatibility. They are not the common invitation link.

`CONTEXT.md` and ADR-009 record the changed access model.
Unlike the previous hash-only member-link policy, the common
join credential must be retrievable so Share can show it repeatedly. This does
not authorize storing retrievable private owner/member links.

## Stack, structure and style

Use React 19.3.1, TypeScript 5.9.3, Vite 8.3.5, Vitest 4.1.12 and
Playwright 1.64.1. No new dependencies are needed.

- `src/features/sharing/`: compact Share view using existing panels and buttons.
- `src/app/`: join-by-name entry, API/session coordination and remembered access.
- `shared/`: shared input types and validation.
- `server/`: SQLite storage and HTTP behavior.
- `supabase/`: additive local source migration and Edge API behavior.
- `tests/`, `tests/e2e/`: backend, migration and real-browser workflow checks.
- `docs/`: this spec, the access decision, rollout notes and test evidence.

Match existing two-space indentation, single quotes, stable member IDs and
native labeled controls. Reuse existing compact white/slate/blue UI patterns:

```tsx
<button type="button" className="button" disabled={busy}
  onClick={() => void copyLink()}>Copy link</button>
```

## Testing and commands

Run focused tests, not the whole suite. Add cases to the related backend and
browser suites for shared joining, repeated copying, separate identities,
remembered return, legacy compatibility and failed requests.

```sh
npm run build
npm test -- tests/server.test.ts tests/online-api.test.ts src/app/api.test.ts src/app/remembered-trips.test.ts src/features/sharing/SharingPage.test.tsx
PLAYWRIGHT_PORT=5197 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe' VITE_BACKEND=sqlite npm run test:e2e -- --grep 'share|join|invitation'
TRIP_TEST_GREP='share|join|invitation' PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe' node scripts/test-attribution.mjs
npx --no-install deno check supabase/functions/trip-api/index.ts
```

Verify actual copying and joining with separate browser contexts. Check keyboard
operation, errors, accessible names and overflow at 320/768/1024/1440 pixels.
Use disposable fixtures, not real trip data or hosted writes.

## Boundaries

- Always preserve member identities, author attribution, private-note filtering,
  draft guards and remembered access. Validate names and joins server-side.
- Feature-specific source migrations are part of this proposed scope.
- Ask before unrelated schema changes, dependencies, CI changes, changing real
  trip data, applying hosted migrations or publishing the feature.
- Never commit runtime credentials, turn a name into proof of identity, expose
  an owner link as the shared invitation, push or merge without authorization.
- Out of scope: accounts, email verification, configurable invitation roles,
  family-content selection, cross-device identity recovery, link-management
  controls, redesigning other trip pages or removing legacy access APIs.

## Open questions

None for the proposed flow. Owners retain their existing management role;
travelers joining through the common link become editors.
