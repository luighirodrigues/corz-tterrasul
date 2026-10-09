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
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASS` | servidor de e-mail do resumo semanal e mensal. Porta 587 (STARTTLS) ou 465 com `SMTP_SECURE=true`; a 25 costuma ser bloqueada. Sem `SMTP_HOST` o envio fica desligado |
| `EMAIL_FROM` | remetente, ex.: `Tterrasul Qualidade <qualidade@tterrasul.com.br>`. Precisa ser do domínio do servidor de e-mail, com **SPF e DKIM** configurados, senão os e-mails caem no spam |
| `APP_URL` | endereço público do painel, **com `https://`** e sem barra no fim. É o que o botão "Abrir o resumo" abre |
| `JOBS_TOKEN` | libera o disparo dos comandos por HTTP (§3, "Agendamento por serviço externo"). Mínimo de 32 caracteres; gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Vazio = desligado |

As demais (janela, timeouts, cobertura mínima...) têm padrão; veja `.env.example`.

Exponha com domínio e **HTTPS**: a tela mostra conversas de clientes (mascaradas), e o login é a única barreira. O acesso é só pelo domínio com HTTPS: o cookie de sessão é `secure`, e quem abrir pelo IP com `http://` não fica conectado.

A tela exige e-mail e senha de cada pessoa. Depois do deploy, crie o primeiro administrador no terminal do serviço (veja o §3) e cadastre os demais pela tela **Usuários**. Antes disso, ninguém entra, então os dados não ficam expostos em nenhum momento.

## 3. Jobs pelo terminal do serviço

Abra o terminal do serviço no EasyPanel (mesma imagem, mesmas variáveis):

```bash
pnpm user:admin -- --email ana@empresa.com.br --nome "Ana"   # cria o administrador e imprime a senha provisória
pnpm job:sync -- --from 2026-09-01   # primeira carga (depois: pnpm job:sync, incremental)
pnpm config:lost-reasons             # lista os motivos de perda dos painéis
pnpm job:stage1 -- --since 2026-09-16 --limit 50   # IA por conversa (chama a OpenAI)
pnpm job:report -- --week 2026-09-17 --dry-run     # rascunho, não grava
pnpm job:report -- --week 2026-09-17               # publica a janela (exige a trava do §16)
pnpm daily                                          # sync incremental + IA estágio 1
pnpm daily -- --email                               # o mesmo, e manda o resumo de hoje para quem marcou "Diário"
pnpm publish:weekly -- --email                      # publica a última janela encerrada e manda o resumo semanal
pnpm publish:monthly -- --email                     # publica o último mês encerrado (dia 2 de cada mês, depois do daily) e manda o resumo mensal
pnpm job:report -- --month 2026-09 --dry-run        # rascunho do mês, não grava
pnpm job:metrics                                    # recalcula os indicadores gravados em cada conversa (--all refaz todas)
```

Agende `pnpm publish:monthly` no **dia 2 de cada mês**, depois do `daily`. Ele publica o mês do calendário que acabou de encerrar; o mês que começa antes do `GO_LIVE_AT` sai marcado como parcial.

**Nenhum comando manda e-mail sozinho:** só o `daily`, o `publish:weekly`, o `publish:monthly` e o `pipeline` com a flag `--email`. O agendamento fica assim:

```
0 5 * * *   pnpm daily                        # madrugada: completa o dia anterior
0 18 * * *  pnpm daily -- --email             # fim da tarde: atualiza e manda o resumo de hoje
0 8 * * 4   pnpm publish:weekly -- --email    # quinta de manhã
0 8 2 * *   pnpm publish:monthly -- --email   # dia 2
```

**Fuso do agendamento.** O cron segue o relógio do servidor, que costuma estar em UTC. Com a linha dizendo 18h e o servidor em UTC, o envio sai às 15h de Brasília: ajuste o horário (18h de Brasília = 21h UTC). O "hoje" do e-mail usa o fuso do painel (`TIMEZONE`), então o dia continua certo; só a hora muda. Evite horários perto da meia-noite, que podem cair no dia seguinte e mandar um resumo quase vazio. Deixe os horários separados: se outro comando estiver rodando, o `daily -- --email` falha na hora e não envia (`pnpm email:resumos -- --day AAAA-MM-DD` repete o envio).

### Agendamento por serviço externo

Em vez do cron, outro serviço (agendador, n8n, GitHub Actions...) pode chamar um endereço do painel para cada linha acima. As opções são as flags, sem os traços, e o token vai no cabeçalho:

```
curl -H "Authorization: Bearer $JOBS_TOKEN" "https://<domínio>/api/jobs/daily"          # pnpm daily
curl -H "Authorization: Bearer $JOBS_TOKEN" "https://<domínio>/api/jobs/daily?email"    # pnpm daily -- --email
curl -H "Authorization: Bearer $JOBS_TOKEN" "https://<domínio>/api/jobs/weekly?email"   # pnpm publish:weekly -- --email
curl -H "Authorization: Bearer $JOBS_TOKEN" "https://<domínio>/api/jobs/monthly?email"  # pnpm publish:monthly -- --email
```

