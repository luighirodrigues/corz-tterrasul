# PRD — Sistema de qualidade de conversas (FLW)

Documento de produto e funcionamento para construir o sistema que lê a API FLW Chat, calcula métricas, analisa conversas fechadas com IA e guarda o resultado para não reprocessar o que já foi lido.

**Status:** recorte aprovado. Provedor de IA: **OpenAI**. Dá para montar o v1; o que falta é config do tenant (painéis, janela, chaves), não decisão de produto.

**Fontes:** OpenAPI FLW (`IA-GUIA.md`) · tela de referência Pry · metodologia Tterrasul (processo, não a fórmula dos 6 critérios) · `docs/PLANO_IMPORTADOR_FLW.md` (padrão de sync).

---

## 1. Problema

A FLW não tem endpoint de dashboard, qualidade ou IA. Os 105 endpoints entregam sessão, mensagem, agente, equipe e card de CRM. Quem precisa de nota de atendimento, KPIs e texto de pontos fortes / oportunidades tem de **puxar, persistir, calcular e analisar** do lado de cá.

Sem banco próprio, cada relatório revarre a API, reanalisa as mesmas sessões e não tem histórico semanal comparável.

---

## 2. Objetivo

Sistema próprio que:

1. Sincroniza da FLW (conversas, mensagens, agentes, cards dos quatro painéis).
2. Calcula as **cinco métricas sintéticas** (conta, sem LLM).
3. Envia **somente sessões `COMPLETED` ainda não analisadas** a um prompt estruturado.
4. Grava o JSON de qualidade por sessão e os relatórios agregados (geral, divisão, painel, atendente).
5. Gera o texto de pontos fortes e oportunidades num **segundo prompt**, com as contagens já salvas — não relendo as 60 transcrições.

A tela-alvo é a da Pry: anel 0–10, KPIs no topo, barras dos 5 critérios, funil, bloco de IA.

---

## 3. Decisões travadas

| Tema | Decisão |
|------|---------|
| Amostra da IA | Toda sessão `COMPLETED`. Painel é filtro extra se existir card. Sem card: entra na nota do atendente e fica marcada **sem esteira**. |
| Nota (anel) | Só os 5 critérios de qualidade da IA, escala **0–10**. Sintéticos e CRM **não entram** no anel. |
| Sintéticos | Faixa de KPIs (TMR, FTR, sem resposta, fechamento, reativação). Calculados no banco. |
| Análise por função | **Idêntica** para todos. Barra mais rígida do agendamento vs vendedor é leitura humana posterior, não da IA. |
| Esteiras | Quatro **painéis CRM**. Duas divisões: venda de carros (Vendas + Campanhas) e peças (Peças + Oficina). |
| Cadência da nota | Cada período é calculado **do zero**. Semana anterior recalculada com a régua atual só para a seta de evolução. Histórico semanal **não se reescreve**. |
| Amostra pequena | Menos de 10 conversas no recorte: nota **preliminar**, declarada. |
| Critério indisponível | Sai da nota; pesos dos demais redistribuídos; semana anterior recalculada com a mesma regra. |
| Campo do sistema mente | TMR e reativação saem da **timeline de mensagens**, não só de `timeWait`. |
| Evidência | Trechos de conversa **anonimizados** em qualquer saída. |
| Provedor de IA | **OpenAI** (Chat Completions + Structured Outputs). Estágio 1 e 2 na mesma conta, modelos configuráveis. |
| Stack | **Node.js 22 + TypeScript**, **PostgreSQL 16**, **Prisma**, OpenAI SDK, fetch, Zod, jobs via cron/pg-boss. Detalhe no §7.1. |

O que **não** se copia da Tterrasul: organograma (Sergio, Kamily…), os 6 pesos operacionais na nota, escala 1–5, HTML escuro CORZ. O que se herda: justiça, honestidade, nota do zero, amostra pequena, workaround de mensagem, gráfico um ponto por semana.

