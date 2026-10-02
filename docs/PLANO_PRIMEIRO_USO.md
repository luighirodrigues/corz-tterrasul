# Painel para quem abre pela primeira vez — plano de implementação

**Objetivo:** o gestor que abre o painel pela primeira vez entende em poucos segundos como está o atendimento e chega
às conversas que precisam de atenção. No caminho, não encontra termo técnico nem número que não bate com outro.

**Origem:** revisão das telas em 02/10/2026, com o app rodando com os dados da semana de 23 a 29/09, em 1280px e 390px.

**Status:** decisões da §2 confirmadas em 02/10/2026, todas como recomendadas. **Nada implementado:** a implementação
espera liberação.

**Ordem:** a parte A (U1 a U8) corrige o que o gestor percebe no primeiro minuto. A parte B (U9 a U13) encurta o
caminho e a parte C (U14 e U15) tira o que parece tela gerada. U16 é a verificação. Cada etapa termina com `pnpm test`
e `pnpm web:build`.

**O que não muda:** o estilo do `docs/UI_REDESIGN.md` (cores, fonte e componentes). Os jobs e as regras de cálculo
também ficam como estão, exceto a consulta da lista de conversas (U4 e U10).

---

## 1. O que as telas mostram hoje

### Números que não batem (semana de 23 a 29/09, banco de desenvolvimento)

| Onde aparece | Valor | De onde vem |
|---|---|---|
| Subtítulo: "241 conversas avaliadas" | 241 | encerradas na semana, com nota na versão atual da análise (`reports-loader.ts:103`) |
| Indicadores (1ª resposta, sem resposta, retomadas) | 280 | conversas **iniciadas** na semana (`job-c-synthetics.ts:10`) |
| Conversas: "Mostrando 50 de 256" | 256 | encerradas na semana com análise pronta **de qualquer versão** (`sessions-loader.ts:46`): 241 com nota, 14 avaliadas sem nota e 1 avaliada só na versão antiga |
| Observações: "282 de 311 conversas…" | 311 | encerradas na semana, incluindo 56 sem fala de nenhuma pessoa |
| Histograma: "112 de 241 conversas atingiram a meta" | 112 | o histograma **arredonda** a nota (`aggregate.ts:81`), então 7,5 conta como 8 |
| Conversas com nota 8 ou mais, sem arredondar | 103 | as 9 conversas entre 7,5 e 7,9 aparecem "na meta" no histograma e com o chip "Atenção" na lista |
| Análise: "Base: 167 conversas de 241" | 241 | usa `totalConversas`, mas a frase da IA ao lado diz "Em 167 das 236": o total da frase conta só as conversas em que o critério se aplica (`n_total`, `stage2.ts:151`) |

### Termos técnicos na tela

- "sem esteira" aparece em quase toda linha de Conversas e na janela da conversa (`sessions-loader.ts:94`). A coluna
  se chama "Painel", mas mostra a etapa do CRM ("Agendado").
- `{{cliente}}` aparece cru em resumos, evidências e mensagens. O anonimizador também gera `{{fone}}`, `{{email}}`,
  `{{cpf}}` e `{{cnpj}}` (`anonymizer.ts`).
- "Observações sobre os dados" mostra o texto que o servidor gravou: "sem card (sem esteira)", "TMR", "espelho",
  "Funil", "janela", "versão atual", "puladas", "Item … descartado: faixa …", "Síntese de IA indisponível: <erro>" e
  "1 conversas". As frases vêm de `compute-scope.ts:291-323`, `job-e-stage2-report.ts:128-279`, `stage2.ts:133-146`
  e `live-loader.ts:57-60`. Os nomes dos critérios ali vêm de `CRITERION_LABEL` ("Próximo passo combinado") e não
  são os da tela ("Combinou o próximo passo").

### Ranking de atendentes

