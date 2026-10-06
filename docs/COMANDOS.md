# Comandos `pnpm` e a rotina de atualização

Este guia explica todos os comandos do `package.json` e diz o que rodar, e quando, para manter os dados atualizados.

**Onde rodar:** no seu computador, na pasta do projeto, ou no **terminal do serviço no EasyPanel** (mesma imagem, mesmas variáveis de ambiente). Os comandos que falam com a FLW e a OpenAI precisam de `FLW_TOKEN`, `OPENAI_API_KEY` e `DATABASE_URL`.

**Um job por vez:** os comandos de dados (`job:*`, `daily`, `pipeline`, `publish:*`) usam um lock no Postgres. Se outro estiver rodando, o comando avisa e sai sem fazer nada. Não faça deploy com um job aberto: o redeploy reinicia o container e mata o job.

**Opções com `--`:** passe as opções depois de `--`, por exemplo `pnpm job:sync -- --from 2026-09-01`.

---

## 1. Rotina de atualização (o que rodar todo dia)

### Resumo

| Quando | Comando | O que atualiza |
|---|---|---|
| **Todo dia, de madrugada** (agendado) | `pnpm daily` | Traz da FLW as conversas e os negócios do CRM, recalcula os indicadores e analisa com IA as conversas novas. |
| **Todo dia, no fim da tarde** (agendado) | `pnpm daily -- --email` | O mesmo, e depois manda o **resumo do dia** (hoje, até a hora do sync) para quem marcou "Diário". |
| **Quinta de manhã** (agendado) | `pnpm publish:weekly -- --email` | Publica o relatório da semana que acabou de fechar e manda o resumo semanal. |
| **Dia 2 de cada mês** (agendado), depois do `daily` | `pnpm publish:monthly -- --email` | Publica o relatório do mês que acabou de fechar e manda o resumo mensal. |

**E-mail só com `--email`.** Nenhum comando manda e-mail sozinho: o `daily`, o `publish:weekly`, o `publish:monthly` e o `pipeline` só enviam com a flag `--email`. Assim a linha do agendamento diz o que ela manda, e rodar um comando à mão para testar não escreve para todo mundo.

O `daily` precisa rodar **antes** dos dois `publish`: a publicação confere se o sync e a análise estão em dia e, se não estiverem, recusa publicar (veja §3, "trava").

### Passo a passo do dia

Se o `daily` está agendado, não há nada a fazer. Se for rodar à mão (ou o agendamento falhou):

1. Abra o terminal do serviço no EasyPanel (ou o terminal na pasta do projeto).
2. Rode:
   ```bash
   pnpm daily
   ```
3. Espere terminar. Ele faz, nesta ordem:
   1. **Sessões (Job A):** baixa da FLW as conversas criadas ou alteradas desde o último sync, além da lista de equipes. No fim, recalcula os indicadores (1ª resposta, sem resposta, retomada, tempo até resolver) só das conversas que mudaram.
   2. **Cards do CRM (Job B):** baixa os negócios dos painéis.
   3. **Análise por IA (Job D):** avalia as conversas encerradas que ainda não têm nota (chama a OpenAI e gera custo).
4. Confira o resultado de um destes jeitos:
   - Abra a página `/status` da tela: ela mostra as últimas execuções.
   - Leia o final do log: deve terminar sem erro. As linhas `[Job A] Concluído` e `[Job D]` trazem os totais.
5. Abra a tela. O que muda com os dados novos:
   - **Período personalizado** ("Últimos 7 dias", "Este mês", datas escolhidas): é calculado na hora com o que está no banco, então já mostra os dados novos.
   - **Semana e mês publicados:** não mudam. Um relatório publicado é imutável; ele só ganha dados novos se for corrigido (§3, `--correct`).

### Para ver a semana em andamento

Use o menu de período, **Últimos 7 dias** ou **Este mês**. Esses períodos não têm texto de IA nem comparação com a semana anterior; esses só existem nos relatórios publicados.