---

## 4. Quem usa e o que vê

- **Gestão:** nota por pessoa, por painel, por divisão e geral; evolução semanal; texto de coaching.
- **Leitura de corte:** quem avalia sabe que agendamento não pode ficar só no “ok”. O sistema mostra a mesma nota; não aplica teto diferente.

Não há login de vendedor neste PRD (v1 é relatório / API interna).

---

## 5. Quatro painéis, duas divisões

| Divisão | Painel CRM | O que é |
|---------|------------|---------|
| Venda de carros | **Vendas** | Carro (loja / balcão). |
| Venda de carros | **Campanhas** | Mesma venda de carro, origem de anúncio / tráfego. Nome do painel na FLW a confirmar no tenant. |
| Peças | **Peças** | Só a peça, sem serviço. Cliente leva e monta em outro lugar. |
| Peças | **Oficina** | Peça + serviço (agendamento, recepção, execução, orçamento). |

Na FLW: `GET /v2/panel` lista painéis; `GET /v2/panel/card?PanelId=` lista cards (`sessionId`, `status`, `stepTitle`, `responsibleUserId`, `lostReason`). A sessão em si não traz o painel — o vínculo é o **card**.

---

## 6. Catálogo de métricas

### 6.1 Sintéticas (KPI — fora do anel)

Calculadas no Postgres a partir de sessão + mensagens + card. Podem usar conversas **abertas** quando a métrica for operacional (sem resposta, reativação, fechamento em aberto).

| KPI (Pry) | Definição | Como calcular | Fonte FLW |
|-----------|-----------|---------------|-----------|
| **TMR médio** | Tempo médio até a primeira resposta humana | Da 1ª fala do cliente (`TO_HUB`) até a 1ª **resposta humana** (definição abaixo). `firstResponseAt − startAt` só quando a thread não está no espelho (declarado em `limitacoes`) | `GET /v2/session` + mensagens |
| **FTR mediana** | Mediana do tempo até fechar o atendimento | Mediana de `endAt − startAt` (ou `timeService`) em `COMPLETED` | `GET /v2/session` |
| **Resp. cliente** | Complemento de sem resposta | `1 − % sem resposta` | derivado |
| **Sem resposta** | % de conversas/clientes em que o cliente falou e não houve resposta humana | O cliente escreveu e (a) nunca houve resposta humana depois da 1ª fala dele, ou (b) a sessão **não** está `COMPLETED` e a última fala do cliente é posterior à última fala humana. Uma `COMPLETED` que termina com “ok, obrigado” do cliente **não** conta | sessão |
| **Prob. / taxa de fechamento** | No v1: **taxa realizada** de card `WON` no recorte, não modelo preditivo | `WON / (OPEN + WON + LOST)` no painel; `classification.category = WON` é apoio se o card faltar | `GET /v2/panel/card` |
| **Reativação** | % de conversas não concluídas (ou no período) em que, após ≥ 24h sem interação, a próxima mensagem é **humana** | Timeline ordenada por `timestamp` | `GET /v1/session/{id}/message` |

`RESP. CLIENTE` na Pry (79%) + `SEM RESPOSTA` (21%) somam 100: não é métrica nova.

Outbound iniciado pela loja: não confiar só em `timeWait` (regra Tterrasul). Usar a thread. Atendimento iniciado pela loja (sem fala do cliente) não tem TMR nem entra em “sem resposta”.

**Mensagem humana (decisão travada).** É a mensagem `FROM_HUB` com `origin = DEFAULT`, de tipo de conversa (não `NOTE`, `TRANSITION` nem `TRACK`) e status não falho (`FAILED`/`DELETED`). As demais origens da FLW (`BOT`, `OFFICE_HOURS`, `CAMPAIGN`, `PAYMENT`, `GATEWAY`, `API`) são **automáticas** e nunca contam como resposta nem como reativação. `API` é tratada como automática até confirmar que nenhum atendente envia por integração. Nota interna (`NOTE`) é anotação que o cliente não vê.

