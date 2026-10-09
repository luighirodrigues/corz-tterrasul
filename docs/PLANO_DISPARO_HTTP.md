# Disparo dos comandos por HTTP — plano de implementação

**Objetivo:** um `GET` para cada um dos três comandos agendados (`pnpm daily`, `pnpm publish:weekly` e
`pnpm publish:monthly`), para que outro serviço (agendador externo, n8n, GitHub Actions...) possa dispará-los pela
internet. As opções da URL são **exatamente as flags do comando**: `/api/jobs/daily?email` faz o mesmo que
`pnpm daily -- --email`.

**Origem:** pedido de 09/10/2026.

**Status:** decisões da §2 aprovadas em 09/10/2026 (o serviço que vai chamar manda cabeçalho, então o token fica só no
`Authorization`). H1 a H8 implementados e commitados em 09/10/2026 na branch `disparo-http`, enviada ao GitHub para o
teste em produção. Verificado com `curl` num
`next dev` local: 401, 400, 405, 409 (trava presa no `psql` e dois disparos juntos), 404, 503 (sem token e com token
curto) e uma execução real do CLI pela rota (`weekly?week=2026-12-02&email`, que para na trava de publicação sem gravar
nada e voltou 500 com a saída e o código 1). **Não rodado:** um `daily` de verdade pela rota, que chama a FLW e a
OpenAI e passa pelo caminho do 202. Falta o H9 (servidor).

**Depende de:** branch `usuarios` (login por usuário, `src/proxy.ts` e `src/auth/dal.ts` atuais, flag `--email`). A
implementação sai numa branch nova a partir dela.

**Ordem:** H1 e H2 são funções puras (flags e token), com teste. H3 abre o caminho no proxy. H4 roda o comando. H5 são
as rotas. H6 ajusta os testes de guarda, H7 a documentação, H8 é a verificação e H9 o servidor. Cada etapa termina
com `pnpm test`, `pnpm web:build` e `npx tsc --noEmit`.

**O que não muda:** o `src/cli.ts`, os jobs, a trava, o comportamento de cada flag e o terminal do EasyPanel, que
continua funcionando como hoje.

---

## 1. O que o código já tem

- **Uma imagem só** (`Dockerfile`): a tela (`next start`) e os jobs rodam no mesmo container, com todas as
  dependências instaladas, inclusive o `tsx`. O processo da tela consegue rodar `tsx src/cli.ts daily --email`, que é
  o que o `pnpm daily -- --email` faz.
- **Flags lidas pelo CLI** (`src/cli.ts`):
  - `daily`: `--email`.
  - `publish:weekly` (mesmo `case` do `report`): `--week`, `--month`, `--dry-run`, `--allow-incomplete`, `--correct`,
    `--reason` e `--email`. O `--month` funciona porque o código é o do `job:report`.
  - `publish:monthly`: `--dry-run`, `--allow-incomplete`, `--correct`, `--reason` e `--email`. Usa sempre o último mês
    encerrado e ignora `--week` e `--month`.
  - O CLI ignora em silêncio qualquer flag que não conhece.
- **Trava** (`src/domain/lock.ts`): `pg_try_advisory_xact_lock(hashtext('flw-quality'))`. Se outro comando estiver
  rodando, o novo **falha na hora** com "Outra execução ... já está em andamento".
- **Código de saída:** o CLI termina com 1 quando dá erro, e também quando o envio de e-mail falha ou está desligado
  com `--email` (`enviarResumos`).
- **Proxy** (`src/proxy.ts`): toda rota `/api/*` sem o cookie de sessão volta 401. Quem valida a sessão é
  `authorizeApi` (`src/auth/dal.ts`), e o `tests/auth-guard.test.ts` exige `authorizeApi(` em toda rota da API.
