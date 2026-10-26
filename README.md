# Belgium, together

A shared Belgium trip planner with a calendar, saved places, private and shared notes, a packing list, and a fresh departure checklist for each move. The editable visual proposal is in `belgium-trip-proposal.excalidraw`.

## Run locally

Use Node 24 or later, preferably the current Node 24 LTS release.

```sh
npm ci
task run
```

Start Docker first, then open http://127.0.0.1:5173. The development task starts local Supabase, its Edge API and the React client. It uses local development configuration without changing cloud values in `.env.local`. The itinerary opens immediately, without a separate setup page. Use **Add trip details** to open the setup pane when you are ready to save your own dates, name and cities. Nothing is created, booked or pre-scheduled just by opening the website.

On a first run with no saved trip, **Quick start** opens the same setup pane with sample values: **Sample Belgium trip**, **Demo traveler**, Brussels, Ghent and Bruges, and a seven-day range starting today in Europe/Brussels. Edit anything you want, then choose **Save trip details**. Opening or cancelling Quick start creates nothing; saving uses the normal trip-creation flow and adds no activities or bookings. **Add trip details** still starts with blank name and date fields. The editable flow is in `quick-start-trip.excalidraw`.

The existing SQLite trip is not imported automatically. Use `task run:sqlite` to open the original application and data instead. Stop an existing development server on port 5173 before switching runners.

Use **Settings** in the top bar for later changes. The pane edits the trip name, dates and individual cities, including their order. Renaming or reordering a city preserves linked plans. Removing a city or shortening dates still requires moving or removing affected plans first. To return to an existing trip in a new browser, use **Open trip link** or open your invitation/recovery URL directly.

Trip dates use one calendar in both setup and Settings. Select a start date, then an end date to highlight the full range. Selecting the same day twice makes a one-day trip; selecting the second date earlier puts the dates in chronological order. After completing a range, select another day to begin a new range, or use **Clear dates**. Month/year controls and previous/next buttons support ranges across months and years. Keyboard users can move by day with the arrow keys, to the start/end of a week with Home/End, and by month with Page Up/Page Down. Hold Shift with Page Up/Page Down to move by year, then select with Enter or Space. Both dates are required before saving.

The continuous itinerary includes every day, even empty ones. Hover or focus a marker in the compact right-hand day rail to preview its activities; click or press Enter to jump to that day. Ordinary ticks stay 2 pixels thick while their width grows on hover/focus; immediate neighbors grow halfway and receive 20% of the hover color. The selected tick follows the same width effect, while retaining its blue accent and 3-pixel thickness. The strip scales to fit all trip days without scrolling, and the current marker follows the itinerary. The number beside a marker defaults to its day of the month; click **Days** to toggle between that and trip-day numbering starting at 1. The calendar button below the strip opens a full-size date chooser. On touch screens, tapping a marker opens its preview. Settings returns you to the same place in the itinerary.

The icon beside **Days** indicates the current numbering mode: a calendar for day-of-month dates, or a numbered list for ordered trip days.

Weekday initials use the Excalidraw comparison's color-only option, without boxes, fills or an extra right-side bar. Ordinary weekdays are gray; Saturday and Sunday are warm-colored and bold. When days are too tightly packed for readable initials, only the focused/previewed day or current day shows its initial.

## Plan your route in Places

`Places` uses option 4, inline quick add, in `checkpoint-details-options.excalidraw`. It keeps M2's single expanded checkpoint from `checkpoint-mobile-directions.excalidraw`. Each checkpoint is one city visit, so you can plan `Brussels → Ghent → Brussels` with different activities in each Brussels checkpoint.