**Sem dado, não há número.** Quando o recorte não tem base para calcular, o KPI é `null` (“N/D”), nunca `0%` ou `100%`.

### 6.2 Analíticas (entram no anel)

Só em sessão `COMPLETED`. A API **não rotula** isso; o estágio 1 da IA devolve nota 0–10 por critério.

| Critério | Pergunta | Polaridade |
|----------|----------|------------|
| Gerou atrito | Houve dificuldade de entendimento? | **10 = pouco/nenhum atrito** (inverso do nome). Barra alta é boa. |
| Apresentou solução | O atendente ofereceu solução para o pedido? | 10 = sim, clara |
| Entendeu a necessidade | Compreendeu o que o cliente queria? | 10 = sim |
| Próximo passo | Ficou claro o que fazer depois? | 10 = sim, combinado explícito |
| Conversa resolvida | Houve conclusão no diálogo (agendamento, test drive, retorno, peça combinada)? | 10 = sim. **Não** é card `WON`. |

Nota da conversa = média aritmética dos critérios com valor (ignora `nao_se_aplica`).  
Nota da pessoa / painel / período = média das notas das conversas daquele recorte (calculada do zero na janela).

Pesos v1: **20% cada**. Se um critério for `nao_se_aplica` em massa e ficar indisponível na leva, redistribuir os outros e recalcular a semana anterior com a mesma regra.

---

### 6.3 Base de datas por métrica

| Métrica | Sessões consideradas |
|---------|----------------------|
| Qualidade (anel, barras, histograma, estágio 2) | `status = COMPLETED` e `endAt` na janela |
| FTR mediana | `status = COMPLETED` e `endAt` na janela |
| TMR, sem resposta, reativação | `startAt` na janela, qualquer status (métrica operacional) |
| Fechamento e funil | cards com `flwCreatedAt` na janela, com o **status atual** do card (sem webhook não há histórico de etapa; declarado em `limitacoes`) |
| Atendentes com relatório | ≥1 sessão `COMPLETED` encerrada na janela **ou** iniciada nela |

A nota do recorte é a média das notas das conversas **com nota**: conversa em que nenhum critério se aplica não entra na média. Recorte sem nenhuma conversa com nota tem nota `null` (“—”), não `0`. `preliminar` vale para menos de 10 conversas **com nota**.

**Critério indisponível na leva.** Critério aplicável em menos de `CRITERION_MIN_COVERAGE` (padrão 30%) das conversas do recorte sai da nota e das médias; a nota de cada conversa é recalculada só com os critérios disponíveis, e o motivo vai para `limitacoes`. A semana anterior é recalculada com o **mesmo** conjunto de critérios.

**Motivos de perda.** As listas `IGNORED_LOST_REASONS` (fora do controle) e `HYGIENE_LOST_REASONS` (higienização) casam pelo **nome exato** do motivo (sem acento e caixa), nunca por trecho, e ficam fora do denominador do fechamento. Padrão: vazias.

---

## 7. Arquitetura

Sistema **novo**, com Postgres próprio. Reutiliza o *padrão* do importador (job, checkpoint, rate limit, idempotência), não depende de o importador DKW/FLW já estar no ar.

```
FLW API (chat / core / crm)
        │  Bearer token por tenant
        ▼
┌───────────────────────────────────────┐
│  Serviço de qualidade                 │
│  1. Sync (sessões, msgs, cards, agents)│
│  2. Sintéticos (SQL)                  │
│  3. Fila IA estágio 1 (por sessão)    │
│  4. IA estágio 2 (síntese do período) │
└───────────────────────────────────────┘
        │
        ▼
   Postgres (fonte da tela / API do relatório)
```

Três bases FLW:

- `https://api.wts.chat/chat` — sessões e mensagens
- `https://api.wts.chat/core` — agentes, equipes
- `https://api.wts.chat/crm` — painéis e cards