- Ketren está em 1º com 10,0, calculado de 1 conversa (`AgentsTab.tsx:18`).
- Sergio, Fernando e Vinicios aparecem em 7º, 8º e 9º sem nenhuma conversa com nota. Sergio tem 14 conversas na
  semana e 50% sem resposta, mas o card diz "Nenhuma conversa avaliada".
- "Agendamento" é uma pessoa só (confirmado em 02/10/2026) e continua no ranking.

### Celular (390 × 844)

- O cabeçalho fixo ocupa 239px (28% da tela) e chega a 283px (34%) com "Personalizado". No computador, com
  Personalizado, ocupa 205px.
- Na janela da conversa, o título quebra em 3 linhas e a nota fica por cima da data (`ConversationModal.tsx:38-63`).
  Para chegar às mensagens, é preciso rolar a avaliação inteira.
- No indicador, "1 dia e 23h" quebra em duas linhas.

### Caminho do usuário

- Logo abaixo do título vem a barra "Observações sobre os dados". A nota fica a ~600px do topo e "Onde melhorar"
  (com as sugestões de fala) a ~1.250px.
- Só "Sem resposta" tem referência (limite de 30%). Os outros indicadores não dizem se o número é bom ou ruim.
- A aba Conversas lista 256 conversas por data, 50 por vez, sem filtro de nota nem ordenação.
- O período usa três botões e uma lista. No "Personalizado" entram mais duas datas e três atalhos, e o cabeçalho
  passa de 1 para 3 linhas.
- Em "Mês", sem mês publicado, a tela tem só uma frase e nenhum botão (`page.tsx:197`).
- No menu de visão, 6 dos 12 itens mostram "—", mas não estão vazios: Veículos tem 11 negócios no CRM e a equipe
  Vendas tem 16 conversas. "Peças" e "Vendas" aparecem como equipe e como painel, sem explicar a diferença.
- A ficha do atendente abre com a aba "Visão geral" marcada (`page.tsx:218-221`).
- O chip mostra "Atenção" para notas de 6 a 7,9 e "Abaixo da meta" só abaixo de 6. No histograma, tudo abaixo de 8 é
  "Abaixo da meta".

### Detalhes com cara de tela gerada

- Ícones decorativos nos títulos de bloco: `Sparkles` (Análise), `Star` (Conversas em destaque) e `CalendarDays`
  (Semanas do mês).
- Frases de instrução: "clique em uma conversa para…", "Clique para abrir a semana." e "Clique para ler a conversa.".
- "Ver detalhes" aparece 9 vezes, uma em cada card de atendente, e os cards são idênticos.
- Avisos de gráfico vazio ocupam espaço: "O gráfico aparece a partir da 2ª semana publicada" (e mais uma linha no
  Personalizado).
- No Personalizado aparecem ao mesmo tempo "Atualizado ontem às 19:20", "Calculado agora" e "Com dados até ontem às
  19:20".
- "2677" sem separador de milhar; "1 de 1 conversas atingiram a meta".

---

## 2. Decisões (confirmadas em 02/10/2026)