- **Rotas `GET` não ficam em cache** no Next 16 (`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`).
- **`HEAD` vira `GET`:** se a rota não exporta `HEAD`, o Next responde o `HEAD` chamando o `GET`
  (`next/dist/server/route-modules/app-route/helpers/auto-implement-methods.js`). Um monitor de disponibilidade que
  manda `HEAD` dispararia o comando.
- **`tests/web-imports.test.ts`:** tudo o que a tela alcança importa sem `.js`. O `lock.ts` hoje importa
  `../db/prisma.js`.

---

## 2. Decisões

| # | Tema | Decisão |
|---|---|---|
| H-D1 | Como o comando roda | A rota **inicia o próprio CLI** num processo filho: `node node_modules/tsx/dist/cli.mjs src/cli.ts <comando> <flags>`, sem shell. Assim as flags, a trava, os logs e o código de saída são os mesmos do terminal, sem copiar código. O processo da tela não carrega a OpenAI nem segura memória do job, e o `process.exitCode` do CLI não afeta o servidor. Descartado: chamar os jobs dentro do processo do Next. |
| H-D2 | Endereços | `GET /api/jobs/daily`, `GET /api/jobs/weekly` e `GET /api/jobs/monthly`. As flags vão na query, com o mesmo nome sem os traços: `?email`, `?dry-run`, `?week=2026-09-17`, `?correct&reason=Sync%20atrasado`. |
| H-D3 | Flag ligada | Presente sem valor (`?email`), `=1` ou `=true` liga. `=0` ou `=false` deixa de fora. Qualquer outro valor é recusado. |
| H-D4 | Flag que o comando não lê | **Recusa com 400**, listando as aceitas (`?emial` não pode rodar um `daily` calado, sem e-mail). É a única diferença em relação ao CLI, que ignora. Os valores também são conferidos antes de começar: `week` em AAAA-MM-DD, `month` em AAAA-MM, `correct` só com `reason` (a mesma mensagem do CLI). |
| H-D5 | Resposta | **Não espera o comando terminar** (o `daily` com IA leva minutos e estoura o tempo de qualquer agendador). A rota espera até 2 s: se o comando já falhou nesse tempo, devolve o erro e a saída; senão, devolve **202** com o id da execução. `GET /api/jobs/execucoes/<id>` mostra se ainda roda, o código de saída e as últimas 300 linhas. |
| H-D6 | Autenticação | Variável **`JOBS_TOKEN`** (mínimo 32 caracteres), enviada no cabeçalho `Authorization: Bearer <token>`. Vazia, o disparo fica desligado (503, "Disparo por HTTP desligado: configure JOBS_TOKEN."), como o `SMTP_HOST`. Comparação em tempo constante. O proxy deixa `/api/jobs/` passar sem cookie, e a rota confere o token. **Sem `?token=` na URL**: a URL vai para logs de proxy e histórico, e sem o cabeçalho um link aberto por engano não dispara nada. Se o serviço escolhido não mandar cabeçalho, este é o ponto a rever. |
| H-D7 | Já tem comando rodando | Antes de iniciar, a rota testa a trava no banco (cobre também o que foi iniciado no terminal) e a lista de execuções em memória. Ocupada: **409**, "Outro comando já está em andamento.". |
| H-D8 | `HEAD` | A rota exporta `HEAD` com **405**, para um monitor não disparar o comando. Só `GET`. |
| H-D9 | Histórico das execuções | **Em memória** (as 20 últimas), no `globalThis`. Some quando o container reinicia. A saída também vai, linha a linha, para o log do serviço no EasyPanel, com o prefixo `[disparo daily a1b2c3]`. |
| H-D10 | Agendador | O serviço externo **substitui** as linhas de cron da §3 do `DEPLOY_EASYPANEL.md`. Os dois juntos rodariam cada comando duas vezes (o segundo cai na trava ou repete o sync). |

---

## 3. Etapas

### H1 — Mapa das flags (`src/jobs/http/comandos.ts`)