Auth: `Authorization: Bearer {token_permanente}`.

### 7.1 Tecnologias (stack do v1)

Não estava listada de forma explícita; fica travada aqui. Alinha com o padrão do importador (`docs/PLANO_IMPORTADOR_FLW.md`): TypeScript + Postgres, sem Redis no v1.

| Camada | Tecnologia | Para quê |
|--------|------------|----------|
| Linguagem | **Node.js 22 LTS + TypeScript** | Serviço, jobs e tipos do JSON da OpenAI / FLW |
| Banco | **PostgreSQL 16** | Espelho FLW, `session_analyses`, `period_reports`, checkpoints |
| ORM / migrate | **Prisma** | Schema, migrations, upsert idempotente |
| HTTP FLW | **fetch nativo** (undici) | Bearer, timeout, paginação |
| IA | **OpenAI Node SDK** + Structured Outputs | Estágios 1 e 2 |
| Validação | **Zod** | Conferir o JSON da OpenAI antes de gravar |
| Jobs | **scripts TS + cron** (ou **pg-boss** no mesmo Postgres, se precisar de fila/retry) | Jobs A–E, retomáveis |
| Config | `.env` (`FLW_TOKEN`, `OPENAI_API_KEY`, `DATABASE_URL`, modelos) | Segredos fora do código |
| Relatório v1 | **Painel Next.js** (API interna + tela) e HTML estático gerado pelo Job E | Só lê o banco: sem banco não mostra dado nenhum (nunca dado de exemplo) |

**Fora do v1:** Redis, fila cloud. O painel web (Next.js + React + Tailwind) foi adotado no v1 como tela interna, protegido por Basic Auth (`REPORT_BASIC_AUTH_USER`/`PASS`) e servindo só na rede interna. Docker Compose opcional só para Postgres local.

Modelos OpenAI padrão: `gpt-4.1-mini` (estágio 1), `gpt-4.1` (estágio 2), override por env.

---

## 8. O que puxar da FLW (endpoints)

| Uso | Método | Path |
|-----|--------|------|
| Listar conversas do período | `GET` | `/v2/session` (`Status`, `UserId`, `DepartmentId`, `CreatedAt.*`, `EndAt.*`, `IncludeDetails=AgentDetails,DepartmentsDetails,ClassificationDetails,ContactDetails`) |
| Detalhe | `GET` | `/v2/session/{id}` |
| Transcript | `GET` | `/v1/session/{id}/message` (pageSize até 100; paginar até acabar) |
| Notas internas | `GET` | `/v1/session/{id}/note` |
| Agentes | `GET` | `/v1/agent` |
| Equipes | `GET` | `/v2/department` |
| Painéis | `GET` | `/v2/panel` |
| Etapas | `GET` | `/v1/panel/{id}?IncludeDetails=Steps,StepsCardCount` |
| Cards da esteira | `GET` | `/v2/panel/card?PanelId=&IncludeDetails=StepTitle,LostReason,ResponsibleUser,Contacts` |
| Webhooks (opcional, depois) | — | `SESSION_COMPLETE`, `MESSAGE_*`, `PANEL_CARD_STEP_CHANGE` |

Não existe GET de métricas, qualidade ou “já analisado”. Isso é nosso.

Paginação: `PageSize` máximo 100. Mensagens **só por sessão** — não há dump global.

---

## 9. Modelo de dados (Postgres)

Nomes ilustrativos. IDs externos FLW são UUID. Tudo particionado por `tenant_id`.

### 9.1 Espelho operacional

| Tabela | Conteúdo | Idempotência |
|--------|----------|--------------|
| `tenants` | Token, nome, IDs dos 4 painéis, timezone | 1 linha por cliente |
| `agents` | `GET /v1/agent` | `external_id` |
| `sessions` | Campos do `PublicSessionDTOV2` | `external_id` = `session.id` |
| `messages` | Transcript | `external_id` = `message.id` |
| `panel_cards` | Card + `panel_id` + `session_id` nullable | `external_id` = `card.id` |
| `sync_jobs` | Checkpoint de página, cursor de data, status | job id |

