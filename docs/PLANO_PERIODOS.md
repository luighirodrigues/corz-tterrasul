# Relatório mensal e período livre — plano de implementação

**Objetivo:**
1. **Relatório do mês**, publicado como o semanal (nota, critérios, indicadores, funil e texto da IA), para os mesmos escopos: geral, divisões, equipes, painéis e atendentes.
2. **Período livre na tela**: além de semana e mês, o gestor escolhe um intervalo qualquer (ex.: 5 a 10 de setembro). Esse intervalo é calculado na hora e não traz o texto da IA.

**Status:** plano completo confirmado em 02/10/2026, com o relatório mensal (D1 a D9) e o período livre (L-D1 a L-D7). **Implementado em 02/10/2026 (branch `equipes-relatorios`, ainda sem commit); falta o ensaio no banco do servidor (M7) e o deploy (M8).** Desvio do plano: o Next não resolve `import "./x.js"` para `./x.ts`, então os módulos que a tela alcança (`compute-scope`, `job-c-synthetics`, `session-metrics`) importam sem a extensão `.js`; `tests/web-imports.test.ts` vigia isso.

**Ordem:** base comum (B1, B2), depois o mensal (M1 a M8) e por fim o período livre (L1 a L4). A base resolve o principal risco de desempenho dos outros dois.

---

## 1. O que o código já faz

- **O Job E aceita qualquer janela** (`runJobEStage2Reports({ startDate, endDate })`). A janela de 7 dias só existe em `src/domain/period.ts` e na CLI.
- **A análise de cada conversa já está pronta.** O estágio 1 roda todo dia (`pnpm daily`) e grava nota, critérios, evidências e resumo de cada conversa concluída. Um período qualquer já tem nota e critérios sem chamar a IA de novo. Só o texto do estágio 2 (pontos fortes e oportunidades) depende de uma chamada por escopo.
- **O texto do estágio 2 recebe uma entrada de tamanho fixo:** contagens já calculadas, 3 indicadores e no máximo 10 casos (`pickCases`, `src/domain/aggregate.ts:129`). Um período maior não deixa a chamada mais lenta. O tempo cresce com o número de escopos, porque é uma chamada por escopo.
- **O cálculo dos indicadores (Job C) carrega todas as mensagens** das conversas iniciadas na janela, de novo para cada escopo (`job-c-synthetics.ts:73`). Com ~1.100 conversas no mês (pelas 251 por semana do levantamento das equipes) e ~20 escopos, isso é o gargalo do mês e torna inviável calcular um período livre na hora.
- **No banco, mês e semana não se confundem**, porque a chave única de `period_reports` inclui `period_end`. **Na leitura eles se confundem:**
  - `listPublishedPeriods` (`src/lib/reports-loader.ts:14`) devolve tudo o que tem escopo geral;
  - `loadReports` busca só por `period_start` (`reports-loader.ts:38`), e 1º de julho de 2026 caiu numa quarta, então semana e mês teriam o mesmo início. Sem período escolhido, ele pega o mais recente sem olhar o tipo;
  - `/api/reports/history` monta o gráfico com todas as linhas do escopo;
  - `loadAuditedSessions` acha a janela lendo `period_reports` (`src/lib/sessions-loader.ts:13`).
- **A comparação volta 7 dias fixos:** `previousPeriod` (`period.ts:28`), chamado em `job-e-stage2-report.ts:292`.

---

## 2. Decisões

### Relatório mensal (confirmadas)

