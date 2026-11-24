# ADR-017: Planejar atividades sem definir horário

## Status

Aceito. Substitui a regra de aviso por ordem da rota do ADR-006.

## Contexto

Um passeio pode ter dia definido antes de ter horário. Exigir início e fim
levava a preencher estimativas só para colocar o passeio na agenda. O aviso
global também tratava retornos intencionais à mesma cidade como conflito.

## Decisão

A ordem da rota organiza as paradas. A agenda usa as datas dos eventos e não
avisa quando as duas ordens diferem. O aviso pontual de sobreposição continua
para dois eventos com horário no mesmo dia.

Uma ideia continua sem data até ser agendada. Ao adicionar uma atividade ou
agendar uma ideia, deixar início e fim em branco coloca a atividade no grupo
**Sem horário**. Editar a atividade permite mudar de data ou incluir um horário
sem trocar seu ID. Excluir o último agendamento de uma ideia não apaga a
atividade salva: ela volta a aparecer em **Ideias da cidade**. Um transporte
provisório também pode ficar **Sem horário**, por exemplo, quando a data do voo
é conhecida, mas o embarque ainda não foi conferido. Transporte planejado e
hospedagem continuam exigindo início e fim.

No comando `event.save`, uma entrada sem horário tem `startTime` e `endTime`
iguais a `''`. Não se aceita só um horário. Eventos com horário ainda requerem
fim posterior ao início no mesmo dia. SQLite e PostgreSQL armazenam eventos em
JSON, sem migração nem alteração dos eventos existentes.

## Publicação

Atualizar a API antes de oferecer o formulário novo. A API anterior rejeita
horários vazios. O desenho editável está em
[e-02-agenda-sem-horario.excalidraw](../../e-02-agenda-sem-horario.excalidraw).
