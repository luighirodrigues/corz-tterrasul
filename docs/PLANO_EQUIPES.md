# Relatórios por equipe — plano de implementação

**Objetivo:** gerar o relatório semanal (nota, critérios, indicadores e texto da IA) também **por equipe**, ao lado de geral, divisões, painéis e atendentes. Mostrar a equipe nas telas de Atendentes e Conversas.

**Fonte:** `GET /v2/department` (documentação em `docs/endpoints/get_v2-department.md`).

**Status:** plano validado em 01/10/2026 (grupos, Agendamento como equipe própria, semanas passadas). Código das etapas E1 a E7 escrito (falta o ensaio no dev, E8, e o servidor, E9). Desenvolvimento e ensaio no ambiente de dev; o servidor só recebe depois do ensaio (E9).

---

## 1. O que os dados reais mostram (consulta à FLW em 01/10/2026)

- **18 equipes na FLW, e a maioria é a fila de uma pessoa** ("Keity Consultora", "Henrique Consultor", "Sérgio Vendas", "Jorge Peças"...). Se cada uma virasse um relatório, ele repetiria o relatório do atendente. Por isso **as equipes da FLW são juntadas em grupos**: cada grupo vira uma "equipe" no relatório.
- **Conversas criadas nos últimos 7 dias, por equipe da FLW (251 no total):**

  | Equipe na FLW | Conversas |
  |---|---|
  | Agendamento | 116 |
  | Keity Consultora | 41 |
  | Henrique Consultor | 37 |
  | Peças | 26 |
  | Sérgio Vendas | 17 |
  | Leonardo Peças | 6 |
  | Jorge Peças | 5 |
  | Vinicios Vendas | 2 |
  | Vendas | 1 |

- **Toda conversa já guarda a equipe:** `sessions.department_id` e `department_name` são gravados desde a primeira versão (`job-a-sync-sessions.ts:46-47`). **Não é preciso ressincronizar** para ter o histórico, nem no dev nem no servidor.
- **Membros vêm com `userId`**, o mesmo ID das conversas, e não o `id` de cadastro que a tabela `agents` guarda. **Uma pessoa pode estar em várias equipes:** o Henrique está em "Henrique Consultor" e em "Pós Vendas", e é supervisor em "Agendamento". Por isso a conta usa a **equipe da conversa**, não a lista de membros.

---

## 2. Decisões

| # | Tema | Decisão |
|---|---|---|
| D1 | Grupos | Os da §3. **Confirmado.** |
| D2 | Em que equipe a conversa conta | Na equipe em que **terminou** (`department_id` da sessão). Conversa transferida conta na equipe final. |
| D3 | Qualidade (nota e critérios) | Mesmas regras do geral: conversas concluídas que encerraram na semana e são da equipe |
| D4 | Indicadores (TMR, sem resposta, retomadas) | Conversas da equipe iniciadas na semana |
| D5 | Taxa de fechamento | Cards criados na semana **ligados a conversas da equipe** |
| D6 | Funil | **Não aparece** no relatório de equipe: os cards de uma equipe se espalham por vários painéis, com etapas diferentes |
| D7 | Onde fica a configuração | `.env` (no servidor, variáveis do EasyPanel), copiada para o tenant a cada job, igual aos motivos de perda: `TEAM_GROUPS` e `IGNORED_TEAMS`. Vazio = relatório por equipe desligado. |
| D8 | Equipe nova na FLW sem grupo | Avisa no log do sync. No relatório geral, entra uma observação: "N conversas não entram em nenhuma equipe: Nome (n)". |
| D9 | Identificador do relatório | `scope_id` = nome do grupo. **Renomear um grupo cria uma série nova** no gráfico de evolução. |
| D10 | Semanas passadas | Gerar os relatórios de equipe de todas as semanas já publicadas. Os relatórios publicados não mudam. **Confirmado.** |
| D11 | Implantação | Ensaio completo no dev (E8), de preferência com uma cópia do banco do servidor. Só depois o servidor (E9). |