| # | Tema | Decisão |
|---|---|---|
| U-D1 | Nomes dos status | 8 ou mais: **Na meta**. De 6 a 7,9: **Abaixo da meta**. Menos de 6: **Muito abaixo da meta**. Sai o "Atenção", e "abaixo da meta" passa a querer dizer a mesma coisa no chip, no histograma, no filtro e no resumo. As cores continuam as mesmas. |
| U-D2 | O que conta como "na meta" | Nota da conversa de 8,0 ou mais, **sem arredondar**. Só a API de conversas (U4) calcula essa contagem, e o resumo, a frase do histograma e o filtro usam o número dela. As barras do histograma continuam com a nota arredondada, com essa informação na legenda. |
| U-D3 | Ranking | Posição só para quem tem 10 ou mais conversas com nota. Quem tem de 1 a 9 vai para "Poucas conversas para comparar", sem posição. Quem não tem nenhuma vai para "Sem nota na semana" e continua clicável, porque os indicadores existem. |
| U-D4 | Observações | Traduzidas **na tela** por uma função pura (`src/lib/observacoes.ts`), que reconhece cada frase gravada e devolve o texto simples ou a esconde. Não mexe no banco nem nos jobs e vale também para as semanas já publicadas. Frase desconhecida aparece como veio. Descartado: mudar o texto na origem e reescrever as linhas gravadas, porque isso altera relatório publicado. |
| U-D5 | Seletor de período | Um botão só no cabeçalho ("23 a 29 de set. ▾"), que abre um menu com as semanas publicadas, os meses publicados, "Últimos 7 dias", "Últimos 30 dias", "Este mês" e "Escolher datas…". Os endereços (`?tipo`, `?period`, `?de&ate`) continuam os mesmos, então os links já enviados continuam valendo. |
| U-D6 | Cabeçalho | Marca e período numa linha, abas embaixo. Continua fixo, com ~104px no celular. "Atualizado…" sai do cabeçalho: vai para o rodapé do menu de período e para o subtítulo da página. |
| U-D7 | Atendentes | Lista em linhas, no mesmo formato de Conversas, no lugar dos cards. A linha inteira abre a ficha, e a ficha fica na aba Atendentes. |
| U-D8 | Lista de conversas | Mesma regra do relatório: encerradas no período e com análise da versão atual. Filtros "Todas", "Abaixo da meta", "Na meta" e "Sem nota", cada um com sua contagem. Ordem "Mais recentes" ou "Menor nota primeiro". |
| U-D9 | Resumo no topo | Calculado na tela, sem IA, com nota, status, diferença para o período anterior (se houver), o critério de menor média e o número de conversas abaixo da meta. Tem o botão "Ver essas conversas". |

---

## 3. Etapas

### Parte A — Corrigir

#### U1 — Dados ocultos sem `{{…}}`

| Arquivo | Mudança |
|---|---|
| `src/components/TextoAnonimo.tsx` (novo) | Quebra o texto nos marcadores `{{cliente}}`, `{{fone}}`, `{{email}}`, `{{cpf}}` e `{{cnpj}}` e mostra cada um como uma marca discreta: "cliente", "telefone", "e-mail", "CPF", "CNPJ" (`bg-subtle text-muted rounded px-1`). |
| `src/lib/labels.ts` | `textoAnonimo(s)`: a mesma troca em texto puro, para `title` e `aria-label`. |
| `ConversationsTab`, `ConversationModal` (resumo, evidências e mensagens), `HighlightsBlock`, `AiInsightsBlock` | Usar `TextoAnonimo` no lugar do texto direto. |

- **Pronto quando:** nenhum `{{` aparece no texto das três abas nem da janela da conversa (U16).

#### U2 — Etapa no CRM no lugar de "sem esteira"

- `sessions-loader.ts:94`: sem negócio no CRM, `panelName` passa a ser `null` (o texto sai do servidor). Com negócio
  sem etapa, continua "Sem etapa".
- `ConversationsTab`: a coluna "Painel" vira "Etapa no CRM". Com `null`, mostra "Sem negócio" em `text-muted`, sem
  chip.
- `ConversationModal`: quando `panelName` é `null`, o item não aparece na linha de detalhes.
- **Pronto quando:** "esteira" não aparece em nenhuma tela do cliente.

#### U3 — Observações em português simples (U-D4)

`src/lib/observacoes.ts` (novo): `observacao(linha: string): { texto: string; destaque: boolean } | null`. O retorno
`null` esconde a linha. Os testes ficam em `tests/observacoes.test.ts`, com uma frase real de cada tipo.