Conversa sintética (opcional, igual ao plano do importador): `{contactId}:{channelId}`. A unidade de análise de qualidade é a **session**.

### 9.2 Qualidade (o que o usuário pediu para persistir)

**`session_analyses`** — um resumo por sessão já lida pela IA.

| Coluna | Papel |
|--------|--------|
| `tenant_id` | Tenant |
| `session_id` | FK interna / `external_id` FLW |
| `prompt_version` | Versão do prompt estágio 1 |
| `model` | Modelo usado |
| `status` | `pending` / `done` / `error` / `skipped` |
| `skipped_reason` | Ex.: sem mensagens humanas |
| `score_atrito` … `score_resolvida` | 0–10 ou null (`nao_se_aplica`) |
| `nota_conversa` | Média dos critérios válidos |
| `evidencias` | JSON: citação curta por critério, já anonimizada |
| `resumo_1linha` | Insumo do estágio 2 |
| `entidades` | JSON solto (ex. modelo de carro citado), opcional |
| `analyzed_at` | Quando fechou a análise |
| `error_text` | Se falhou |

Unique: `(tenant_id, session_id, prompt_version)`.

Fila: `COMPLETED` no espelho **sem** linha `done` nessa `prompt_version`.

Reanálise: só se `prompt_version` subir, ou job manual `force`. Sessão que era `IN_PROGRESS` e virou `COMPLETED` entra sozinha na próxima leva (não tinha linha `done`).

**`period_reports`** — relatório da janela (o que a tela mostra).

| Coluna | Papel |
|--------|--------|
| `tenant_id` | |
| `period_start` / `period_end` | Janela fechada |
| `scope_type` | `geral` / `divisao` / `painel` / `agente` |
| `scope_id` | id do painel, agente ou `carros` / `pecas` |
| `sinteticos` | JSON (TMR, FTR, sem resposta, fechamento, reativação, n) |
| `qualidade` | JSON (médias dos 5, nota, histograma 0–10, n) |
| `funil` | JSON (etapas, OPEN/WON/LOST, lost reasons) |
| `texto_fortes` / `texto_ops` | Saída do estágio 2 |
| `preliminar` | boolean (n < 10) |
| `limitacoes` | texto declarado (critério fora, sem card, etc.) |
| `prompt_version_sintese` | |
| Unique | `(tenant_id, period_start, period_end, scope_type, scope_id)` |

Colunas adicionais em `period_reports`: `comparativo` (JSON: nota da semana anterior recalculada, deltas), `corrected_at`, `correction_reason`. Cada correção guarda a versão anterior em `period_report_revisions`.

Colunas adicionais em `session_analyses`: `attempts`, `next_retry_at` (backoff de erro), `transcript_truncated`, `messages_omitted`, `audio_sem_transcricao`, `atendentes_humanos`, `input_tokens`, `output_tokens`, `cost_usd`.

Relatório da semana N **não se update** depois de publicado, salvo correção explícita (`report --correct --reason "..."`). Comparação com N−1 usa recálculo *efêmero* ou uma linha `recalc_for_compare` que não substitui o ponto histórico.

---

## 10. Jobs (como roda)

Ordem sugerida, todos retomáveis (checkpoint), com rate limit por tenant.

### Job A — Sync de sessões + mensagens

1. `GET /v2/session` paginado, janela `UpdatedAt` ou `CreatedAt` incremental (cursor no `sync_jobs`).
2. Upsert `sessions`.
3. Para cada sessão nova ou com `updatedAt` > último sync de mensagens: paginar `GET /v1/session/{id}/message` até `hasMorePages = false`.
4. Upsert `messages`.