### Quando precisa recalcular algo além do `daily`

| Situação | O que fazer |
|---|---|
| Mudou uma regra de cálculo dos indicadores (1ª resposta, sem resposta, retomada) | `pnpm job:metrics -- --all` refaz todas as conversas. Depois, corrija os relatórios publicados que precisarem (`--correct`). |
| Trocou a versão do prompt da análise por IA | `pnpm job:stage1` analisa de novo com a versão nova (as antigas deixam de valer nas telas e nos relatórios). |
| Uma conversa saiu com nota estranha | `pnpm job:stage1 -- --session <id da FLW> --force` reanalisa só ela. |
| Muitas conversas com erro de análise | Rode `pnpm job:stage1` de novo. Ele repete as com erro, com intervalo crescente entre as tentativas, até `STAGE1_MAX_ATTEMPTS` (padrão 5). |
| O sync falhou no meio ou ficou dias parado | `pnpm job:sync -- --resume` retoma. Para refazer um intervalo: `pnpm job:sync -- --from AAAA-MM-DD`. |
| Mudou `TEAM_GROUPS` ou `IGNORED_TEAMS` | Rode `pnpm job:sync` (atualiza as equipes). Relatórios já publicados mantêm as equipes de quando saíram. |
| Relatório publicado saiu errado | `pnpm job:report -- --week AAAA-MM-DD --correct --reason "motivo"` (guarda a versão anterior). |

---

## 2. Comandos de dados (os que você roda no dia a dia)

Todos estão no `package.json` e chamam `src/cli.ts`.

### `pnpm daily`

Rotina diária: sync de sessões e cards, indicadores das conversas alteradas e análise por IA (Job D). **Agende de madrugada.** Não gera relatório. Usa o modo incremental.

| Opção | O que faz |
|---|---|
| `--email` | Depois da análise, manda o **resumo do dia** (hoje, até a hora do sync) para quem tem "Diário" marcado em **Usuários**. Agende uma segunda rodada do `daily` no **fim da tarde** com esta flag; a da madrugada fica sem. Rodar de novo no mesmo dia não reenvia. Um escopo sem nota no dia fica fora do e-mail, e quem fica sem nenhum bloco (domingo, feriado) não recebe. |

Um problema no envio não desfaz o sync nem a análise: aparece no terminal e o comando termina com código 1, para o agendamento acusar. Com `--email` e sem `SMTP_HOST`, o comando faz o resto, avisa "Envio de e-mail desligado: configure SMTP_HOST" e também termina com código 1.

### `pnpm job:sync`

Só a parte da FLW: sessões (Job A, com as equipes e o recálculo dos indicadores) e cards (Job B). É o `daily` sem a IA.

| Opção | O que faz |
|---|---|
| (nenhuma) | Incremental: busca o que mudou desde a última execução, com uma folga de 15 minutos (`SYNC_OVERLAP_MINUTES`). |
| `--from AAAA-MM-DD` | Carga a partir de uma data. Use na **primeira carga** ou para refazer um intervalo. |
| `--days N` | Carga dos últimos N dias. |
| `--all` | Tudo o que a FLW tem. Pesado. |
| `--resume` | Retoma um sync que parou no meio. |

### `pnpm job:cards`

Só os cards dos painéis do CRM (Job B). Aceita `--from`, `--days` e `--all`. Use quando só os negócios do CRM estão desatualizados.

### `pnpm job:metrics`

Recalcula, em cada conversa, os indicadores que as telas somam: tempo da 1ª resposta, sem resposta, retomada e tempo até resolver. Normalmente você **não precisa** rodar: o sync e a publicação já recalculam o que mudou. Só recalcula as conversas marcadas como desatualizadas.

| Opção | O que faz |
|---|---|
| `--all` | Marca **todas** as conversas para recálculo. Use no **backfill** depois de uma migração ou quando a regra mudou. Pode demorar. |

Conferência: `SELECT count(*) FROM sessions WHERE metrics_stale;` deve dar 0 depois que termina.