---

## 3. Grupos (D1, confirmado)

```env
TEAM_GROUPS="Vendas: Vendas; Sérgio Vendas; Vinicios Vendas; Dione Vendas; Cristiano Vendas; Vendas - Amanda; Escritório de Vendas; Inicio - campanha vendas | Peças: Peças; Jorge Peças; Leonardo Peças | Pós-venda: Pós Vendas; Henrique Consultor; Keity Consultora | Agendamento: Agendamento | Caixa: Caixa"
IGNORED_TEAMS="Geral; Inicio"
```

| Equipe no relatório | Equipes da FLW |
|---|---|
| Vendas | Vendas, Sérgio Vendas, Vinicios Vendas, Dione Vendas, Cristiano Vendas, Vendas - Amanda, Escritório de Vendas, Inicio - campanha vendas |
| Peças | Peças, Jorge Peças, Leonardo Peças |
| Pós-venda | Pós Vendas, Henrique Consultor, Keity Consultora |
| Agendamento | Agendamento (equipe própria) |
| Caixa | Caixa |
| *fora* | Geral, Inicio (filas de entrada e robô: só entram no relatório geral) |

Formato: `Grupo: equipe; equipe | Outro grupo: equipe`. O casamento é pelo **nome exato** da equipe na FLW, sem acento e sem caixa, nunca por trecho ("Jorge Peças" não cai em "Peças").

**Tenha em mente:**
- O relatório da equipe Agendamento vai ficar quase igual ao do atendente "Agendamento" (login compartilhado).
- "Caixa" teve 0 conversas na semana consultada, então o relatório dela vai sair vazio na maior parte das semanas.

---

## 4. Etapas

Ordem pensada para que nada apareça na tela antes de os números estarem certos: E1–E4 não mudam a tela; E5 gera os relatórios; E6 mostra; E8 e E9 levam para o dev e para o servidor.

### E1 — Agrupamento (função pura) · **feito**

- `src/domain/teams.ts`:
  - `parseTeamGroups` lê o `TEAM_GROUPS` e **falha com mensagem clara** quando falta `:`, o grupo não tem equipe, o grupo se repete ou uma equipe aparece em dois grupos.
  - `parseIgnoredTeams` lê o `IGNORED_TEAMS`.
  - `assignTeamGroups` devolve o grupo de cada equipe, os IDs de cada grupo, as equipes sem grupo e os nomes do `.env` que não existem na FLW.
- O arquivo não importa nada: é usado pelos jobs e pelas telas.
- `tests/teams.test.ts`: 12 testes passando.
- Aceita o valor com aspas em volta (dependendo de como o EasyPanel repassa a variável, elas podem chegar literais), com teste.

### E2 — Configuração

| Arquivo | Mudança |
|---|---|
| `src/config/env.ts` | `TEAM_GROUPS` e `IGNORED_TEAMS`, padrão `""` |
| `prisma/schema.prisma` (Tenant) | `teamGroups String? @map("team_groups")`, `ignoredTeams String? @map("ignored_teams")` |
| `src/domain/tenant.ts` (`ensureTenant`) | copia as duas do `.env` para o tenant, como faz com os motivos de perda |
| `.env.example` | bloco explicando o formato, com os grupos da §3 como exemplo |

O grupo de cada equipe **não fica gravado no banco**: é calculado na hora a partir da configuração do tenant. Assim, mudar o `.env` vale na próxima rodada de qualquer job, sem ressincronizar.

### E3 — Banco (migração `2_equipes`)

**Tudo é aditivo:** nenhuma coluna ou linha existente é alterada ou apagada. Isso é o que permite aplicar no banco do servidor sem perder dados (E9).

| Objeto | Mudança | Efeito no banco existente |
|---|---|---|
| `tenants` | colunas `team_groups` e `ignored_teams` (texto, aceitam vazio) | linhas atuais ficam com `NULL` até o próximo job |
| `departments` | tabela nova (abaixo) | nasce vazia; o sync preenche |
| `sessions` | índice `(tenant_id, department_id)` | criado em segundos (tabela pequena); bloqueia escrita em `sessions` enquanto cria |