Não precisa sincronizar o histórico inteiro a cada corrida — só o delta. Backfill inicial: `CreatedAt.After` da data de go-live (ou um lookback combinado).

### Job B — Sync dos 4 painéis

1. Resolver `panel_id` dos quatro nomes configurados no tenant.
2. `GET /v2/panel/card?PanelId=` paginado.
3. Upsert `panel_cards`. Várias linhas podem apontar o mesmo `session_id` (não deveria; se acontecer, registrar e usar a mais atualizada).

### Job C — Sintéticos do período

SQL sobre o espelho. Sem LLM. Grava rascunho em memória / tabela staging até o Job E publicar o `period_reports`.

### Job D — IA estágio 1 (por sessão)

Seleciona sessões onde:

- `status = COMPLETED`
- `endAt` (ou `updatedAt`) na janela **ou** ainda nunca analisadas
- não existe `session_analyses` `done` para a `prompt_version` atual

Para cada uma:

1. Monta transcript compacto: `timestamp`, `direction` (`TO_HUB` cliente / `FROM_HUB` operação), `origin`, `userId`, `text` (áudio: `details.transcription.text` se houver). Ignora `TRANSITION` / `TRACK` no prompt; `NOTE` pode ir marcada como nota interna.
2. Chama a OpenAI com Structured Outputs (schema abaixo).
3. Persiste `session_analyses`. Em erro: `status = error`, retry com backoff; não marca `done`.

Uma sessão = uma chamada. Lote de várias conversas no mesmo prompt **não** entra no v1 (estoura contexto e mistura evidência).

### Job E — Agregação + IA estágio 2

Para cada scope (geral, 2 divisões, 4 painéis, cada agente com ≥1 conversa na janela):

1. Média das `nota_conversa` e dos 5 critérios.
2. Histograma 0–10.
3. Sintéticos do Job C no mesmo recorte.
4. Funil a partir de `panel_cards` do painel (scopes sem painel: omitir funil ou juntar os painéis da divisão).
5. Segundo prompt: recebe **aggregates + até N evidências / resumos_1linha**, não o transcript completo. Devolve bullets no padrão Pry (“em 6 das 60…”, exemplo concreto, frase de coaching).
6. Upsert `period_reports` daquela janela.

Publicação: uma vez por período (ex. quinta, se a janela for quarta a quarta — ver §15).

---

## 11. Integração OpenAI

Tudo que é “análise” passa pela API da OpenAI. Sintéticos e funil **não**.

| | Estágio 1 (por sessão) | Estágio 2 (síntese do período) |
|--|------------------------|--------------------------------|
| Quando | Job D, 1 call / sessão `COMPLETED` inédita | Job E, 1 call / scope do relatório |
| Modelo padrão | `gpt-4.1-mini` (volume) | `gpt-4.1` (texto de coaching) |
| API | `POST https://api.openai.com/v1/chat/completions` | igual |
| Formato | `response_format: json_schema` (Structured Outputs) | igual |
| Temperatura | `0` | `0.3` |
| Env | `OPENAI_API_KEY`, `OPENAI_MODEL_STAGE1`, `OPENAI_MODEL_STAGE2` | |

`prompt_version` no banco (ex. `stage1-v2`) sobe quando o texto do sistema ou o schema mudam — isso **reabre** a fila de sessões já analisadas.

**Antes de enviar:** mascarar telefone, e-mail e nome do contato no transcript (`{{cliente}}`, `{{fone}}`). Nome do atendente pode ficar: o relatório é interno.

**Não enviar:** arquivos de imagem/áudio crus. Só `text` e transcrição já pronta. Transcript longo: cortar do meio, manter início + fim + teto de ~8k tokens de conversa; se cortar, gravar `limitacoes`.

**Erro / retry:** 429 e 5xx com backoff. 400 de schema → `error` na linha, não `done`. Timeout: 60s no estágio 1, 120s no 2.