```ts
export const COMANDOS_HTTP = {
  daily:   { cli: "daily",           flags: { email: "liga" } },
  weekly:  { cli: "publish:weekly",  flags: { week: "dia", month: "mes", "dry-run": "liga", "allow-incomplete": "liga",
                                              correct: "liga", reason: "texto", email: "liga" } },
  monthly: { cli: "publish:monthly", flags: { "dry-run": "liga", "allow-incomplete": "liga", correct: "liga",
                                              reason: "texto", email: "liga" } },
} as const;
```

- `montarArgv(nome, searchParams)` devolve `{ argv: ["daily", "--email"] }` ou `{ erro: "..." }`, com as regras do
  H-D3 e do H-D4. Parâmetro repetido é recusado, e `week` com `month` também (o CLI usaria o `month` calado). `reason` vazio ou com mais de 500 caracteres é recusado. A ordem do
  `argv` segue a do mapa, para o log sair sempre igual.
- `textoDoComando(argv)` devolve `pnpm daily -- --email`, para a resposta e o log.
- Puro e sem `.js` nos imports (a tela alcança).
- Teste (`tests/jobs-http.test.ts`): `?email`, `?email=false`, `?emial`, `?email=talvez`, `monthly?week=...`,
  `weekly?week=2026-13-40`, `weekly?month=2026-9`, `weekly?correct` sem `reason`, `reason` com espaços e aspas chegando
  como um item só do `argv`, parâmetro repetido.

### H2 — Token (`src/config/env.ts`, `src/auth/job-token.ts`)

- `JOBS_TOKEN: z.string().default("")` no `env.ts` e no `.env.example`, com o jeito de gerar:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `tokenConfere(recebido, esperado)` (puro, em `src/auth/rules.ts`): compara os SHA-256 com `timingSafeEqual`.
- `authorizeJobToken(request)` (`server-only`): devolve `null` quando vale, ou a resposta pronta: 503 com
  `JOBS_TOKEN` vazio ou curto, 401 sem cabeçalho ou com token errado (a mesma mensagem nos dois casos).
- Teste: token certo, errado, vazio, com um caractere a mais, sem o `Bearer`.

### H3 — Proxy (`src/proxy.ts`)

- `/api/jobs/` passa sem cookie, logo depois do `/login`. Comentário: "quem confere é o token, na rota".
- Só esse prefixo. As demais rotas da API continuam com 401 sem cookie.

### H4 — Execução (`src/jobs/http/execucoes.ts`, `src/domain/lock.ts`)

- `lock.ts` passa a importar `../db/prisma` sem `.js` (o `tsx` resolve os dois jeitos) e ganha
  `travaOcupada(nome)`: um `pg_try_advisory_xact_lock` dentro de uma transação curta, que solta a trava no fim.
- `iniciarExecucao(argv)`: `spawn(process.execPath, [<tsx>/dist/cli.mjs, "src/cli.ts", ...argv])`, com
  `cwd: process.cwd()`, o mesmo `env` do servidor e sem shell (funciona igual no Windows do dev e no Linux do
  container). Guarda `{ id, comando, inicio, fim, status: "rodando" | "concluido" | "erro", codigo, saida }`.
- Cada linha da saída vai para o `console` com o prefixo do H-D9 e para a `saida` (as 300 últimas).
- `aguardar(execucao, 2000)`: termina quando o processo sai ou quando passam 2 s.
- O processo filho não fica preso à requisição: se quem chamou desistir, o comando continua.
- Teste com um script de mentira (`tests/fixtures/cli-falso.mjs`, que imprime linhas e sai com o código pedido): a
  saída é capturada, o código e o status batem, a lista guarda só as 20 últimas, e `aguardar` devolve antes dos 2 s
  quando o processo sai.

### H5 — Rotas (`src/app/api/jobs/...`)