| Frase gravada | Na tela |
|---|---|
| `Amostra preliminar: N conversas com nota (mínimo 10).` | esconder (o aviso de amostra pequena já aparece) |
| `Conversas fora da nota: N puladas (sem fala humana), M com erro de análise, K ainda sem análise.` | "N conversas ficaram sem nota porque nenhuma pessoa respondeu.", "M conversas não puderam ser avaliadas." e "K conversas ainda vão ser avaliadas." (uma linha para cada parte, com plural certo) |
| `N de T conversas sem card (sem esteira).` | "N de T conversas não estão ligadas a um negócio no CRM." |
| `Critério "X" fora da nota: aplicável em P das conversas.` | "O critério “<nome da tela>” ficou fora da nota: só vale para P das conversas." (nome pela chave: `CRITERION_LABEL` → `CRITERIOS`) |
| `N conversas não entram em nenhuma equipe: …` | igual |
| `N sessões com mais de um card; usado o mais recente.` | "N conversas têm mais de um negócio no CRM; contamos o mais recente." |
| `TMR de N conversas veio do campo da sessão (…).` | esconder |
| `Funil usa o status atual dos cards, não o status no fim da janela.` | "Os negócios do CRM aparecem com a situação de hoje, não a do fim do período." |
| `Sem comparação com a semana anterior: só P das conversas dela têm análise na versão atual.` (e a versão do mês) | "Sem comparação com a semana anterior: ela foi avaliada antes da mudança nos critérios." |
| `Sem comparação com o mês anterior: ele é parcial (…).` | igual |
| `Síntese de IA indisponível: …` e `Item sobre "X" descartado: …` | esconder (o bloco da análise já avisa quando ela não existe) |
| `Dados a partir de …` e `O período começa antes dos dados: …` | igual, com destaque (substitui `AVISO_DESTAQUE`, `OverviewTab.tsx:33`) |
| `N conversas com indicadores em atualização; …` | igual |

- `OverviewTab` mostra só as linhas que sobram. Se não sobrar nenhuma, a barra some.
- No `compute-scope.ts`, um comentário acima das limitações aponta para `observacoes.ts`: quem criar uma frase nova
  precisa traduzi-la lá.
- **Pronto quando:** os testes cobrem todas as frases da tabela, e na semana de 23/09 nenhuma observação tem termo da
  lista proibida.

#### U4 — Lista de conversas com a mesma regra do relatório (U-D2, U-D8)

| Arquivo | Mudança |
|---|---|
| `src/lib/sessions-loader.ts` | Consultar a partir de `sessionAnalysis` (uma linha por conversa e versão, `@@unique`), com `promptVersion: STAGE1_PROMPT_VERSION`, `status: "done"` e `session` encerrada no período. Assim a lista conta o mesmo que o relatório. |
| `src/lib/sessions-loader.ts` | Devolver `contagens: { todas, abaixo, naMeta, semNota }`, com quatro `count` em paralelo: `notaConversa < 8`, `>= 8` e `null`. |
| `src/app/api/sessions/route.ts` | Repassar `contagens`. |

- `STAGE1_PROMPT_VERSION` já é usado pelo lado da tela (`live-loader.ts:38`). O import fica sem `.js`
  (`tests/web-imports.test.ts`).
- **Pronto quando:** na semana de 23/09, "Todas" = 255 (241 com nota e 14 sem nota), "Abaixo da meta" = 138,
  "Na meta" = 103 e "Sem nota" = 14.

#### U5 — Contagens, plural e milhar

- `format.ts`: `fmtInt(n)` ("2.677"). Usar em todo número de conversas e negócios.
- `HistogramChart.tsx:51`: a frase usa `contagens.naMeta` (U-D2): "103 de 241 conversas atingiram a meta", com plural
  certo ("1 de 1 conversa atingiu a meta"). Legenda: "Nota arredondada".
