# Resumo do dia por e-mail — plano de implementação

**Objetivo:** além do resumo da semana e do mês, cada pessoa pode receber um **resumo do dia**, com o dia de hoje até a
hora do envio. O cron roda o `daily` duas vezes por dia, e só a rodada com `--email` envia. O administrador escolhe,
por pessoa, quais resumos ela recebe: diário, semanal e mensal.

**Origem:** pedido de 06/10/2026, logo depois da validação do resumo por e-mail (`docs/PLANO_RESUMO_EMAIL.md`). Junto
entram os quatro ajustes que a validação apontou (§1, "Pendências").

**Status:** D1 a D10 implementados em 06/10/2026 na branch `usuarios`, sem commit. Falta o D11 (servidor). Verificado com o
Mailpit, o banco de desenvolvimento e `scratch/telas.mjs` (1280 e 390); `pnpm test`, `pnpm web:build` e `npx tsc --noEmit`
passam. **Não rodados** (chamam a FLW e a OpenAI): `daily -- --email` e `publish:*` de ponta a ponta; o que foi testado é o
job F, o `email:resumos -- --day` e a fiação do `--email` pelo compilador.

**Depende de:** `PLANO_RESUMO_EMAIL.md` (E1 a E10 na branch `usuarios`, sem commit). Este plano parte dela. O E11 de lá
(servidor) ainda não foi feito, então nada em produção depende do envio automático que este plano troca pela flag.

**Ordem:** D1 a D3 cadastram quem recebe qual resumo. D4 e D5 calculam e montam o resumo do dia. D6 liga a flag
`--email` nos comandos. D7 faz os ajustes da validação. D8 e D9 tratam da página técnica e da documentação, D10 é a
verificação e D11 é o servidor. Cada etapa termina com `pnpm test`, `pnpm web:build` e `npx tsc --noEmit` (o
`web:build` não confere os tipos do CLI nem dos jobs).

**O que não muda:** os relatórios publicados, os jobs que os calculam, o painel e o conteúdo do resumo da semana e do
mês.

---

## 1. O que o código já tem

- **Cálculo de qualquer intervalo de dias.** `loadLiveReports(de, ate)` (`src/lib/live-loader.ts`) calcula o período
  livre com as mesmas regras do relatório publicado (`computeScope`). Não tem texto da IA nem comparação, e devolve
  `dadosAte`, o fim do último sync. É o que o painel usa quando a pessoa escolhe um intervalo. Hoje ele calcula também
  um escopo por atendente.
- **As conversas de hoje já têm nota depois do `daily`.** O job D analisa toda conversa encerrada que ainda não foi
  analisada, sem esperar o dia ou a semana fecharem. `parseFreePeriod` aceita intervalos que terminam hoje.
- **O painel abre um dia só.** `/?de=2026-10-06&ate=2026-10-06` mostra o dia, e o escopo no endereço (E4 do plano
  anterior) vale também no período livre.
- **O envio.** O job F (`src/jobs/job-f-email-resumos.ts`) e o `montarEmailResumo` (`src/email/resumo-email.ts`)
  trabalham com `semana | mes`. A coluna `summary_emails.granularity` é texto: "dia" cabe sem migração.
- **`daily`** (`src/cli.ts`) roda o sync (jobs A e B) e a IA (job D), sem opções. Roda dentro da trava, que **falha na
  hora** se outra execução estiver rodando (`src/domain/lock.ts`).
- **`publish:weekly` e `publish:monthly`** enviam o resumo sempre que publicam de verdade (R-D5 do plano anterior). O
  `pipeline` chama a mesma função de publicação e, por isso, também envia, o que o plano anterior não previa.
- **Assinaturas.** `user_report_subscriptions` guarda os escopos de cada pessoa, e o resumo da semana e o do mês vão
  para todos os usuários ativos com escopo marcado. Ninguém escolhe a frequência.