### `pnpm job:stage1`

Análise por IA de cada conversa encerrada (Job D): gera a nota de 0 a 10 em cada critério, o resumo e as evidências. **Chama a OpenAI e gera custo.** Só pega conversas que ainda não têm análise na versão atual do prompt. Para quando o gasto da execução chega ao teto `OPENAI_MAX_USD_PER_RUN` (padrão 50 dólares; o teto só vale se os preços `OPENAI_PRICE_STAGE1_*` estiverem configurados).

| Opção | O que faz |
|---|---|
| `--limit N` | Analisa no máximo N conversas. Bom para testar. |
| `--since AAAA-MM-DD` | Só conversas encerradas a partir da data (padrão: `GO_LIVE_AT`). |
| `--session ID` | Só uma conversa, pelo id da FLW. |
| `--force` | Reanalisa mesmo as que já têm análise. **Refaz o custo.** |

### `pnpm job:synthetics`

Calcula e mostra numa tabela os indicadores sintéticos de uma janela (1ª resposta, sem resposta...). É de diagnóstico: não grava relatório. Aceita `--week AAAA-MM-DD`; sem ela, usa a última semana encerrada.

### `pnpm job:report`

Publica os relatórios de uma janela (Job E): agrega as notas, chama a IA do estágio 2 (texto de "Onde melhorar" e "O que está funcionando") e grava no banco. Gera também os HTMLs em `reports/`. **Chama a OpenAI.** Relatórios que já existem são mantidos, e só os que faltam são criados.

| Opção | O que faz |
|---|---|
| `--week AAAA-MM-DD` | Qualquer data dentro da semana-alvo. Sem ela, a última semana encerrada. |
| `--month AAAA-MM` | Um mês do calendário. |
| `--dry-run` | Não grava nada: gera rascunhos em `reports/rascunho/` para você ler. |
| `--allow-incomplete` | Publica mesmo com a trava falhando (as falhas vão para as observações do relatório). Evite. |
| `--correct --reason "texto"` | Corrige um relatório já publicado e guarda a versão anterior. O motivo aparece na tela. |

### `pnpm publish:weekly`

Publica a **última semana encerrada** (mesma coisa que `job:report` sem opções). **Agende na quinta de manhã**, depois do `daily`. A semana vai de quarta a terça. Com `--email`, envia no fim o **resumo semanal** de cada pessoa que o marcou (veja `pnpm email:resumos`); sem a flag, só publica. Com `--dry-run` e `--correct` nunca envia.

### `pnpm publish:monthly`

Publica o **último mês encerrado**. **Agende no dia 2 de cada mês**, depois do `daily`. O mês que começa antes do `GO_LIVE_AT` sai marcado como parcial. Com `--email`, envia também o resumo mensal no fim.

### `pnpm email:resumos`

Envia o **resumo por e-mail** de um dia, de uma semana ou de um mês **já publicado**. O `daily`, o `publish:weekly` e o `publish:monthly` já chamam este envio quando rodam com `--email`, então só use o comando à mão para **repetir** (quando o servidor de e-mail falhou no meio) ou **testar**.

| Opção | O que faz |
|---|---|
| `--day AAAA-MM-DD`, `--week AAAA-MM-DD` ou `--month AAAA-MM` | O dia (calculado na hora, com os números daquele momento), a semana (qualquer data dentro dela) ou o mês. Sem nenhuma das três, a última semana encerrada. |
| `--dry-run` | Não envia nem grava no banco: salva os e-mails como HTML em `reports/emails/<período>/<e-mail>.html` para você abrir no navegador (em 390 px de largura para ver o celular). |
| `--para fulano@empresa.com.br` | Só para esta pessoa. |
| `--reenviar` | Manda de novo para quem já recebeu (o padrão é pular quem já recebeu). |