- Subtítulo: "Semana de 23 a 29 de setembro, 241 conversas com nota".
- Legenda embaixo dos indicadores: "Calculados sobre as 280 conversas que começaram na semana" (`sinteticos.n`).
- `AiInsightsBlock.tsx:14`: sai a linha "Base: …", porque a frase da IA já traz os números.
- `ConversationModal`: nota de critério com `fmtNota`, igual ao resto da tela.
- **Pronto quando:** o número de conversas que se repete na tela é o mesmo em todo lugar e, quando muda, a legenda
  explica o porquê.

#### U6 — Ranking (U-D3)

- `AgentsTab`: três grupos.
  1. Com posição: `!preliminar`, ordenados por nota.
  2. "Poucas conversas para comparar": `preliminar && totalConversas > 0`, sem posição, ordenados por número de
     conversas.
  3. "Sem nota na semana": `totalConversas === 0`. Cada nome mostra o número de conversas da semana
     (`sinteticos.n`): "Sergio, 14 conversas", "Fernando, nenhuma conversa".
- Os textos usam `PERIODO[tipo]` ("na semana", "no mês", "no período").
- O formato em linhas vem em U14. Esta etapa só muda a ordem e os grupos.
- **Pronto quando:** Ketren aparece em "Poucas conversas para comparar" e ninguém sem nota tem posição.

#### U7 — Cabeçalho compacto e seletor de período único (U-D5, U-D6)

`src/components/layout/PeriodPicker.tsx` (reescrito):

```
[ 📅 23 a 29 de set. ▾ ]
┌──────────────────────────────────┐
│ Semanas                          │
│   23 a 29 de set. de 2026     ✓  │
│   16 a 22 de set. de 2026        │
│ Meses                            │
│   setembro de 2026               │
│ Atalhos                          │
│   Últimos 7 dias                 │
│   Últimos 30 dias                │
│   Este mês                       │
│   Escolher datas…                │  → abre De / até dentro do menu, com "Aplicar"
│ ──────────────────────────────── │
│ Dados atualizados ontem às 19:20 │
└──────────────────────────────────┘
```

- `page.tsx`: carrega as duas listas (`/api/reports/periods?tipo=semana` e `?tipo=mes`) uma vez. O estado
  (`tipo`, `selectedPeriod`, `intervalo`) e o endereço continuam iguais.
- O botão mostra o período escolhido. No celular, a forma curta ("23–29 set.", "set. 2026", "1–30 set.").
- No menu, as datas usam rascunho e só valem no "Aplicar", com a mensagem de erro que já existe para data invertida.
- O menu fecha com Esc, com clique fora e ao escolher. Setas navegam entre os itens.
- `AppHeader`: marca e botão de período na mesma linha, abas embaixo. No celular, a marca mostra só o "T" e
  "Tterrasul".
- **Pronto quando:** o cabeçalho fixo tem até 110px em 390px, em qualquer tipo de período, e até 113px no computador.

#### U8 — Janela da conversa no celular

- Cabeçalho da janela, abaixo de `lg`: a data numa linha e o botão fechar à direita. Embaixo, nota e chip. Depois,
  atendente, etapa e duração (pode quebrar linha).
- Abaixo de `lg`, duas abas, "Avaliação" e "Mensagens", em vez de uma coluna longa. No computador continuam as duas
  colunas.
- O título usa "Conversa de 29 de setembro", sem o ano quando é o ano corrente. Para isso, o loader passa a mandar
  `startAt` em ISO (hoje manda "29/09/2026") e a tela formata com uma `fmtDia` nova, também usada na lista.
- **Pronto quando:** em 390px nada se sobrepõe e as mensagens ficam a um toque.

### Parte B — Encurtar o caminho

#### U9 — Resumo no topo e nova ordem da Visão geral (U-D1, U-D9)