- `daily/route.ts`, `weekly/route.ts` e `monthly/route.ts`, cada um com:
  1. `authorizeJobToken(request)`;
  2. `montarArgv` (400 com a mensagem e a lista de flags aceitas);
  3. trava e execuções em memória (409);
  4. `iniciarExecucao` e `aguardar`;
  5. se já saiu com erro: 409 quando a saída tem a mensagem da trava, 500 nos demais casos, com as últimas linhas;
     senão, 202.
- `HEAD` com 405 (H-D8). Todas as respostas com `Cache-Control: no-store`.
- `execucoes/[id]/route.ts`: o mesmo token; 404 "Execução não encontrada (o servidor pode ter reiniciado)." para id
  desconhecido.

Resposta do disparo:

```json
{
  "id": "a1b2c3",
  "comando": "pnpm daily -- --email",
  "inicio": "2026-10-09T21:00:00.000Z",
  "acompanhar": "/api/jobs/execucoes/a1b2c3"
}
```

Resposta do acompanhamento:

```json
{
  "id": "a1b2c3",
  "comando": "pnpm daily -- --email",
  "status": "concluido",
  "codigo": 0,
  "inicio": "2026-10-09T21:00:00.000Z",
  "fim": "2026-10-09T21:06:12.000Z",
  "saida": ["=== ROTINA DIÁRIA: SYNC INCREMENTAL + IA ESTÁGIO 1 ===", "..."]
}
```

`status: "erro"` com `codigo: 1` cobre também o e-mail que falhou com `--email`, como no terminal.

### H6 — Testes de guarda

- `tests/auth-guard.test.ts`: as rotas em `app/api/jobs/` têm de chamar `authorizeJobToken(`; as demais continuam com
  `authorizeApi(`. Novo caso: o proxy só libera o prefixo `/api/jobs/`.
- `tests/web-imports.test.ts`: as quatro rotas novas entram em `ENTRIES`.
- Paridade: cada flag do `COMANDOS_HTTP` aparece como `"--<flag>"` em `src/cli.ts`. Uma flag renomeada no CLI quebra
  o teste.

### H7 — Documentação

- `docs/COMANDOS.md`: seção nova "Disparar pela internet", com a tabela comando ↔ endereço, flag ↔ parâmetro, os
  códigos de resposta (202, 400, 401, 409, 500, 503), o acompanhamento e exemplos:

  ```bash
  curl -H "Authorization: Bearer $JOBS_TOKEN" "https://<domínio>/api/jobs/daily"
  curl -H "Authorization: Bearer $JOBS_TOKEN" "https://<domínio>/api/jobs/daily?email"
  curl -H "Authorization: Bearer $JOBS_TOKEN" "https://<domínio>/api/jobs/weekly?email"
  curl -H "Authorization: Bearer $JOBS_TOKEN" "https://<domínio>/api/jobs/monthly?email"
  curl -H "Authorization: Bearer $JOBS_TOKEN" "https://<domínio>/api/jobs/weekly?week=2026-09-17&dry-run"
  ```

  Na §1 ("Rotina"), uma linha dizendo que o agendamento pode ser o cron ou um serviço externo chamando esses
  endereços, nunca os dois (H-D10).
- `docs/DEPLOY_EASYPANEL.md`: `JOBS_TOKEN` na tabela de variáveis; na §3, o agendamento por serviço externo ao lado do
  cron, com o mesmo aviso de fuso; e que trocar o token é trocar a variável e reiniciar o serviço.
- Ajuda do CLI (`default` do `src/cli.ts`): uma linha apontando para o endereço HTTP de cada um dos três.

### H8 — Verificação

