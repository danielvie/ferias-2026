# ADR-003: Use private links instead of application sign-in

## Status

Accepted for the Supabase online target. Database, Edge API and browser integration are implemented and locally verified; hosted deployment remains pending. Resolves Q3 in `tasks/online-plan.md` and replaces that plan's proposed account-based access.

## Context

The app is for a small group. The user explicitly chose sharing through links with no sign-in. The existing local application already uses private capabilities and logical members rather than verified accounts.

Supabase Free and GitHub Pages remain selected. Supabase Auth is not required just because Supabase stores the data.

## Decision

Use separate, high-entropy links for owner, editor, viewer and family roles. A link is an application credential and identifies a logical member, not a verified person. Display names are labels only.

Capture the capability from a URL fragment and exchange it over HTTPS for an expiring application session. Keep only credential hashes in Postgres. Keep the derived session in app-scoped `sessionStorage` for refresh within a tab; keep the reusable link out of persistent browser storage. Reopening the private link restores access in another tab/device.

Edge Functions authenticate these custom credentials rather than requiring a Supabase Auth JWT. Direct client table/routine access is denied through grants and RLS. A server-only database client may bypass RLS, so credential-aware database operations must enforce membership, role, authorship, link revocation, session expiry and revisions. A public project key or known trip ID is insufficient.

Revoke a parent link to invalidate all its sessions. Rotate credentials without changing the logical member ID, preserving private-note ownership. Keep the existing restricted family projection.

## Alternatives

Google/email/password sign-in was rejected by the user. Do not add a hidden anonymous Supabase account flow as a substitute for the approved capability model.

Making the trip readable/writable to anyone with the publishable project key would remove authorization rather than implement link-only access. It is not an acceptable simplification.

Cross-site HttpOnly cookies are not the default because GitHub Pages and the API are on different origins and browser restrictions make that transport unreliable. The chosen browser-held session has different security properties, stated below.

## Consequences

Anyone who receives or copies a link gets its privileges. Two people sharing the same editor link share its logical identity and can read that identity's private notes. Give travelers distinct links when their private notes must be separate.

The owner creates member links and can replace their credentials. An owner who retains or replaces someone's link can open it and act as that logical member. Author-only filtering separates link identities; it does not provide verified-person privacy against the issuer or project administrator. The UI must state this limit rather than promise otherwise.

Keep the owner link private and save it securely. There is no email/password recovery. A lost owner credential can only be recovered through an already authorized owner session or secure project-admin tooling.

Browser-held sessions are script-readable, not HttpOnly. Bound their lifetime, avoid unnecessary third-party scripts, protect against XSS, omit secrets from logs/analytics and use HTTPS. Revocation cannot erase data already downloaded.

Unauthenticated creation and link exchange need body/resource/rate limits appropriate to a small personal deployment. Public availability must not consume the entire Free quota without controls.

The later user request authorizes local migration implementation. Cloud resource changes, hosted data writes, real-data imports, paid services and publication still require separate approval.

## References

- Provider decision: `docs/decisions/002-supabase-free-and-github-pages.md`
- Implementation plan: `tasks/online-plan.md`
- Supabase custom-auth functions: https://supabase.com/docs/guides/functions/auth
- Browser preflight handling: https://supabase.com/docs/guides/functions/cors