Cada pessoa ativa recebe **um** e-mail por período, com um bloco para cada escopo que ela acompanha (marcados em **Usuários**, junto com a frequência: Diário, Semanal e Mensal; o comando só manda para quem marcou a frequência do período). Escopo sem conteúdo no período fica fora; se nenhum tiver conteúdo, a pessoa não recebe. No fim o comando imprime `Enviados: N · Sem nada para mandar: N · Erros: N`, com o e-mail e o motivo de cada erro. Rodar de novo manda só para quem ainda não recebeu ou deu erro. A correção de um relatório já publicado (`--correct`) **não** reenvia; se precisar, use `--reenviar`.

Precisa de `SMTP_HOST`, `EMAIL_FROM` e `APP_URL` (veja o `.env.example`). Sem `SMTP_HOST` o envio fica desligado.

### `pnpm email:teste`

`pnpm email:teste -- --para fulano@empresa.com.br` manda um e-mail simples ("O envio de e-mail do painel está funcionando.") para conferir o servidor de e-mail. Se falhar, mostra o erro do servidor por extenso. Não usa o banco nem a FLW.

### `pnpm pipeline`

Faz tudo de uma vez: sync de sessões e cards, análise por IA e publicação da janela. Aceita as opções do `job:report` (`--week`, `--month`, `--dry-run`...) e o `--email` (sem ele não envia e-mail). Útil para a primeira carga ou para refazer uma semana inteira; no dia a dia, use `daily` e `publish:*`.

### `pnpm config:lost-reasons`

Lista os motivos de perda cadastrados em cada painel do CRM (só lê da FLW, não usa o banco). Use na configuração inicial para copiar os nomes **exatos** para `IGNORED_LOST_REASONS` e `HYGIENE_LOST_REASONS`.

---

## 3. Como as publicações funcionam

- **Imutáveis.** Um relatório publicado não muda sozinho. Rodar `publish` de novo para a mesma janela só cria o que faltar. Para mudar um relatório, use `--correct --reason "..."`.
- **Trava de publicação.** Antes de publicar, o Job E confere: a janela já fechou; o sync de sessões e o de cards terminaram **depois** do fim da janela; e nenhuma conversa da janela ficou sem análise. Se algo falhar, ele lista os problemas e recusa. A resposta é rodar o que ele pede (`pnpm job:sync`, `pnpm job:stage1`) e tentar de novo. Não use `--allow-incomplete` só para passar.
- **Ensaio.** `--dry-run` mostra o que seria publicado, sem gravar.
- **Custo.** O estágio 1 (por conversa) é o maior gasto. O estágio 2 é uma chamada por escopo (geral, divisões, equipes, painéis e atendentes) em cada relatório.

---

## 4. Comandos da tela e do banco

| Comando | O que faz |
|---|---|
| `pnpm web` ou `pnpm web:dev` | Sobe a tela em modo desenvolvimento, em http://localhost:3000 (use `localhost`, não `127.0.0.1`). Recarrega sozinho quando você muda o código. |
| `pnpm web:build` | Gera a versão de produção da tela (o Dockerfile faz isso). Serve também para conferir se o código compila. |
| `pnpm web:start` | Serve a versão gerada pelo `web:build`, em 127.0.0.1:3000. A tela exige login: sem um usuário cadastrado ninguém entra (veja `pnpm user:admin`). |
| `pnpm user:admin -- --email ana@empresa.com.br --nome "Ana"` | Cria o administrador do painel e imprime a **senha provisória** (mostrada só uma vez). Se o e-mail já existe, torna a pessoa administradora, reativa, gera outra senha provisória, desbloqueia e encerra as sessões: serve para **recuperar o acesso** se nenhum administrador conseguir entrar. `--senha <senha>` grava uma senha definitiva, sem troca obrigatória (para o ambiente de desenvolvimento). Os demais usuários são cadastrados pela tela **Usuários**. |
| `docker compose up -d mailpit` | Sobe o Mailpit, um servidor de e-mail de mentira para o desenvolvimento: SMTP na porta 1025 e uma página com os e-mails recebidos em http://localhost:8025. No `.env`: `SMTP_HOST=localhost`, `SMTP_PORT=1025`. |
| `pnpm prisma:generate` | Gera o cliente do Prisma a partir do `schema.prisma`. Rode depois de mudar o schema ou ao clonar o projeto. |
| `pnpm prisma:deploy` | Aplica as migrations que faltam no banco. É o que o container faz ao subir. Use no dev para testar o mesmo caminho do servidor. |
| `pnpm prisma:migrate` | Só no **dev**: cria uma migration nova a partir das mudanças no schema. **Nunca no servidor.** |
| `pnpm prisma:studio` | Abre um navegador de tabelas do banco. Só no seu computador. |
| `pnpm prisma migrate status` | Mostra quais migrations estão aplicadas. Rode antes de um deploy que traz migration. |