```prisma
model Department {
  id         String   @id @default(uuid())
  tenantId   String   @map("tenant_id")
  externalId String   @map("external_id") // id da equipe na FLW (= sessions.department_id)
  name       String
  isDefault  Boolean  @default(false) @map("is_default")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, externalId])
  @@map("departments")
}
```

- **Como gerar o SQL:** `prisma migrate diff --from-schema-datamodel <schema do HEAD> --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/2_equipes/migration.sql`, depois `pnpm prisma:generate`. Não precisa de banco ligado.
- **Sem `prisma migrate dev`:** no servidor a migração entra por `prisma migrate deploy`, então o dev usa o mesmo comando (`pnpm prisma:deploy`) para testar exatamente o mesmo caminho.
- **Reversão:** junto com a migração vai um `prisma/migrations/2_equipes/down.sql` com o SQL de reversão (§E9.4). O Prisma não executa esse arquivo; ele fica ali para uso manual.
- **Membros e supervisores não são gravados:** nada os usa nesta entrega (§5).

### E4 — Sincronizar as equipes (Job A)

| Arquivo | Mudança |
|---|---|
| `src/flw/flw-types.ts:112` | completar `FlwDepartmentDTO` conforme a documentação: `isDefault`, `restrictionType`, `agents`, `channels` |
| `src/jobs/job-a-sync-sessions.ts` (depois dos agentes, ~linha 211) | `listDepartments()` → `upsert` em `departments`. **Erro aqui não para o sync**, igual aos agentes. |

**Log para conferir** (principal forma de validar no servidor):
- `[Job A] Equipes: Vendas (8 da FLW), Peças (3), Pós-venda (3), Agendamento (1), Caixa (1)`
- quando houver: `Equipes da FLW sem grupo: ...` e `Nomes do TEAM_GROUPS que não existem na FLW: ...`

**Outras regras:**
- Custa 1 chamada a mais à FLW por rodada.
- Equipe apagada na FLW **não é apagada** da tabela, porque conversas antigas apontam para ela.

### E5 — Relatório por equipe (Jobs C e E)

**`src/jobs/job-c-synthetics.ts`**
- Novo campo `departmentIds?: string[]` em `SyntheticFilter` (linha 29).
- Conversas: filtro `departmentId: { in: departmentIds }`.
- Cards: filtro `session: { departmentId: { in: departmentIds } }` (regra D5).

**`src/jobs/job-e-stage2-report.ts`**
1. `ReportScope` (linha 37): novo `scopeType` `"equipe"` e campo `departmentIds?: string[]`.
2. Montagem dos escopos (depois dos painéis, ~linha 146):
   - lê a configuração do tenant;
   - se ela estiver malformada, **falha antes de gravar qualquer relatório**, como já acontece com painéis não encontrados;
   - lê `departments` e cria um escopo por grupo: `{ scopeType: "equipe", scopeId: <nome do grupo>, name: "Equipe <nome>", departmentIds }`;
   - grupo sem nenhuma equipe sincronizada não gera relatório e avisa no log ("rode o sync").
3. `collectQuality` (~linha 176): filtro por `departmentId` quando o escopo tiver `departmentIds`.
4. Chamada de `calculateSynthetics` (~linha 271): passar `departmentIds`.
5. Funil: nada a fazer. Ele já só é montado quando o escopo tem painel (regra D6).
6. Observação no relatório **geral** sobre conversas de equipes sem grupo (regra D8), em linguagem de cliente: "12 conversas não entram em nenhuma equipe: Nova Fila (12)."

O texto da IA (estágio 2) não muda: ela já recebe o nome do escopo.

### E6 — Telas

