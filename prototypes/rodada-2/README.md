# Rodada 2: cidades no mapa, atividades por dia

## Direção escolhida

**D1. A variante 2, Lado a lado, foi escolhida pelo usuário para orientar a integração com o aplicativo existente.** A seleção do desenho não significa remover funcionalidades nem substituir os dados reais pelo conteúdo dos protótipos. D2 também foi aprovada: reunir Itinerary e Places em Roteiro, preservando agenda e ideias como registros distintos. A integração inicial está no branch `feature/roteiro-lado-a-lado`, em `src/features/roteiro/`.

Abra http://localhost:4173/rodada-2/ com `task prototypes:run` ativo na raiz do repositório.

Esta rodada combina a seleção de cidades do protótipo 2 anterior com a organização de atividades do protótipo 6. A primeira rodada continua intacta em http://localhost:4173/.

## As seis propostas

| Variante | Entrada | Organização |
| --- | --- | --- |
| 1. Panorama | [1.html](1.html) | Mapa horizontal, semana ilustrada e detalhes em três colunas. |
| 2. Lado a lado | [2.html](2.html) | Mapa e dias da cidade à esquerda. Semana, atividades e notas à direita. |
| 3. Por cidade | [3.html](3.html) | Mapa e índice abrem `cidade.html`. A página reúne datas, atividades e notas daquela parada. |
| 4. Caderno | [4.html](4.html) | Agenda cronológica, um dia aberto por vez. Mapa e bilhete do grupo ao lado. |
| 5. Dia em foco | [5.html](5.html) | Um dia em primeiro plano. O mapa abre e fecha na mesma tela. |
| 6. Rota e agenda | [6.html](6.html) | Duas páginas: `rota.html` para escolher cidades e `agenda.html` para consultar três dias próximos. |

Nas opções 3 e 6, os links carregam arquivos HTML separados. Não há submenus nem mais de um nível de detalhe. As outras opções mudam o conteúdo na própria página.

O comparador inferior pertence ao estudo, não ao site proposto. Ele preserva a data entre as variantes e inclui um link para a primeira rodada. As setas esquerda e direita também trocam de proposta, exceto dentro de formulários ou diálogos.

## Interações

- Escolher uma cidade destaca a parada e mostra suas datas. Selecionar Liège permite alternar entre visitas distintas, sem prender a cidade a um único dia.
- Escolher um dia atualiza atividades, pernoite e notas. Dias de ida e volta também estão disponíveis.
- Atividades e notas abrem diálogos nativos com Escape e retorno de foco.
- Cidade, data e variante ficam na URL. Exemplo: `index.html?variante=2&dia=8&cidade=liege`.
- Voltar e avançar no navegador recupera seleções e navegação entre páginas.

## Premissas e limites

Todo o texto desta rodada está em pt-BR. São protótipos descartáveis de leitura, sem edição, login, reservas, colaboração em tempo real ou persistência.

O conteúdo segue a mesma viagem de 02 a 15 de dezembro de 2026. Gante e outros planos continuam provisórios. Os horários são ilustrativos, e as datas seguem o quadro geral do roteiro de origem onde ele diverge do detalhamento.

Uma cidade pode aparecer em vários dias, e um dia pode passar por várias cidades. A agenda mostra o dia inteiro, incluindo deslocamentos e alternativas, não apenas atrações da cidade selecionada. Eindhoven continua sendo a base de pernoite dos bate-voltas, embora esses dias estejam associados às cidades visitadas.

Os mapas são esquemáticos, não indicam escala, distâncias ou uma sequência exata de deslocamentos. O mapa da variante 6 testa um desenho de linha de transporte. As notas esclarecem as pendências; nenhuma reserva é apresentada como confirmada.

As ilustrações SVG e os dados foram copiados para `dados.js` para não alterar a primeira rodada. Isso é intencional nesta comparação descartável. Na implementação escolhida, usar uma única fonte de dados. Google Fonts é opcional; há fontes locais de reserva e nenhuma dependência para os desenhos ou mapas.

## Verificação

Com `task prototypes:run` ativo, execute `task prototypes:check` e abra [verificar.html](verificar.html).