- Compact checkpoint rows show the route number, city name and activity count, including zero. There are no vertical bars or selected-row fills. The open checkpoint uses blue, a bold city name and number, and a thicker circle outline and chevron.
- Tap a checkpoint to expand its activities directly underneath. Tap it again to collapse, or open another checkpoint to switch. The same interaction works on phones and desktop, without a bottom sheet or separate details panel. Enter and Space also toggle the focused checkpoint.
- Drag a checkpoint by its numbered circle to move the whole group. Keyboard users can pick up with Space, move with Up/Down and drop with Space. The itinerary's route summary follows the same order; its continuous days and booked times stay chronological.
- Use the open checkpoint heading's `···` menu to insert before or after it, or **Add checkpoint** to append one. On phones the top button is shortened to **+ Add**.
- Type a title in **New activity**, then press Enter or **Add** to save an unscheduled idea to that checkpoint. It starts with the existing defaults, Sight and 60 minutes. A successful save clears and refocuses the input. Failed saves keep the draft and its ID for retry.
- Use **Full form** for category, duration, address and other details. It carries over the quick-add title. Cancelling keeps the quick-add draft; saving clears it.
- **Activity ideas** are compact, directly saveable suggestion buttons, not bookings. Search and category/status filters belong to that checkpoint. Filters never change the checkpoint counts or hide route stops.
- Desktop action buttons are 32 pixels high for mouse users. Phone and touch targets remain at least 44 pixels high.
- An activity's **Move** button opens a popup with its source checkpoint, destination and position. Return checkpoints have distinct stop numbers. Its ID, details, notes and links stay attached. A successful move opens the destination checkpoint.
- Activities do not use drag-and-drop. Checkpoint `···` menus offer non-drag route moves. **Undo move** reverses the most recent move while its revision remains current.
- Scheduled dates and times do not shift. Review date warnings when route order and calendar order differ.

Checkpoint selection is local UI state and does not write trip data. Reordering preserves the selected checkpoint's identity even when its route number changes. Existing saved places become activity cards without being recreated.

For local Supabase, run `task db:migrate` to apply the repeat-city migration without resetting data. The hosted database and Edge Function also need an explicitly approved deployment before using this feature online. See ADR-006 for identity and scheduling rules, ADR-007 for inline expansion, and ADR-010 for quick add and the unfilled selection style.

## Trip access

Open **Share** and click **Copy link**. Send the same invitation link to everyone.
Each traveler enters their own name and clicks **Join trip**, then can edit plans,
write notes and use checklists. There are no accounts or permission choices.
The invitation does not expire, and Share shows the same link whenever you return.
Owners and editors can both copy it.

Each join creates a distinct member identity. Returning on a remembered browser
reuses that identity; joining on a new browser creates another one, even with the
same name. Names are labels, not identity recovery. Private notes remain with
their author. Old identity-specific viewer/family/member links still work.

Private owner recovery is separate, under **Settings → Private owner recovery**.
The initial owner link is available there while its creation page remains open;
online owners can replace a lost owner link from an active owner session.
Do not share that identity-specific link as the group invitation. There is no
mandatory save-link banner or confirmation in the normal creation/sharing flow.

The root page automatically reopens the last trip used in this browser. **Trips**
lists previously opened trips and lets you switch, open another link or create
a trip without signing out of the current one. Each tab keeps its own trip.
Entries distinguish member names and roles, so a saved viewer link never silently
becomes owner access.

The app also saves the last main page in local storage for each trip and member
identity. Refreshing, reopening the browser or switching back to a trip returns
to that page. Open tabs do not navigate when another tab changes pages.
This remembers navigation only, not unsaved form drafts, dialogs, filters or
scroll position. Missing or invalid saved pages fall back to Itinerary, and
family access still opens only permitted pages. Forgetting a trip or using Exit
also clears its saved page. If local storage is blocked, navigation still works
but the last page cannot be restored.

Remembered access has no automatic expiry. Use it only on trusted browser
profiles: anyone using that profile can reopen these trips. **Forget this trip**
removes saved access without deleting the trip; **Exit** signs out and forgets
only the current trip. Clearing browser data also removes saved access. Keep your
private recovery link for a new device or after forgetting/signing out.

## Your identity and change history

Your name and role appear beneath **Belgium, together**, including on phones.
Click your name to open **Your profile**, edit your name, and save it. This is
separate from trip settings and works for every role, including viewers and family.
Renaming does not change your access or private-note ownership.

The same pane shows **Change history** for owners, editors, and viewers. It records
who added, changed or deleted data, the affected item, and when. Use **Load older
changes** beyond the first 50 records. **Record details** shows stable member/item
IDs and the group tying automatic related changes to the same write.

History starts with this feature; older actions have no invented attribution.
Earlier records retain the name used at the time. Private-note history is restricted
to its author, including earlier records when a shared note becomes private.
Family links cannot read history. The common trip invitation creates separate
identities, so edits are credited to the person who joined under that name.
Legacy private member links still share one identity if passed to another person.

This feature does not add payments or calculate balances. The member entering a
future expense must be distinguished from its payer and beneficiaries.

## Prepare Supabase configuration

The local configuration file is `.env.local`, which Git ignores. The shareable template is `.env.example`.