| Arquivo | Mudança |
|---|---|
| `src/lib/types.ts` | `ScopeType` ganha `"equipe"`; `ReportItem.equipe` (atendentes) e `SessionDetail.equipe` |
| `src/domain/scope-title.ts:31` | `case "equipe"` → título "Equipe Vendas", chave `vendas` (vale também para o HTML exportado pela CLI) |
| `src/lib/labels.ts` (`nomeEscopo`) | tirar o prefixo "Equipe " |
| `src/lib/teams-loader.ts` (novo) | `loadTeamGroupMap()`: equipe da FLW → grupo. Configuração inválida ou `departments` vazia → mapa vazio, a tela não quebra. `loadAgentTeams()`: **equipe principal do atendente na semana** = grupo com mais conversas concluídas dele na semana. |
| `src/lib/reports-loader.ts:48` | ordem: geral, divisões, **equipes**, painéis, atendentes; preenche `equipe` nos atendentes |
| `src/lib/sessions-loader.ts` | preenche `equipe` em cada conversa |
| `src/components/ScopeMenu.tsx:36` | grupo **"Equipes"** entre "Divisões" e "Painéis do CRM" |
| `src/components/tabs/AgentsTab.tsx` | abaixo do nome: "Pós-venda · 12 conversas avaliadas" |
| `src/components/tabs/ConversationsTab.tsx` | equipe abaixo do nome do atendente (`text-xs text-muted`); busca vira "Buscar por atendente ou equipe" |

- Segue os tokens e componentes do `docs/UI_REDESIGN.md`, sem cor nova nem jargão.
- O relatório de equipe aparece na **Visão geral** pelo seletor do título, como divisões e painéis.
- **Intervalo entre o deploy e o primeiro sync no servidor:** com `departments` vazia, a tela funciona como hoje, só sem as equipes.

### E7 — Documentação

- `docs/COMO_CALCULAMOS_METRICAS.md`: nova seção "Equipes" com as regras D2–D6 e D8.
- `docs/DEPLOY_EASYPANEL.md`:
  - linha com `TEAM_GROUPS` / `IGNORED_TEAMS` na tabela de variáveis (linha 31), com o aviso de colar **sem aspas**;
  - seção curta "Atualizar um banco que já existe", apontando para a E9 deste plano.
- `docs/PRD_QUALIDADE_CONVERSAS.md:258`: `scope_type` passa a incluir `equipe`.
- `docs/PLANO_CORRECOES_PRD.md` (M31): `GET /v2/department` passa a "feito".

---

## 5. Ensaio no dev (E8)

**Objetivo:** fazer no dev exatamente o que será feito no servidor, com os mesmos comandos e de preferência com os mesmos dados. Assim, no servidor não há surpresa.

1. **Subir o Postgres local:** `docker compose up -d`.
2. **Trazer uma cópia do banco do servidor** (recomendado):
   - no servidor: `pg_dump -Fc "$DATABASE_URL" > corz_antes_equipes.dump`;
   - no dev: `pg_restore --clean --no-owner -d "postgresql://postgres:postgres@localhost:5432/corz_qualidade" corz_antes_equipes.dump`.
   - **Atenção:** a cópia tem conversas reais de clientes. Não vai para o git (`*.dump` no `.gitignore`) e deve ser apagada depois do ensaio.
   - Sem a cópia, o ensaio vale do mesmo jeito, mas com os dados que já estão no banco local.
3. **Conferir o estado inicial:** `pnpm prisma migrate status` deve mostrar `0_init` e `1_alinhamento_prd` aplicadas e `2_equipes` pendente.
4. **Aplicar:** `pnpm prisma:deploy` e depois `pnpm prisma migrate status` → "Database schema is up to date".
5. **Configurar:** colocar `TEAM_GROUPS` e `IGNORED_TEAMS` no `.env` local (§3).
6. **Sincronizar:** `pnpm job:sync` e conferir o log da E4 (5 grupos; nenhuma equipe sem grupo além das ignoradas).
7. **Conferir com SQL** (§7): equipes sincronizadas e conversas por equipe numa semana.
8. **Rascunho:** `pnpm job:report -- --week <data da última semana publicada> --dry-run` e ler os HTMLs das equipes em `reports/rascunho`. Custa as chamadas de IA de todos os escopos dessa semana, por isso **só uma semana**.
9. **Gerar as semanas passadas** como no servidor (E9.2, passo 6).
10. **Abrir a tela:** `pnpm web` e passar pela lista da §6.
11. **Testar a reversão** (E9.4) e depois aplicar de novo. Assim o roteiro de volta também fica testado.

