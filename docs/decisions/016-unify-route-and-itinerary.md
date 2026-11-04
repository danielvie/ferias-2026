# ADR-016: Reunir agenda e atividades em Roteiro

## Status

Implementado localmente no branch `feature/roteiro-lado-a-lado`. Não publicado.
O usuário escolheu a variante 2 da segunda rodada e aprovou reunir Itinerary e
Places em Roteiro.

## Contexto

Consultar o dia, a cidade e suas notas exigia trocar de páginas. O desenho
aprovado coloca um mapa à esquerda e a agenda à direita, mas o protótipo não
incluía edição, ideias sem data, visitas repetidas, listas ou permissões reais.

## Decisão

A navegação principal oferece Roteiro, Notas e Listas. Compartilhar é uma ação
visível, e os demais controles ficam no menu Viagem e no perfil.

Roteiro usa a mesma sessão, `TripContext` e comandos existentes. A agenda mostra
todos os eventos do dia, inclusive quando passam por cidades diferentes.
Ideias da cidade mostra primeiro atividades sem agendamento e permite incluir
as já agendadas no filtro. Salvar uma ideia não cria um evento.

As visitas continuam identificadas pelo ID. Um ponto do mapa pode representar
várias passagens; a lista abaixo dele permite escolher cada visita separadamente.
A localização ilustrada cobre destinos conhecidos na Bélgica e nos Países Baixos.
Cidades desconhecidas continuam disponíveis na lista. O mapa não calcula rotas,
distâncias ou tempos e não exige API externa.

Datas explícitas de uma visita e datas de seus eventos compõem seus atalhos.
Intervalos completos incluem dias sem eventos. Datas incompletas não são
preenchidas por suposição. Eventos fora da estadia permanecem acessíveis.
O acesso familiar deriva suas opções somente da resposta já filtrada da API.

Organizar rota abre os controles existentes para adicionar, mover e reordenar.
Formulários de atividade, agendamento e notas reutilizam os componentes atuais.
Trocar entre agenda e ideias mantém os componentes montados para preservar
rascunhos. Durante um formulário aberto, os seletores do Roteiro ficam bloqueados.
A regra existente de navegação global continua válida: não há salvamento
automático de rascunhos ao sair para outra página.

Dia e visita selecionados ficam nos parâmetros `dia`, `parada` e
`roteiroViagem`. A restauração valida o período e os IDs contra a viagem atual.
Esses parâmetros não concedem acesso e não substituem o convite privado.
Não são criadas entradas de histórico a cada seleção.

No celular, o mapa começa recolhido. Selecionar a parada o recolhe novamente e
devolve o foco ao controle que permite abri-lo.

O desenho editável está em
[roteiro-lado-a-lado.excalidraw](../../roteiro-lado-a-lado.excalidraw).

## Consequências

- Nenhuma mudança de esquema, migração ou substituição de dados reais.
- Campos, permissões, revisão otimista, conflitos e atribuição existentes continuam.
- O agendamento de uma ideia começa na data selecionada no Roteiro.
- Links de direções não acrescentam mais Belgium a destinos de outros países.
- Componentes antigos de agenda e rota continuam reutilizáveis; os testes
  estruturais antigos da agenda contínua não validam o novo layout.
- A suíte de navegador `roteiro.spec.ts` cobre a integração nova. Os demais
  testes E2E ainda referenciam a navegação e textos antigos e precisam ser
  adaptados antes de usar a suíte inteira como critério de publicação.
- Navegação, agenda compacta, ideias, detalhes e notas foram adaptados para pt-BR.
  Tradução integral de configuração, acesso, listas, sugestões legadas e
  mensagens provenientes do servidor fica para a próxima etapa. Não é uma
  entrega de localização completa.

## Referências

- https://react.dev/learn/sharing-state-between-components
- https://react.dev/learn/preserving-and-resetting-state
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal
- ADR-013: listas por visita.
- ADR-014: datas da visita independentes dos eventos.