- `pnpm test`, `pnpm web:build` e `npx tsc --noEmit`.
- Com `pnpm web:dev` e um `JOBS_TOKEN` no `.env`, por `curl`:
  - sem `JOBS_TOKEN`: 503; token errado ou sem cabeçalho: 401;
  - `daily?emial`, `monthly?week=2026-09-17` e `weekly?correct`: 400 com a mensagem certa;
  - trava presa à mão no `psql` (`BEGIN; SELECT pg_advisory_xact_lock(hashtext('flw-quality'));`): 409;
  - `HEAD /api/jobs/daily`: 405, e nada roda;
  - `/api/reports` sem cookie continua 401;
  - uma execução de verdade do `daily` (sync incremental e IA das conversas novas: chama a FLW e a OpenAI, **só com o
    seu ok**): 202, o acompanhamento mostra a saída e `codigo: 0`, e a mesma saída aparece no terminal do
    `web:dev` com o prefixo.

### H9 — Servidor

1. Gerar o token e pôr `JOBS_TOKEN` nas variáveis do serviço no EasyPanel.
2. Deploy.
3. De fora: `curl` sem token (401) e com uma flag errada (400), que não rodam nada.
4. Configurar o serviço externo com os quatro horários da §3 do `DEPLOY_EASYPANEL.md`, ajustados ao fuso dele, e
   **não** criar as linhas de cron (H-D10).
5. Na primeira rodada de cada um, olhar o acompanhamento, o log do serviço e a página `/status`.

---

## 4. Riscos

- **Token vazado.** Quem tiver o token dispara os três comandos com qualquer flag. O `--email` repetido não duplica
  e-mail (quem já recebeu o período é pulado, e o `--reenviar` não está nestes comandos), mas o `--correct` refaz um
  relatório publicado, guardando a versão anterior, e cada `daily` gasta FLW e OpenAI. A trava impede duas execuções
  juntas, mas não repetições. Resposta: trocar a variável e reiniciar.
- **`GET` que muda coisas.** Pré-carregamento de navegador, prévia de link em chat e robôs fazem `GET` em URLs. Sem o
  cabeçalho nada roda, e o `HEAD` volta 405.
- **Deploy no meio de uma execução.** O redeploy reinicia o container e mata o processo filho, como mata o comando do
  terminal hoje. O histórico em memória some junto.
- **Agendador e cron juntos** (H-D10): cada comando rodaria duas vezes.
- **Fuso do agendador.** O mesmo aviso do cron: o "hoje" do resumo do dia usa o `TIMEZONE` do painel, e só a hora do
  disparo muda.
- **Corrida na trava.** Entre a rota testar a trava e o CLI pegá-la, outro comando pode começar. O CLI falha na hora,
  como hoje, e a espera de 2 s do H-D5 devolve 409 nesse caso.

---

## 5. Como saber que ficou pronto

- [x] `GET /api/jobs/daily?email` com o token faz o mesmo que `pnpm daily -- --email`, e o mesmo vale para `weekly`
  e `monthly` com cada flag que o CLI lê. (Montagem do `argv` e paridade com o `cli.ts` nos testes; execução real só
  com o `weekly` parado na trava de publicação.)
- [x] Flag desconhecida, valor errado ou `correct` sem `reason` voltam 400 sem rodar nada.
- [x] Sem token, com token errado ou com `JOBS_TOKEN` vazio, nada roda.
- [x] Com outro comando rodando (do terminal ou de outro disparo), volta 409.
- [x] O acompanhamento mostra a saída, o código de saída e se ainda está rodando. (O "rodando" pelo HTTP depende de um
  comando longo: coberto no teste com o script de mentira.)
- [x] `HEAD` não dispara nada, e as demais rotas da API continuam exigindo login.
- [x] `pnpm test`, `pnpm web:build` e `npx tsc --noEmit` passam.

---

## 6. Fora desta entrega

- `?esperar` para a resposta só voltar quando o comando terminar.
- Disparo do `pipeline`, do `email:resumos` e dos `job:*`.
- Histórico dos disparos no banco e na página `/status`.
- Um token por serviço, lista de IPs permitidos ou limite de chamadas.
- Botão na tela para o administrador disparar os comandos.
