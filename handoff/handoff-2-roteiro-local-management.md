# Handoff 2: Roteiro e gerenciamento local

## Ponto de retomada

O usuário aprovou a direção visual, a integração inicial e o gerenciamento local
por senha, incluindo exclusão de viagens. A última solicitação foi criar este
handoff, fazer commit e enviar ao remoto. A publicação é no branch
`feature/roteiro-lado-a-lado`, sem merge em `main`, deploy ou alteração do banco
online. Confira `git status`, `git log` e o upstream antes de continuar.

Continue a conversa em pt-BR. O site é para brasileiros. O usuário considera o
projeto descartável e prefere uma solução simples a cadastros, comandos de
provisionamento e controles administrativos complexos. Não amplie o escopo de
autenticação sem uma nova solicitação.

## Decisões desta conversa

1. Foram criados seis protótipos independentes da aparência antiga.
2. O usuário gostou da seleção de cidades no mapa da opção 2 e da organização de
   atividades da opção 6. Isso gerou uma segunda rodada de seis propostas.
3. A opção escolhida foi **2, Lado a lado, da segunda rodada**. O usuário aprovou
   reunir Itinerary e Places em **Roteiro**, mantendo agenda e ideias sem data
   como registros distintos.
4. Ao tentar abrir viagens existentes, o usuário encontrou uma prévia SQLite
   isolada, sem gerenciamento do Supabase. A prévia foi então ligada ao Supabase
   local existente. Não retornar ao SQLite de exemplo e afirmar que ele lista
   as viagens reais do Supabase.
5. O usuário pediu uma senha local simples, já configurada, em vez de geração e
   cadastro manual de master key. O fluxo é **Viagem → Minhas viagens → Gerenciar
   todas as viagens → Senha → Ver viagens → Abrir viagem**.
6. Depois pediu **Excluir viagem**. A implementação confirma nome e ID curto,
   exclui do banco conectado e remove os acessos lembrados neste navegador.
   "Local" foi explicitamente interpretado como essas entradas do navegador,
   não como cópias em outros bancos. Nenhuma viagem real foi excluída nos testes.

A senha, chaves, tokens, identidades pessoais e dados privados não estão neste
handoff. O texto da senha também foi retirado dos arquivos a publicar. O servidor
local conserva o mesmo verificador; não houve troca da senha combinada.

## Artefatos para ler

| Arquivo | Uso |
| --- | --- |
| `prototypes/README.md` | Primeira rodada arquivada, seis HTMLs |
| `prototypes/rodada-2/README.md` | Segunda rodada, decisões D1/D2 e comparação com o aplicativo |
| `docs/decisions/016-unify-route-and-itinerary.md` | Regras e limites da integração escolhida |
| `docs/master-key.md` | Gerenciamento por senha, exclusão e diferenças entre ambientes |
| `docs/verification.md` | Resultados anteriores e escopo de cada verificação |
| `roteiro-lado-a-lado.excalidraw` | Layout e estados editáveis do Roteiro |
| `master-key-access.excalidraw` | Gerenciamento e exclusão editáveis |
| `CONTEXT.md` | Vocabulário: visita, atividade, evento, nota e lista |

Esses documentos contêm os detalhes funcionais. Não reconstruir a especificação
nem gerar outra rodada de protótipos sem pedido do usuário.

## Onde está a implementação

- `src/features/roteiro/`: composição do mapa, agenda, ideias e notas; seleção por
  ID de visita; datas e aliases geográficos; testes de seleção.
- `src/app/App.tsx` e `AppShell.tsx`: navegação Roteiro/Notas/Listas, Compartilhar,
  menu Viagem e integração do gerenciamento.
- `src/features/calendar/` e `src/features/places/`: componentes e formulários
  existentes reaproveitados, com modo incorporado no Roteiro.
- `src/app/MasterKeyPane.tsx`, `TripsList.tsx`, `useTripSession.ts`, `api.ts` e
  `remembered-trips.ts`: gerenciamento, fechamento da viagem excluída e limpeza
  de todas as identidades locais da mesma viagem, somente após sucesso do banco.
- `supabase/functions/trip-api/handler.ts`: endpoints de gerenciamento existentes
  e novo `/master/delete`.
- `supabase/migrations/20260717001000_delete_trip.sql`: exclusão autorizada,
  transacional e repetível, usando as relações com cascata existentes.
- `scripts/dev-online.mjs`: prepara apenas o Supabase Docker local e cadastra o
  verificador da senha de desenvolvimento. Não usar esse verificador no online.

## Workspace e Git

Nesta sessão, a pasta externa `ferias-2026.git` era um repositório contêiner com
`main` sem commit. A aplicação estava em
`.delta/worktrees/0xcyssyqc6k6/ferias-2026`. Confirme a raiz com
`git rev-parse --show-toplevel`; não faça commits da aplicação no contêiner vazio.
Em um clone comum do remoto, todos os caminhos deste handoff são relativos à raiz.

Os protótipos foram inicialmente escritos fora do worktree. Para esta publicação,
foram copiados para `prototypes/` da aplicação, com tarefas próprias. O Taskfile
principal do aplicativo foi preservado. As cópias externas não foram apagadas.