**Custo:** 1 call por conversa fechada nova + N calls de síntese por leva (geral + 2 divisões + 4 painéis + 1 por atendente com volume). Teto opcional `OPENAI_MAX_USD_PER_RUN` aborta o job D com as restantes em `pending`.

---

## 11.1 Estágio 1 — uma sessão

**System (prompt_version `stage1-v2`; o texto vigente está em `src/domain/stage1.ts`):**

Você avalia qualidade de um atendimento WhatsApp já encerrado. Dê nota 0–10 em cinco critérios. 10 é excelente. Em “atrito”, 10 significa pouco ou nenhum atrito (polaridade invertida). “Conversa resolvida” é conclusão no diálogo (agendamento, test drive, retorno combinado, peça combinada), não venda no CRM. Mensagens com origin BOT não são o atendente humano. Não invente falas. Se o critério não se aplicar, aplica=false e nota nula. evidencia: no máximo 200 caracteres, já sem telefone/nome do cliente.

**User:** metadados (session_id, atendente, equipe, painel se houver, start/end) + transcript `[{n, t, dir, origin, text}]` onde `dir` é `cliente` ou `operacao`.

**Saída (JSON estrito):**

```json
{
  "atrito": { "nota": 8, "aplica": true, "evidencia": "…" },
  "solucao": { "nota": 7, "aplica": true, "evidencia": "…" },
  "necessidade": { "nota": 9, "aplica": true, "evidencia": "…" },
  "proximo_passo": { "nota": 4, "aplica": true, "evidencia": "…" },
  "resolvida": { "nota": 3, "aplica": true, "evidencia": "…" },
  "resumo": "uma linha",
  "entidades": { "interesse": "BMW X1" }
}
```

`nota` inteira 0–10. `aplica: false` → critério fora da média da conversa.

### 11.2 Estágio 2 — síntese

**System (prompt_version `stage2-v1`):**

Você escreve feedback gerencial com base em agregados já calculados. Não recálcule notas. Cada bullet cita quantidade (“em 6 das 60”). Oportunidade pode incluir uma frase pronta de script. Não use nome/telefone de cliente. Não invente contagens.

**User:** JSON com `n`, médias dos 5, histograma, `top_gaps`, lista de até 10 `{resumo, evidencias}`.

**Entrada (`stage2-v2`):** `contagens` por critério (`aplicavel`, `baixo_0_4`, `medio_5_7`, `alto_8_10`) calculadas no código, `top_gaps`, `top_fortes`, `criterios_indisponiveis` e até 10 `casos` (metade das piores notas, metade das melhores; ids curtos `c01…`).

**Saída da IA:** `pontos_fortes[]` e `oportunidades[]`, cada item com `criterio`, `faixa` (`alto` ou `baixo`), `texto` com os marcadores `{n_casos}` e `{n_total}`, e `script_sugerido` (string ou null). **A IA não escreve número.** O sistema preenche `n_casos` e `n_total` a partir das contagens, descarta item de critério indisponível, com contagem zero, na seção errada ou com outra quantidade escrita no texto (cada descarte vai para `limitacoes`), e anonimiza o texto.

**Gravado** em `texto_fortes`/`texto_ops`: `criterio`, `faixa`, `n_casos`, `n_total`, `texto`, `script_sugerido`. Se a chamada falhar, grava-se `null` (não `[]`) e a falha vai para `limitacoes`.

O estágio 2 **não** recalcula as 5 notas.

---

## 12. Tela (Pry) → dados nossos

| Bloco | Origem no sistema |
|-------|-------------------|
| Anel 6.3 + nome + n conversas | `period_reports.qualidade` do `scope_type = agente` |
| Mix Hatch/SUV… | Fora do v1, salvo extração em `entidades` ou tag/custom field depois |
| Histograma 0–10 | Contagem de `nota_conversa` |
| TMR, FTR, resp., sem resposta, fechamento, reativação | `sinteticos` |
| Barras dos 5 critérios | Médias 0–10 (a Pry mostrou contribuição +1.5; v1 usa 0–10 direto, mais simples de auditar) |
| Funil / status / estagnação | `funil` dos cards; rótulos = `stepTitle` / `lostReason` reais do painel. Não inventar “Lead Frio” se o CRM não tiver |
| Pontos fortes e oportunidades | `texto_fortes` / `texto_ops` |