---

## 5. Outros comandos

| Comando | O que faz |
|---|---|
| `pnpm test` | Roda os testes (vitest). Não precisa de banco nem de internet. |
| `pnpm build` | Compila os jobs com o TypeScript para `dist/`. Normalmente você não usa: os jobs rodam com `tsx`. |
| `pnpm dev` | Roda o CLI em modo "assistir" (reexecuta ao salvar). Só desenvolvimento. |
| `pnpm seed` | Insere dados de demonstração no tenant `demo`, separado dos dados reais. Só desenvolvimento. |

---

## 6. Primeira carga (banco novo)

1. Configure as variáveis (`docs/DEPLOY_EASYPANEL.md`, §2). O container aplica as migrations ao subir.
2. `pnpm config:lost-reasons` e copie os nomes para as variáveis de motivos de perda.
3. `pnpm job:sync -- --from AAAA-MM-DD` (a data de início dos dados).
4. `pnpm job:stage1 -- --limit 50` para testar a IA e o custo; depois `pnpm job:stage1` para o resto.
5. `pnpm job:report -- --week AAAA-MM-DD --dry-run`, leia o rascunho e então publique: `pnpm job:report -- --week AAAA-MM-DD`. Repita para as semanas passadas, da mais antiga para a mais nova.
6. `pnpm job:report -- --month AAAA-MM` para cada mês passado (o primeiro sai parcial).
7. Agende `pnpm daily`, `pnpm daily -- --email`, `pnpm publish:weekly -- --email` e `pnpm publish:monthly -- --email` como na §1.

Para um banco que já existe e recebe migrations novas, siga `docs/DEPLOY_EASYPANEL.md`, §5.

---

## 7. Quando algo não está certo

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| O comando avisa que outro job está em andamento e sai | O lock do Postgres está em uso | Espere o outro terminar. Se nenhum está rodando de verdade, reinicie o serviço. |
| `publish` recusa e lista problemas | A trava de publicação | Rode o que ela pede (`job:sync`, `job:stage1`) e repita. |
| Lista de conversas vazia, mas há conversas na FLW | Não há análise na versão atual do prompt | `pnpm job:stage1`. |
| Indicadores do período personalizado zerados ou incompletos | Conversas ainda marcadas como desatualizadas | `pnpm job:metrics`; confira `metrics_stale` = 0. |
| Equipes não aparecem | `TEAM_GROUPS` vazio ou equipes ainda não sincronizadas | Configure a variável e rode `pnpm job:sync`. |
| Ninguém consegue entrar no painel | Não há administrador ativo, ou a senha foi esquecida | No terminal do serviço: `pnpm user:admin -- --email <e-mail> --nome "<nome>"` e entre com a senha provisória. |
| Entrar funciona no desenvolvimento e falha no servidor | O Next recusa a ação quando o domínio de quem acessa não bate com o que chega ao app | Ponha o domínio em `experimental.serverActions.allowedOrigins` no `next.config.mjs`. |
| A OpenAI deu erro ou o custo estourou o teto | Limite de `OPENAI_MAX_USD_PER_RUN` ou falha de rede | Rode `pnpm job:stage1` de novo: ele retoma de onde parou. |
