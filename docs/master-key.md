# Gerenciar todas as viagens

## Ambiente local

Abra **Viagem → Minhas viagens → Gerenciar todas as viagens**. Informe a senha
combinada, clique em **Ver viagens** e depois em **Abrir viagem**.
Não é preciso gerar um arquivo de chave nem fazer cadastro manual.

O verificador da senha de desenvolvimento fica em `scripts/dev-online.mjs`,
somente no lado do servidor. O texto da senha não está versionado. `task run` registra seu hash automaticamente no Supabase local, depois
das migrações. Essa configuração é intencional para este projeto descartável;
não é aplicada ao Supabase online. A lista vem do banco conectado, não do
histórico do navegador. O runner SQLite legado não oferece este recurso.

A prévia em `http://127.0.0.1:5180/` passou a usar o Supabase local, em vez do
SQLite temporário. As viagens de exemplo do SQLite não foram apagadas ou
importadas. O servidor anterior na porta 5173 não foi substituído.

## Excluir uma viagem

Em **Gerenciar todas as viagens**, use **Excluir viagem**. A confirmação mostra
o nome e o ID curto da viagem e avisa que não é possível desfazer.

A exclusão remove a viagem e seus dados vinculados do banco conectado, incluindo
atividades, notas, listas, participantes, convites e sessões. Depois da confirmação
do servidor, todos os acessos dessa viagem salvos neste navegador são removidos,
mesmo quando há mais de um participante lembrado. Outras viagens são preservadas.
Se a viagem excluída estiver aberta, ela é fechada.

Cancelar não altera nada. Se a solicitação falhar, a entrada local é mantida para
nova tentativa. A operação pode ser repetida se a resposta da primeira tentativa
se perder. Não apaga cópias em outros bancos nem o histórico de outros dispositivos.

A exclusão usa a migração 010. `task run` aplica as migrações locais normalmente.
Para verificar com viagens descartáveis, com a prévia local ativa em 5180:
`task test:trip-delete`, com `TRIP_MANAGEMENT_PASSWORD` definido na sessão do
terminal. Não grave o valor em arquivos versionados. O teste só exclui os IDs
que ele próprio criou.

## Uso e configuração online

A versão online continua exigindo configuração explícita do banco, da API e do
frontend. Ela não recebe a senha local automaticamente.

Use **Viagem → Minhas viagens → Gerenciar todas as viagens**, informe a chave
configurada naquele banco e clique em **Ver viagens**. A lista mostra título,
datas, organizador e um ID curto para distinguir nomes iguais.

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

The endpoints are under `/functions/v1/trip-api`. They require JSON POST
requests and share the existing global opening limit of 60 requests per minute.
Never put the key in query parameters or fragments.

| Endpoint | JSON request | Successful response |
| --- | --- | --- |
| `/master/trips` | `{ "key": "<master-key>" }` | Array of `{ id, title, startDate, endDate, ownerName }` |
| `/master/open` | `{ "key": "<master-key>", "tripId": "<uuid>" }` | `{ snapshot, sessionToken }` for the existing owner |
| `/master/delete` | `{ "key": "<master-key>", "tripId": "<uuid>" }` | `{ ok: true }`, inclusive quando o ID já foi excluído |

Both use HTTP 200 on success, `Cache-Control: no-store`, and the normal origin
checks. An invalid or disabled key returns the same 401 message. Invalid trip ID
syntax returns 422; a deleted trip or missing active owner link returns 404 after
key authentication. Rate limiting returns 429. Existing `/trip` and `/commands`
requests use the returned `X-Trip-Session`, never the master key.

See [ADR-015](decisions/015-open-trips-with-a-master-key.md) for the permission,
revocation and deployment boundaries, and
[master-key-access.excalidraw](../master-key-access.excalidraw) for editable UI states.