```sh
task env:setup
```

This creates `.env.local` only if it does not already exist. It never overwrites your values. The project URL is already filled in; add only the `sb_publishable_` key from your Supabase project's Connect dialog:

```dotenv
VITE_SUPABASE_URL=https://oljadunrwnagspncclha.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_with_your_publishable_key
```

Do not add secret/service-role keys, database passwords or deployment tokens to this file. `VITE_*` variables are public frontend configuration, not a safe place for backend secrets.

```sh
task supabase:check  # Validate configuration format locally; no network requests
task supabase:ping   # Read-only request to Supabase's public project-settings endpoint
```

Neither command prints key values. The connection check sends only the publishable key to `/auth/v1/settings` on the configured project. It reads public project metadata without creating an account, signing in, or querying/modifying trip rows. It verifies basic API reachability/key acceptance, not deployed trip tables or functions. Database schema introspection is intentionally not used because it requires a backend key.

The checker uses Vite's development-mode environment precedence. Restart the dev server after changing Vite env values. See the [Vite environment documentation](https://vite.dev/guide/env-and-mode#env-files).

`task run` uses local Supabase. `task online:build` validates hosted public configuration and builds for GitHub Pages. Neither adding a key nor building deploys the database/API. See [online setup](docs/online-setup.md) for the guided deployment and [Supabase implementation](supabase/README.md) for its access boundary.

## Commands

| Command | Purpose |
| --- | --- |
| `task env:setup` | Create the ignored local environment file without overwriting it |
| `task supabase:check` | Validate public Supabase configuration without network access |
| `task supabase:ping` | Perform a read-only Supabase API/key check |
| `task db:start` | Start local Supabase and apply migrations, with Docker running |
| `task db:migrate` | Apply pending migrations locally without resetting data |
| `task db:test` | Run native database access and session tests |
| `task db:stop` | Stop local Supabase while preserving data |
| `task run` | Start client, local Supabase and Edge API |
| `task run:sqlite` | Start the original client/Node API with existing SQLite data |
| `task online:check` | Typecheck the Edge Function with pinned Deno |
| `task attribution:check` | Check fresh migrations, native races and online browser workflows in a disposable local database |
| `task online:test` | Exercise the real local Edge API without hosted access |
| `task online:e2e` | Test the static frontend under `/ferias-2026/` against local Supabase |
| `task online:build` | Validate hosted configuration and build the Pages frontend |
| `task backup:check` | Verify private-note backup/restore with disposable local databases |
| `npm run typecheck` | Check client, shared contracts, server and tests |
| `npm test` | Run domain, feature and backend tests |
| `npm run build` | Typecheck and build the production client |
| `npm start` | Run the production API and serve the built client |
| `npm run test:e2e` | Start isolated test servers and run Playwright workflows |

For browser tests, first install Playwright's browser:

```sh
npx playwright install chromium
npm run test:e2e
```

Alternatively, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an existing Chromium or Chrome executable. Browser tests use a separate ignored database under `data/`. Do not have the development servers running on ports 3001 and 5173 when starting them.

If a frontend is already running on 5173, set `PLAYWRIGHT_PORT=5187` to run browser tests separately. The test API still needs port 3001 free.

## Persistence and sharing

The online target persists trips in Supabase Postgres. Local Supabase uses preserved Docker volumes. The old SQLite database remains at `data/trips.sqlite` by default. None of these data are committed or served as static assets. See `docs/online-setup.md` for private manual backups and tested restore behavior.

Invitation links grant access to anyone holding them. The server checks roles on every mutation and filters every response. Private notes are excluded from other member links, including the owner link. Anyone holding the author's link acts as that author, including an owner who retains or replaces an issued link. Link-only access is not protection against the link issuer or database administrator. Family links always show the trip title, full dates and city names, plus selected events and places with sensitive fields removed. Stay events, notes, checklists and member activity are excluded. The owner previews this content before sharing.

Only an owner can create and revoke invitations. Revocation also invalidates sessions opened through that invite. Links on `localhost` or `127.0.0.1` do not work for people on other machines.

Removing a shared place or changing the trip does not rewrite someone else's private notes. If their original destination disappears, the note is kept and its author can relink it on the next edit.

