# ADR-002: Plan the online target on Supabase Free and GitHub Pages

## Status

Accepted provider and cost constraints for the online target. Not implemented or deployed. ADR-003 resolves the access model as private links without application accounts or sign-in.

ADR-001 remains the record of the running local implementation. This decision replaces its local-only hosting/storage target only after a verified migration; it does not authorize removing SQLite data or changing current access.

## Context

The user wants online collaboration, requires no charges, intends to host only the frontend on GitHub Pages, and selected Supabase after comparing free alternatives. The existing planner uses a Node API, SQLite and revocable bearer links. A static Pages deployment cannot run that backend.

The application must preserve its approved layout, dashboard-first entry, member roles, author-only private notes, family redaction, independent departure checks and stale-write protection.

## Decision

Plan for GitHub Pages to serve the React build and Supabase Free to provide Postgres and Edge Functions. Supabase Auth is not part of the selected application access model. Use explicit database grants and RLS to block direct client access, with trusted capability-aware command validation and atomic database transactions as detailed in ADR-003.

Keep the frontend API boundary so feature components do not acquire provider-specific database access. Avoid a multi-provider abstraction with no current requirement.

Stay on a genuine Free organization/project. Do not enable paid plans, add-ons, billing-backed trials, purchased domains or automatic upgrades. Quota exhaustion may reduce availability; it never authorizes spending.

## Alternatives

Firebase Spark provides free document storage and supported authentication, but deployed Cloud Functions and file storage require Blaze. A rules-only migration would change the existing trusted sharing design more substantially.

Cloudflare Workers Free and D1 are a viable API/SQLite-compatible alternative. The user chose Supabase instead, with relational policies and functions. Its optional account-authentication product is not needed for this app.

Hosting the current Node/SQLite server would minimize application changes, but it would leave server and persistent-disk operations outside GitHub Pages and would need a separate verified no-charge host.

## Consequences

Supabase Free projects may pause after seven days of low activity and require manual restoration. Free automatic database backups are not included. Maintain a private manual export/restore procedure and verify service before travel.

GitHub Pages and Supabase are different origins. Repository-aware asset/share URLs and browser-safe capability/session/preflight handling must replace the local same-origin assumptions. No OAuth return URLs are needed.

Private notes cannot remain embedded in a broad client-readable trip JSON blob. RLS and transactional routines need tests using anonymous, member, unrelated and privileged access paths. Secret/service-role keys stay out of the browser and Pages repository.

The user has approved planning with these providers, not resource provisioning, account configuration, migration, deployment, repository publication or a paid subscription.

## References

- Implementation plan: `tasks/online-plan.md`
- Supabase Free: https://supabase.com/pricing
- Cost controls: https://supabase.com/docs/guides/platform/fair-use-policy
- Availability and backups: https://supabase.com/docs/guides/platform/going-into-prod#availability
- Database authorization: https://supabase.com/docs/guides/database/postgres/row-level-security
- Function authorization: https://supabase.com/docs/guides/functions/auth