| # | Tema | Decisão |
|---|---|---|
| D1 | O que é o mês | **Mês do calendário**, do dia 1 ao último dia, no fuso do tenant. Não são "4 semanas de quarta a terça". |
| D2 | Como calcula | **Recalcula das conversas**, com as mesmas regras do semanal. Não soma nem tira a média dos relatórios semanais: a mediana do FTR, os percentuais e a regra de critério fora da nota não dá para somar, e as semanas não cabem certinhas no mês. |
| D3 | Escopos | Os mesmos do semanal: geral, divisões, equipes, painéis e atendentes. |
| D4 | Texto da IA do mês | Chamada nova por escopo com os casos do mês (até **20**, contra 10 na semana) e, como contexto, os pontos fortes e oportunidades **já publicados nas semanas do mês**, para ela apontar o que se repetiu. O número de casos de cada item continua vindo do código (`finalizeStage2`). Usa outra versão de prompt (`stage2-mes-v1`), e o semanal (`stage2-v2`) não muda. |
| D5 | Mês com início antes do go-live | **Publica como parcial, com aviso**: "Dados a partir de <data do `GO_LIVE_AT`>: o mês está incompleto." |
| D6 | Comparação | Com o mês anterior recalculado na régua atual, com a mesma regra de 80% de cobertura do semanal. **Se o mês anterior for parcial (D5), não há seta**, e a limitação explica o motivo. |
| D7 | Semanas do mês | Uma semana pertence ao mês em que cai o **seu 4º dia (o sábado)**. Setembro de 2026 tem as semanas que começam em 02, 09, 16 e 23/09. A semana de 30/09 a 06/10 fica em outubro. Um mês tem 4 ou 5 semanas. |
| D8 | Agendamento | `publish:monthly` no **dia 2** de cada mês, depois do `daily`. Publica o último mês encerrado. |
| D9 | Tipo no banco | Coluna `granularity` em `period_reports`: `semana` (padrão, que vale para tudo que já existe) ou `mes`. |

### Período livre (confirmadas)

| # | Tema | Decisão |
|---|---|---|
| L-D1 | Gravação | **Calculado na hora e não gravado.** Não é relatório publicado: se os dados mudarem (novo sync, reanálise), o número muda. Na tela aparece "Calculado agora, com dados até 02/10 às 05:12". |
| L-D2 | Texto da IA | **Não tem.** O motivo não é o tamanho do período, porque a entrada da IA tem tamanho fixo (§1). É o custo e a espera a cada clique (uma chamada por escopo) e um texto que muda a cada consulta do mesmo período. No lugar entra **"Conversas em destaque"**: as 3 melhores e as 3 piores do período, com o resumo que a análise diária já gravou. A nota e os critérios continuam, porque vêm da análise de cada conversa. |
| L-D3 | Comparação | **Sem seta.** O gráfico de evolução continua com as semanas oficiais. |
| L-D4 | Limites | Até **366 dias**. O fim do intervalo é no máximo hoje. Um início antes do go-live é ajustado, com aviso. |
| L-D5 | Inclui hoje | **Sim.** Como a análise roda de madrugada, as conversas de hoje entram nos indicadores e ainda não têm nota. A tela avisa: "38 conversas ainda sem avaliação". |
| L-D6 | Abas | Visão geral, Atendentes e Conversas seguem o período escolhido. |
| L-D7 | Link | O período fica no endereço (`?de=2026-09-05&ate=2026-09-10`), para o gestor mandar o link. |

---

## 3. Base comum

### B1 — Indicadores de cada conversa gravados na própria conversa

