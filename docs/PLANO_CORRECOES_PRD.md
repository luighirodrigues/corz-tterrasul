# Plano de correções — aderência ao PRD de qualidade de conversas

Lista de todas as mudanças necessárias para a plataforma seguir o `docs/PRD_QUALIDADE_CONVERSAS.md`, com o problema atual, a regra do PRD que ele quebra, o que fazer e como saber que ficou pronto.

**Base da avaliação:** código em `D:\Projetos\corz tterrasul` em 29/09/2026, o PRD e a documentação OpenAPI da FLW em `D:\Projetos\flwchat-api-docs\endpoints`.

**Estado atual em uma frase:** a estrutura segue o PRD (stack, tabelas, jobs A–E, prompts, regra de "já li esta sessão"), mas faltam as regras que dão honestidade e comparação semanal, e há bugs que distorcem os números. Os 13 testes passam e o `tsc` não dá erro, mas nenhum teste cobre as métricas nem a agregação.

---

## Status da execução (branch `fase-2-sync-calculos`)

Implementado no código, com `tsc` limpo, 93 testes passando e `next build` OK. **Nada foi validado contra Postgres, FLW ou OpenAI reais**: o banco estava desligado. O que exige banco (imutabilidade, sync, fila, migrations aplicadas) tem lógica coberta por testes de funções puras, mas precisa de uma rodada real.

| ID | Situação | Observação |
|----|----------|------------|
| M01 | Feito | `--week`, `--dry-run`, janela no fuso do tenant (`src/domain/period.ts`) |
| M02 | Feito | `create` só; `--correct --reason` guarda revisão |
| M03 | Feito | trava do §16 + `--allow-incomplete` |
| M04 | Feito | sem dado inventado; seed no tenant `demo`. **Falta conferir no banco real** se o seed antigo gravou lixo (consultas SQL na M04) |
| M05 | Feito | anonimização na API, no modal e no estágio 1/2; Basic Auth via `src/proxy.ts` |
| M06 | Feito | incremental por `UpdatedAt`; 1ª carga com `--from` ou `GO_LIVE_AT`. **Validar** se o `updatedAt` da sessão muda com mensagem nova |
| M07 | Feito | mensagens só do delta; áudio em processamento reagenda |
| M08 | Feito | checkpoint por página e `--resume` no Job A |
| M09 | Feito | `LostReason` e cards incrementais. **Validar** o formato real de `lostReason` na resposta |
| M10 | Feito | ID ou título exato; falha listando os painéis |
| M11 | Feito | `sem esteira` na tela e nos relatórios |
| M12 | Feito | só `origin = DEFAULT` é humano (D3: `API` = automática) |
| M13 | Feito | base de datas por métrica |
| M14 | Feito | nota só entre conversas com nota |
| M15 | Feito | KPIs de divisão com os 2 painéis |
| M16 | Feito | critério indisponível (D4: 30%) |
| M17 | Feito | D2 aplicada; `null` sem dado |
| M18 | Parcial | listas exatas + `config:lost-reasons`. **Falta definir o card automático da oficina (D7)** |
| M19 | Feito | `stage1-v2`, nota inteira, `temperature 0`, timeout |
| M20 | Feito | transcript JSON com data local e nota interna |
| M21 | Feito | corte do meio com estimativa de tokens (`caracteres/3,5`, sem `js-tiktoken`) |
| M22 | Feito | precisa dos preços em `OPENAI_PRICE_*`; sem eles o teto não se aplica (avisa) |
| M23 | Feito | fila sem `skipped`, backoff, lotes de 25, `--since/--session/--force` |
| M24 | Feito | a IA não escreve número; o código preenche e valida |
| M25 | Feito | sem "áudio sem transcrição" e "transferência" por escopo (o dado é gravado, falta agregar) |
| M26 | Feito | `comparativo` na linha de N, série em `/api/reports/history`, seta e gráfico |
| M27 | Parcial | falta: auditoria com `skipped`/`error` e filtro de período em `/api/sessions` |
| M28 | Feito offline | `0_init` + `1_alinhamento_prd` geradas por `migrate diff`, só aditivas |
| M29 | Parcial | 93 testes. Faltam os que precisam de banco: `immutability`, `sessions-api` |
| M30 | Feito | cliente FLW usa o token do tenant |
| M31 | Parcial | feito `config:lost-reasons`. Faltam departamentos, etapas do painel (ordem do funil) e notas |
| M32 | Feito | `daily`, `publish:weekly` e trava de concorrência (lock no Postgres) |
| M33 | Parcial | `main` corrigido; grupo pulado no Job D; falta ignorar `HIDDEN`/`UNDEFINED` nos sintéticos |

**Passos manuais antes da primeira leva real** (nesta ordem):
1. Subir o Postgres e fazer backup.
2. Banco já existente (criado por `db push`): `npx prisma migrate resolve --applied 0_init` e depois `pnpm prisma:deploy`. Banco novo: só `pnpm prisma:deploy`.
3. Conferir o seed antigo (SQL na M04) e limpar se houver lixo.
4. Preencher no `.env`: `GO_LIVE_AT`, `PANEL_*_TITLE` (ou IDs), `REPORT_BASIC_AUTH_*`, `OPENAI_PRICE_*`.
5. `pnpm config:lost-reasons` e preencher `IGNORED_LOST_REASONS` / `HYGIENE_LOST_REASONS`.
6. Primeira carga: `pnpm job:sync -- --from <go-live>`; depois `pnpm daily` todo dia e `pnpm publish:weekly` na quinta.
7. Antes de publicar de verdade, rodar `pnpm job:report -- --dry-run` e ler o rascunho em `reports/rascunho/`.
8. Os relatórios antigos em `reports/` (18/09) foram gerados com a lógica antiga e não valem.

---

## Sumário

