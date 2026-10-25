# Put the trip online

## What is ready

The application now runs against local Supabase without sign-in. Calendar, places, private/shared notes, comments, packing, departure checks, invitations, family views, revocation and link replacement use the Edge API. The static frontend is prepared for `https://danielvie.github.io/ferias-2026/`.

The owner authorized deployment and confirmed the Free organization in the dashboard. Both migrations and `trip-api` are deployed to `oljadunrwnagspncclha`. The [manual Pages workflow](https://github.com/danielvie/ferias-2026/actions/runs/40212635375) passed for source commit `26ba75994a17f7c2ef9eb5388775ff1f770fd5d8`. The site is live at https://danielvie.github.io/ferias-2026/.

Hosted synthetic-data validation passed, including separate role contexts, privacy, revocation and recovery. The fixture was deleted; the hosted database has no trips and new-trip creation is disabled. Follow section 4 when the owner is ready to create the real trip, then disable creation again. `.env.local` and the existing SQLite trip are unchanged. No real-data import was requested. The steps below remain the deployment/redeployment runbook; see `docs/verification.md` for evidence and limits.

## 1. Owner checks and deployment login

In Supabase, confirm that project `oljadunrwnagspncclha` belongs to a **Free** organization/project. Do not upgrade, add paid services or start a paid trial. Check the project is active. The owner supplied dashboard confirmation for this deployment; recheck before future deployments.

In your own terminal, from the project directory:

```sh
npx --no-install supabase login
npx --no-install supabase link --project-ref oljadunrwnagspncclha
```

Complete the browser login. If linking asks for the database password, enter it in your terminal, not chat. Do not paste CLI tokens, database passwords or backend keys into `.env.local`. This is the developer's deployment login; travelers still use private links without signing in.

The GitHub repository is already public, as verified through its public API. The owner has approved committing and saving the application source there on `main`. Private trip data, local env files, SQL snippets, backups and databases are excluded. Website deployment remains a separate step after authentication and the Free-plan check.

## 2. Review and deploy the backend

After authentication and the Free-plan check, inspect the linked project and its PostgreSQL major version before changing it. Local tests run on PostgreSQL 17 and embedded PostgreSQL 18. Check for any existing hosted app schema/data and take a private backup before applying changes to a non-empty deployment.

Review the migration preview first:

```sh
npx --no-install supabase db push --linked --dry-run --skip-vault
```

Then, after approval of the target and migration list:

```sh
npx --no-install supabase db push --linked --skip-vault
npx --no-install supabase secrets set TRIP_ALLOWED_ORIGINS=https://danielvie.github.io --project-ref oljadunrwnagspncclha
npx --no-install supabase functions deploy trip-api --project-ref oljadunrwnagspncclha --no-verify-jwt
```

The platform JWT gate is disabled deliberately because this app uses its own capability/session checks, not Supabase Auth users. Do not remove the handler's authorization or grant browser roles access to the privileged RPCs.

Supabase injects the server key into the function. There is no backend key to put in the frontend, GitHub variables or chat. `TRIP_ALLOWED_ORIGINS` contains origins only, so do not append `/ferias-2026/`.

Before frontend publication, verify the hosted `/functions/v1/trip-api/health` endpoint, unauthenticated trip rejection, and direct database/RPC denial using the public key.

## 3. Configure and publish GitHub Pages

If source publication is approved, publish the reviewed implementation and its manual workflow to the GitHub repository. Do not force-push or overwrite an existing branch.

In the repository settings:

1. **Pages → Build and deployment → Source:** GitHub Actions.
2. **Secrets and variables → Actions → Variables:** add:
   - `VITE_SUPABASE_URL`: `https://oljadunrwnagspncclha.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: the same public `sb_publishable_` key you supplied locally.
3. In **Actions**, run **Deploy frontend to GitHub Pages** manually and confirm the Free-plan/publication checkbox.

There is no automatic deployment on pushes. The workflow validates public configuration, runs tests/typechecks, builds with `/ferias-2026/`, and uploads only `dist` to Pages. It never uploads `.env.local` or the database as a site asset. Source files are public if committed to this public repository.

For a local hosted-target build:

```sh
task online:build
```

Use the workflow for publication so a local test build pointing to `127.0.0.1` cannot be accidentally uploaded. Production validation rejects localhost URLs and backend secrets.

If only built assets should be public, stop before publishing source. Use a separate reviewed static-artifact publication procedure instead of this source-build workflow.

## 4. Create the online trip, then close creation

Creation is disabled by default. In the hosted project's SQL editor, after backend deployment:

```sql
update trip_private.settings set creation_enabled = true where singleton;
```

Open the Pages website, add trip details, and save the one-time owner link securely. Create a different invitation for each traveler. Test an editor and family link on another browser/device before sharing widely.

After the intended trip is created, disable public creation:

```sql
update trip_private.settings set creation_enabled = false where singleton;
```

Existing links, edits, invitations and owner recovery continue working. There is no sign-in, payment flow or email recovery. A lost/exposed link can be replaced from an active owner session in **Share**. Replacement preserves note ownership and invalidates the old link and its sessions.

Private notes are separated by link identity, not verified person. An owner who retains or replaces a member link can act as that member. Trust the link issuer and project administrator with personal notes; this model does not provide end-to-end privacy against them.

## Availability and zero-charge operation

- Keep Supabase on Free. Do not add payment-dependent services or assume an included paid allowance means no charges.
- Free projects can pause after inactivity. Check the dashboard before the trip and restore the project there if paused. No artificial keep-alive traffic is scheduled.
- The app refreshes manually or when the tab regains focus after at least 30 seconds, not every 15 seconds.
- Quota and availability errors keep form drafts and show a retry/error state. They do not trigger an upgrade or switch storage providers.
- Global limits reduce accidental database growth but do not prevent all malicious invocation/egress exhaustion. Close creation after setup and monitor the Free usage dashboard.
- Treat all scripts hosted under the same GitHub Pages origin as trusted. App-scoped storage keys prevent accidental collisions, not access by other scripts on that origin.

## Private manual backups and restore

Free automatic backups are not assumed. Before the trip and important changes, save a manual export to an encrypted/private location, never Git or Pages. This export contains private notes and credential hashes.

After securely linking the intended hosted project:

```sh
mkdir -p data
npx --no-install supabase db dump --linked --data-only --use-copy --schema trip_private --exclude trip_private.sessions,trip_private.request_limits,trip_private.settings --file data/trip-backup.sql
```

The file is ignored by Git, but it still needs private storage and a separate protected copy. Excluding sessions makes recipients reopen their private links after a restore. Excluding settings leaves new creation disabled on a fresh installation.

Restore into a new, empty, approved project/database: apply the same migrations first, then import the private data dump with secure database tooling. Do not reset or truncate the live project as a shortcut. Check stable note authorship and links, then rotate exposed links and verify permissions before any cutover.

`task backup:check` proves this sequence with synthetic private notes in two disposable local databases. It does not export user trip data or test hosted backup credentials.

## Rollback

Keep the database and private backups. Disable new creation if setup must pause. Redeploy the last compatible frontend/function version rather than resetting data. The original local trip is still available through `task run:sqlite`; it is not a synchronized copy of future online edits.

## Sources

- https://supabase.com/docs/guides/local-development/cli/getting-started
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/platform/going-into-prod#availability
- https://supabase.com/pricing
- https://vite.dev/guide/static-deploy.html#github-pages