A verificação no navegador cobre as seis variantes, os 14 dias e larguras de 320, 768, 1024 e 1440 pixels. Testa cidades clicáveis, múltiplas datas, atividades, notas, páginas separadas, troca de variante, recarga e parâmetros inválidos. Não substitui avaliação visual ou teste com tecnologia assistiva.

Para comparar, tente achar o dia 08 em Liège, suas atividades e sua nota. Depois abra Eindhoven pelo mapa e volte à seleção anterior. Na opção 3, experimente entrar na página de uma cidade. Na opção 6, alterne entre Rota e Agenda.

## Comparação com o aplicativo implementado

A inspeção original usou o código `cca3f04`. Na ocasião, o servidor local na porta 5173 usava outro worktree, em `bb51a6a`. A diferença entre essas revisões adicionava acesso por chave-mestra. Este registro descreve a análise anterior à integração, não o estado atual do deploy.

A interface local foi examinada com respostas de API simuladas em um navegador isolado. Os exemplos incluíam duas visitas a Liège, uma atividade agendada, uma ideia sem data, notas com visibilidades distintas e listas gerais e de cidade. Nenhum pedido de dados desse navegador foi encaminhado à API real. A inspeção visual não valida persistência ou permissões do servidor; essas regras foram conferidas no código. Nenhum dado de viagem foi alterado.

### Funcionalidades e destino proposto

| Recurso implementado | Situação no protótipo 2 | Proposta de integração |
| --- | --- | --- |
| Itinerário contínuo, todos os dias, seletor de datas e navegação lateral | Exibe um dia e uma semana com dados fixos | Agenda diária com seletor que alcance todo o período real, inclusive dias vazios. |
| Eventos com início/fim, transporte, hospedagem, plano provisório e avisos de sobreposição | Lista simplificada, sem edição | Manter horários, tipos e avisos; ações de adicionar/editar nos detalhes. |
| Atividades salvas sem data, categorias, busca, sugestões, duração, custo, endereço e site | Não representadas como coleção independente | Área "Ideias da cidade", com inclusão rápida e agendamento. Não criar eventos automaticamente. |
| Visitas repetidas, reordenação da rota, mover atividades e desfazer | Mapa com cidades únicas fixas | Preservar IDs das visitas. Diferenciar passagens pela mesma cidade e manter "Organizar rota". |
| Datas opcionais de chegada/saída por visita | Datas fixas por cidade | Usar datas reais, manter intervalos incompletos e avisos. Alterar a estadia não altera eventos. |
| Notas privadas e do grupo, associadas a viagem/cidade/atividade/dia, com comentários | Notas estáticas em diálogos | Resumo contextual na agenda e na cidade. Página Notas para busca, edição e comentários. |
| Checklists gerais e de cidade, responsáveis, conclusão, cópia e ordenação | Ausentes | Página Listas e acesso direto às listas da visita selecionada. |
| Deslocamentos com checklist independente e estados pendente/concluído/ignorado | Texto ilustrativo de rota | Resumo no dia e acesso às verificações daquele deslocamento. Não confundir com listas gerais. |
| Convite reutilizável, identidade individual, acesso somente leitura e acesso familiar filtrado | Apenas URL do protótipo | Botão Compartilhar usa o fluxo existente. A URL de seleção não substitui o convite. |
| Configurações, viagens lembradas, perfil e histórico, recuperação do proprietário | Ausentes | Menu da viagem/perfil, fora do conteúdo principal. Preservar os fluxos existentes. |
| Salvamento, erro, conflito de revisão, perda de acesso e atualização ao voltar à aba | Sem servidor ou persistência | Reusar `TripContext`, `useTripSession` e comandos atuais. Não substituir por manipulação de DOM do protótipo. |

### Organização proposta na análise

