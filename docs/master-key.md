# Open trips with a master key

This feature supports local Docker Supabase and hosted Supabase, not the legacy
SQLite runner. It must be deployed and explicitly configured before use.

## Use it

Choose **Trips → Use master key**, or **Open trip link → Use master key instead**.
Enter the key, select **Show trips**, then open a trip. The list shows its title,
dates, owner and short ID to distinguish trips with identical names.

Opening uses the trip's existing owner identity and permissions. The owner's
private notes are visible; other members' private notes remain hidden. Edits
appear under the owner's name, just as when using the owner recovery link.
Existing invitation and recovery links still work.

The master key is not saved by the app. Closing the picker discards it. Opening
a trip remembers only that trip's derived owner session on this trusted browser.
Use **Exit** or **Forget this trip** to remove that remembered access.

## Configure the same key in both databases

First apply migration 009 and run the matching API/frontend locally:

```sh
task db:migrate
task run
```

After a separately approved hosted migration/API/frontend deployment, generate
one key and configure both environments from the same file:

```sh
task master-key:generate
task master-key:set -- --local
task master-key:set -- --project-ref oljadunrwnagspncclha
```

Generation creates `data/master-key.txt` with owner-only permissions, refuses to
overwrite it, and requires that Git ignores the path. No key is printed.
Open that private file locally and store its contents in your password manager.
Do not paste it into chat, an issue, source code, `.env.local`, a URL, or any
`VITE_*` variable. On Windows also restrict the file's ACL to your user.

The setup command reads the file, hashes the key, and sends only the hash to
the explicitly selected database. Hosted setup requires a Supabase CLI login
with database access; a browser publishable key cannot configure master access.

Use `--file /path/to/private-key.txt` with **set** to reuse a securely transferred
key from another machine. Do not independently generate a new key for each
environment if both should accept the same key.

## Replace or disable

To replace the key, securely retain the old file if needed for recovery and move
it out of `data/master-key.txt`, then generate a fresh one and run both **set**
commands again. Do not overwrite a key before checking which environments use it.
Reapplying an unchanged key does not revoke sessions.

To disable:

```sh
task master-key:disable -- --local
task master-key:disable -- --project-ref oljadunrwnagspncclha
```

Replacement or disabling revokes sessions created using that database's old
master key. It does not delete trips or change ordinary links/sessions. Updates
are independent; if the second environment fails, retry it explicitly. A leaked
shared key must be replaced in both.

A master-key holder has full owner powers, including creating or replacing
individual trip links. Master-key revocation cannot undo those actions. Review
issued links separately after suspected misuse.

Private backups include the master-key hash. Restoring an older backup can
restore an old key configuration; reconfigure or disable master access before
exposing a restored database.

## API

Both endpoints are under `/functions/v1/trip-api`. They require JSON POST
requests and share the existing global opening limit of 60 requests per minute.
Never put the key in query parameters or fragments.

| Endpoint | JSON request | Successful response |
| --- | --- | --- |
| `/master/trips` | `{ "key": "<master-key>" }` | Array of `{ id, title, startDate, endDate, ownerName }` |
| `/master/open` | `{ "key": "<master-key>", "tripId": "<uuid>" }` | `{ snapshot, sessionToken }` for the existing owner |

Both use HTTP 200 on success, `Cache-Control: no-store`, and the normal origin
checks. An invalid or disabled key returns the same 401 message. Invalid trip ID
syntax returns 422; a deleted trip or missing active owner link returns 404 after
key authentication. Rate limiting returns 429. Existing `/trip` and `/commands`
requests use the returned `X-Trip-Session`, never the master key.

See [ADR-015](decisions/015-open-trips-with-a-master-key.md) for the permission,
revocation and deployment boundaries, and
[master-key-access.excalidraw](../master-key-access.excalidraw) for editable UI states.