- [Como ler este documento](#como-ler-este-documento)
- [Antes de começar](#antes-de-começar)
- [Tabela geral das mudanças](#tabela-geral-das-mudanças)
- [Fase 1 — Janela, imutabilidade e honestidade](#fase-1--janela-imutabilidade-e-honestidade)
- [Fase 2 — Sync correto com a FLW](#fase-2--sync-correto-com-a-flw)
- [Fase 3 — Cálculos](#fase-3--cálculos)
- [Fase 4 — IA (estágios 1 e 2)](#fase-4--ia-estágios-1-e-2)
- [Fase 5 — Saídas (tela, HTML, API)](#fase-5--saídas-tela-html-api)
- [Fase 6 — Infra e qualidade de código](#fase-6--infra-e-qualidade-de-código)
- [Decisões pendentes](#decisões-pendentes)
- [Mudanças consolidadas no schema Prisma](#mudanças-consolidadas-no-schema-prisma)
- [Novas variáveis de ambiente](#novas-variáveis-de-ambiente)
- [Atualizações necessárias no próprio PRD](#atualizações-necessárias-no-próprio-prd)
- [Checklist §16 do PRD → mudanças](#checklist-16-do-prd--mudanças)
- [Ordem de execução e dependências](#ordem-de-execução-e-dependências)

---

## Como ler este documento

Cada mudança tem um ID (`M01`…`M33`) e segue o mesmo formato:

- **Prioridade**
  - **P0**: bloqueia publicar uma leva confiável (número errado, dado inventado ou regra travada do PRD quebrada).
  - **P1**: necessária para cumprir o PRD, mas não distorce tanto os números.
  - **P2**: melhoria de infraestrutura ou robustez.
- **Tamanho:** P (horas), M (1–2 dias), G (3+ dias). É estimativa relativa, não prazo.
- **PRD:** seção do PRD que a mudança atende.
- **Como está hoje:** o que o código faz, com `arquivo:linha`.
- **O que fazer:** passos concretos.
- **Pronto quando:** critério de aceite verificável.

Itens que dependem de uma decisão de produto apontam para a seção [Decisões pendentes](#decisões-pendentes) (`D1`…`D9`).

---

## Antes de começar

1. **Colocar o projeto no git.** Hoje a pasta não é um repositório. Sem isso, não dá para revisar nem desfazer as mudanças abaixo.
   - Adicionar `.next/` ao `.gitignore` antes do primeiro commit. O `.env` já está ignorado.
   - `git init`, commit inicial com o estado atual e uma branch por fase.
2. **Fazer backup do banco:** `pg_dump` do `corz_qualidade` antes das migrations da Fase 1.
3. **Tratar os relatórios atuais como inválidos.** Os HTMLs em `reports/` e as linhas de `period_reports` foram gerados com a lógica atual (janela móvel, KPI de divisão errado, nota geral errada). Não vale a pena comparar com eles depois das correções.

---

## Tabela geral das mudanças

| ID | Mudança | Prioridade | Tamanho | PRD |
|----|---------|:---:|:---:|-----|
| M01 | Janela fixa da leva no fuso do tenant | P0 | M | §3, §15, §16 |
| M02 | Relatório publicado imutável + correção explícita | P0 | P | §3, §9.2 |
| M03 | Trava de publicação (checklist §16) | P0 | M | §16 |
| M04 | Remover dados inventados (tela, API, seed) | P0 | P | §3 (honestidade), §13 |
| M05 | Anonimização em todas as saídas + proteção da API | P0 | M | §3, §11 |
| M06 | Sync de sessões incremental por `UpdatedAt` | P0 | M | §9.2, §10 Job A |
| M07 | Mensagens só do delta | P1 | M | §10 Job A |
| M08 | Checkpoint retomável | P2 | P | §7, §10 |
| M09 | Cards: `LostReason`, sync incremental, religar sessão | P0 | M | §8, §10 Job B, §13 |
| M10 | Resolver os 4 painéis por configuração exata | P0 | P | §5, §15 |
| M11 | Vínculo sessão → painel e marca "sem esteira" | P1 | M | §3, §5 |
| M12 | Definição única de "mensagem humana" | P0 | P | §6.1, §11.1 |
| M13 | Base de datas correta por métrica | P0 | P | §6, §10 Job D |
| M14 | Nota geral e contagens corretas | P0 | P | §6.2 |
| M15 | KPIs das divisões | P0 | P | §5, §10 Job E |
| M16 | Critério indisponível na leva | P1 | M | §3, §6.2 |
| M17 | Ajustes nas métricas sintéticas | P1 | M | §6.1 |
| M18 | Regras de justiça com listas exatas | P1 | P | §13 |
| M19 | Estágio 1: schema, parâmetros e validação | P0 | P | §11, §11.1 |
| M20 | Estágio 1: formato do transcript | P1 | M | §10 Job D, §11.1 |
| M21 | Corte de transcript longo | P1 | M | §11 |
| M22 | Teto de custo por corrida | P1 | P | §11 |
| M23 | Fila do Job D | P1 | M | §9.2, §10 Job D |
| M24 | Estágio 2 com contagens reais | P0 | G | §10 Job E, §11.2, §16 |
| M25 | `limitacoes` completo | P1 | M | §3, §13 |
| M26 | Evolução semanal (seta + série histórica) | P1 | G | §3, §9.2 |
| M27 | Tela e HTML: limitações, nomes, período, segurança | P1 | G | §12 |
| M28 | Migrations Prisma | P2 | P | §7.1 |
| M29 | Testes | P1 | M | — |
| M30 | Token por tenant | P2 | P | §7, §9 |
| M31 | Endpoints FLW que faltam | P2 | M | §8 |
| M32 | Agendamento e trava de concorrência | P2 | P | §7.1, §10 |
| M33 | Limpezas diversas | P2 | P | — |

---

## Fase 1 — Janela, imutabilidade e honestidade

### M01 — Janela fixa da leva, no fuso do tenant

**Prioridade:** P0 · **Tamanho:** M · **PRD:** §3 (cadência), §15 item 1, §16 ("janela sem sobreposição")
**Arquivos:** `src/cli.ts`, novo `src/domain/period.ts`, `src/jobs/job-e-stage2-report.ts`, `prisma/schema.prisma`

**Como está hoje**
- `src/cli.ts:150-154` (`report`) e `src/cli.ts:178-182` (`pipeline`) montam a janela como "agora menos N dias", até o milissegundo, em UTC.
- O `timezone` do tenant é gravado (`schema.prisma:23`), mas nada o usa.
- Cada execução gera um `periodStart`/`periodEnd` diferente: duas rodadas no mesmo dia viram dois "relatórios" diferentes, e as janelas se sobrepõem.

**Por que é problema**
O PRD define uma janela fechada (padrão: quarta 00:00 → terça 23:59, entrega na quinta) e exige janelas sem sobreposição. Sem isso não existe "semana N" nem "semana N−1": não há comparação, histórico nem imutabilidade.

**O que fazer**
1. Criar `src/domain/period.ts` com funções puras:
   ```ts
   export interface Period { start: Date; end: Date; label: string } // label: "2026-09-23 a 2026-09-29"
   export function periodContaining(ref: Date, tz: string, weekStartIsoDay?: number): Period;
   export function lastClosedPeriod(now: Date, tz: string, weekStartIsoDay?: number): Period;
   export function previousPeriod(p: Period, tz: string): Period;
   ```
   - `start` = dia de início da semana (ISO: 1 = segunda … 3 = quarta) às 00:00:00.000 no fuso do tenant, convertido para UTC.
   - `end` = início da semana seguinte menos 1 ms (terça 23:59:59.999 local).
   - Usar **luxon** (ou `@date-fns/tz`) para o fuso. Não fazer conta de offset na mão.
2. Coluna nova `Tenant.periodWeekStart Int @default(3)`, alimentada por `PERIOD_WEEK_START`.
3. Na CLI:
   - `report` e `pipeline` passam a aceitar `--week YYYY-MM-DD` (qualquer data dentro da semana-alvo). Sem argumento, usam `lastClosedPeriod(now)`.
   - `--days` continua só nos comandos de sync, como lookback de captura, e não define mais a janela de relatório.
   - Recusar publicar uma janela ainda aberta (`end > now`). Com `--dry-run`, calcula e imprime/exporta o HTML marcado como "RASCUNHO", sem gravar em `period_reports`.
4. Exemplo esperado, fuso `America/Sao_Paulo`, hoje terça 29/09/2026:
   - A janela 23/09–29/09 ainda está aberta.
   - `lastClosedPeriod` devolve 16/09 00:00 → 22/09 23:59:59.999 (UTC: `2026-09-16T03:00:00.000Z` → `2026-09-23T02:59:59.999Z`).
   - Na quinta 01/10, devolve 23/09–29/09.

**Pronto quando**
- Duas execuções de `report` no mesmo dia geram exatamente o mesmo `periodStart`/`periodEnd`.
- Para duas janelas consecutivas, `end(N) + 1 ms == start(N+1)`.
- Testes de `period.ts` cobrindo: virada na quarta, execução na terça e na quinta, e `previousPeriod` contíguo.

---

### M02 — Relatório publicado imutável, com correção explícita

**Prioridade:** P0 · **Tamanho:** P · **PRD:** §3 ("histórico semanal não se reescreve"), §9.2
**Arquivos:** `src/jobs/job-e-stage2-report.ts`, `prisma/schema.prisma`

**Como está hoje**
`job-e-stage2-report.ts:328-366` faz `upsert`: rodar o Job E de novo para a mesma janela sobrescreve o relatório publicado, inclusive o `publishedAt` (linha 348).

**O que fazer**
1. Publicação normal: `create`. Se já existir linha para `(tenant, periodStart, periodEnd, scopeType, scopeId)`, **pular esse escopo** e registrar no log "já publicado em <publishedAt>".
2. Correção explícita: `--correct --reason "texto"`.
   - Antes de sobrescrever, copiar o conteúdo atual (`sinteticos`, `qualidade`, `funil`, `textoFortes`, `textoOps`, `limitacoes`, `comparativo`) para uma tabela nova `period_report_revisions` (`reportId`, `snapshot Json`, `reason`, `createdAt`).
   - Depois, atualizar a linha e preencher `correctedAt` e `correctionReason`.
3. Mostrar na tela e no HTML: "Corrigido em dd/mm — motivo: …" quando `correctedAt` estiver preenchido.

**Pronto quando**
- Rodar o Job E duas vezes para a mesma janela não altera nenhuma linha na segunda vez.
- `--correct` sem `--reason` é recusado.
- Toda correção deixa uma linha em `period_report_revisions`.

---

### M03 — Trava de publicação (checklist §16)

**Prioridade:** P0 · **Tamanho:** M · **PRD:** §16
**Arquivos:** novo `src/domain/publish-gate.ts`, `src/jobs/job-e-stage2-report.ts`, `src/cli.ts`

**Como está hoje**
O Job E publica sem conferir nada: nem se o sync terminou, nem se todas as sessões da janela já passaram pela IA.

**O que fazer**
Antes de publicar, `checkPublishGate(tenantId, period)` confere:
1. **A janela está fechada** (`period.end < now`).
2. **O sync cobriu a janela:** existe `sync_jobs` com `jobType = SYNC_SESSIONS`, `status = completed` e `startedAt > period.end`, e o mesmo para `SYNC_CARDS`.
3. **Nenhuma sessão pendente:** toda sessão `COMPLETED` com `endAt` na janela tem linha em `session_analyses` na `prompt_version` atual, com status `done`, `skipped` ou `error`.

Se alguma condição falhar, abortar e listar o que falta, por exemplo: "37 sessões COMPLETED da janela sem análise; rode `job:stage1`". Com `--allow-incomplete`, publicar mesmo assim e escrever cada condição que falhou em `limitacoes` (M25).

**Pronto quando**
- Com o sync de cards falho, o Job E se recusa a publicar e explica o motivo.
- Com `--allow-incomplete`, o relatório sai e `limitacoes` diz o que ficou de fora.

---

### M04 — Remover dados inventados (tela, API, seed)

**Prioridade:** P0 · **Tamanho:** P · **PRD:** §3 (herda da Tterrasul: honestidade), §12 ("não inventar"), §13 ("nunca escondida")
**Arquivos:** `src/lib/sessions-loader.ts`, `src/lib/reports-loader.ts`, `src/app/api/pipeline/route.ts`, `src/app/page.tsx`, `src/components/AiInsightsBlock.tsx`, `src/seed-demo.ts`

**Como está hoje**

| Onde | O que é inventado |
|------|-------------------|
| `sessions-loader.ts:67-186` | Três conversas fictícias (Vinicios, Keity, Sergio), com transcrição e nota, devolvidas quando o banco está vazio ou fora do ar. |
| `sessions-loader.ts:186` | Se o filtro por atendente não acha nada, devolve todas as conversas fictícias. |
| `sessions-loader.ts:48` | `notaConversa ?? 7.5`: sessão sem nota aparece com 7,5. |
| `sessions-loader.ts:43` | `panelName` cai em `"Vendas Novos"` quando não há card. |
| `sessions-loader.ts:56` | Resumo padrão inventado ("Atendimento conduzido com foco em agendamento de test-drive…"). |
| `sessions-loader.ts:35` | Duração padrão de 15 minutos. |
| `api/pipeline/route.ts:20-35` | Com o banco fora do ar, devolve um job "PIPELINE_COMPLETE, completed, 124 itens" que nunca existiu. |
| `reports-loader.ts:213+` | Sem banco, lê os HTMLs de `reports/` com regex. O período padrão está fixo em 18/09–25/09 (`:30-31`). |
| `page.tsx:519+` (aba Pipeline) | Os 5 jobs aparecem sempre como "Pronto", sem ler nada do banco. |
| `AiInsightsBlock.tsx:22` | Etiqueta fixa "Estágio 2 • GPT-4.1", qualquer que seja o modelo usado. |
| `seed-demo.ts:5` | O seed grava sessões, agentes ("Rodrigo Silva", "Camila Rocha") e cards falsos **no tenant real** (`DEFAULT_TENANT_ID`). Essas sessões entram na fila da IA e nos relatórios. |

**O que fazer**
1. `sessions-loader.ts`:
   - Apagar `mockSessions` e o fallback do filtro.
   - Campo ausente vira `null` e a tela mostra "N/D" ou "—".
   - Erro de banco propaga: a rota responde `503` com `{ error: "Banco indisponível" }`.
2. `reports-loader.ts`: apagar `parseHtmlReport` e o fallback por arquivo. A única fonte da tela é o `period_reports`.
3. `api/pipeline/route.ts`: com erro, responder `503` com `recentJobs: []`.
4. Aba Pipeline: ler o status real (M27).
5. `AiInsightsBlock`: receber `model` e `promptVersionSintese` do relatório.
6. `seed-demo.ts`: gravar sempre no tenant fixo `demo`, nunca em `DEFAULT_TENANT_ID`. Como os jobs e a tela usam `DEFAULT_TENANT_ID`, os dados de demonstração nunca se misturam com os reais.
7. Limpar o que o seed já pode ter gravado no tenant real. Conferir antes com:
   ```sql
   SELECT external_id FROM sessions WHERE tenant_id = 'tterrasul' AND external_id IN ('flw-sess-101','flw-sess-102');
   SELECT external_id FROM agents   WHERE tenant_id = 'tterrasul' AND external_id IN ('agent-rodrigo','agent-camila');
   SELECT external_id FROM panel_cards WHERE tenant_id = 'tterrasul' AND external_id IN ('card-101','card-102');
   ```
   Se aparecer algo, apagar (o cascade leva junto mensagens e análises) e checar se o tenant ficou com `panel_*_id = 'panel-vendas-1'` e parecidos.

**Pronto quando**
- Com o banco desligado, a tela mostra "Banco indisponível", e não relatórios nem conversas.
- Com o banco vazio, a tela mostra "Nenhum relatório publicado".
- `grep -r "7.5\|Vendas Novos\|mockSessions" src/` não acha nada.

---

### M05 — Anonimização em todas as saídas + proteção da API

**Prioridade:** P0 · **Tamanho:** M · **PRD:** §3 ("trechos anonimizados em qualquer saída"), §11 ("antes de enviar: mascarar…")
**Arquivos:** `src/lib/sessions-loader.ts`, `src/components/ConversationModal.tsx`, `src/utils/anonymizer.ts`, `src/jobs/job-d-stage1-analysis.ts`, `src/jobs/job-a-sync-sessions.ts`, novo `src/middleware.ts`

**Como está hoje**
- A anonimização só acontece no transcript que vai para a OpenAI (`job-d:215-219`).
- `/api/sessions` devolve `contactName` (`sessions-loader.ts:41`) e o texto cru das mensagens (`:30`).
- O modal diz "Transcrição Anonimizada do WhatsApp" (`ConversationModal.tsx:104`), mas mostra `m.text` sem máscara (`:142`).
- A máscara de telefone `replace(/(\d{4})\d{4}/, "$1-****")` (`sessions-loader.ts:42`) deixa os últimos dígitos visíveis. Exemplo: `5511988881111` vira `5511-****81111`.
- `truncateEvidence` (`anonymizer.ts:64`) chama `anonymizeText` sem o nome do cliente, e `resumo1Linha` é gravado sem nenhuma máscara.
- O Job A grava só `contactDetails.name || nameWhatsapp` (`job-a:134`). Quando os dois existem, o nome do WhatsApp não é guardado e, por isso, não é mascarado.
- As rotas `/api/*` não têm nenhuma proteção e servem transcrições.

**O que fazer**
1. **Job A:** gravar os dois nomes (`contactName` e o novo `contactNameWhatsapp`) e passar ambos ao anonimizador.
2. **Anonimizador:**
   - `AnonymizeOptions` aceita `clientNames: string[]` em vez de um nome só.
   - Mascarar também CPF sem pontuação (11 dígitos isolados) e CNPJ.
   - Adicionar casos de teste com códigos reais de peça e chassi, para medir o quanto a regex de telefone (`anonymizer.ts:14`, que casa qualquer sequência de 8 dígitos) está mascarando além da conta. Na dúvida, preferir mascarar a mais.
3. **Job D:**
   - `truncateEvidence(text, 200, { clientNames, clientPhone })`.
   - Aplicar o anonimizador também ao `resumo` antes de gravar.
4. **`sessions-loader`:**
   - Não devolver `contactName`.
   - Telefone vira `{{fone}}`, ou no máximo os 2 últimos dígitos.
   - Passar cada `text` pelo `anonymizeText` com os nomes e o telefone da sessão, **no servidor**, antes de sair na API.
5. **Estágio 2:** passar `texto` e `script_sugerido` pelo anonimizador genérico (telefone, e-mail, CPF) antes de gravar.
6. **Proteção mínima da API e da tela** (ver [D8](#decisões-pendentes)):
   - `src/middleware.ts` com Basic Auth (`REPORT_BASIC_AUTH_USER` / `REPORT_BASIC_AUTH_PASS`) em todas as rotas.
   - `next start -H 127.0.0.1` por padrão no script `web:start`.

**Pronto quando**
- A resposta de `/api/sessions` não contém nome nem telefone do cliente. Teste automatizado com uma sessão cujo texto cita nome e telefone.
- Sem credencial, `/api/*` responde `401`.

---

## Fase 2 — Sync correto com a FLW

> A documentação da FLW (`flwchat-api-docs/endpoints/get_v2-session.md` e `get_v2-panel-card.md`) confirma que **`/v2/session` e `/v2/panel/card` aceitam `UpdatedAt.After` / `UpdatedAt.Before`**, e que `LostReason` é um valor válido de `IncludeDetails` nos cards.

### M06 — Sync de sessões incremental por `UpdatedAt`

**Prioridade:** P0 · **Tamanho:** M · **PRD:** §9.2 ("sessão que era IN_PROGRESS e virou COMPLETED entra sozinha na próxima leva"), §10 Job A
**Arquivos:** `src/jobs/job-a-sync-sessions.ts`, `src/cli.ts`, `prisma/schema.prisma`

**Como está hoje**
- O Job A filtra só por `CreatedAt.After = agora − N dias` (`job-a:68-73`, `:95-100`). O cliente já aceita `updatedAtAfter` (`flw-client.ts:122`, `:131`), mas ninguém usa.
- O cursor gravado no `sync_jobs` nunca é lido na corrida seguinte.
- **Consequência:** uma sessão criada antes do lookback (padrão: 7 dias) que fecha depois nunca é atualizada. Ela fica `IN_PROGRESS` no espelho para sempre e **nunca é analisada**. Conversas longas de venda de carro são justamente as mais afetadas.

**O que fazer**
1. **Modo incremental (padrão):**
   - Ler o `cursorDate` do último `SYNC_SESSIONS` com `status = completed`.
   - Pedir `UpdatedAt.After = cursor − SYNC_OVERLAP_MINUTES` (padrão 15 min de margem).
   - Ao concluir, gravar como novo cursor o **instante em que a corrida começou**. Assim nada que mudou durante a corrida se perde.
2. **Modo backfill** (primeira carga, §15 item 3): `sync --from YYYY-MM-DD` usa `CreatedAt.After` uma única vez e, no fim, grava o cursor como no modo incremental. `GO_LIVE_AT` é o padrão do `--from` quando não existe cursor ainda.
3. **Sem cursor e sem `--from`:** abortar com uma mensagem clara, em vez de supor 7 dias.
4. Guardar os parâmetros da corrida em `SyncJob.params` (M08).
5. Gravar também `lastMessageIn`, `lastMessageOut` e `type` (`INDIVIDUAL`/`GROUP`) da sessão. A API devolve esses campos, e eles servem para M17 e M33.
6. **Validar na primeira corrida real** que o `updatedAt` da sessão muda quando chega mensagem e quando ela fecha: pegar uma sessão aberta, mandar uma mensagem e ver se ela volta com `UpdatedAt.After`. Se não mudar com mensagem, somar uma segunda consulta por `EndAt.After = cursor` para capturar as que fecharam.

**Pronto quando**
- Uma sessão criada 20 dias atrás e fechada ontem aparece `COMPLETED` no espelho depois do sync diário e entra na fila do Job D.
- Duas corridas seguidas sem mudança na FLW fazem só a paginação vazia, sem baixar mensagens (M07).

---

### M07 — Mensagens só do delta

**Prioridade:** P1 · **Tamanho:** M · **PRD:** §10 Job A passo 3
**Arquivos:** `src/jobs/job-a-sync-sessions.ts`, `prisma/schema.prisma`

**Como está hoje**
- `job-a:179` baixa **todas** as mensagens de **toda** sessão listada, a cada corrida, e faz um `upsert` por mensagem (`:183`).
- Com rate limit de 60 req/min, isso cresce rápido.
- `:182` usa `new Date()` como timestamp quando a mensagem não traz data, o que corrompe a timeline.

**O que fazer**
1. Colunas novas em `Session`: `messagesSyncedAt` e `messagesSyncedFlwUpdatedAt`.
2. Baixar as mensagens só se:
   - a sessão é nova no espelho, **ou**
   - `item.updatedAt > messagesSyncedFlwUpdatedAt`, **ou**
   - `messagesPending = true` (ver passo 4).
3. Gravar com `createMany({ skipDuplicates: true })`. Usar `upsert` só para mensagens de áudio, cuja transcrição pode chegar depois.
4. Se alguma mensagem de áudio vier com `details.transcription.processing = true`, marcar `Session.messagesPending = true` para buscar de novo na próxima corrida. A doc da API mostra que a transcrição é assíncrona (`PublicMsgTranscriptionDTO.processing`).
5. Mensagem sem `timestamp` nem `createdAt`: não gravar e registrar no log. Nunca usar `new Date()`.

**Pronto quando**
- A segunda corrida seguida faz zero chamadas a `/v1/session/{id}/message` para sessões que não mudaram.
- Um áudio cuja transcrição chegou depois aparece transcrito no espelho depois da corrida seguinte.

---

### M08 — Checkpoint retomável

**Prioridade:** P2 · **Tamanho:** P · **PRD:** §7 ("job, checkpoint"), §10 ("todos retomáveis")
**Arquivos:** `src/jobs/job-a-sync-sessions.ts`, `src/jobs/job-b-sync-cards.ts`, `prisma/schema.prisma`

**Como está hoje**
- Cada corrida cria um `SyncJob` novo e nunca retoma o anterior.
- O checkpoint só é salvo quando `i % 20 === 0` (`job-a:227`), e esse índice reinicia a cada página.

**O que fazer**
1. `SyncJob.params Json?` com os filtros usados (`mode`, `updatedAfter`/`createdAfter`, `before`).
2. Salvar `currentPage` e contadores **ao fim de cada página**.
3. `--resume` pega o último job `failed`/`running` do mesmo tipo e continua da `currentPage` com os mesmos `params`.
4. Como os upserts são idempotentes e o cursor só avança no fim (M06), rodar de novo do zero também é seguro. O `--resume` só economiza chamadas.

**Pronto quando**
Derrubar o processo no meio da página 30 e rodar `sync --resume` continua da página 30, e o cursor final é o mesmo de uma corrida sem queda.

---

### M09 — Cards: `LostReason`, sync incremental e religar sessão

**Prioridade:** P0 · **Tamanho:** M · **PRD:** §8 (`IncludeDetails=StepTitle,LostReason,ResponsibleUser,Contacts`), §10 Job B, §13
**Arquivos:** `src/flw/flw-client.ts`, `src/flw/flw-types.ts`, `src/jobs/job-b-sync-cards.ts`, `tests/flw-client.test.ts`, `prisma/schema.prisma`

**Como está hoje**
- `flw-client.ts:253-255` pede `StepTitle`, `ResponsibleUser` e `Contacts`, mas **não pede `LostReason`**. Na doc da API, `lostReason` é um objeto opcional (`LostReasonDTO { id, name }`), então sem esse detalhe ele tende a vir nulo. Com isso:
  - os "motivos de perda" do funil ficam vazios;
  - a regra de justiça de perdas fora do controle (`job-c:231`) nunca se aplica.
- Os cards também são filtrados só por `CreatedAt` no lookback (`job-b:17-24`, `:106-110`). Um card criado antes da janela que vira WON/LOST depois nunca é atualizado.
- Se o card chega antes da sessão existir no espelho, `sessionId` fica nulo e nunca é preenchido depois.
- O teste `flw-client.test.ts` fixa a lista antiga de `IncludeDetails`.

**O que fazer**
1. `IncludeDetails`: somar `LostReason`, `PanelTitle` e `StepPhase`. Atualizar o teste.
2. Tipar `lostReason?: { id: string; name: string } | null` em `FlwPanelCardDTO` e gravar em colunas separadas: `lostReasonId` e `lostReason` (o nome). Gravar também `panelTitle` e `stepPhase`.
3. Sync incremental com `UpdatedAt.After = cursor − margem`, mesma lógica de M06. O backfill usa `CreatedAt.After`.
4. Depois dos Jobs A e B, rodar o religamento:
   ```sql
   UPDATE panel_cards pc SET session_id = s.id
   FROM sessions s
   WHERE pc.tenant_id = s.tenant_id
     AND pc.session_external_id = s.external_id
     AND pc.session_id IS NULL;
   ```
5. Detectar mais de um card por sessão (§10 Job B: "registrar e usar a mais atualizada"): contar e registrar no log. A resolução fica em M11.

**Pronto quando**
- Um card perdido no painel aparece com `lost_reason` preenchido.
- Um card criado há 30 dias e ganho ontem aparece `WON` depois do sync.
- Não sobram cards com `session_external_id` preenchido e `session_id` nulo quando a sessão existe no espelho.

---

### M10 — Resolver os 4 painéis por configuração exata

**Prioridade:** P0 · **Tamanho:** P · **PRD:** §5, §15 item 2
**Arquivos:** `src/jobs/job-b-sync-cards.ts`, novo `src/domain/tenant.ts`, `src/config/env.ts`, `.env.example`

**Como está hoje**
- `job-b:51-62` adivinha o painel por pedaço do título ("venda", "campanha", "peca", "oficina", "servico").
- `job-b:57` tem um bug de precedência: `!panelPecasId && titleLower.includes("peça") || titleLower.includes("peca")`. Qualquer painel com "peca" no título sobrescreve o ID já resolvido.
- Um painel chamado "Venda de Peças" cairia em **Vendas** (divisão carros).
- O palpite é gravado no tenant e nunca mais revisto.
- O Job A só atualiza o `name` do tenant (`job-a:19-33`). IDs de painel e motivos de perda vindos do `.env` só entram na criação, e mudar o `.env` depois não tem efeito.

**O que fazer**
1. Criar `ensureTenant()` em `src/domain/tenant.ts`, chamada no início de **todos** os jobs. Ela faz `upsert` com `update` completo a partir do `.env`: IDs, títulos, listas de motivos, fuso, início da semana e go-live.
2. Ordem de resolução de cada painel:
   - se `PANEL_X_ID` estiver preenchido, usar o ID;
   - senão, casar **exatamente** com `PANEL_X_TITLE`, normalizando (minúsculas, sem acento, `trim`).
3. Nenhum painel encontrado, ou mais de um casando com o mesmo título: **falhar o Job B**, listando os painéis que a API devolveu (`título (id)`).
4. Apagar a heurística atual.

**Pronto quando**
- Um título que não existe faz o Job B falhar com a lista de painéis disponíveis.
- Mudar `PANEL_VENDAS_ID` no `.env` passa a valer na corrida seguinte.

---

### M11 — Vínculo sessão → painel e marca "sem esteira"

**Prioridade:** P1 · **Tamanho:** M · **PRD:** §3 ("sem card: entra na nota do atendente e fica marcada sem esteira"), §5
**Arquivos:** novo `src/domain/session-panel.ts`, `src/jobs/job-d-stage1-analysis.ts`, `src/jobs/job-e-stage2-report.ts`, `src/lib/sessions-loader.ts`

**Como está hoje**
- `job-d:244` manda como "Painel CRM" o `stepTitle` do primeiro card: é a **etapa**, não o painel.
- Nada marca a sessão como "sem esteira".
- Os relatórios não dizem quantas conversas do atendente não têm card.
- Com mais de um card por sessão, o código pega um qualquer (`panelCards[0]`).

**O que fazer**
1. Criar `resolveSessionPanel(session, tenant)`, que devolve `{ panelKey: "vendas"|"campanhas"|"pecas"|"oficina"|null, panelTitle, stepTitle, cardStatus, duplicateCards: number }`.
   - Com vários cards, escolhe o de `flwUpdatedAt` mais recente.
   - `panelKey = null` significa **sem esteira**.
2. Job D: metadado `Painel: Oficina | Etapa: Orçamento` ou `Painel: sem esteira`.
3. Job E: no escopo `agente`, contar `nSemEsteira` e escrever em `limitacoes` (M25), por exemplo "12 de 40 conversas sem card (sem esteira)".
4. Na tela, a aba Auditoria mostra uma etiqueta "sem esteira".

**Pronto quando**
Uma sessão sem card aparece como "sem esteira" na tela, entra na nota do atendente e fica fora das notas de painel e de divisão.

---

## Fase 3 — Cálculos

### M12 — Definição única de "mensagem humana"

**Prioridade:** P0 · **Tamanho:** P · **PRD:** §6.1 (TMR "origin != BOT"), §11.1
**Arquivos:** novo `src/domain/message-kind.ts`, `src/jobs/job-c-synthetics.ts`, `src/jobs/job-d-stage1-analysis.ts`

**Como está hoje**
- O código trata como humana toda mensagem `FROM_HUB` com `origin !== "BOT"` (`job-c:134`, `job-d:181`).
- A API real tem mais origens automáticas: `DEFAULT`, `CAMPAIGN`, `OFFICE_HOURS`, `BOT`, `API`, `PAYMENT` e `GATEWAY` (doc de `get_v1-session-id-message`).
- Consequências:
  - A resposta automática de **fora do horário** (`OFFICE_HOURS`) conta como primeira resposta humana. O **TMR sai artificialmente baixo** e o "sem resposta" sai baixo também.
  - Disparos de **campanha** contam como resposta humana e como reativação.
  - Mensagens do tipo `NOTE` (nota interna, que o cliente não vê) também são `FROM_HUB` e contam como resposta ao cliente.
  - Mensagens `FAILED`/`DELETED` contam como resposta.
- No transcript da IA, `OFFICE_HOURS` e `CAMPAIGN` aparecem como "operacao" sem marca de automático (`job-d:213-214`), então a IA julga o atendente por essas mensagens.

**O que fazer**
1. Criar `message-kind.ts` com uma única fonte de verdade:
   ```ts
   const AUTOMATED_ORIGINS = new Set(["BOT", "OFFICE_HOURS", "CAMPAIGN", "PAYMENT", "GATEWAY", "API"]); // API: ver D3
   const NON_CONVERSATION_TYPES = new Set(["TRANSITION", "TRACK", "NOTE"]);
   const FAILED_STATUSES = new Set(["FAILED", "DELETED"]);

   export function isClientMessage(m): boolean;          // TO_HUB e tipo de conversa
   export function isHumanOperatorMessage(m): boolean;   // FROM_HUB, origin DEFAULT, tipo de conversa, status não falho
   export function isAutomatedMessage(m): boolean;       // FROM_HUB com origin automática
   export function isInternalNote(m): boolean;           // type NOTE
   ```
2. Usar essas funções no Job C (TMR, sem resposta, reativação), no Job D (checagem de "tem fala humana" e rótulos do transcript) e no `sessions-loader`.
3. Registrar no PRD (§6.1) que "humano" = `origin DEFAULT` (ver [Atualizações no PRD](#atualizações-necessárias-no-próprio-prd)).

**Pronto quando**
Os testes cobrem: `OFFICE_HOURS` não conta como primeira resposta, `NOTE` não conta como resposta, `CAMPAIGN` não conta como reativação humana e `FAILED` não conta como resposta.

---

### M13 — Base de datas correta por métrica

**Prioridade:** P0 · **Tamanho:** P · **PRD:** §6, §10 Job D ("endAt na janela")
**Arquivos:** `src/jobs/job-e-stage2-report.ts`, `src/jobs/job-c-synthetics.ts`

**Como está hoje**
- A qualidade (anel, barras, histograma, estágio 2) filtra as sessões por `startAt` na janela (`job-e:163`).
- Uma conversa que começa na semana N e fecha na N+1:
  - não entra em N, porque ainda estava aberta quando N foi publicada;
  - não entra em N+1, porque o `startAt` não está em N+1.
- Resultado: **ela nunca é avaliada em relatório nenhum**.
- A lista de atendentes com relatório também usa `startAt` (`job-e:134-142`).

**O que fazer**
Uma regra de data para cada métrica, documentada no código e no PRD:

| Métrica | Sessões consideradas |
|---------|----------------------|
| Qualidade (anel, barras, histograma, estágio 2) | `status = COMPLETED` e `endAt` na janela |
| FTR mediana | `status = COMPLETED` e `endAt` na janela |
| TMR, sem resposta, reativação | `startAt` na janela, qualquer status (métrica operacional, §6.1) |
| Fechamento e funil | cards com `flwCreatedAt` na janela, **status atual** do card |
| Atendentes com relatório | com ≥1 sessão `COMPLETED` e `endAt` na janela, **ou** ≥1 sessão iniciada na janela |

Declarar em `limitacoes` que o funil usa o status atual do card, não o status no fim da janela. Sem webhook não existe histórico de etapa (§14).

**Pronto quando**
Uma sessão iniciada em 21/09 e fechada em 24/09 entra na leva 23/09–29/09.

---

### M14 — Nota geral e contagens corretas

**Prioridade:** P0 · **Tamanho:** P · **PRD:** §6.2 ("nota do recorte = média das notas das conversas")
**Arquivos:** `src/jobs/job-e-stage2-report.ts`, novo `src/domain/aggregate.ts`

**Como está hoje**
- `job-e:233`: `notaGeral = sumNotaGeral / n`, e `n` inclui sessões com `notaConversa = null` (todos os critérios "não se aplica"). Essas sessões somam 0 e dividem, **puxando a nota para baixo**.
- Um escopo sem nenhuma conversa grava `notaGeral: 0` (`:233`), e o anel mostra **0,0**, como se a qualidade fosse zero.
- `preliminar` usa o `n` total, não o número de conversas com nota.

**O que fazer**
1. Extrair o cálculo para `aggregateScope(...)` em `src/domain/aggregate.ts`, uma função pura e testável, usada também em M16 e M26.
2. Campos de `qualidade`:
   ```json
   {
     "n": 60,            // sessões COMPLETED da janela no escopo
     "nDone": 55,
     "nComNota": 54,
     "nSkipped": 3,
     "nError": 2,
     "nSemEsteira": 7,
     "notaGeral": 6.3,   // média de nota_conversa só entre as 54 com nota; null se nComNota = 0
     "medias": { "atrito": 7.9, "...": "..." },
     "histograma": [0, 0, 1, 3, 5, 9, 12, 11, 8, 4, 1],
     "criteriosIndisponiveis": []
   }
   ```
3. `preliminar = nComNota < 10`.
4. A tela e o HTML mostram "—" quando `notaGeral` é `null`.

**Pronto quando**
- Com 10 conversas de nota 8 e 2 sem nota, a nota geral é 8,0, não 6,7.
- Um escopo vazio mostra "—".

---

### M15 — KPIs das divisões

**Prioridade:** P0 · **Tamanho:** P · **PRD:** §5, §10 Job E
**Arquivos:** `src/jobs/job-c-synthetics.ts`, `src/jobs/job-e-stage2-report.ts`

**Como está hoje**
- `job-e:250` só passa `panelId` para os sintéticos quando o escopo tem **exatamente 1** painel.
- As divisões têm 2 painéis, então recebem `undefined` e os **KPIs de "Venda de carros" e de "Peças" saem iguais aos da visão geral**: TMR, FTR, sem resposta, fechamento e reativação.

**O que fazer**
1. `SyntheticFilter.panelIds?: string[]` no lugar de `panelId`, filtrando com `panelCards: { some: { panelId: { in: panelIds } } }` nas sessões e `panelId: { in: panelIds }` nos cards.
2. O Job E passa `scope.panelIds` sempre.

**Pronto quando**
Os KPIs da divisão carros correspondem aos de Vendas + Campanhas juntos, e diferem dos da visão geral quando há sessões de peças.

---

### M16 — Critério indisponível na leva

**Prioridade:** P1 · **Tamanho:** M · **PRD:** §3 ("critério indisponível: sai da nota; pesos redistribuídos; semana anterior recalculada com a mesma regra"), §6.2
**Arquivos:** `src/domain/aggregate.ts`, `src/jobs/job-e-stage2-report.ts`

**Como está hoje**
Não existe. A redistribuição só acontece dentro de cada conversa (`aplica=false`), nunca no nível da leva.

**O que fazer**
1. Para cada escopo, calcular a cobertura de cada critério: `nAplicavel / nDone`.
2. Critério com cobertura menor que `CRITERION_MIN_COVERAGE` (padrão proposto: 0,3; ver [D4](#decisões-pendentes)) fica **indisponível** no escopo.
3. Recalcular a nota de cada conversa **só com os critérios disponíveis**, a partir das colunas `score_*`. A `nota_conversa` gravada no banco não muda.
4. A nota do escopo e o histograma usam essas notas recalculadas.
5. Gravar `criteriosIndisponiveis` em `qualidade` e declarar em `limitacoes`, por exemplo: "Critério 'próximo passo' fora da nota: aplicável em 18% das conversas."
6. Na semana anterior (M26), usar **o mesmo conjunto de critérios** da semana N.

**Pronto quando**
Teste de `aggregateScope` com um critério aplicável em 10% das conversas: ele sai da nota e das médias, e o motivo aparece em `limitacoes`.

---

### M17 — Ajustes nas métricas sintéticas

**Prioridade:** P1 · **Tamanho:** M · **PRD:** §6.1
**Arquivos:** `src/jobs/job-c-synthetics.ts`, novo `src/domain/session-metrics.ts`

**Como está hoje**
- Toda a lógica está dentro de uma função que consulta o banco, sem teste possível.
- **Sem resposta** (`job-c:152-161`): conta a sessão se a última mensagem é do cliente. Isso segue o PRD ao pé da letra, mas o "ok, obrigado" no fim de uma conversa já resolvida conta como "sem resposta" e **infla o KPI** (ver [D2](#decisões-pendentes)). Além disso, uma mensagem automática no fim (pesquisa, bot) conta como "respondido".
- **Reativação** (`job-c:164-174`): aceita qualquer `FROM_HUB` depois de 24h, inclusive bot e campanha (ver [D3](#decisões-pendentes)).
- **Escopo vazio** (`job-c:100-113`): `respClientePct: 100` e `reativacaoPct: 0`. Mostra "100% respondido" onde não há dado.

**O que fazer**
1. Extrair `computeSessionMetrics(session, messages)` para uma função pura em `session-metrics.ts`, usando `message-kind.ts` (M12). Ela devolve `{ tmrSeconds, semResposta, reativada, ftrSeconds }`.
2. **TMR:** primeira mensagem do cliente → primeira `isHumanOperatorMessage` depois dela. O fallback `firstResponseAt − startAt` só vale quando não há mensagens no espelho, e deve ser declarado em `limitacoes` com a contagem.
3. **Sem resposta:** implementar a definição decidida em D2. Proposta:
   - (a) o cliente escreveu e **nunca** houve resposta humana depois da primeira mensagem dele; **ou**
   - (b) a sessão **não** está `COMPLETED` e a última mensagem do cliente é posterior à última mensagem humana.
   - Uma `COMPLETED` que termina com mensagem do cliente não conta.
4. **Reativação:** gap ≥ 24h seguido de mensagem humana (`isHumanOperatorMessage`), conforme D3.
5. **Escopo vazio:** devolver `null` em todos os percentuais e tempos. A tela mostra "N/D".
6. Gravar `lastMessageIn` e `lastMessageOut` (M06) e usá-los como conferência quando não houver mensagens.

**Pronto quando**
Os testes de `computeSessionMetrics` cobrem: bot antes do humano, `OFFICE_HOURS`, `NOTE`, "obrigado" final numa `COMPLETED`, sessão aberta com o cliente por último e gap de 24h com bot e com humano.

---

### M18 — Regras de justiça com listas exatas

**Prioridade:** P1 · **Tamanho:** P · **PRD:** §13
**Arquivos:** `src/jobs/job-c-synthetics.ts`, `src/jobs/job-e-stage2-report.ts`, `src/config/env.ts`, `src/cli.ts`, `prisma/schema.prisma`

**Como está hoje**
- Motivo ignorado casa por **substring** (`job-c:231`, `reasonLower.includes(ig)`).
- A lista padrão no `env.ts:24` ("falta de peca fornecedor,cancelamento de fabrica") é um exemplo inventado, não os motivos reais do painel.
- Higienização (duplicado, já é cliente) não tem lista própria.
- O funil conta todas as perdas sem separar as desconsideradas.
- "Card da oficina que nasce sozinho: ninguém leva nota por criar o card" não tem tratamento.

**O que fazer**
1. Comando `pnpm tsx src/cli.ts config:lost-reasons`: lista os motivos reais de cada um dos 4 painéis via `GET /v1/panel/{id}/lost-reason` (endpoint existe na doc), para o tenant escolher os nomes.
2. Duas listas no tenant: `ignoredLostReasons` (fora do controle) e `hygieneLostReasons` (nova). O padrão das duas é **vazio**.
3. Casamento **exato**, normalizado (minúsculas, sem acento, `trim`), pelo nome do motivo gravado em M09.
4. As duas listas saem do denominador do fechamento. O funil mostra "Perdas desconsideradas: N (fora do controle: X · higienização: Y)".
5. **Card automático da oficina:** definir com o tenant como ele é reconhecido (sem responsável? responsável = usuário de sistema como "Agendamento"?). Esses cards saem do fechamento por atendente. Ver [D7](#decisões-pendentes).

**Pronto quando**
Um card perdido com motivo "Duplicado", configurado como higienização, não entra no denominador e aparece contado à parte no funil.

---

## Fase 4 — IA (estágios 1 e 2)

> **Versão de prompt:** M19, M20 e M21 mudam o texto do sistema e o schema do estágio 1. Juntar todas no mesmo lote e subir para `stage1-v2` **uma única vez**, porque cada subida reabre a fila inteira (§11) e custa. A M24 sobe o estágio 2 para `stage2-v2`.

### M19 — Estágio 1: schema, parâmetros e validação

**Prioridade:** P0 · **Tamanho:** P · **PRD:** §11 (tabela: temperatura 0, timeout 60s; retry em 429/5xx), §11.1 ("nota inteira 0–10")
**Arquivos:** `src/jobs/job-d-stage1-analysis.ts`

**Como está hoje**
- JSON schema com `nota: { type: ["number","null"] }` (`job-d:38` e seguintes), mas a coluna é `Int` (`schema.prisma:198`). Se o modelo devolver 7,5, o Prisma rejeita o valor não inteiro e a sessão cai em `error`, repetindo a cada corrida.
- Sem `temperature` (`job-d:251-261`). O padrão da API não é 0, e o PRD pede 0 no estágio 1 e 0,3 no 2.
- Sem timeout: o SDK usa o padrão, bem acima dos 60s do PRD (`job-d:141`).
- `resumo: z.string().max(250)` e `evidencia: z.string().max(300)` (`job-d:13`, `:22`): um texto um pouco mais longo derruba a análise inteira.
- Não trata `refusal` nem `finish_reason = "length"`.
- `aplica=true` com `nota=null` passa sem aviso.

**O que fazer**
1. Schema: `nota: { type: ["integer","null"] }`. No Zod: `z.number().int().min(0).max(10).nullable()`.
2. Cliente: `new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_STAGE1_MS, maxRetries: 3 })`. O SDK já faz backoff em 429/5xx.
3. Chamada: `temperature: 0`.
4. Tirar os `.max()` de `resumo` e `evidencia` do Zod e **truncar depois** do parse: resumo em 200 caracteres, evidência em 200.
5. Normalizar a coerência antes de gravar:
   - `aplica=true` e `nota=null` → tratar como `aplica=false` e registrar no log;
   - `aplica=false` e nota preenchida → ignorar a nota.
6. `message.refusal` preenchido ou `finish_reason === "length"` → `status = error` com o motivo em `error_text`.
7. Estágio 2: `temperature: 0.3` e timeout `OPENAI_TIMEOUT_STAGE2_MS` (120s).

**Pronto quando**
- Teste de parse: nota 7,5 é recusada pelo schema, um resumo de 400 caracteres é truncado sem erro e `aplica=true` com nota nula vira não aplicável.
- A chamada leva `temperature: 0`.

---

### M20 — Estágio 1: formato do transcript

**Prioridade:** P1 · **Tamanho:** M · **PRD:** §10 Job D passo 1, §11 ("não enviar áudio/imagem crus"), §11.1 ("User: metadados + transcript `[{n, t, dir, origin, text}]`")
**Arquivos:** `src/jobs/job-d-stage1-analysis.ts`, novo `src/domain/transcript.ts`

**Como está hoje**
- Linhas de texto `1. [14:15:03] operacao: …` (`job-d:212-222`), com hora **UTC** e **sem data**. Numa conversa de vários dias, a IA não sabe quando cada fala aconteceu.
- `NOTE` (nota interna) vai como fala da operação, e a IA pode achar que o cliente leu aquilo.
- Mensagens sem texto (áudio sem transcrição, imagem, documento) são **descartadas** (`job-d:177`). A IA vê um buraco e pode concluir que o atendente não respondeu.
- Não há `userId` nem nome do atendente em cada fala. Com transferência entre atendentes, a IA não sabe quem disse o quê.

**O que fazer**
1. Criar `buildTranscript(session, messages, agentsById, tz)` em `transcript.ts`, que devolve um array JSON conforme o PRD:
   ```json
   {"n":1,"t":"2026-09-24 14:15","dir":"cliente","origin":"DEFAULT","atendente":null,"text":"Boa tarde, tem o T-Cross…"}
   {"n":2,"t":"2026-09-24 14:15","dir":"operacao","origin":"BOT","atendente":null,"text":"Olá! Já estou transferindo…"}
   {"n":3,"t":"2026-09-24 14:17","dir":"operacao","origin":"DEFAULT","atendente":"Vinicios","text":"Temos sim…"}
   {"n":4,"t":"2026-09-24 14:20","dir":"nota_interna","origin":"DEFAULT","atendente":"Vinicios","text":"cliente já tem Polo 2019"}
   ```
   - `t` no fuso do tenant, com data.
   - `dir` vale `cliente`, `operacao` ou `nota_interna`.
2. Mídia sem texto vira marcador, e a legenda (`text`) vai junto quando existir:
   - `[áudio sem transcrição]`, `[imagem]`, `[vídeo]`, `[documento]`, `[figurinha]`, `[localização]`, `[contato compartilhado]`;
   - áudio com transcrição vai com o texto transcrito.
3. `TRANSITION` e `TRACK` continuam fora (§10 Job D).
4. Contar e gravar em `session_analyses`:
   - `audioSemTranscricao`;
   - `atendentesHumanos`, o número de `userId` distintos com fala humana (>1 indica transferência, ver [D6](#decisões-pendentes)).
5. Metadados do usuário: sessão, atendente(s), equipe, painel e etapa (M11), início e fim no fuso local, duração.
6. Novo texto do sistema (`stage1-v2`):

   > Você avalia a qualidade de um atendimento de WhatsApp já encerrado entre uma loja (venda de carros, peças e oficina) e um cliente.
   >
   > Dê nota inteira de 0 a 10 em cinco critérios. 10 é excelente.
   > - **atrito**: houve dificuldade de entendimento? POLARIDADE INVERTIDA: 10 = pouco ou nenhum atrito; 0 = atrito extremo.
   > - **solucao**: o atendente ofereceu solução clara para o pedido?
   > - **necessidade**: o atendente compreendeu o que o cliente queria?
   > - **proximo_passo**: ficou claro o que fazer depois, com combinado explícito?
   > - **resolvida**: houve conclusão no diálogo (agendamento, test drive, retorno combinado, peça combinada)? Não é venda no CRM.
   >
   > Como ler a transcrição:
   > - Cada linha é um JSON com `n`, `t` (data e hora local), `dir`, `origin`, `atendente` e `text`.
   > - `dir = "cliente"`: fala do cliente. `dir = "operacao"`: mensagem enviada pela loja. `dir = "nota_interna"`: anotação interna que o cliente **não viu**. Use só como contexto, nunca como fala ao cliente.
   > - Só é fala do atendente humano a mensagem com `dir = "operacao"`, `origin = "DEFAULT"` e `atendente` preenchido. Mensagens com origin BOT, OFFICE_HOURS, CAMPAIGN, API, GATEWAY ou PAYMENT são automáticas: não dê crédito nem culpa ao atendente por elas.
   > - Marcadores entre colchetes (`[áudio sem transcrição]`, `[imagem]`, `[... N mensagens omitidas ...]`) indicam conteúdo que você não vê. Não suponha o que havia nele. Se isso impedir avaliar um critério, marque `aplica=false`.
   >
   > Regras:
   > 1. Não invente falas nem fatos.
   > 2. Se o critério não se aplicar: `aplica=false` e `nota=null`. Se `aplica=true`, a nota é obrigatória.
   > 3. `evidencia`: até 200 caracteres, citação curta ou paráfrase, sem nome, telefone, e-mail ou documento do cliente (use `{{cliente}}`).
   > 4. `resumo`: uma linha, até 200 caracteres, sem dados pessoais do cliente.

**Pronto quando**
- Teste de `buildTranscript` com nota interna, bot, `OFFICE_HOURS`, áudio com e sem transcrição, imagem com legenda e duas pessoas atendendo.
- O fuso sai correto numa conversa que cruza a meia-noite.

---

### M21 — Corte de transcript longo

**Prioridade:** P1 · **Tamanho:** M · **PRD:** §11 ("cortar do meio, manter início + fim + teto de ~8k tokens; se cortar, gravar `limitacoes`")
**Arquivos:** `src/domain/transcript.ts`, `src/jobs/job-d-stage1-analysis.ts`, `prisma/schema.prisma`

**Como está hoje**
Não existe. Conversas longas vão inteiras, com risco de custo alto ou de estourar o contexto.

**O que fazer**
1. Contar tokens com `js-tiktoken` (encoding `o200k_base`, usado pela família gpt-4.1) ou, na falta dele, estimar com `caracteres / 3,5`.
2. Se o transcript passar de `STAGE1_MAX_TRANSCRIPT_TOKENS` (padrão 8000):
   - manter as primeiras mensagens até ~40% do teto e as últimas até ~60%;
   - no meio, inserir `{"n":null,"dir":"sistema","text":"[... 37 mensagens omitidas do meio ...]"}`.
3. Gravar `transcriptTruncated = true` e `messagesOmitted = 37` em `session_analyses`.
4. O Job E conta as conversas cortadas e escreve em `limitacoes` (M25).

**Pronto quando**
Teste com 500 mensagens: o resultado fica abaixo do teto, mantém a primeira e a última mensagem, tem o marcador e registra quantas foram omitidas.

---

### M22 — Teto de custo por corrida

**Prioridade:** P1 · **Tamanho:** P · **PRD:** §11 ("teto opcional `OPENAI_MAX_USD_PER_RUN` aborta o job D com as restantes em pending")
**Arquivos:** `src/jobs/job-d-stage1-analysis.ts`, `src/config/env.ts`, `prisma/schema.prisma`

**Como está hoje**
`OPENAI_MAX_USD_PER_RUN` existe no `env.ts:16` e no `.env.example`, mas nada o lê.

**O que fazer**
1. Preços por milhão de tokens vêm do `.env` (`OPENAI_PRICE_STAGE1_INPUT_PER_1M` e parecidos), **não fixos no código**, porque mudam.
2. Depois de cada chamada, somar `usage.prompt_tokens` e `usage.completion_tokens` convertidos em US$.
3. Gravar `inputTokens`, `outputTokens` e `costUsd` na linha de `session_analyses`.
4. Antes de cada chamada, se o acumulado já passou do teto: parar o Job D e registrar no log "teto de US$ X atingido; N sessões ficaram pendentes". As restantes continuam sem linha `done` e entram na próxima corrida.
5. Se os preços não estiverem configurados, avisar no início e seguir sem teto.

**Pronto quando**
Com teto de US$ 0,01, o Job D para depois de poucas sessões e informa quantas ficaram.

---

### M23 — Fila do Job D

**Prioridade:** P1 · **Tamanho:** M · **PRD:** §9.2 ("fila: COMPLETED sem linha done"; "reanálise só se prompt_version subir, ou job manual force"), §10 Job D
**Arquivos:** `src/jobs/job-d-stage1-analysis.ts`, `src/cli.ts`, `prisma/schema.prisma`

**Como está hoje**
- A fila exclui só `done` (`job-d:150-159`). Sessões `skipped` são reavaliadas a cada corrida.
- Uma sessão em `error` volta toda corrida, para sempre, sem limite de tentativas.
- Carrega **todas** as sessões pendentes com **todas** as mensagens de uma vez (`job-d:146-168`). Um backfill ou uma troca de `prompt_version` pode estourar a memória.
- Ao subir a `prompt_version`, **todo o histórico** vira pendente e é reanalisado, com custo proporcional.
- `forceReanalyze` existe, mas a CLI não o expõe.

**O que fazer**
1. A fila exclui `done` **e** `skipped` da versão atual. `skipped` só é reavaliada com `--force`.
2. Erros: colunas `attempts` e `nextRetryAt`, com backoff exponencial entre corridas. Depois de `STAGE1_MAX_ATTEMPTS` (padrão 5), a sessão para de tentar sozinha, fica `error` e aparece em `limitacoes`.
3. Processar em lotes de 25, com paginação por cursor, carregando as mensagens de um lote por vez.
4. Ordem: `endAt desc`, para priorizar a janela que vai ser publicada.
5. Limite de histórico: só entram sessões com `endAt >= GO_LIVE_AT`, ou `>= --since` quando informado. Assim, subir a versão não reprocessa anos de conversa sem querer ([D9](#decisões-pendentes)).
6. CLI: `stage1 --force`, `stage1 --session <externalId>`, `stage1 --since YYYY-MM-DD` e `stage1 --limit N`.

**Pronto quando**
- Uma sessão `skipped` não gera nenhum processamento na corrida seguinte.
- Uma sessão com erro permanente para depois de 5 tentativas.
- O consumo de memória com 5.000 pendentes fica estável.

---

### M24 — Estágio 2 com contagens reais

**Prioridade:** P0 · **Tamanho:** G · **PRD:** §10 Job E passo 5, §11.2 (`top_gaps`, "não invente contagens"), §16 ("estágio 2 usa contagens do estágio 1, não inventa '6 de 60' solto")
**Arquivos:** `src/jobs/job-e-stage2-report.ts`, `src/domain/aggregate.ts`

**Como está hoje**
- O prompt pede "cite quantidades comprovadas (em 6 das 60…)" (`job-e:290`), mas a IA recebe só as médias, o histograma, três KPIs e as **10 primeiras sessões que o banco devolver** (`:223`), sem critério de escolha.
- Não há `top_gaps` nem **nenhuma contagem por critério**. A IA não tem como saber quantas conversas ficaram sem próximo passo, então **o número do bullet é inventado**.
- Se a chamada falha, o relatório é publicado com a síntese vazia e nenhum aviso (`:322-324`).

**O que fazer**
1. **Calcular as contagens no código**, em `aggregateScope`:
   ```json
   "contagens": {
     "atrito":        { "aplicavel": 58, "baixo_0_4": 4,  "medio_5_7": 15, "alto_8_10": 39 },
     "solucao":       { "aplicavel": 57, "baixo_0_4": 9,  "medio_5_7": 20, "alto_8_10": 28 },
     "necessidade":   { "aplicavel": 58, "baixo_0_4": 3,  "medio_5_7": 12, "alto_8_10": 43 },
     "proximo_passo": { "aplicavel": 55, "baixo_0_4": 14, "medio_5_7": 21, "alto_8_10": 20 },
     "resolvida":     { "aplicavel": 56, "baixo_0_4": 17, "medio_5_7": 19, "alto_8_10": 20 }
   }
   ```
2. **`top_gaps`:** os critérios ordenados pela maior quantidade em `baixo_0_4`, cada um com até 3 casos de exemplo. **`top_fortes`:** o mesmo, por `alto_8_10`.
3. **Amostra de casos escolhida, não aleatória:** até 10 casos, metade entre as piores notas e metade entre as melhores. Cada caso leva um id curto (`c01`…`c10`, nunca o id real), as notas, o resumo e as evidências.
4. **A IA não escreve números.** O schema de saída do `stage2-v2` passa a ser:
   ```json
   {
     "pontos_fortes": [ { "criterio": "necessidade", "faixa": "alto", "texto": "Em {n_casos} das {n_total} conversas…", "script_sugerido": null } ],
     "oportunidades": [ { "criterio": "proximo_passo", "faixa": "baixo", "texto": "Em {n_casos} das {n_total} conversas…", "script_sugerido": "Posso já deixar reservado…?" } ]
   }
   ```
   - `criterio` é enum com os 5 critérios; `faixa` é `"alto"` ou `"baixo"`.
   - O código preenche `n_casos = contagens[criterio][faixa]` e troca `{n_casos}` e `{n_total}` no texto.
   - O formato gravado em `texto_fortes`/`texto_ops` continua o do PRD: `n_casos`, `texto`, `script_sugerido`.
5. **Validação depois da resposta:**
   - descartar item com `n_casos = 0`;
   - descartar item cujo texto contenha outra quantidade de conversas escrita pela IA (regex tipo `\d+\s+(das|de|conversas|casos|atendimentos)`);
   - cada descarte vira uma linha em `limitacoes`.
6. **Novo texto do sistema (`stage2-v2`):**

   > Você escreve feedback gerencial de atendimento via WhatsApp a partir de agregados já calculados.
   > 1. Não recalcule notas nem médias. Use os números fornecidos.
   > 2. Cada item se apoia em uma contagem de `contagens`: informe `criterio` e `faixa` ("alto" para pontos fortes, "baixo" para oportunidades). O sistema preenche o número.
   > 3. No `texto`, escreva `{n_casos}` e `{n_total}` onde entram as quantidades (ex.: "Em {n_casos} das {n_total} conversas…"). Não escreva nenhuma outra quantidade de conversas.
   > 4. Traga um exemplo concreto tirado de `casos` (parafraseado, sem dados pessoais) e, nas oportunidades, uma frase pronta de script em `script_sugerido`.
   > 5. Não use nome, telefone ou documento de cliente. O nome do atendente pode aparecer.
   > 6. De 2 a 4 pontos fortes e de 2 a 4 oportunidades. Sem base para um item, devolva menos itens.
7. **Falha na chamada:** gravar `textoFortes = null` e `textoOps = null` (não `[]`) e escrever em `limitacoes`: "Síntese de IA indisponível: <erro>". A tela mostra "Síntese indisponível nesta leva".
8. Atualizar o §11.2 do PRD com o novo contrato de saída da IA.

**Pronto quando**
- Todo `n_casos` gravado é igual a um número de `contagens`.
- Um teste com resposta simulada contendo "em 7 das 60" (número inventado) descarta o item.

---

### M25 — `limitacoes` completo

**Prioridade:** P1 · **Tamanho:** M · **PRD:** §3, §13 ("limitação de dado vai para `limitacoes`, nunca escondida")
**Arquivos:** novo `src/domain/limitations.ts`, `src/jobs/job-e-stage2-report.ts`, `src/report/html-reporter.ts`, `src/app/page.tsx`

**Como está hoje**
Só registra "amostra preliminar" (`job-e:345`), e esse texto não aparece nem na tela nem no HTML.

**O que fazer**
Criar um acumulador de limitações por escopo, gravado como texto com uma limitação por linha (`\n`). Itens possíveis:

| Situação | Texto (exemplo) |
|----------|-----------------|
| Amostra pequena | "Amostra preliminar: 7 conversas com nota (mínimo 10)." |
| Sessões sem análise | "3 conversas puladas (sem fala humana) e 2 com erro de análise." |
| Sem esteira | "12 de 40 conversas sem card (sem esteira)." |
| Áudio sem transcrição | "9 áudios sem transcrição em 5 conversas." |
| Transcript cortado | "2 conversas longas avaliadas com o meio omitido." |
| Critério indisponível | "Critério 'próximo passo' fora da nota: aplicável em 18% das conversas." |
| Transferência | "6 conversas tiveram mais de um atendente humano; a nota foi para o último." |
| TMR por fallback | "TMR de 4 conversas veio do campo da sessão (sem mensagens no espelho)." |
| Funil | "Funil usa o status atual dos cards, não o status no fim da janela." |
| Cards duplicados | "2 sessões com mais de um card; usado o mais recente." |
| Síntese | "Síntese de IA indisponível: timeout." / "1 item da síntese descartado por contagem sem base." |
| Publicação forçada | "Publicado com --allow-incomplete: sync de cards não concluído." |
| Comparativo | "Sem comparação com a semana anterior: 40% das conversas dela não foram analisadas na versão atual." |

Renderizar em destaque na tela e no HTML (M27).

**Pronto quando**
Um relatório com sessões sem card, áudio sem transcrição e erro de IA lista as três situações, com números.

---

## Fase 5 — Saídas (tela, HTML, API)

### M26 — Evolução semanal: seta e série histórica

**Prioridade:** P1 · **Tamanho:** G · **PRD:** §3 ("semana anterior recalculada com a régua atual só para a seta de evolução; histórico semanal não se reescreve"), §3 (herda: "gráfico um ponto por semana"), §9.2 (`recalc_for_compare`)
**Arquivos:** `src/jobs/job-e-stage2-report.ts`, `src/domain/aggregate.ts`, `prisma/schema.prisma`, nova rota `src/app/api/reports/history/route.ts`, `src/app/page.tsx`, `src/report/html-reporter.ts`

**Como está hoje**
Não existe nada disso.

**O que fazer**
1. **Recalcular a semana anterior** ao publicar a semana N:
   - rodar `aggregateScope` para `previousPeriod(N)`, no mesmo escopo;
   - usar as análises da `prompt_version` **atual** e o **mesmo conjunto de critérios disponíveis** de N (M16).
2. Gravar o resultado **na linha de N**, na coluna nova `comparativo Json?`. A linha de N−1 **não é tocada**:
   ```json
   {
     "periodoAnterior": { "start": "2026-09-16", "end": "2026-09-22" },
     "notaAnteriorRecalculada": 5.9,
     "deltaNota": 0.4,
     "mediasAnteriores": { "atrito": 7.5, "...": "..." },
     "deltaMedias": { "atrito": 0.4, "...": "..." },
     "nAnterior": 48
   }
   ```
3. Se menos de 80% das sessões `COMPLETED` de N−1 tiverem análise na versão atual: `comparativo = null` e uma linha em `limitacoes`.
4. **Série histórica:** `GET /api/reports/history?scopeType=agente&scopeId=<id>` devolve a `notaGeral` **oficial** de cada semana publicada, em ordem, sem recalcular.
5. **Tela e HTML:**
   - seta ▲/▼ com o delta ao lado do anel;
   - gráfico de linha com um ponto por semana, usando o valor oficial;
   - tooltip explicando que a seta compara com a semana anterior **recalculada** na régua atual, por isso pode diferir do ponto dela no gráfico.

**Pronto quando**
- Publicar N grava `comparativo` e não altera nenhum campo da linha de N−1 (teste comparando a linha antes e depois).
- O gráfico mostra os valores originalmente publicados.

---

### M27 — Tela e HTML: limitações, nomes, período e segurança

**Prioridade:** P1 · **Tamanho:** G · **PRD:** §12
**Arquivos:** `src/app/page.tsx`, `src/components/*`, `src/lib/reports-loader.ts`, `src/lib/sessions-loader.ts`, `src/app/api/*`, `src/report/html-reporter.ts`, `src/cli.ts`

**Como está hoje**
- `limitacoes`, `correctedAt` e `comparativo` não aparecem em lugar nenhum.
- Relatórios vindos do banco têm título `AGENTE - <uuid>` (`reports-loader.ts:190`), sem o nome do atendente.
- `/api/reports` devolve **todos os relatórios de todos os períodos misturados**. A tela escolhe o primeiro "geral" que aparecer.
- `/api/sessions` devolve 50 sessões quaisquer, sem filtro de período nem de atendente no banco.
- O HTML interpola texto da IA, nomes de etapa, motivos de perda e nomes de atendente **sem escapar** (`html-reporter.ts:438`, `:458`, `:461`). Um texto com `<` quebra o HTML, e é um vetor de injeção.
- Limites de alerta de "sem resposta" diferentes: 15% no HTML (`html-reporter.ts:265`) e 30% na tela (`KpiStrip.tsx:10`).
- A aba Pipeline mostra status fixo (M04).

**O que fazer**
1. **Período:**
   - `/api/reports?period=YYYY-MM-DD` devolve só os relatórios daquela janela;
   - `/api/reports/periods` lista as janelas publicadas;
   - na tela, um seletor de semana, com a última publicada como padrão.
2. **Nomes:** um helper único `resolveScopeTitle(report, tenant)` (hoje duplicado em `cli.ts:10-82`) que busca o nome do atendente em `agents` e do painel na configuração do tenant. A tela e o HTML usam o mesmo helper.
3. **Limitações:** caixa em destaque abaixo do título, com cada linha de `limitacoes`. Etiqueta "preliminar" usando `nComNota`.
4. **Correção:** "Corrigido em dd/mm — motivo" quando houver.
5. **Evolução:** seta e gráfico (M26).
6. **Auditoria:**
   - `/api/sessions?period=…&agent=…` filtra no banco;
   - mostra também as sessões `skipped` e `error`, com o motivo;
   - etiqueta "sem esteira";
   - só texto anonimizado (M05).
7. **Aba Pipeline:** último job de cada tipo lido de `sync_jobs` (status, início, fim, contadores, erro) e contagem de `session_analyses` por status (`done`, `skipped`, `error`, pendentes da janela).
8. **HTML:** função `escapeHtml()` aplicada a todo valor dinâmico.
9. **Etiqueta do modelo** vinda do relatório (`model`, `promptVersionSintese`).
10. **Um único limite de alerta** de "sem resposta", configurável, usado nos dois lugares.

**Pronto quando**
- Trocar a semana no seletor muda todos os blocos.
- O relatório de atendente mostra o nome.
- Um texto de IA com `<script>` aparece como texto no HTML.
- A aba Pipeline reflete o banco.

---

## Fase 6 — Infra e qualidade de código

### M28 — Migrations Prisma

**Prioridade:** P2 · **Tamanho:** P · **PRD:** §7.1 ("Prisma: schema, migrations")
**Arquivos:** `prisma/migrations/` (nova), `package.json`

**Como está hoje**
Não há pasta de migrations. O banco foi criado por `db push`.

**O que fazer**
1. Criar a migration inicial a partir do schema **atual**, antes das mudanças:
   ```bash
   mkdir -p prisma/migrations/0_init
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
   npx prisma migrate resolve --applied 0_init
   ```
2. Daqui em diante, cada mudança de schema deste plano entra por `prisma migrate dev --name <descricao>`.
3. Tirar `prisma:push` do fluxo documentado.

**Pronto quando**
`prisma migrate status` mostra o banco em dia, e as migrations deste plano estão versionadas.

---

### M29 — Testes

**Prioridade:** P1 · **Tamanho:** M (distribuído)
**Arquivos:** `tests/*`

**Como está hoje**
Os 13 testes cobrem `formatDuration`, a média da conversa, o anonimizador, a URL de cards e o HTML. Nada cobre TMR, sem resposta, reativação, agregação, janela nem estágio 2.

**O que fazer:** cada mudança traz o próprio teste. Lista mínima:

| Arquivo | Cobre |
|---------|-------|
| `period.test.ts` | M01: limites da semana, fuso, terça e quinta, contiguidade |
| `message-kind.test.ts` | M12: origens automáticas, `NOTE`, `FAILED` |
| `session-metrics.test.ts` | M17: TMR, sem resposta, reativação, escopo vazio |
| `aggregate.test.ts` | M14, M15, M16, M24: nota com nulos, divisão, critério indisponível, contagens |
| `stage1-parse.test.ts` | M19: nota inteira, coerência `aplica`/nota, truncamento |
| `transcript.test.ts` | M20, M21: formato, marcadores de mídia, nota interna, fuso, corte |
| `stage2-validate.test.ts` | M24: troca de marcadores, descarte de contagem zero e de número inventado |
| `publish-gate.test.ts` | M03: cada condição da trava |
| `immutability.test.ts` | M02, M26: segunda publicação não altera nada; `comparativo` não mexe em N−1 |
| `sessions-api.test.ts` | M05: saída sem nome e sem telefone |
| `flw-client.test.ts` | M06, M09: `UpdatedAt.After` e `IncludeDetails` com `LostReason` |

Para os testes que precisam de banco: um Postgres de teste pelo `docker-compose` (banco `corz_qualidade_test`) ou isolar a lógica em funções puras. A extração para `src/domain/*` já prevê isso.

---

### M30 — Token por tenant

**Prioridade:** P2 · **Tamanho:** P · **PRD:** §7 ("Bearer token por tenant"), §9 ("tudo particionado por tenant_id")
**Arquivos:** `src/flw/flw-client.ts`, jobs

**Como está hoje**
O schema é multi-tenant, mas o `FlwClient` usa sempre `env.FLW_TOKEN` (`flw-client.ts:38`) e a CLI usa sempre `DEFAULT_TENANT_ID`.

**O que fazer**
1. Os jobs recebem `tenantId` e criam `new FlwClient({ token: tenant.token ?? env.FLW_TOKEN })`.
2. CLI com `--tenant <id>` opcional.
3. Continuar lendo o token do `.env` no v1 (um tenant), mas sem fixá-lo no cliente.

---

### M31 — Endpoints FLW que faltam

**Prioridade:** P2 · **Tamanho:** M · **PRD:** §8

| Endpoint | Uso | Situação |
|----------|-----|----------|
| `GET /v1/session/{id}/note` | Notas internas | Não é chamado. Primeiro conferir se as notas já vêm como mensagens `type=NOTE`. Se vierem, dispensar. |
| `GET /v2/department` | Equipes | Método existe (`flw-client.ts:191`), nunca é chamado. Sincronizar em tabela `departments` para os nomes. |
| `GET /v1/panel/{id}?IncludeDetails=Steps,StepsCardCount` | Etapas do painel | Não é chamado. Serve para **ordenar o funil** pela posição real das etapas; hoje sai na ordem em que aparecem. |
| `GET /v1/panel/{id}/lost-reason` | Motivos de perda | Para o comando de configuração da M18. |
| `GET /v1/company/officehours` | Horário de atendimento | Só se D5 decidir por TMR em horário comercial. |

---

### M32 — Agendamento e trava de concorrência

**Prioridade:** P2 · **Tamanho:** P · **PRD:** §7.1 ("scripts TS + cron"), §10 ("publicação uma vez por período, ex. quinta")
**Arquivos:** `src/cli.ts`, `package.json`, documentação de deploy

**O que fazer**
1. Dois comandos:
   - `daily`: sync A + B + estágio 1, rodando toda madrugada;
   - `publish:weekly`: trava de publicação (M03) + Job E para `lastClosedPeriod` + exportação do HTML, rodando na quinta de manhã.
2. Agendar no Agendador de Tarefas do Windows (ou cron no servidor definitivo).
3. **Trava de concorrência:** `SELECT pg_try_advisory_lock(<hash do job>)` no início de cada comando. Se outra instância estiver rodando, sair com aviso. Evita chamadas duplicadas à OpenAI e à FLW.

---

### M33 — Limpezas diversas

**Prioridade:** P2 · **Tamanho:** P

- `job-a:108`: `parseTimeToSeconds` está declarada **dentro** do laço, no meio do `try`. Mover para o topo do arquivo.
- `package.json`: `"main": "dist/index.js"` aponta para um arquivo que não existe. A pasta `dist/` é de 18/09 e está desatualizada. Apagar `dist/` ou ajustar o `build`.
- Sessões de **grupo** (`type = GROUP`): filtrar `Type=INDIVIDUAL` no Job A ou marcar como `skipped` no Job D. Uma conversa de grupo não é atendimento individual.
- Status de sessão `HIDDEN`/`UNDEFINED`: ignorar nos sintéticos.
- `scratch/`: os scripts com ID de painel fixo podem ficar, mas fora do `tsconfig` de build.
- `docs/AGENTES_UUID.md`: tem e-mails e UUIDs de pessoas. Tudo bem mantê-lo interno, mas nunca publicá-lo.

---

## Decisões pendentes

Itens que mudam o comportamento e precisam de resposta antes (ou durante) a implementação. Cada um traz uma recomendação.

| ID | Pergunta | Recomendação | Afeta |
|----|----------|--------------|-------|
| **D1** | O PRD diz "Fora do v1: frontend React" (§7.1, §14), mas foi feito um app Next 16 + React + Tailwind. Mantém? | Manter, porque já existe e atende a tela Pry, e atualizar os §7.1/§14 do PRD. Condição: sem dado inventado (M04) e com proteção (M05). | M04, M05, M27 |
| **D2** | Definição de "sem resposta": ao pé da letra, o "ok, obrigado" final numa conversa resolvida conta como sem resposta. | Contar só (a) cliente que nunca recebeu resposta humana ou (b) sessão ainda aberta com o cliente por último. Uma `COMPLETED` com mensagem final do cliente não conta. | M17 |
| **D3** | Reativação conta mensagem automática (bot, campanha)? Origem `API` é humana ou automática? | Reativação só com mensagem humana (`origin DEFAULT`). Tratar `API` como automática até confirmar que nenhum atendente envia por integração. | M12, M17 |
| **D4** | Limiar para um critério ficar "indisponível na leva". | 30% de cobertura (`CRITERION_MIN_COVERAGE=0.3`), configurável. | M16 |
| **D5** | TMR em horas corridas ou só em horário comercial? Mensagem às 23h respondida às 8h pesa 9h no TMR. | v1: horas corridas, como o PRD, com uma linha em `limitacoes`. Depois: TMR comercial via `/v1/company/officehours`. | M17, M31 |
| **D6** | Conversa com transferência: a nota vai para o último atendente (`session.userId`) ou para quem mais falou? | v1: último atendente (como hoje), declarando em `limitacoes` quantas conversas tiveram mais de um. | M20, M25 |
| **D7** | Configuração do tenant (§15): títulos exatos dos 4 painéis (o de Campanhas está "a confirmar"), motivos de perda fora do controle e de higienização, como reconhecer o card automático da oficina, data de go-live e janela (quarta→terça, entrega quinta?). | Levantar com a operação usando o comando `config:lost-reasons` (M18) e a listagem de painéis do Job B. | M01, M10, M18 |
| **D8** | Proteção da tela e da API. | Basic Auth + servidor escutando só na rede interna. Login por pessoa fica fora do v1 (§4). | M05 |
| **D9** | Ao subir para `stage1-v2`, reanalisar quanto do histórico? | Só desde `GO_LIVE_AT`, ou desde o início da janela N−1 se o objetivo for só ter a seta de evolução. Estimar o custo com os tokens médios gravados na M22 antes de rodar. | M23, M26 |

---

## Mudanças consolidadas no schema Prisma

Todas entram por migration (M28). Valores em `snake_case` no banco, como no schema atual.

```prisma
model Tenant {
  // ...campos atuais
  hygieneLostReasons String?   @map("hygiene_lost_reasons")   // M18
  periodWeekStart    Int       @default(3) @map("period_week_start") // M01 (ISO: 3 = quarta)
  goLiveAt           DateTime? @map("go_live_at")             // M06, M23
}

model Session {
  // ...campos atuais
  contactNameWhatsapp        String?   @map("contact_name_whatsapp")          // M05
  sessionType                String?   @map("session_type")                   // M33 (INDIVIDUAL | GROUP)
  lastMessageIn              DateTime? @map("last_message_in")                // M06, M17
  lastMessageOut             DateTime? @map("last_message_out")               // M06, M17
  messagesSyncedAt           DateTime? @map("messages_synced_at")             // M07
  messagesSyncedFlwUpdatedAt DateTime? @map("messages_synced_flw_updated_at") // M07
  messagesPending            Boolean   @default(false) @map("messages_pending") // M07
}

model PanelCard {
  // ...campos atuais (lostReason passa a guardar só o nome)
  lostReasonId String? @map("lost_reason_id") // M09
  panelTitle   String? @map("panel_title")    // M09
  stepPhase    String? @map("step_phase")     // M09
}

model SyncJob {
  // ...campos atuais
  params Json? // M08
}

model SessionAnalysis {
  // ...campos atuais
  attempts            Int       @default(0)                         // M23
  nextRetryAt         DateTime? @map("next_retry_at")               // M23
  transcriptTruncated Boolean   @default(false) @map("transcript_truncated") // M21
  messagesOmitted     Int?      @map("messages_omitted")            // M21
  audioSemTranscricao Int       @default(0) @map("audio_sem_transcricao") // M20
  atendentesHumanos   Int?      @map("atendentes_humanos")          // M20
  inputTokens         Int?      @map("input_tokens")                // M22
  outputTokens        Int?      @map("output_tokens")               // M22
  costUsd             Float?    @map("cost_usd")                    // M22
}

model PeriodReport {
  // ...campos atuais
  comparativo      Json?                                  // M26
  correctedAt      DateTime? @map("corrected_at")         // M02
  correctionReason String?   @map("correction_reason")    // M02
  revisions        PeriodReportRevision[]                 // M02
}

model PeriodReportRevision { // M02
  id        String       @id @default(uuid())
  reportId  String       @map("report_id")
  snapshot  Json
  reason    String
  createdAt DateTime     @default(now()) @map("created_at")
  report    PeriodReport @relation(fields: [reportId], references: [id], onDelete: Cascade)

  @@index([reportId])
  @@map("period_report_revisions")
}
```

---

## Novas variáveis de ambiente

Acrescentar ao `.env.example` e ao `src/config/env.ts`:

```bash
# Janela da leva (M01) e go-live (M06, M23)
PERIOD_WEEK_START=3                 # ISO: 1=seg … 3=qua
GO_LIVE_AT="2026-09-01"

# Sync (M06, M09)
SYNC_OVERLAP_MINUTES=15

# Painéis por título exato, usados quando o ID está vazio (M10)
PANEL_VENDAS_TITLE="Vendas"
PANEL_CAMPANHAS_TITLE="Campanhas"
PANEL_PECAS_TITLE="Peças"
PANEL_OFICINA_TITLE="Oficina"

# Justiça (M18). Padrão vazio; preencher com nomes reais do painel.
IGNORED_LOST_REASONS=""
HYGIENE_LOST_REASONS=""

# OpenAI (M19, M21, M22, M23)
OPENAI_TIMEOUT_STAGE1_MS=60000
OPENAI_TIMEOUT_STAGE2_MS=120000
STAGE1_MAX_TRANSCRIPT_TOKENS=8000
STAGE1_MAX_ATTEMPTS=5
OPENAI_PRICE_STAGE1_INPUT_PER_1M=
OPENAI_PRICE_STAGE1_OUTPUT_PER_1M=
OPENAI_PRICE_STAGE2_INPUT_PER_1M=
OPENAI_PRICE_STAGE2_OUTPUT_PER_1M=

# Agregação (M16)
CRITERION_MIN_COVERAGE=0.3

# Proteção da tela e da API (M05)
REPORT_BASIC_AUTH_USER=
REPORT_BASIC_AUTH_PASS=
```

---

## Atualizações necessárias no próprio PRD

Depois das decisões, o PRD precisa refletir:

1. **§6.1:** "resposta humana" = `direction FROM_HUB`, `origin DEFAULT`, tipo de conversa (não `NOTE`/`TRANSITION`/`TRACK`), status não falho. Hoje o PRD diz só "origin != BOT", e a API tem outras origens automáticas.
2. **§6.1:** nova definição de "sem resposta" (D2) e de reativação (D3).
3. **§6 / §10:** tabela de base de datas por métrica (M13).
4. **§7.1 e §14:** status do frontend Next/React (D1).
5. **§9.2:** colunas novas (`comparativo`, correção, revisões, contadores da análise).
6. **§11.2:** novo contrato de saída do estágio 2 (`criterio`, `faixa`, marcadores `{n_casos}`/`{n_total}`), mantendo o formato gravado.
7. **§15:** novas configurações (`GO_LIVE_AT`, títulos dos painéis, listas de motivos, limiar de critério).

---

## Checklist §16 do PRD → mudanças

| Item do checklist | Como fica garantido |
|-------------------|---------------------|
| Janela sem sobreposição com a leva anterior | M01 |
| Sync A/B terminou (checkpoint `completed`) | M03 (trava), M06–M09 |
| Toda `COMPLETED` da janela está `done` ou `skipped`/`error` explícito | M03, M23 |
| Sintéticos conferidos (TMR a partir da thread se outbound) | M12, M17, M29 |
| Notas do zero; semana anterior recalculada só para o delta | M14, M16, M26 |
| n < 10 sinalizado | M14 (por `nComNota`), M27 |
| Limitações escritas | M25, M27 |
| Evidências anonimizadas | M05 |
| Estágio 2 usa contagens do estágio 1, não inventa "6 de 60" | M24 |
| Ponto histórico da semana anterior intacto | M02, M26 |

---

## Ordem de execução e dependências

```
Antes: git init + backup + M28 (migration inicial)

Fase 1  M04 ─┐
        M01 ─┼─> M02 ─> M03
        M05 ─┘

Fase 2  M10 ─> M09 ─> M11
        M06 ─> M07 ─> M08

Fase 3  M12 ─> M17
        M13, M14, M15 (independentes)
        M09 ─> M18
        M14 ─> M16

Fase 4  M12 + M11 ─> M20 ─> M21 ─┐
        M19 ────────────────────┼─> subir stage1-v2 (uma vez)
        M22, M23 ────────────────┘
        M14 + M16 ─> M24 ─> M25

Fase 5  M01 + M02 + M16 ─> M26
        M25 + M26 ─> M27

Fase 6  M29 acompanha cada fase; M30–M33 quando der
```

**Primeira leva confiável:** todas as P0 prontas (M01–M06, M09, M10, M12–M15, M19, M24), com as decisões D2, D3 e D7 respondidas.
**Aderência completa ao PRD:** P0 + P1.
