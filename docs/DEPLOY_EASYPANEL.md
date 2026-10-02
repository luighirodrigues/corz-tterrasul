# Deploy no EasyPanel

A imagem (`Dockerfile`) serve a **tela** e também contém os **jobs**, que você roda à mão pelo terminal do serviço (por enquanto, para testes e validação).

## 1. Postgres

Use o Postgres separado do EasyPanel. Crie um banco vazio (ex.: `corz_qualidade`) e monte a `DATABASE_URL`:

```
postgresql://USUARIO:SENHA@HOST_INTERNO:5432/corz_qualidade?schema=public
```

As tabelas são criadas sozinhas: ao subir, o container roda `prisma migrate deploy`.

## 2. Serviço da tela (App)

- **Origem:** o repositório git, com build por **Dockerfile** (raiz do projeto).
- **Porta:** 3000.
- **Variáveis de ambiente** (o `.env` não vai na imagem):

| Variável | Observação |
|----------|------------|
| `DATABASE_URL` | do passo 1 |
| `REPORT_BASIC_AUTH_USER` / `REPORT_BASIC_AUTH_PASS` | **obrigatórias**: sem elas a tela responde 503 em produção |
| `FLW_TOKEN` | token permanente da FLW |
| `OPENAI_API_KEY` | chave da OpenAI |
| `OPENAI_MODEL_STAGE1` / `OPENAI_MODEL_STAGE2` | modelos (o PRD sugere `gpt-4.1-mini` / `gpt-4.1`) |
| `DEFAULT_TENANT_ID` / `DEFAULT_TENANT_NAME` | o mesmo usado nos dados |
| `PANEL_VENDAS_ID` `PANEL_CAMPANHAS_ID` `PANEL_PECAS_ID` `PANEL_OFICINA_ID` | ou os `PANEL_*_TITLE` exatos |
| `GO_LIVE_AT` | ex.: `2026-09-01` |
| `IGNORED_LOST_REASONS` / `HYGIENE_LOST_REASONS` | nomes exatos dos motivos (veja `pnpm config:lost-reasons`) |
| `TEAM_GROUPS` / `IGNORED_TEAMS` | relatório por equipe; formato e exemplo no `.env.example`. Cole o valor **sem aspas**. Vazio = sem relatório por equipe |
| `OPENAI_PRICE_STAGE1_INPUT_PER_1M` / `..._OUTPUT_PER_1M` | habilitam o teto `OPENAI_MAX_USD_PER_RUN` |
| `TIMEZONE` | padrão `America/Sao_Paulo` |

As demais (janela, timeouts, cobertura mínima...) têm padrão; veja `.env.example`.

Exponha com domínio e **HTTPS**: a tela mostra conversas de clientes (mascaradas), e a senha é a única barreira.

## 3. Jobs pelo terminal do serviço

Abra o terminal do serviço no EasyPanel (mesma imagem, mesmas variáveis):

```bash
pnpm job:sync -- --from 2026-09-01   # primeira carga (depois: pnpm job:sync, incremental)
pnpm config:lost-reasons             # lista os motivos de perda dos painéis
pnpm job:stage1 -- --since 2026-09-16 --limit 50   # IA por conversa (chama a OpenAI)
pnpm job:report -- --week 2026-09-17 --dry-run     # rascunho, não grava
pnpm job:report -- --week 2026-09-17               # publica a janela (exige a trava do §16)
pnpm daily                                          # sync incremental + IA estágio 1
pnpm publish:weekly                                 # publica a última janela encerrada
pnpm publish:monthly                                # publica o último mês encerrado (dia 2 de cada mês, depois do daily)
pnpm job:report -- --month 2026-09 --dry-run        # rascunho do mês, não grava
pnpm job:metrics                                    # recalcula os indicadores gravados em cada conversa (--all refaz todas)
```

Agende `pnpm publish:monthly` no **dia 2 de cada mês**, depois do `daily`. Ele publica o mês do calendário que acabou de encerrar; o mês que começa antes do `GO_LIVE_AT` sai marcado como parcial.

Só um job roda por vez (lock no Postgres): se outro estiver em andamento, o comando avisa e sai.

Os HTMLs gerados ficam em `reports/` dentro do container (somem se o container for recriado); a tela lê tudo do banco.

## 4. Antes da primeira leva

1. Rode `pnpm job:sync -- --from <data>` e confira o resultado.
2. Rode `pnpm job:stage1` (vai chamar a OpenAI; sem `OPENAI_PRICE_*` não há teto de custo).
3. Faça `job:report --dry-run` e leia o rascunho antes de publicar.

## 5. Atualizar um banco que já existe

O container roda `prisma migrate deploy` toda vez que sobe, então migrações novas entram sozinhas no deploy. **Se a migração falhar, a tela não sobe**: faça backup antes e não faça deploy com job rodando (o redeploy mata o job aberto no terminal). O passo a passo da migração `2_equipes` (backup, conferência, sync, semanas passadas e reversão) está em `docs/PLANO_EQUIPES.md`, seção E9.

### Migração `3_periodos` (relatório mensal e período livre)

1. Backup (`pg_dump -Fc`) e `pnpm prisma migrate status`; deploy sem job rodando (a migração entra sozinha no `CMD`).
2. **Backfill dos indicadores por conversa:** `pnpm job:metrics`. Até terminar, as conversas ficam marcadas (`metrics_stale`) e os indicadores de tempo dos relatórios novos ficam incompletos. Confira: `SELECT count(*) FROM sessions WHERE metrics_stale;` deve dar 0.
3. Meses passados, do mais antigo ao mais novo: `pnpm job:report -- --month AAAA-MM` (o primeiro sai parcial). Custo: ~20 chamadas da IA por mês.
4. Agendar `pnpm publish:monthly` (dia 2).
5. Reversão: o código antigo ignora as colunas novas, mas lê os relatórios mensais como se fossem semanas. **Antes de voltar o código:** `DELETE FROM period_reports WHERE granularity = 'mes';` (o `down.sql` da migração tem os comandos).