- **Pendências da validação de 06/10:**
  1. O `APP_URL` sem `https://` gera botões quebrados sem aviso: o job F só confere se a variável está vazia
     (`job-f-email-resumos.ts:57-58`).
  2. O `pipeline` também envia (ver acima).
  3. A contagem "abaixo da meta" e a montagem do e-mail ficam fora do `try` de cada pessoa: um erro do banco ali para
     a rodada inteira. E, se o registro falhar logo depois de um envio que deu certo, a próxima rodada manda de novo.
  4. Com um escopo no endereço, trocar para uma semana em que ele existe mas está vazio abre um escopo que não aparece
     no menu de visão (`Dashboard.tsx:166`).

---

## 2. Decisões

| # | Tema | Decisão |
|---|---|---|
| D-D1 | Qual dia | **Hoje, até a hora do envio** (confirmado em 06/10/2026). Calculado na hora com `loadLiveReports`, como o período livre do painel, sem publicar nada. Descartado: o dia de ontem fechado. |
| D-D2 | Quando sai | Só com a flag **`--email`** no `daily`. O cron roda o `daily` duas vezes por dia, e só a rodada do fim do dia leva `--email` (confirmado em 06/10/2026). |
| D-D3 | A flag vale para todos | `publish:weekly` e `publish:monthly` passam a enviar **só com `--email`**. O mesmo vale para o `pipeline`. Isso troca o R-D5 do plano anterior ("sai sozinho"). Assim a linha do cron diz o que ela manda, e rodar um comando à mão para testar não manda e-mail para todo mundo. Também resolve a pendência 2. |
| D-D4 | Quem recebe | O **administrador escolhe por pessoa** (confirmado em 06/10/2026): caixas **Diário**, **Semanal** e **Mensal** em `/usuarios`, além dos escopos. Os escopos marcados valem para as três. Quem já existe fica com Semanal e Mensal marcados e Diário desmarcado, que é o que recebe hoje. No cadastro, as caixas vêm assim também. Escopo marcado sem nenhuma frequência é recusado, com a mensagem "Marque com que frequência a pessoa recebe, ou desmarque os escopos.". |
| D-D5 | O que o bloco do dia mostra | Nota e se está na meta, ponto mais fraco, quantas conversas ficaram abaixo da meta e o aviso de poucas conversas, com as mesmas funções do resumo da semana. **Sem comparação com o dia anterior**: o período livre do painel também não compara, e um dia contra o outro oscila demais. |
| D-D6 | Dia sem conversa | Um escopo **sem nota no dia** fica fora do e-mail, **inclusive o Geral**. Quem fica sem nenhum bloco não recebe e-mail, então num domingo ou feriado sem atendimento ninguém recebe. No resumo da semana, o Geral continua entrando sempre. |
| D-D7 | Não repetir | Um e-mail diário por pessoa por dia: `summary_emails` com `granularity = "dia"` e `period_start` à meia-noite do dia, no fuso do tenant. Rodar `--email` de novo no mesmo dia não reenvia. `email:resumos -- --day <dia> --reenviar` reenvia, com os números daquela hora. |
| D-D8 | O link | `<APP_URL>/?de=2026-10-06&ate=2026-10-06&escopo=equipe:Peças`, o período livre de um dia. Pede login como qualquer página. |
| D-D9 | O texto | Assunto: "Resumo do dia 06/10" (com um escopo só, "… · Equipe Peças"). Abertura: "Olá, Ana. Este é o resumo do dia 06/10, com as conversas até as 18:05." Logo abaixo: "O dia ainda não terminou: no painel, os números mudam conforme chegam novas conversas." A hora é o fim do último sync, a mesma do "Atualizado…" do painel. Para um dia que já passou (reenvio com `--day`), saem o "até" e o aviso. |
| D-D10 | Comando de reenvio | `pnpm email:resumos -- --day AAAA-MM-DD`, ao lado do `--week` e do `--month`, com `--dry-run`, `--para` e `--reenviar`. |
| D-D11 | E-mail desligado com a flag | Se o `--email` vier sem `SMTP_HOST`, o comando faz o resto (sync, IA, publicação), avisa "Envio de e-mail desligado: configure SMTP_HOST" e **termina com erro** (código 1), para o cron acusar. Sem a flag, nada muda. |

---

## 3. Etapas

### D1 — Banco (migração `6_resumo_diario`)