```
Visão geral da operação ▾
Semana de 23 a 29 de setembro, 241 conversas com nota

┌──────────────────────────────────────────────────────────────┐
│  ◔ 7,1   Abaixo da meta de 8,0                               │
│          (comparação com a semana anterior, quando houver)   │
│          Ponto mais fraco: Conversa resolvida, média 5,6     │
│          138 conversas ficaram abaixo da meta                │
│          [ Ver essas conversas ]                             │
└──────────────────────────────────────────────────────────────┘
(avisos que mudam a leitura: amostra pequena, sem avaliação, corrigido)
[ 1ª resposta ][ Até resolver ][ Sem resposta ][ Fechamento ][ Retomadas ]
Calculados sobre as 280 conversas que começaram na semana
┌ Critérios avaliados ──────────────┐ ┌ Distribuição das notas ──────┐
│                                   │ │ histograma + evolução        │
└───────────────────────────────────┘ └──────────────────────────────┘
┌ Análise da semana: Onde melhorar │ O que está funcionando ──────────┐
┌ Negócios no CRM ─────────────────────────────────────────────────────┐
┌ Semanas do mês (só no mês) ──────────────────────────────────────────┐
Observações sobre os dados (2)   ← recolhido, no fim
```

- `labels.ts`: `scoreStatus` com os nomes de U-D1. Atualizar `tests/format.test.ts` ("scoreStatus").
- `src/components/SummaryBlock.tsx` (novo). Leva o anel (`ScoreRing` de 112px; o tamanho do número passa a seguir o
  `size`), o status, a comparação (`comparativo.deltaNota`, por extenso: "0,3 acima/abaixo da semana anterior",
  "igual à semana anterior"), o critério de menor média entre os não nulos e `contagens.abaixo` (U4).
  - Se todos os critérios estão na meta: "Todos os critérios estão na meta".
  - Sem nota no período: "Nenhuma conversa com nota {t.nesta}." Nesse caso não há botão, e os indicadores e o CRM
    continuam.
  - "Ver essas conversas" leva à aba Conversas com o filtro "Abaixo da meta" (estado do filtro sobe para `page.tsx`).
- O card "Nota da semana" sai: o anel vai para o resumo e o histograma e a evolução vão para o card "Distribuição das
  notas", ao lado dos critérios.
- `CriteriaBars`: o número de cada critério ganha a cor do status (`text-bad`, `text-warn`). A barra continua de uma
  cor só, com o traço da meta.
- `AiInsightsBlock`: "Onde melhorar" passa a ser a primeira coluna (no celular, vem primeiro). Ela é a parte que vira
  ação.
- Os avisos que mudam a leitura do número ficam logo abaixo do resumo, e "Observações sobre os dados" vai para o fim
  da página.
- **Pronto quando:** em 1280×800 e em 390×844, sem rolar, aparecem a nota, o status, o ponto mais fraco e o botão.

#### U10 — Filtros e ordem em Conversas (U-D8)

- API (`/api/sessions`): `faixa=abaixo|meta|sem` e `ordem=recentes|nota`.
  - "Menor nota primeiro": `orderBy: [{ notaConversa: { sort: "asc", nulls: "last" } }, { session: { endAt: "desc" } }]`.
    A ordenação é feita a partir de `sessionAnalysis`, e o índice `[tenantId, notaConversa]` já existe.
  - Recomendado: a lista para de trazer as mensagens das 50 conversas. A janela busca a conversa por `?id=`, como as
    "Conversas em destaque" já fazem (`page.tsx:166`).
- `ConversationsTab`: os botões de filtro "Todas 255", "Abaixo da meta 138", "Na meta 103" e "Sem nota 14", mais o
  seletor de ordem. A busca combina com o filtro, e o filtro continua o mesmo ao trocar o período.
- Lista vazia com filtro: "Nenhuma conversa abaixo da meta {t.nesta}." Com busca: a frase que já existe.
- **Pronto quando:** do resumo, um clique mostra as 138 conversas abaixo da meta, as de menor nota primeiro.

#### U11 — Telas vazias com saída