---

## 13. Regras de justiça (aplicadas no cálculo, não no prompt)

- Card da oficina que nasce sozinho: ninguém leva nota por “criar” o card.
- Perda fora do controle (se o painel tiver motivo mapeado, ex. falta de fornecedor): não entra no KPI de fechamento contra a pessoa — **quando o tenant configurar essa lista**. V1: declarar a lista no `tenants`.
- Higienização (duplicado, já é cliente): idem, configurável, não conta como perda.
- n < 10: `preliminar = true`.
- Limitação de dado (sem transcript, áudio sem transcrição, sem card) vai para `limitacoes`, nunca escondida.

---

## 14. Não fazer no v1

- Endpoint de qualidade na FLW (não existe).
- IA aplicando corte diferente para agendamento.
- Previsão de fechamento (o “PROB.” da Pry vira taxa `WON` real).
- Histórico de movimentação de etapa sem gravar webhook (`GET` do card é só etapa atual).
- Reanálise automática a cada mensagem nova em sessão já `COMPLETED`.
- Mix de produto como KPI oficial.
- UI pública. A tela interna exige Basic Auth e não sai da rede da loja.

---

## 15. Config no deploy (não é buraco de produto)

1. **Janela** da leva (padrão sugerido: quarta 00:00 → terça 23:59, entrega quinta — Tterrasul).
2. **UUIDs / títulos** dos 4 painéis no tenant FLW.
3. **Lookback** do backfill inicial.
4. Chaves: `FLW_TOKEN`, `OPENAI_API_KEY`, opcional override dos dois modelos.
5. `GO_LIVE_AT` (limita backfill e reanálise), `PERIOD_WEEK_START` (padrão 3 = quarta), fuso do tenant.
6. Títulos exatos dos painéis (`PANEL_*_TITLE`) ou os IDs; motivos de perda (`config:lost-reasons` lista os reais); `CRITERION_MIN_COVERAGE`.
7. Preços da OpenAI (`OPENAI_PRICE_*`) se quiser o teto de custo `OPENAI_MAX_USD_PER_RUN`.
8. Como reconhecer o card que nasce sozinho na oficina (§13): **pendente de definição com a operação**.
9. Banco isolado (padrão) vs compartilhado com o importador.

Provedor de IA e contrato dos dois prompts já estão travados neste PRD.

---

## 16. Checklist de uma leva publicada

- [ ] Janela sem sobreposição com a leva anterior
- [ ] Sync A/B terminou (checkpoint `completed`)
- [ ] Toda `COMPLETED` da janela está `done` ou `skipped`/`error` explícito
- [ ] Sintéticos conferidos (TMR a partir da thread se outbound)
- [ ] Notas do zero; semana anterior recalculada só para o delta
- [ ] n < 10 sinalizado
- [ ] Limitações escritas
- [ ] Evidências anonimizadas
- [ ] Estágio 2 usa contagens do estágio 1, não inventa “6 de 60” solto
- [ ] Ponto histórico da semana anterior intacto

---

## 17. Ordem de construção

1. Tenant + sync A (sessões/mensagens) + sync B (cards).
2. Tabelas `session_analyses` / `period_reports` e a regra de “já li esta sessão”.
3. Job C sintéticos.
4. Job D prompt estágio 1 + persistência.
5. Job E agregação + estágio 2.
6. Relatório no formato da tela Pry.

O passo 2 é o que torna o sistema barato e repetível: **a API é a origem; o banco é a memória do que já foi lido e resumido.**