```prisma
model User {
  // ...
  // Quais resumos a pessoa recebe (D-D4). Os escopos estão em `subscriptions`.
  resumoDia    Boolean @default(false) @map("resumo_dia")
  resumoSemana Boolean @default(true) @map("resumo_semana")
  resumoMes    Boolean @default(true) @map("resumo_mes")
}
```

- Os valores padrão preservam o que os usuários já recebem.
- `SummaryEmail.granularity`: o comentário passa a ser `dia | semana | mes`. A coluna não muda.
- `migration.sql` e `down.sql`, no formato das anteriores. O `down.sql` apaga as três colunas e as linhas de
  `summary_emails` com `granularity = 'dia'`.

### D2 — Regras puras (`src/email/frequencias.ts`)

- `FREQUENCIAS`: a lista de `{ granularity: "dia" | "semana" | "mes", rotulo: "Diário" | "Semanal" | "Mensal",
  campo: "resumoDia" | … }`, na ordem da tela.
- `recebe(usuario, granularity)`: diz se a caixa daquela frequência está marcada.
- `textoFrequencias(usuario)` devolve "diário, semanal e mensal", "só o semanal" ou "nenhuma frequência". É o que a
  lista de usuários mostra.
- `blocoEntra(relatorio, granularity)`: no dia, só com nota (D-D6). Na semana e no mês, o `temConteudo` de hoje.
- Alcançado pela tela e pelo job, então importa sem `.js` (o `tests/web-imports.test.ts` vigia).
- Teste: as três funções, incluindo o domingo sem nota no Geral.

### D3 — Escolha em `/usuarios`

- A seção "Resumos por e-mail" ganha, no alto, o grupo "Com que frequência", com as caixas Diário, Semanal e Mensal.
  Embaixo continuam os escopos. A dica passa a ser: "O diário chega uma vez por dia, com o dia até a hora do envio. O
  semanal e o mensal chegam quando sai o relatório."
- `criarUsuario` e `editarUsuario` recebem `frequencias: ("dia" | "semana" | "mes")[]` (zod `enum`), gravam as três
  colunas no mesmo `create` ou na mesma transação da edição e recusam escopo sem frequência (D-D4).
- Na lista, a linha passa a ser "Recebe: Equipe Peças, Geral · diário, semanal e mensal".
- `tests/auth-guard.test.ts` continua cobrindo as duas ações.

### D4 — Cálculo do dia e envio (`live-loader.ts`, `job-f-email-resumos.ts`)

- `loadLiveReports(de, ate, now, { semAtendentes })`: a opção nova pula os escopos de atendente, que o e-mail não
  usa. O padrão continua igual, então o painel não muda.
- `runJobFEmailResumos` aceita `granularity: "dia"` com `dia: "AAAA-MM-DD"`:
  1. os relatórios vêm de `loadLiveReports(dia, dia, agora, { semAtendentes: true })` em vez de `period_reports`;
  2. `periodStart` é a meia-noite do dia no fuso do tenant (é a chave do D-D7);
  3. a hora do "até" é o `dadosAte` do cálculo, e só aparece quando o dia é hoje;
  4. a contagem "abaixo da meta" usa o `loadAuditedSessions` com a janela do dia, a mesma conta que o painel faz em
     `?de=…&ate=…`;
  5. nenhuma conversa no dia não é erro: a rodada termina com "Sem nada para mandar: N".
- Nas três frequências, o job só busca quem tem a caixa marcada (`resumoDia`, `resumoSemana` ou `resumoMes`), e os
  blocos passam pelo `blocoEntra`.

### D5 — Conteúdo do e-mail do dia (`src/email/resumo-email.ts`)

- `EntradaEmail.periodo.granularity` passa a aceitar `"dia"`, com o campo opcional `ate` (hora do último sync, só para
  hoje).
- Assunto, abertura e aviso como no D-D9. Sem linha de comparação (D-D5).
- `linkResumo` gera `?de=…&ate=…` no dia (D-D8).
- O resumo da semana e o do mês não mudam (os testes atuais continuam passando sem alteração).
- `PERIODO` (`src/lib/labels.ts`) é do painel e não ganha "dia". Se o e-mail precisar de frase própria, ela fica no
  módulo do e-mail.