**Por quê:** o Job C refaz o cálculo de cada conversa a partir das mensagens, para cada escopo e cada relatório (§1). Gravando o resultado uma vez, o mês e o período livre viram uma consulta de colunas.

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` (Session) | `tmrSeconds Float?`, `tmrFallback Boolean`, `semResposta Boolean`, `reativada Boolean`, `ftrSeconds Float?`, `metricsStale Boolean @default(true)` |
| `src/jobs/job-a-sync-sessions.ts` | `metricsStale: true` no `upsert` da conversa (~linha 250) e depois do sync das mensagens (~linha 268) |
| `src/jobs/job-metrics.ts` (novo) | recalcula as conversas com `metricsStale = true` usando **a mesma** `computeSessionMetrics` e grava `metricsStale = false`. Roda no fim do Job A (`sync`, `daily`, `pipeline`) e sozinho como `pnpm job:metrics` (backfill). |
| `src/jobs/job-c-synthetics.ts` | lê só as colunas numéricas (sem `include: messages`) e aplica as mesmas `mean`, `median` e `pct`. A saída (`SyntheticMetrics`) não muda. |

- **Regra que não pode quebrar:** para toda semana publicada, o Job C novo dá **exatamente** os números do antigo. Um script em `scratch/` roda os dois e compara campo a campo.
- O status de uma conversa aberta só muda pelo sync, e o sync marca a conversa para recálculo. Por isso o "sem resposta" gravado é o mesmo que o Job C calcula hoje.

### B2 — Cálculo de um escopo separado do Job E

**Por quê:** o mês (Job E) e o período livre (tela) precisam das mesmas regras. Com dois códigos, os números divergem com o tempo.

- `src/report/compute-scope.ts` (novo): `computeScope(ctx, scope, janela)` devolve `{ sinteticos, qualidade, funil, limitacoes, preliminar, rows }`. O código sai do Job E (`collectQuality`, funil e limitações) sem mudar regra nenhuma.
- A montagem dos escopos (geral, divisões, equipes, painéis e atendentes) também sai, para `buildScopes(tenant, janela)`.
- O Job E fica com: escopos → `computeScope` → comparação → IA → gravação.
- **A tela precisa conseguir importar esse módulo.** Os jobs usam imports com `.js` (`../db/prisma.js`), e a tela hoje só importa arquivos de `domain` sem imports. Primeiro passo: confirmar que o Next 16 resolve isso; se não, configurar `extensionAlias` no `next.config.mjs`.
- **Conferência:** o `--dry-run` de uma semana publicada, antes e depois da mudança, dá o mesmo JSON (fora o texto da IA).

---

## 4. Relatório mensal

### M1 — Janela do mês

`src/domain/period.ts`:
- `Period` ganha `granularity: "semana" | "mes" | "livre"`;
- `monthContaining(ref, tz)`, `previousMonth(p, tz)`, `lastClosedMonth(now, tz)`;
- `previousOf(p, tz)`: semana → semana anterior, mês → mês anterior;
- `weeksOfMonth(mes, tz, weekStart)`: semanas cujo 4º dia cai no mês (D7);
- label "setembro de 2026".

`tests/period.test.ts`: meses de 28, 29, 30 e 31 dias, virada de ano, fuso (o mês de setembro vai de `2026-09-01 03:00 UTC` a `2026-10-01 02:59:59.999 UTC`) e semanas de setembro e de outubro de 2026 (4 e 5).

### M2 — Banco (migração `3_periodos`)

Tudo aditivo, como na `2_equipes`.

| Objeto | Mudança | Efeito no banco existente |
|---|---|---|
| `period_reports` | coluna `granularity text not null default 'semana'` e índice `(tenant_id, granularity, period_start)` | relatórios publicados viram `semana` sem tocar em mais nada |
| `sessions` | colunas da B1; `metrics_stale` nasce `true` | o backfill (`pnpm job:metrics`) preenche |

A chave única não muda: semana e mês com o mesmo início nunca têm o mesmo fim. SQL gerado com `prisma migrate diff`, como na `2_equipes`, e um `down.sql` ao lado.

### M3 — Job E

- Opção `granularity` em `RunStage2Options`, gravada no relatório.
- Comparação com `previousOf`. Os textos de limitação dizem "semana anterior" ou "mês anterior".
- Mês: `pickCases(..., 20)` e, na entrada da IA, os pontos das semanas publicadas do mês (`weeksOfMonth`), com o prompt `stage2-mes-v1` (D4).
- Mês com início antes de `GO_LIVE_AT`: limitação de mês parcial (D5). Mês anterior parcial: sem seta (D6).
- A trava de publicação não muda: mês fechado, sync depois do fim e análise completa.

### M4 — CLI e HTML

| Arquivo | Mudança |
|---|---|
| `src/cli.ts` | `report --month 2026-09` e `publish:monthly` (último mês encerrado), com `--dry-run`, `--correct` e `--allow-incomplete` |
| `package.json` | script `publish:monthly` |
| `src/report/html-reporter.ts` | "Mês de setembro de 2026", "vs mês anterior" (linha 323). Arquivo `relatorio_<escopo>_<chave>_2026-09.html` |

### M5 — Leitura (loaders e APIs)

| Arquivo | Mudança |
|---|---|
| `src/lib/reports-loader.ts` | `listPublishedPeriods` devolve `granularity`; `loadReports(granularity, start)`, e o "mais recente" respeita o tipo |
| `src/app/api/reports/history/route.ts` | filtra por `granularity`: o gráfico semanal só mostra semanas, o mensal só meses |
| `src/app/api/reports/route.ts`, `periods/route.ts` | parâmetro `tipo` |
| `src/lib/sessions-loader.ts` | recebe `start`/`end` em vez de procurar a janela em `period_reports` (também serve para o período livre). Lista paginada ("Carregar mais"): o limite de 50 não serve para ~1.100 conversas no mês |

### M6 — Telas

Segue o `docs/UI_REDESIGN.md`, sem jargão.

| Arquivo | Mudança |
|---|---|
| `AppHeader.tsx` | seletor **Semana · Mês · Personalizado** e, ao lado, a lista do tipo escolhido ("setembro de 2026") |
| `OverviewTab.tsx` | "Nota do mês", "em relação a agosto", "Evolução mensal" e o bloco **"Semanas do mês"** com a nota oficial de cada semana (D7). Clicar numa semana abre a semana. Uma frase abaixo da nota: "Calculada com todas as conversas do mês; não é a média das semanas." |
| `AgentsTab.tsx`, `ConversationsTab.tsx` | "Mês de setembro de 2026", "avaliadas no mês" |
| `TrendChart.tsx` | rótulos por mês ("set", "out") e o texto de vazio "O gráfico aparece a partir do 2º mês publicado" |
| `src/lib/format.ts` | `fmtMes("2026-09-01")` → "setembro de 2026" |

### M7 — Ensaio no dev

1. Cópia do banco do servidor, como na E8 do `PLANO_EQUIPES.md`.
2. `pnpm prisma:deploy` → `3_periodos` aplicada.
3. `pnpm job:metrics` (backfill) e o script de comparação da B1 em todas as semanas publicadas: diferença zero.
4. `pnpm job:report -- --month 2026-09 --dry-run`: ler os HTMLs, conferir o aviso de mês parcial e **medir o tempo**.
5. Conferir que a nota do mês fica perto da média ponderada das 4 semanas (consulta da §7). A diferença deve vir só dos dias de borda.
6. `pnpm web`: passar pela lista da §8.

### M8 — Servidor

1. Backup (`pg_dump -Fc`), `pnpm prisma migrate status` e deploy (a migração entra sozinha no `CMD`).
2. `pnpm job:metrics` (backfill de todas as conversas). **Não fazer deploy com job rodando.**
3. Meses passados, do mais antigo ao mais novo: `pnpm job:report -- --month <AAAA-MM>`. O primeiro sai parcial (D5). Custo: ~20 chamadas do estágio 2 por mês.
4. Agendar `pnpm publish:monthly` no dia 2 de cada mês (D8). `docs/DEPLOY_EASYPANEL.md` ganha a linha.
5. Reversão: igual à E9.4 das equipes. O código antigo ignora as colunas novas, mas lê os relatórios mensais como se fossem semanas. **Se voltar o código, apagar antes** `DELETE FROM period_reports WHERE granularity = 'mes';`.

---

## 5. Período livre

### L1 — API

`GET /api/reports/live?de=2026-09-05&ate=2026-09-10` devolve `ReportItem[]` no mesmo formato da semana, com `textoFortes`, `textoOps` e `comparativo` nulos, mais `calculadoAgora: true`, `dadosAte` (último sync) e `destaques` (3 melhores e 3 piores, com `pickCases`).

- Usa `buildScopes` e `computeScope` (B2), sem IA e sem gravar nada.
- Valida as datas (`de ≤ ate`, até 366 dias, fim ≤ hoje, início ≥ go-live com aviso) no fuso do tenant: `de` às 00:00 e `ate` às 23:59:59.999.
- Meta: **menos de 3 s para um mês com todos os escopos**, medida no ensaio. Se não bater, calcular só o escopo aberto e os atendentes.

### L2 — Conversas por intervalo

Já resolvido na M5 (`sessions-loader` por `start`/`end`, com paginação).

### L3 — Tela

- Modo **Personalizado** no seletor: duas datas (de/até) e atalhos "Últimos 7 dias", "Últimos 30 dias" e "Este mês".
- Selo **"Calculado agora"** perto do título, com o "dados até" no texto de ajuda.
- `AiInsightsBlock` cede lugar a **"Conversas em destaque"**. Clicar numa conversa abre o `ConversationModal` que já existe.
- Sem seta de comparação. O gráfico de evolução continua semanal, com as semanas oficiais.
- O período fica no endereço (L-D7).

### L4 — Ensaio

- Um período livre igual a uma semana publicada dá os números do relatório publicado. Pode haver diferença onde os dados mudaram depois da publicação (análise feita depois, card que mudou de status), e ela tem de ser explicável pela consulta da §7.
- Um período com hoje mostra o aviso de conversas sem avaliação (L-D5).

---

## 6. Riscos

- **A nota do mês não é a média das semanas.** Fica perto, mas não igual: dias de borda, pesos e semanas publicadas que congelaram números antigos. A tela explica (M6).
- **Troca do prompt do estágio 1 no meio do mês.** A trava exige o mês inteiro analisado na versão nova, o que significa reanalisar até um mês de conversas.
- **Período livre e relatório publicado podem divergir para as mesmas datas.** O publicado é uma foto, e o livre usa os dados de hoje. O selo "Calculado agora" existe por isso.
- **Next importando código dos jobs** (B2). Se o `extensionAlias` não resolver, o `compute-scope` fica sem imports `.js`.

---

## 7. Consultas de conferência

```sql
-- Backfill da B1 terminou (esperado: 0)
SELECT count(*) FROM sessions WHERE metrics_stale;