Edits include the last-seen trip revision. If someone saved first, your change is rejected, the current trip is loaded, and your form stays available for review. Confirmation prompts are reserved for deletion. Closing settings or other forms, switching trips, leaving a draft, replacing an owner link, forgetting saved access and reloading do not ask for confirmation. Unsaved edits are not saved automatically. Pending saves still disable their controls and block in-app navigation without a popup; validation and save errors stay inline. Refresh manually or return to the tab after at least 30 seconds to load changes. There is no periodic polling or real-time collaborative text editor.

Current source remembers derived online session credentials in app-scoped browser
storage, without saving reusable invitation/owner links or full trip snapshots.
Remembered sessions do not expire automatically. Replacing a link from **Share**
preserves the member's identity and notes but invalidates the previous link and
its sessions. SQLite keeps its credentials in HttpOnly cookies and uses public
trip/member selectors to keep tabs separate. Browser storage eviction and cookie
lifetime caps still apply. See ADR-008 and the rollout notes before deployment.

## Original SQLite self-hosting

Build with `VITE_BACKEND=sqlite npm run build`, then run `npm start`. Use `PORT`, `HOST`, `DB_PATH`, and `PUBLIC_ORIGIN` to configure the server. The default host is loopback. This is not the GitHub Pages deployment path.

Before sharing publicly:

- Put the server behind HTTPS and configure `PUBLIC_ORIGIN` to the exact browser-facing origin.
- Use a persistent, backed-up disk for `DB_PATH`; ephemeral serverless disks will lose your trip.
- Keep the database outside the public static directory and restrict its filesystem access.
- Protect server access and consider registration restrictions, rate limiting and authenticated identities if strangers can reach trip creation.

The Node runner does not provision hosting, configure TLS or send invitations by email. The separate Pages workflow runs only when manually requested.

## Module ownership

- `shared/model.ts`: vocabulary, snapshots and intent commands.
- `shared/checklists.ts`: packing and departure strategies.
- `server/`: validation, role strategies, SQLite persistence and HTTP API.
- `supabase/`: private schema migrations, transactional routines and the Edge API, reusing the shared server domain rules.
- `src/app/`: remembered trips, tab-local session transport, save/conflict handling, top navigation, empty itinerary and trip settings.
- `src/features/calendar/` and `places/`: itinerary and saved-place workflows.
- `src/features/notes/`, `checklists/` and `sharing/`: collaboration and travel checks.
- `tests/`: API and browser verification.

See `belgium-itinerary-layout-v2.excalidraw` and the final section of `tasks/plan.md` for the continuous-itinerary redesign. `tasks/layout-plan.md` records the earlier dashboard layout. `docs/decisions/001-module-boundaries-and-sharing.md` records the architectural trade-offs and official API references.

## Online version

The app is deployed at https://danielvie.github.io/ferias-2026/ with a Supabase Free API/database and no charges permitted. Access is link-only for every role, without application accounts or sign-in. Hosted synthetic-data validation passed and its test trips were deleted. New-trip creation is an operator-controlled setup window; check the hosted setting before creating a trip. No local trip was imported.

The current continuous itinerary, inline Places route, member attribution,
remembered trips and simple sharing are deployed. The owner authorized merging
and pushing `main` and deploying Supabase/Pages, and reconfirmed the Free plan.
[Pages run 40246530711](https://github.com/danielvie/ferias-2026/actions/runs/40246530711)
passed for application commit `97f7741bf4313973b8135866e9e72d6819fd6bac`.

The hosted database has migrations 001 through 006, and the matching `trip-api`
is deployed. Existing content, members, private links, history and creation
settings were preserved. Public-browser validation covered copying the reusable
invitation, name-only joining, editor saves and remembered return; its synthetic
fixtures were removed. See `docs/verification.md` for evidence and limits.

Start with `docs/online-setup.md` for the steps needing owner action. `supabase/README.md` describes local commands and permissions. `tasks/online-plan.md` records rollout status; ADR-002, ADR-003 and ADR-004 record the provider, access and persistence decisions.

## Deliberate limits

Each tab has one active trip, and trusted browser profiles can remember several
trips and identities. There is no account or cross-device synchronization.
The common invitation lets anyone holding it join as an editor; it has no
expiry or rotation control. Legacy private member links remain revocable.
Names are display labels, not verified personal identities.
There is no password recovery if the owner loses both their link and saved
access. Private data is not encrypted at rest by the application.

Offline synchronization, uploaded tickets, shared expenses, group voting, forecasts, reminders and calendar export remain follow-up work. Transport times, opening hours and prices are not live feeds.