- Mês sem mês publicado: "Ainda não há mês fechado publicado." com os botões "Ver setembro" (mês anterior, calculado
  agora) e "Ver outubro até hoje". Os dois usam o período livre.
- Semana sem semana publicada: "Ainda não há semana publicada." com o botão "Ver os últimos 7 dias".
- Erro ao carregar: a frase que já existe, mais o botão "Tentar de novo".
- **Pronto quando:** nenhuma tela vazia termina sem um botão.

#### U12 — Menu de visão

- "—" vira "sem nota" (`text-muted`).
- Escopos sem nada (sem nota, nenhuma conversa e sem CRM) saem do menu. Hoje isso vale só para a equipe Caixa.
- Uma linha embaixo de cada grupo:
  - Divisões: "Pós-venda e Veículos, somando as equipes de cada uma".
  - Equipes: "Grupos de atendentes".
  - Painéis do CRM: "Conversas ligadas aos negócios de cada painel".
- Ao abrir, o foco vai para o item escolhido, e as setas navegam (`role="menu"` e `menuitemradio`).
- **Pronto quando:** dá para diferenciar "Peças" equipe de "Peças" painel sem perguntar a ninguém.

#### U13 — Ficha do atendente na aba Atendentes

- `page.tsx`: estado `agenteId`. Na aba Atendentes, com `agenteId`, aparece a ficha, e "← Atendentes" limpa o estado.
  A aba marcada continua "Atendentes".
- A ficha tem o mesmo resumo (U9) e, no fim, "Conversas de {nome}": a lista de U10 filtrada pelo atendente, sem
  busca.
  - A API passa a aceitar `agente=<agentExternalId>` (o `scopeId` do relatório). Hoje o filtro `agent` busca por
    parte do nome.
  - Na ficha, "Ver essas conversas" aplica o filtro na lista de baixo e rola até ela.
- Com amostra pequena, saem o histograma, a evolução e a análise da IA, e o resumo diz "1 conversa com nota: pouco
  para comparar".
- Ao trocar o período, a ficha continua aberta se o atendente existir no novo período. Se não existir, volta para a
  lista.
- **Pronto quando:** abrir Ketren mantém a aba Atendentes e mostra a conversa dela sem precisar ir a outra aba.

### Parte C — Tirar o que parece tela gerada

#### U14 — Atendentes em lista (U-D7)

```
Atendente                 Conversas   1ª resposta   Sem resposta    Nota
1  Henrique   Pós-venda       23        3h 38min        24,3%     ● 7,4  ›
2  Agendamento               155        2h 41min        17,1%     ● 7,2  ›
…
Poucas conversas para comparar
   Leonardo   Peças            8        3h 01min        27,8%     ● 5,3  ›
   Ketren     Peças            1        6h 58min          50%     ● 10,0 ›
Sem nota na semana
   Sergio     Vendas      14 conversas, sem nota                         ›
```

- No mesmo cartão e com o mesmo estilo de linha de Conversas. A linha inteira é o botão, e "Ver detalhes" sai.
- No celular: nome e nota numa linha, e embaixo equipe, conversas e 1ª resposta.
- Somem os chips "Amostra pequena" de cada card (o grupo já diz isso) e a legenda do topo.

#### U15 — Ícones, instruções, avisos vazios e repetições

- Saem os ícones decorativos dos títulos: `Sparkles` (`AiInsightsBlock.tsx:30`), `Star` (`HighlightsBlock.tsx:54`),
  `CalendarDays` (`WeeksOfMonthBlock.tsx:47`), `CircleCheck` e `Lightbulb`. Ícones ficam só em controles e status.
- Saem as frases "clique…" (`ConversationsTab.tsx:85`, `HighlightsBlock.tsx:57`, `WeeksOfMonthBlock.tsx:50`). As
  linhas clicáveis já têm seta, fundo no hover e foco visível.
- Evolução com menos de 2 pontos: o bloco não aparece (sem a frase "O gráfico aparece…"). A frase do Personalizado
  só aparece quando o gráfico aparece.