-- Relatórios publicados por tipo
SELECT granularity, period_start, period_end, count(*) AS escopos
FROM period_reports GROUP BY 1, 2, 3 ORDER BY 2, 1;

-- Nota do mês x média ponderada das semanas do mês (escopo geral). Setembro de 2026.
SELECT granularity,
       round(sum((qualidade->>'notaGeral')::numeric * (qualidade->>'nComNota')::int)
             / nullif(sum((qualidade->>'nComNota')::int), 0), 2) AS nota_ponderada,
       sum((qualidade->>'nComNota')::int) AS conversas_com_nota
FROM period_reports
WHERE scope_type = 'geral'
  AND ((granularity = 'mes'    AND period_start = '2026-09-01 03:00')
    OR (granularity = 'semana' AND period_start IN ('2026-09-02 03:00', '2026-09-09 03:00', '2026-09-16 03:00', '2026-09-23 03:00')))
GROUP BY 1;
```

---

## 8. Como saber que ficou pronto

**Código**
- [ ] `pnpm test` e `tsc --noEmit` limpos.
- [ ] Job C novo = Job C antigo em todas as semanas publicadas (B1).
- [ ] `--dry-run` de uma semana igual antes e depois da B2.

**Mensal**
- [ ] Setembro publicado como parcial, com o aviso, sem seta.
- [ ] Outubro (publicado em 02/11) sai sem seta, porque setembro é parcial (D6). A primeira seta aparece no relatório de novembro.
- [ ] O seletor de semanas não mostra meses, e o gráfico semanal não ganhou pontos novos.
- [ ] O bloco "Semanas do mês" mostra 02, 09, 16 e 23/09 para setembro.

**Período livre**
- [ ] 5 a 10/09 abre em menos de 3 s, sem texto da IA, com "Conversas em destaque".
- [ ] O link com `?de=&ate=` abre o mesmo período.
- [ ] Período com hoje mostra o aviso de conversas sem avaliação.

---

## 9. Fora desta entrega

- Texto da IA sob demanda no período livre (botão "Gerar resumo" para um escopo, guardado para não repetir a chamada).
- Comparação no período livre (com o período anterior de mesmo tamanho).
- Exportar o período livre em HTML ou PDF.
