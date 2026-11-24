# Handoff 3: Estado do projeto e execução local

## Estado atual

O Belgium, together é um planejador de viagens compartilhado. A versão atual
do código reúne mapa, agenda e ideias em **Roteiro**. **Notas** e **Listas**
continuam separadas. O frontend usa React e Vite, e o `trip-api` usa Supabase
Edge Functions e Postgres. O modo SQLite é legado e não acessa as viagens
do Supabase.

| Ambiente | Último estado verificado |
| --- | --- |
| GitHub | `main` é o branch padrão. A base deste handoff é `ff44232`, que já inclui Roteiro, gerenciamento local e as migrações `009` e `010`. |
| Supabase local | As migrações `001` a `010` estão aplicadas. A viagem importada continua no banco. O frontend na porta 5173 e o endpoint `/health` da API local responderam com HTTP 200. |
| GitHub Pages | O [último deploy bem-sucedido verificado](https://github.com/danielvie/ferias-2026/actions/runs/40635382127) serviu o commit `bb51a6a`, anterior ao novo Roteiro. O workflow é manual. |

O roteiro foi importado separadamente no Supabase local e no hospedado. As
ideias sem horário ficaram fora da agenda. Não presuma datas ou horários
onde a fonte é incompleta ou contraditória. A importação não é parte do Git,
e a presença de uma migração em `main` não confirma sua aplicação no Supabase
hospedado. Nenhuma migração hospedada foi aplicada ou verificada nesta retomada.
Mantenha documentos de origem, backups, dados da viagem e credenciais fora do
repositório.

## Como rodar e diagnosticar

1. Abra o Docker Desktop e espere `docker info` responder. Use Node 24 ou mais recente.
2. No worktree atualizado, rode `npm ci` se as dependências ainda não estiverem
   instaladas. Depois rode `task run` e abra [a aplicação local](http://127.0.0.1:5173/).
3. Para abrir uma viagem existente, use o acesso já lembrado no navegador ou
   **Viagem → Minhas viagens → Gerenciar todas as viagens** com a senha local
   combinada. O fluxo está em [docs/master-key.md](../docs/master-key.md).

Se aparecer `Cannot connect to the Docker daemon`, o CLI não está conseguindo
acessar o Docker. Se aparecer `container is not ready: starting`, aguarde o
contêiner `supabase_db_ferias-2026` ficar `healthy` antes de tentar novamente.

Se `migration up --local` listar `20260717000900` e `20260717001000` como
ausentes no diretório, confira se o Git está atualizado antes de mexer no
banco. O erro foi reproduzido com `bb51a6a` no worktree e as duas migrações já
aplicadas no Docker compartilhado. Atualizar para `origin/main` resolveu. Não
rode `db reset` nem `migration repair` para contornar esse descompasso.

## Onde retomar

- [Handoff 2](handoff-2-roteiro-local-management.md) registra as decisões de
  interface, o gerenciamento e os testes anteriores. As referências a branch
  e portas daquele documento são históricas.
- [ADR-016](../docs/decisions/016-unify-route-and-itinerary.md) descreve a
  integração do Roteiro; [docs/verification.md](../docs/verification.md)
  separa o que os testes cobrem do que falta validar.
- A tradução pt-BR ainda é parcial e testes de navegador antigos ainda
  esperam a navegação anterior. Para publicar o novo Roteiro, confirme o
  estado das migrações e da Edge Function no ambiente hospedado e siga o
  [guia de publicação](../docs/online-setup.md) com aprovação separada.

## Suggested skills

- `clear-explanations` e `unslop` para documentação em pt-BR.
- `frontend-ui-engineering` para alterações no Roteiro e na navegação.
- `mado-lazy-tester` para escolher testes focados e usar dados descartáveis.