O ambiente criou o commit local `239a295`, "syncing project", sobre `cca3f04`.
Esse snapshot continha a senha local em texto claro. Ele foi preservado no
`main` local, mas **não deve ser publicado nem incorporado ao branch novo**.
O conteúdo foi reaplicado sem o commit original sobre
`feature/roteiro-lado-a-lado`, cuja base era `cca3f04`, e revisado antes dos novos
commits. Isso não reescreve o remoto. Não faça merge automático do `main` local
nesse branch; use o estado atualizado de `origin/main` como referência.

O commit revisado da implementação e dos protótipos é `cd68b43`,
`Integrate roteiro layout and local trip management`. Ele parte de `cca3f04`,
sem o snapshot local `239a295` em sua ancestralidade.

O workflow de Pages é manual. Push de código não é autorização para acioná-lo.
Não usar force-push nem modificar histórico publicado.

## Ambiente local observado

Os endereços abaixo estavam ativos ao preparar o handoff; processos temporários
não são garantidos após encerrar a sessão:

| Porta | Função |
| --- | --- |
| 5180 | Prévia do novo aplicativo, conectada ao Supabase local |
| 54331 | API Deno da revisão nova, ligada ao PostgREST local |
| 54321 | Gateway do Supabase Docker local |
| 5173 | Servidor de outro worktree, anterior à integração |
| 4173 | Comparador dos protótipos |
| 3001 | API SQLite isolada usada anteriormente, não é o banco da prévia atual |

As migrações 009 e 010 foram aplicadas somente no Supabase local. O cadastro da
senha alterou a configuração local, não o conteúdo das viagens. Sessões foram
criadas ao testar abertura. O banco online não foi migrado, reconfigurado ou
publicado nesta conversa.

O lançador temporário `/tmp/start-ferias-local-password.cjs` iniciou a API em
54331 e a prévia em 5180 para não substituir o servidor anterior. Ele não foi
versionado e lê credenciais locais em memória. Não copiar logs, credenciais ou
conteúdo de `/tmp`, `data/` e `.env*` para o repositório.

Para uma retomada normal, use `task run` com Docker e dependências instalados.
Ele prepara o Supabase local e usa 5173. Verifique conflitos de portas antes de
iniciá-lo; não encerre processos de outros worktrees indiscriminadamente.

## Verificação e comandos

Executados novamente antes dos commits desta publicação:

```sh
npm run build
npm test -- --reporter=dot
task prototypes:check
task --list
```

Build e TypeScript passaram; **207 testes em 36 arquivos** passaram. Os três
scripts dos protótipos passaram na verificação de sintaxe.

Também foi repetido `task test:trip-delete`, usando a senha somente no ambiente
do processo via `TRIP_MANAGEMENT_PASSWORD`. O teste cria seus próprios IDs,
recusa APIs externas e exclui apenas suas viagens descartáveis. Cobre cancelamento,
falha sem limpeza local prematura, nova tentativa, exclusão de viagem não ativa,
exclusão da ativa e recarga. Passou sem apagar viagens preexistentes.

Para testar a exclusão em outra prévia local, configure
`TRIP_DELETE_TEST_URL` e `TRIP_MANAGEMENT_PASSWORD` na sessão do terminal.
Não registrar os valores em documentos, comandos versionados ou logs.

Verificações anteriores desta conversa, não confundidas com a suíte inteira:

- Oito fluxos novos em `tests/e2e/roteiro.spec.ts` passaram contra SQLite isolado.
- Agenda inspecionada em 320, 390, 768, 1024 e 1440 px, com checks axe.
- Cada rodada de protótipos passou por 336 combinações de dia e largura.
- Gerenciamento foi exercitado contra Supabase local, incluindo senha incorreta,
  abertura como proprietário e retorno após recarga.

Para servir os desenhos arquivados, use `task prototypes:run`. A primeira rodada
abre em `/`, a segunda em `/rodada-2/`. Os checks de navegador ficam em
`/check.html` e `/rodada-2/verificar.html`. `task run` serve o aplicativo, não os
protótipos.

## Pendências conhecidas

- A tradução pt-BR é parcial. Configurações, acesso, listas, sugestões antigas
  e mensagens do servidor ainda têm trechos em inglês.
- Os E2E antigos ainda esperam a navegação e o layout anteriores. Não executar
  a suíte inteira e anunciar sucesso com base apenas nos oito testes novos.
- O mapa é esquemático e usa destinos conhecidos. Cidades desconhecidas ficam
  na lista. Não há geocodificação, cálculo de percurso ou rastreamento ao vivo.
- A limpeza local ocorre no navegador e no escopo do banco conectado. Não remove
  cópias em outro SQLite/Supabase nem dados de outros dispositivos.
- Nenhum deploy desta integração ou das migrações 009/010 foi feito online.
- Não há uma próxima funcionalidade aprovada além do que já foi entregue. Retome
  pelo feedback do usuário; não introduza rigor adicional por iniciativa própria.

## Suggested skills

- `clear-explanations` e `unslop` para comunicação curta em pt-BR.
- `incremental-implementation` para mudanças pequenas e verificáveis.
- `frontend-ui-engineering` para ajustes no Roteiro e nas telas existentes.
- `source-driven-development` quando precisar confirmar APIs de React ou browser.
- `documentation-and-adrs` ao atualizar decisões ou limites de publicação.
- `excalidraw-design` para manter os desenhos editáveis coerentes com a interface.
- `handoff` para futuras transferências de contexto.

Esta solicitação não autorizou subagentes. Também não autoriza deploy, merge em
`main`, restauração de backup ou exclusão de viagens reais como teste.