- Personalizado: em vez do chip "Calculado agora" e da linha "Com dados até…", uma frase só no subtítulo:
  "Calculado agora, com dados até ontem às 19:20".
- Menos "·" juntando informações: subtítulos com vírgula. O chip de status fica sem "· meta 8,0", porque a meta está
  no resumo. Na mensagem fica "Cliente" e a hora à direita.
- Indicador: número `text-2xl sm:text-[28px]`, para "1 dia e 23h" caber no celular.
- Foco visível (`focus-visible:outline-2 outline-primary`) em linhas, menus e botões.
  `motion-reduce:transition-none` no anel e nas barras.

### U16 — Verificação

- `pnpm test` (incluindo `observacoes.test.ts` e o `scoreStatus` novo) e `pnpm web:build`.
- `scratch/telas.mjs` (novo, sem dependência: Chrome sem janela pelo DevTools) tira prints em 1280×900 e 390×844:
  - as três abas, o menu de visão e o menu de período;
  - a ficha de um atendente com 10 ou mais conversas e a de um com amostra pequena;
  - a janela da conversa, "Mês" sem publicação e o Personalizado.
- Busca no texto renderizado das telas: nenhum `{{`. Também nenhum termo do `UI_REDESIGN.md` §8, nem "esteira",
  "card", "TMR", "Funil", "espelho", "leva" ou "descartado".
- Conferir na semana de 23/09 que as contagens de U4 aparecem iguais no resumo, no histograma e nos filtros.

---

## 4. Riscos

- **U-D1 muda o nome de um status.** Se o gestor já viu o "Atenção", vale avisar na entrega.
- **Frase nova sem tradução (U3).** Uma observação nova criada no servidor aparece como veio. O teste cobre as de hoje,
  e o comentário no `compute-scope.ts` lembra de traduzir.
- **A lista perde conversas avaliadas só na versão antiga (U4).** Na semana de 23/09 é 1 conversa. É o certo, porque o
  relatório também não as conta, mas some uma linha que existia.
- **Anonimizador.** Na conversa aberta, "setor de Peças da {{cliente}}" indica que parte do nome do contato coincidiu
  com o nome da loja. U1 muda só a exibição; a regra (`anonymizer.ts:47-58`) fica de fora.
- **Relatório HTML estático.** O `html-reporter.ts` continua com os termos antigos, como já estava na Fase 1.

---

## 5. Como saber que ficou pronto

- [ ] Ao abrir, sem rolar, aparecem a nota, se está na meta e o ponto mais fraco, e um clique leva às conversas abaixo da meta (1280×800 e 390×844).
- [ ] Nenhum `{{`, "esteira", "card", "TMR", "Funil", "espelho", "leva" ou "descartado" em tela do cliente.
- [ ] O mesmo número aparece igual no resumo, no histograma e nos filtros.
- [ ] Só tem posição no ranking quem tem 10 ou mais conversas com nota.
- [ ] O cabeçalho fixo tem até 110px no celular, em qualquer tipo de período.
- [ ] A janela da conversa fica legível em 390px, com as mensagens a um toque.
- [ ] Toda tela vazia oferece um caminho.
- [ ] Com o teclado: Tab percorre menus, filtros e linhas com foco visível, e Esc fecha menus e janela.
- [ ] `pnpm test` e `pnpm web:build` passam.

---

## 6. Fora desta entrega

- Metas de tempo e de taxa (1ª resposta, fechamento): o cliente precisa definir os valores. Até lá, só "Sem resposta"
  tem limite.
- Aba e atendente no endereço, para mandar o link direto da ficha.
- Regra do anonimizador para nomes que coincidem com o da loja.
- Vocabulário do relatório HTML estático.
- Histograma sem arredondar: mudaria o `aggregate.ts` e os relatórios publicados.
- Exportar PDF.