---

## 6. Servidor: adaptar o banco existente (E9)

### E9.1 — O que acontece no deploy

- **O container roda `prisma migrate deploy` toda vez que sobe** (`Dockerfile`, `CMD`). A migração `2_equipes` é aplicada sozinha no primeiro deploy do código novo.
- **Se a migração falhar, a tela não sobe.** Por isso o backup e a conferência de antes (E9.2, passos 1 e 2).
- **Redeploy reinicia o container**, e isso mata qualquer job aberto no terminal do serviço (sync, stage1, report). **Não fazer deploy com job rodando.**

### E9.2 — Passo a passo

1. **Backup:** pelo EasyPanel (serviço do Postgres → Backups) ou `pg_dump -Fc "$DATABASE_URL" > corz_antes_equipes.dump`. O mesmo arquivo serve para o ensaio da E8.
2. **Conferir as migrações:** no terminal do serviço, `pnpm prisma migrate status`. O esperado é `0_init` e `1_alinhamento_prd` aplicadas, nada falho. Se aparecer algo diferente, **parar** e investigar antes do deploy.
3. **Variáveis:** no EasyPanel, acrescentar `TEAM_GROUPS` e `IGNORED_TEAMS` (§3), **sem aspas**. Salvar junto com o deploy, para reiniciar uma vez só.
4. **Deploy do código.** No log do container, procurar `2_equipes` aplicada ("All migrations have been successfully applied") e a tela subindo.
5. **Sincronizar:**
   - `pnpm prisma migrate status` → "up to date";
   - `pnpm job:sync` → conferir o log da E4.
6. **Semanas passadas (D10):**
   1. listar as semanas publicadas (consulta "semanas publicadas" da §7);
   2. rascunho só da mais recente: `pnpm job:report -- --week <data> --dry-run`;
   3. para cada semana, da mais antiga para a mais nova: `pnpm job:report -- --week <data>`.
   - O Job E pula os escopos que já existem, então **só os relatórios de equipe são criados**. Os publicados ficam como estão.
   - Se a trava bloquear uma semana por análise pendente, rodar `pnpm job:stage1` e repetir. **Não usar `--allow-incomplete`** só para passar.
   - Custo: 1 chamada ao modelo do estágio 2 por equipe por semana (5 equipes × N semanas).
7. **Conferir:** consultas da §7 e a tela (§8).

### E9.3 — Depois disso

Nada muda na rotina: `pnpm daily` e `pnpm publish:weekly` já incluem as equipes a partir da semana seguinte.

### E9.4 — Reversão

Do mais leve para o mais pesado:

| Situação | O que fazer |
|---|---|
| Problema só na tela ou nos números das equipes | Voltar o deploy para o commit anterior. O código antigo ignora a tabela e as colunas novas, e os relatórios de equipe ficam no banco sem aparecer. Opcional: `DELETE FROM period_reports WHERE scope_type = 'equipe';` |
| Desfazer também o banco | **Primeiro** voltar o código. Depois rodar o `down.sql` (abaixo). Com o código novo no ar, isso derruba a tela. |
| Algo deu muito errado | Restaurar o backup do passo 1. Perde o que foi sincronizado e publicado depois dele. |

`prisma/migrations/2_equipes/down.sql`:

```sql
DELETE FROM period_reports WHERE scope_type = 'equipe';
DROP INDEX IF EXISTS "sessions_tenant_id_department_id_idx";
DROP TABLE IF EXISTS "departments";
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "team_groups", DROP COLUMN IF EXISTS "ignored_teams";
DELETE FROM "_prisma_migrations" WHERE migration_name = '2_equipes';
```

### E9.5 — Pontos de atenção

- **Números de semanas antigas:** os relatórios de equipe gerados agora usam os dados de hoje (status atual dos cards, conversas sincronizadas depois). O relatório geral daquela semana foi congelado quando foi publicado. A soma das equipes pode não bater exatamente com o geral publicado. Para conferir a soma, use a consulta SQL da §7, não o número da tela.
- **Aspas no EasyPanel:** vale conferir também `IGNORED_LOST_REASONS` e `HYGIENE_LOST_REASONS` no servidor. Se foram coladas com aspas, a mesma falha pode estar afetando os motivos de perda hoje.

---

## 7. Consultas de conferência

```sql
-- Equipes sincronizadas (esperado: 18 na Tterrasul)
SELECT name, external_id, is_default FROM departments ORDER BY name;

-- Configuração copiada para o tenant
SELECT id, team_groups, ignored_teams FROM tenants;

-- Conversas concluídas de uma semana, por equipe da FLW.
-- O banco grava em UTC: quarta 00:00 de Brasília = 03:00 UTC. Exemplo: semana de 23/09 (qua) a 29/09 (ter).
SELECT coalesce(d.name, s.department_name, '(sem equipe)') AS equipe, count(*) AS conversas
FROM sessions s
LEFT JOIN departments d ON d.tenant_id = s.tenant_id AND d.external_id = s.department_id
WHERE s.status = 'COMPLETED'
  AND s.end_at >= '2026-09-23 03:00' AND s.end_at < '2026-09-30 03:00'
GROUP BY 1 ORDER BY 2 DESC;

-- Semanas publicadas (para gerar as equipes)
SELECT DISTINCT period_start, period_end FROM period_reports WHERE scope_type = 'geral' ORDER BY 1;

-- Relatórios de equipe gerados
SELECT period_start, scope_id,
       (qualidade->>'n')::int        AS conversas,
       (qualidade->>'nComNota')::int AS com_nota,
       qualidade->>'notaGeral'       AS nota
FROM period_reports WHERE scope_type = 'equipe' ORDER BY period_start, scope_id;
```

---

## 8. Como saber que ficou pronto

**Código**
- [ ] `pnpm test` e `tsc --noEmit` limpos.
- [ ] `TEAM_GROUPS` com e sem aspas em volta dá o mesmo resultado.

**Dev e servidor**
- [ ] `prisma migrate status` → "up to date", com `2_equipes` aplicada.
- [ ] Depois do sync, `departments` tem as 18 equipes, e o log mostra os 5 grupos sem equipe sobrando.
- [ ] Toda semana publicada tem relatório para cada equipe.
- [ ] **Soma confere:** pela consulta da §7, as conversas das equipes, mais as das ignoradas e sem grupo, dão o total da semana.
- [ ] Equipe sem nenhuma conversa na semana: nota "—" e "Sem avaliação", nunca 0.
- [ ] Os relatórios publicados antes da mudança continuam iguais (`published_at` e `qualidade` sem alteração).

**Tela**
- [ ] Grupo "Equipes" no seletor; o gráfico de evolução da equipe mostra as semanas passadas.
- [ ] Equipe no card do atendente e na lista de conversas; a busca por equipe funciona.
- [ ] `TEAM_GROUPS` vazio: nenhum relatório de equipe e nenhuma mudança no resto.

---

## 9. Fora desta entrega

- Lista de membros e supervisores de cada equipe. A informação vem na API, mas nada a usa agora.
- Corrigir a tabela `agents` para guardar o `userId` (hoje guarda o `id` de cadastro, que não liga com as conversas). Não afeta as equipes.
- Filtrar as abas Atendentes e Conversas pelo escopo selecionado.
- Funil por equipe.