- Navegação principal: **Roteiro, Notas e Listas**. Compartilhar permanece como ação visível. Configurações, perfil e troca de viagem ficam em um menu secundário.
- Roteiro no desktop: mapa e contexto da visita à esquerda; datas, atividades e notas do dia à direita.
- "Ideias da cidade" preserva atividades ainda não agendadas, com acesso a busca, filtros, sugestões e inclusão rápida.
- "Organizar rota" mantém criação, ordem, datas e movimentação de visitas. Não colocar todos esses controles sobre o mapa.
- Ações de edição aparecem sob demanda, sem perder campos, avisos, validações ou retorno de foco.
- No celular, oferecer mapa recolhível para que a consulta do dia não exija rolar uma tela inteira antes das atividades. Essa adaptação é uma proposta, não uma decisão já aprovada.

**D2. Reunir Itinerary e Places na área Roteiro.** Aprovado pelo usuário. Agenda e ideias sem data continuam distintas, sem fundir registros ou eliminar ferramentas de planejamento.

### Cuidados antes de implementar

1. O `City` atual é uma visita com ID, nome e datas opcionais, não uma cidade geográfica única. Uma parada no mapa pode precisar oferecer mais de uma visita. Nomes não devem virar IDs.
2. Um dia pode passar por várias cidades. A seleção no mapa não deve ocultar silenciosamente atividades do restante do dia. Dias sem eventos continuam aparecendo; chegada/saída registradas são independentes da agenda.
3. O modelo não tem país nem coordenadas. O mapa fixo do protótipo não cobre cidades arbitrárias, que o aplicativo permite adicionar. Uma primeira integração pode usar SVG para destinos conhecidos e uma lista sempre acessível para os demais, sem nova dependência de mapas.
4. `PlaceCard.tsx` acrescenta `Belgium` a todo link de direções. Isso precisa ser revisto para destinos nos Países Baixos. Não confundir o mapa de seleção com instruções de navegação.
5. Notas privadas continuam exclusivas da identidade autora. O acesso familiar não recebe notas, listas, hospedagens nem datas privadas das visitas; o novo mapa deve respeitar a resposta filtrada da API.
6. Tradução inclui navegação, formulários, erros, estados, datas e rótulos de acessibilidade. Usar pt-BR na apresentação, mantendo o fuso da viagem em Europe/Brussels e valores internos compatíveis.
7. O protótipo inclui textos livres de pernoite e horários como "À tarde". Não são campos equivalentes no modelo real. A integração deve mostrar eventos e estadias efetivamente cadastrados, sem inventar reservas ou converter períodos em horas arbitrárias.

### Ordem sugerida

1. Montar o Roteiro de leitura sobre os dados reais: mapa/visita, período, dia, atividades, notas e dias vazios. Verificar visitas repetidas, dias com várias cidades e acesso familiar.
2. Reencaixar inclusão, edição, agendamento, ideias, movimentação e checklists, reaproveitando os comandos. Verificar falhas de salvamento, conflitos e preservação de vínculos.
3. Simplificar a navegação e concluir a tradução pt-BR. Verificar convite, retorno à viagem, somente leitura, teclado e celular antes de substituir a tela antiga.

Nenhuma etapa autoriza migração de dados reais ou publicação. D1 e D2 estão aprovadas. A implementação e suas verificações são registradas no README e no ADR-016 do aplicativo.

### Referências de código

Os caminhos abaixo são relativos à raiz do repositório:

- `shared/model.ts`, `shared/route.ts`: visitas, eventos, atividades, notas e comandos.
- `src/app/App.tsx`, `AppShell.tsx`, `TripContext.tsx`, `useTripSession.ts`: navegação, integração e salvamento.
- `src/features/calendar/CalendarPage.tsx`, `EventForm.tsx`: agenda e edição.
- `src/features/places/PlacesPage.tsx`, `CheckpointDetails.tsx`, `CityDates.tsx`, `CityChecklists.tsx`, `PlaceCard.tsx`: planejamento por visita.
- `src/features/notes/NotesPage.tsx`, `NoteCard.tsx`: busca, visibilidade e comentários.
- `src/features/checklists/ChecklistsPage.tsx`, `DeparturesSection.tsx`: listas e deslocamentos.
- `src/features/sharing/SharingPage.tsx`, `server/permissions.ts`: convite e limites de acesso.
- ADR-013 e ADR-014: checklists por visita e datas independentes da agenda. O README geral contém descrições antigas de checklists de chegada/saída; o código e o ADR-013 usam um único ponto de acesso por visita.