- Teste: assunto e abertura de hoje (com "até") e de um dia passado (sem "até"), link com `de` e `ate`, ausência de
  comparação e a lista de termos proibidos.

### D6 — A flag `--email` (`src/cli.ts`)

- `daily [--email]`: depois do job D, com `--email`, chama o job F para hoje (`dia` no fuso do tenant). Um erro no
  envio não desfaz o sync nem a IA: aparece no terminal e o comando termina com código 1.
- `publish:weekly` e `publish:monthly`: o envio no fim do `publishPeriod` passa a depender de `--email`. Continua sem
  enviar com `--dry-run` e com `--correct`.
- `pipeline`: só envia com `--email`, porque usa o mesmo `publishPeriod`.
- `email:resumos`: aceita `--day AAAA-MM-DD` (D-D10).
- Com a flag e sem `SMTP_HOST`: aviso e código 1 (D-D11).
- O texto de ajuda do CLI mostra a flag nos quatro comandos.

### D7 — Ajustes da validação (pendências da §1)

1. **`APP_URL`:** o job F recusa um valor que não comece com `http://` ou `https://`, com a mensagem "O APP_URL
   precisa começar com https:// (por exemplo https://qualidade.tterrasul.com.br).".
2. **`pipeline`:** resolvido pelo D6.
3. **Erro de uma pessoa não para a rodada:** a contagem, a montagem e o envio de cada pessoa ficam dentro do `try`
   dela. Se o envio der certo e o registro falhar, a pessoa conta como enviada, e o terminal avisa: "Enviado para X,
   mas o registro falhou: a próxima rodada pode mandar de novo para essa pessoa.".
4. **Escopo vazio pelo endereço:** o `Dashboard.tsx` só aceita o escopo do endereço se ele tiver conteúdo no período
   (`temConteudo`). Se não tiver, abre no Geral, como acontece quando o escopo não existe.

### D8 — Página técnica (`/status`)

- O bloco "Resumos por e-mail" mostra o dia como "Dia 06/10", ao lado de "Semana de …" e "Mês de …".
- O texto do topo passa a ser: "Saem quando o daily, o publish:weekly ou o publish:monthly rodam com --email. Para
  repetir só o que falhou: pnpm email:resumos."

### D9 — Documentação

- `docs/COMANDOS.md`:
  - a tabela da §1 mostra o `daily` duas vezes por dia (uma com `--email`) e o `--email` no `publish:*`;
  - as seções do `daily` e do `publish:*` explicam a flag;
  - o `email:resumos` ganha o `--day`.
- `docs/DEPLOY_EASYPANEL.md` ganha as linhas do cron e o aviso do fuso (§4). Exemplo:

  ```
  0 5 * * *   pnpm daily                        # madrugada: completa o dia anterior
  0 18 * * *  pnpm daily -- --email             # fim da tarde: atualiza e manda o resumo de hoje
  0 8 * * 4   pnpm publish:weekly -- --email    # quinta de manhã
  0 8 2 * *   pnpm publish:monthly -- --email   # dia 2
  ```

- `docs/PLANO_RESUMO_EMAIL.md`: o R-D5 e o E7 apontam para a flag (D-D3 deste plano), e o E11 usa os comandos com
  `--email`.
- `.env.example`: o comentário "enviado ao final do publish:weekly e do publish:monthly" passa a citar a flag.

### D10 — Verificação

- `pnpm test`, `pnpm web:build` e `npx tsc --noEmit`.
- Com o Mailpit e usuários de teste (apagados no fim):
  - `pnpm daily -- --email` manda o resumo de hoje só para quem tem Diário marcado, e quem só tem Semanal não recebe;
  - rodar de novo no mesmo dia não duplica, e `email:resumos -- --day <hoje> --reenviar` manda de novo;
  - um escopo sem nota no dia fica fora, e uma pessoa sem nenhum bloco não recebe;
  - logo depois do envio, o "abaixo da meta" do e-mail é o mesmo do painel em `?de=<hoje>&ate=<hoje>`, no Geral e
    numa equipe;
  - o botão abre o dia e o escopo depois do login;
  - `publish:weekly` sem `--email` não manda nada, e com `--email` manda;
  - `--email` sem `SMTP_HOST` avisa e termina com código 1;
  - `APP_URL=qualidade.exemplo.com.br` é recusado com a mensagem do D7.