1. Gere o token e ponha em `JOBS_TOKEN` nas variáveis do serviço (§2). Sem a variável, os endereços respondem 503.
2. Depois do deploy, confira de fora: sem o cabeçalho a resposta é 401, e com uma opção errada (`/api/jobs/daily?emial`) é 400. Nos dois casos nada roda.
3. Cadastre os quatro horários no serviço externo, no fuso dele. **Não crie as linhas de cron:** com os dois, cada comando roda duas vezes.
4. A resposta volta na hora, com um id; o comando segue rodando no servidor. Acompanhe por `/api/jobs/execucoes/<id>` (mesmo cabeçalho) ou pelo log do serviço, nas linhas `[disparo ...]`. Detalhes e códigos de resposta em `docs/COMANDOS.md`, §8.
5. Para trocar o token (vazou, ou alguém saiu), troque a variável e reinicie o serviço; o token antigo deixa de valer na hora.

Entre com a senha provisória, crie a sua senha e cadastre os demais pela tela **Usuários**. Se nenhum administrador conseguir entrar, o mesmo comando gera outra senha provisória.

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

### Migração `4_usuarios` (login por e-mail e senha)

1. Backup (`pg_dump -Fc`) e `pnpm prisma migrate status`; o deploy cria as tabelas `users` e `user_sessions` (a migração entra sozinha no `CMD`).
2. Entre o deploy e o passo 3 a tela mostra o login e ninguém consegue entrar.
3. No terminal do serviço: `pnpm user:admin -- --email <e-mail> --nome "<nome>"`. Entre com a senha provisória e crie a senha definitiva.
4. Se o login funcionar no desenvolvimento e falhar no servidor, ponha o domínio em `experimental.serverActions.allowedOrigins` no `next.config.mjs`.
5. Apague `REPORT_BASIC_AUTH_USER` e `REPORT_BASIC_AUTH_PASS` do EasyPanel: não são mais lidas.
6. Reversão: o `down.sql` da migração tem os comandos (apaga usuários e sessões). Volte também o código para o commit anterior, que usa o Basic Auth, e recoloque as duas variáveis.

### Migração `5_resumo_email` (resumo por e-mail)

1. Backup (`pg_dump -Fc`) e `pnpm prisma migrate status`; o deploy cria as tabelas `user_report_subscriptions` e `summary_emails` (a migração entra sozinha no `CMD`). Nada muda para quem já usa o painel.
2. No EasyPanel, preencha as variáveis de e-mail (§2) com os dados do servidor de e-mail que o cliente fornecer, e o `APP_URL`.
3. No terminal do serviço: `pnpm email:teste -- --para <seu e-mail>`. Confira se chegou e **se não caiu no spam**. Se der erro, ele mostra o do servidor (usuário ou senha errados, porta bloqueada, remetente recusado).
4. Em **Usuários**, edite cada pessoa e marque os escopos que ela deve receber (seção "Resumos por e-mail"). Quem não tem nada marcado não recebe.
5. Veja o e-mail de verdade: `pnpm email:resumos -- --week <última semana> --para <seu e-mail>` (sem `--reenviar` ele só manda se você ainda não recebeu aquela semana).
6. Daí em diante o resumo sai no fim do `publish:weekly -- --email` e do `publish:monthly -- --email` agendados (sem a flag, não sai). A página `/status` mostra o que saiu em cada período e os erros.
7. Nas primeiras semanas, olhe a caixa do `EMAIL_FROM`: um e-mail digitado errado é aceito pelo servidor e volta para o remetente, não para o sistema.
8. Reversão: o `down.sql` da migração apaga as duas tabelas (as assinaturas e o registro dos envios). O código antigo ignora as tabelas novas.

### Migração `6_resumo_diario` (resumo do dia e frequência por pessoa)

1. Backup (`pg_dump -Fc`) e `pnpm prisma migrate status`; o deploy cria as colunas `resumo_dia`, `resumo_semana` e `resumo_mes` em `users` (a migração entra sozinha no `CMD`). Todos começam com Semanal e Mensal marcados e Diário desmarcado, que é o que já recebiam.
2. Em **Usuários**, edite cada pessoa e marque a frequência em "Resumos por e-mail" (Diário, Semanal, Mensal). Escopo marcado sem nenhuma frequência é recusado.
3. **Os comandos passam a exigir `--email` para enviar.** Ajuste o agendamento como no começo da §3: `publish:weekly -- --email`, `publish:monthly -- --email` e uma segunda rodada `daily -- --email` no fim da tarde, com o horário no fuso do servidor.
4. Teste antes de agendar: `pnpm email:resumos -- --day <hoje> --dry-run` (grava o HTML em `reports/emails/dia-<hoje>/`) e depois `pnpm email:resumos -- --day <hoje> --para <seu e-mail>`.
5. No primeiro dia, olhe o terminal da rodada com `--email` e a página `/status` ("Dia 06/10" aparece ao lado das semanas e dos meses).
6. Reversão: o `down.sql` da migração apaga as três colunas e os registros de envio diário. Volte também o código para o commit anterior.