- `scratch/telas.mjs`: prints da seção "Resumos por e-mail" com as frequências, em 1280 e 390.
- O HTML do `--dry-run` do dia aberto no navegador em 390px.

### D11 — Servidor

Junto com o E11 do `PLANO_RESUMO_EMAIL.md`:

1. Deploy. O container roda a migração `6_resumo_diario`.
2. Em `/usuarios`, marcar as frequências de cada pessoa (todos começam com Semanal e Mensal).
3. Configurar o cron como no D9, com o horário ajustado ao fuso do servidor (§4).
4. No primeiro dia, olhar o terminal da rodada com `--email` e a página `/status`.

---

## 4. Riscos

- **O número do e-mail fica diferente do painel depois.** O dia continua depois do envio, e o painel mostra o dia até
  agora. O aviso do D-D9 diz isso. Quem abrir o link à noite vai ver números maiores.
- **Conversas ainda sem nota.** O envio vem depois da IA na mesma rodada. Se a IA parar no meio (teto de custo ou
  erro), o `daily` falha e não envia. Se ela terminar com conversas pendentes de nova tentativa, o resumo sai só com
  as que têm nota.
- **Fuso do cron.** O cron segue o relógio do servidor, que costuma estar em UTC. Se a linha disser 18h e o servidor
  estiver em UTC, o envio sai às 15h de Brasília. O "hoje" do e-mail usa o fuso do tenant, então o dia continua certo:
  só a hora muda. Um horário perto da meia-noite, porém, pode cair no dia seguinte e mandar um resumo quase vazio.
- **Execuções que se cruzam.** A trava falha na hora: se o `daily -- --email` começar enquanto outro comando roda, ele
  não envia. Os horários do cron devem ficar separados, e `email:resumos -- --day <hoje>` repete o envio.
- **Muitos avisos de poucas conversas.** Num dia, a maioria das equipes tem menos de 10 conversas, então o aviso
  aparece em quase todo bloco de equipe. É verdade, mas pode cansar. Se incomodar, fica para depois (§6).
- **Cansaço do e-mail diário.** Um e-mail por dia tende a ser ignorado. Por isso o Diário vem desmarcado e é
  escolhido pessoa a pessoa.
- **Mudança no `publish:*`.** Sem `--email`, eles deixam de enviar. Como o E11 ainda não foi feito, basta o cron já
  nascer com a flag.

---

## 5. Como saber que ficou pronto

- [x] O administrador marca Diário, Semanal e Mensal de cada pessoa em `/usuarios` e vê "Recebe: … · diário, …" na
  lista.
- [x] `pnpm daily -- --email` manda um e-mail por pessoa com Diário marcado, com o dia até a hora do envio e um bloco
  por escopo com nota.
- [ ] Sem `--email`, nenhum comando envia nada. (Pelo código sim; falta rodar o `publish:weekly` de verdade no servidor.)
- [x] Rodar de novo no mesmo dia não duplica, e `--reenviar` manda de novo.
- [x] Os números do e-mail do dia são iguais aos do painel no mesmo dia, logo depois do envio.
- [x] "Abrir o resumo" abre o dia e o escopo do e-mail. (O link tem `de`, `ate` e `escopo`; o painel abre o dia pelo endereço, conferido no `telas.mjs`.)
- [x] As quatro pendências da validação estão resolvidas.
- [x] Nenhum termo técnico no e-mail, que fica legível no celular. (Termos conferidos nos testes; o HTML a 390 px ainda vale abrir no navegador.)
- [x] `pnpm test`, `pnpm web:build` e `npx tsc --noEmit` passam.

---

## 6. Fora desta entrega

- Comparar o dia com o anterior ou com o mesmo dia da semana passada.
- Frequência por escopo (por exemplo, Equipe Peças todo dia e Geral só por semana): aqui a frequência é da pessoa.
- Horário de envio por pessoa.
- Esconder o aviso de poucas conversas no resumo do dia.
- Resumo de ontem pela manhã, além do de hoje.
- O que já estava fora no `PLANO_RESUMO_EMAIL.md` §6.
