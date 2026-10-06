# Resumo por e-mail — plano de implementação

**Objetivo:** quando sai o relatório da semana ou do mês, cada usuário recebe no e-mail um resumo curto dos escopos que
acompanha (por exemplo, a equipe de Vendas ou a de Peças), com um botão que abre esse resumo no painel.

**Origem:** pedido de 06/10/2026, logo depois do login por usuário (`docs/PLANO_USUARIOS.md`). O cliente vai fornecer
o servidor de envio (SMTP).

**Status:** E1 a E10 implementados em 06/10/2026 na branch `usuarios`, sem commit (decisões da §2 confirmadas com o pedido de implementação). Falta o E11 (servidor). Verificado com o Mailpit e com `scratch/telas.mjs`; `pnpm test` e `pnpm web:build` passam.

**Depende de:** `PLANO_USUARIOS.md`, que está na branch `usuarios`, sem commit. Este plano parte dela.

**Ordem:** E1 a E3 cadastram quem recebe o quê. E4 faz o link abrir o escopo certo. E5 a E7 montam e enviam o e-mail.
E8 e E9 tratam da página técnica e da documentação, E10 é a verificação e E11 é o servidor. Cada etapa termina com
`pnpm test` e `pnpm web:build`.

**O que não muda:** os relatórios, os jobs que os calculam e o que cada pessoa vê no painel.

---

## 1. O que o código já tem

- **Escopos.** O relatório é publicado por escopo (`period_reports.scope_type` e `scope_id`), e o menu de visão do
  painel mostra os mesmos:
  - **Geral**;
  - **Divisões**: Veículos (`carros`) e Pós-venda (`pecas`);
  - **Equipes**: são os grupos do `TEAM_GROUPS`. Hoje são Vendas, Peças, Pós-venda, Agendamento e Caixa, e o nome do
    grupo é o `scope_id`;
  - **Painéis do CRM**: Vendas, Campanhas, Peças e Oficina, com o id do painel na FLW como `scope_id`.

  Também existe o escopo **agente**, mas ele não aparece no menu.
- **"Comercial" não existe hoje.** O mais próximo é a equipe "Vendas" ou a divisão Veículos. Para ter um escopo com esse
  nome, basta renomear o grupo no `TEAM_GROUPS` (ver o risco na §4).
- **Publicação.** `pnpm publish:weekly` (quinta de manhã) e `pnpm publish:monthly` (dia 2) gravam os relatórios pela
  função `publishPeriod` do `src/cli.ts`. É o momento natural de enviar.
- **Usuários.** Todo usuário já tem um e-mail, que é o login. Ele é único e está em minúsculas.
- **Endereço da página.** O endereço do painel guarda só o período (`?tipo=mes&period=<início ISO>`). O escopo começa
  sempre em "Geral" (`Dashboard.tsx:157`), então hoje não dá para mandar um link que abra a equipe de Peças.
- **Resumo do topo.** O resumo que aparece no alto da Visão geral já é calculado por funções puras (`src/lib/resumo.ts`):
  ponto mais fraco e diferença para o período anterior. A contagem de "abaixo da meta" vem do
  `loadAuditedSessions` (`src/lib/sessions-loader.ts`), a mesma regra da tela.
- **Envio de e-mail.** Não existe nenhum: não há SMTP, `nodemailer` nem nada parecido.
- **Login no link.** Quem abre um link sem estar conectado passa pelo login e volta para o mesmo endereço (o `volta`
  do `PLANO_USUARIOS.md`). O link do e-mail aproveita isso.

---

## 2. Decisões (confirmadas em 06/10/2026)

| # | Tema | Recomendação |
|---|---|---|
| R-D1 | O que é a "categoria" | Um **escopo** do menu de visão: Geral, uma divisão, uma equipe ou um painel do CRM. Cada usuário recebe **um ou mais**. A gerência pode receber o Geral, e um vendedor, a equipe de Vendas. Para aparecer "Comercial", renomeia-se o grupo no `TEAM_GROUPS`. Descartado: inventar uma lista de categorias à parte dos escopos, que não bateria com o que o painel mostra. |
| R-D2 | Para onde vai | Para o **e-mail do login**, que já é obrigatório e único, com o formato conferido no cadastro. Descartado: um segundo campo de e-mail "para avisos", que vira dois endereços para manter sem necessidade. |
| R-D3 | Um e-mail por quê | **Um e-mail por pessoa por período**, com um bloco para cada escopo que ela acompanha. Quem acompanha três escopos recebe um e-mail só, não três. |
| R-D4 | O que o e-mail mostra | Por escopo: nome, período, **nota** e se está na meta, diferença para o período anterior, o **ponto mais fraco** e quantas conversas ficaram **abaixo da meta**, com os mesmos números e frases do resumo do topo do painel. Embaixo vem o botão **"Abrir o resumo"**. Nenhuma frase de cliente, nome de cliente ou trecho de conversa. Descartado: só o link (ninguém sabe se vale a pena abrir) e o relatório inteiro no e-mail (dados fora do login, e o layout quebra nos programas de e-mail). |
| R-D5 | Quando sai | ~~Sai sozinho ao final do `publish:weekly` e do `publish:monthly`.~~ **Trocado pelo D-D3 do `PLANO_RESUMO_DIARIO.md`:** sai **só com a flag `--email`** (`daily`, `publish:weekly`, `publish:monthly` e `pipeline`), quando eles publicam de verdade (sem `--dry-run`). A correção de um relatório já publicado (`--correct`) não reenvia. |
| R-D6 | Não repetir | Uma tabela registra cada envio (pessoa, período e resultado). Rodar o envio de novo manda só para quem ainda não recebeu ou deu erro. É o que resolve uma falha do SMTP no meio do caminho. |
| R-D7 | O link | `<endereço do painel>/?period=<início>&escopo=equipe:Peças` (com `tipo=mes` no mensal). Pede login como qualquer página e, depois do login, abre no escopo e no período certos. O painel passa a guardar o escopo no endereço, então copiar o endereço também leva o escopo. Descartado: link que entra sem senha, porque um e-mail encaminhado daria acesso ao painel. |
| R-D8 | Quem recebe | Só usuários **ativos**: desativado para de receber na hora. Um escopo sem nada no período (o mesmo critério que tira o escopo do menu) fica fora do e-mail. Se nenhum escopo da pessoa tiver conteúdo, ela não recebe e-mail naquele período. |
| R-D9 | Quem escolhe | O **administrador**, no cadastro e na edição do usuário em `/usuarios`, numa seção "Resumos por e-mail" com caixas de marcar agrupadas como no menu de visão. Na lista de usuários aparece "Recebe: Equipe Peças, Geral". O rodapé do e-mail diz: "Para deixar de receber, fale com o administrador do painel." Descartado: cada pessoa escolher os próprios resumos, e link de descadastro, que precisaria de página pública com código. |
| R-D10 | Configuração | Variáveis de ambiente `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` e `EMAIL_FROM` (ex.: `Tterrasul Qualidade <qualidade@tterrasul.com.br>`), mais `APP_URL` (o endereço público do painel, que o terminal não tem como descobrir). Sem `SMTP_HOST`, o envio fica desligado: a publicação segue normal e avisa no terminal. Biblioteca: `nodemailer`, a única dependência nova. |
| R-D11 | Testar | `pnpm email:teste -- --para fulano@…` manda um e-mail simples para conferir o SMTP. `pnpm email:resumos -- --week … --dry-run` grava os e-mails como arquivos HTML em `reports/emails/` sem enviar. `--para` manda só para uma pessoa. Em desenvolvimento, o `docker-compose.yml` ganha o Mailpit, um SMTP de mentira com uma página que mostra os e-mails recebidos. |

---

## 3. Etapas

### E1 — Banco (migração `5_resumo_email`)

```prisma
// Escopos que a pessoa acompanha por e-mail (R-D1, R-D9). Mesmo par scopeType/scopeId dos relatórios.
model UserReportSubscription {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  scopeType String   @map("scope_type") // geral | divisao | equipe | painel
  scopeId   String   @map("scope_id")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, scopeType, scopeId])
  @@map("user_report_subscriptions")
}

// Um envio por pessoa e período (R-D3, R-D6).
model SummaryEmail {
  id          String    @id @default(uuid())
  userId      String    @map("user_id")
  granularity String    // semana | mes
  periodStart DateTime  @map("period_start")
  toAddress   String    @map("to_address") // o e-mail usado no envio (o login pode mudar depois)
  scopes      Json      // [{ scopeType, scopeId, reportId }] que entraram no e-mail
  status      String    // enviado | erro
  error       String?
  sentAt      DateTime? @map("sent_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, granularity, periodStart])
  @@index([granularity, periodStart])
  @@map("summary_emails")
}
```

- `User` ganha as duas relações. `migration.sql` e `down.sql`, no formato das anteriores.

### E2 — Escopos que dá para acompanhar (`src/domain/report-scopes.ts`)

- `listSubscribableScopes(tenant, teamGroups)`: Geral, as duas divisões, as equipes do `TEAM_GROUPS` (na ordem do
  `.env`) e os quatro painéis, com o id de cada um no `tenant`. Cada item traz `scopeType`, `scopeId`, o grupo do menu
  e o nome como o painel mostra (`resolveScopeTitle` + `nomeEscopo`).
- O escopo "agente" fica fora (§6).
- Função pura, com teste: a lista bate com o menu de visão e o nome é o mesmo da tela.

### E3 — Escolha em `/usuarios`

- O formulário de cadastro e de edição ganha a seção "Resumos por e-mail": caixas de marcar agrupadas em Geral,
  Divisões, Equipes e Painéis do CRM, todas desmarcadas no cadastro. A dica diz: "Chega quando sai o relatório da
  semana e o do mês."
- `criarUsuario` e `editarUsuario` recebem `resumos: { scopeType, scopeId }[]`, validam cada item contra a lista de
  E2 (item desconhecido é recusado) e trocam as assinaturas da pessoa na mesma transação do cadastro.
- Na lista, cada linha mostra "Recebe: …". Quando o escopo não existe mais (grupo renomeado ou removido do
  `TEAM_GROUPS`), aparece "Equipe Vendas (não existe mais)" e a caixa vem marcada para ser desmarcada.

### E4 — O escopo no endereço do painel (R-D7)

- `Dashboard.tsx` lê `escopo=<tipo>:<id>` ao abrir. Quando os relatórios chegam, escolhe o escopo do endereço se ele
  existir no período, e senão escolhe o Geral, como hoje.
- Ao trocar o escopo no menu de visão, o endereço é atualizado (`replaceState`, como já acontece com o período).
  O Geral não aparece no endereço.
- O escopo "agente" não entra no endereço: a ficha do atendente continua fora dele, como ficou decidido no
  `PLANO_PRIMEIRO_USO.md`.

### E5 — Conteúdo do e-mail (`src/email/resumo-email.ts`)

- Função pura `montarEmailResumo({ pessoa, periodo, blocos, appUrl })` que devolve `{ assunto, html, texto }`.
- Cada bloco usa os números do relatório publicado e as funções do painel:
  - nota e status: `scoreStatus`;
  - ponto mais fraco e comparação: `pontoMaisFraco` e `textoComparacao` (`src/lib/resumo.ts`);
  - abaixo da meta: a contagem do `loadAuditedSessions`.

  Com isso, o número do e-mail é o mesmo da tela.
- Assunto: "Resumo da semana de 23 a 29/09" ou "Resumo de setembro", e com um escopo só, "… · Equipe Peças".
- HTML simples, de uma coluna, com estilos no próprio elemento (os programas de e-mail ignoram `<style>`). Cores e fonte
  seguem o `UI_REDESIGN.md`, até onde o e-mail permite. Leva também uma versão só texto.
- Relatório preliminar (menos de 10 conversas): o bloco avisa "Poucas conversas: números ainda instáveis".
- Rodapé: por que a pessoa recebe ("Você acompanha: Equipe Peças, Geral") e "Para deixar de receber, fale com o
  administrador do painel.".
- Vocabulário do `UI_REDESIGN.md` §8: sem "FLW", siglas ou nomes de modelo. Teste
  confere o texto de um e-mail montado com dados fixos e que nenhum termo proibido aparece.

### E6 — Envio (`src/email/smtp.ts`, `src/jobs/job-f-email-resumos.ts`)

- `smtp.ts`: cria o transporte do `nodemailer` a partir das variáveis de R-D10, com `pool` e limite de 1 envio por
  segundo, para não esbarrar no limite do provedor. Expõe `emailLigado()`.
- `runJobFEmailResumos({ granularity, periodStart, dryRun, para, reenviar })`:
  1. busca os relatórios publicados do período, menos os de atendente;
  2. busca os usuários ativos que acompanham algum escopo;
  3. para cada pessoa, junta os escopos com relatório e com conteúdo (R-D8) e pula quem já tem `summary_emails` com
     `status = enviado`, a menos que venha `--reenviar`;
  4. monta (E5), envia e grava o resultado. Erro de uma pessoa não para as outras;
  5. no fim, imprime "Enviados: N · Sem nada para mandar: N · Erros: N", com o e-mail e o motivo de cada erro.
- `--dry-run`: grava `reports/emails/<período>/<email>.html` e não envia nem grava no banco.
- Arquivos alcançados pelo job e pela tela importam sem `.js`, como os outros módulos compartilhados (o
  `tests/web-imports.test.ts` vigia).

### E7 — Comandos

- O `publishPeriod` (`src/cli.ts`) chama o job F no fim, **só com `--email`** (D-D3 do `PLANO_RESUMO_DIARIO.md`) e quando
  publicou de verdade (sem `--dry-run` e sem `--correct`). Com a flag e sem SMTP, imprime "Envio de e-mail desligado:
  configure SMTP_HOST" e o comando termina com código 1.
- `pnpm email:resumos -- --week 2026-09-23 | --month 2026-09 [--dry-run] [--para fulano@…] [--reenviar]`: reenvia
  ou testa um período já publicado. Roda com a trava dos outros jobs.
- `pnpm email:teste -- --para fulano@…`: um e-mail simples ("O envio de e-mail do painel está funcionando."). Mostra
  o erro do SMTP por extenso quando falha.

### E8 — Página técnica (`/status`)

- A página ganha um bloco "Resumos por e-mail" com os últimos períodos enviados (enviados e erros) e a lista de erros
  com o e-mail e o motivo. A página é só para administrador, então o texto técnico do SMTP pode aparecer.

### E9 — Documentação e desenvolvimento

- `.env.example`: as variáveis de R-D10, comentadas, com o exemplo do Mailpit.
- `docker-compose.yml`: serviço `mailpit` (SMTP na 1025 e página na 8025), só para desenvolvimento.
- `docs/COMANDOS.md`: `email:resumos` e `email:teste`.
- `docs/DEPLOY_EASYPANEL.md`: as variáveis, o teste com `email:teste`, o `APP_URL` com `https://` e um aviso de que o
  remetente precisa ser do domínio do SMTP, com SPF e DKIM configurados, senão os e-mails caem no spam.

### E10 — Verificação

- `pnpm test`: escopos (E2), conteúdo do e-mail (E5), escopo no endereço (E4) e o teste de acesso
  (`auth-guard.test.ts`), que continua cobrindo as ações alteradas.
- `pnpm web:build`.
- Com o Mailpit:
  - um usuário com Geral e Equipe Peças recebe um e-mail só, com dois blocos;
  - o botão leva ao login e, depois dele, ao painel em "Equipe Peças" na semana certa;
  - rodar de novo não duplica nada;
  - com `--reenviar`, manda de novo;
  - desativado não recebe;
  - um escopo vazio no período fica fora do e-mail.
- Na semana de 23/09, os números do e-mail são os mesmos do resumo do topo do painel (nota, diferença, ponto mais fraco
  e as 138 conversas abaixo da meta do Geral).
- `scratch/telas.mjs`: prints da seção "Resumos por e-mail" em 1280 e 390, e abrir `/?escopo=equipe:Peças` confere o
  título do escopo.
- Abrir o HTML do `--dry-run` no navegador em 390px de largura para ver como fica no celular.

### E11 — Servidor

1. Deploy da branch com o login por usuário e este plano. O container roda a migração `5_resumo_email`.
2. Variáveis de R-D10 no EasyPanel, com os dados de SMTP que o cliente fornecer, e `APP_URL`.
3. `pnpm email:teste -- --para <seu e-mail>`, conferindo se não caiu no spam.
4. Em `/usuarios`, marcar os escopos de cada pessoa.
5. `pnpm email:resumos -- --week <última semana> --para <seu e-mail>` para ver o e-mail de verdade.
6. Daí em diante, sai com o `publish:weekly -- --email` e o `publish:monthly -- --email` agendados (e o `daily -- --email`, do `PLANO_RESUMO_DIARIO.md`).

---

## 4. Riscos

- **Spam.** Sem SPF e DKIM no domínio do remetente, o e-mail cai na caixa de spam ou nem chega. Isso depende de quem
  administra o domínio, não do código. O E11 confere com `email:teste`.
- **Porta bloqueada.** Alguns servidores bloqueiam a saída SMTP, principalmente na porta 25. Use 587 (STARTTLS) ou 465
  (`SMTP_SECURE=true`). O `email:teste` mostra o erro por extenso.
- **Grupo renomeado.** O nome do grupo no `TEAM_GROUPS` é o `scope_id`. Renomear "Vendas" para "Comercial" faz as
  semanas novas saírem como "Comercial", e as assinaturas de "Vendas" ficam sem relatório. A tela de usuários mostra
  "(não existe mais)" (E3) e o job avisa no terminal. É preciso remarcar.
- **E-mail digitado errado.** O SMTP aceita e o e-mail volta depois para a caixa do remetente, não para o sistema. O
  sistema registra "enviado". Vale olhar a caixa do `EMAIL_FROM` nas primeiras semanas.
- **Relatório corrigido depois do envio.** O e-mail já saiu com o número antigo, e o `--correct` não reenvia (R-D5).
  Se precisar, `email:resumos --reenviar`.
- **Número diferente da tela.** O risco existe se o e-mail calcular por conta própria. E5 usa as mesmas funções e o E10
  confere os números na semana de 23/09.
- **Publicação mais lenta.** O envio entra no fim do `publish:*`. Com 1 e-mail por segundo, 50 pessoas somam menos de 1
  minuto.

---

## 5. Como saber que ficou pronto

- [x] O administrador marca os escopos de cada pessoa em `/usuarios` e vê "Recebe: …" na lista.
- [x] Ao publicar a semana ou o mês, cada pessoa ativa com escopo recebe **um** e-mail com um bloco por escopo.
- [x] Os números do e-mail são iguais aos do resumo do topo do painel.
- [x] "Abrir o resumo" pede login (se preciso) e abre o painel no escopo e no período do e-mail.
- [x] Rodar o envio de novo não duplica; quem deu erro recebe na nova rodada.
- [x] Desativado não recebe; escopo sem conteúdo no período fica fora.
- [x] Sem SMTP configurado, a publicação funciona e avisa que o envio está desligado.
- [x] Nenhum termo técnico no e-mail; legível no celular.
- [x] `pnpm test` e `pnpm web:build` passam.

---

O que o Mailpit e o `scratch/telas.mjs` conferiram em desenvolvimento: um e-mail por pessoa com um bloco por escopo; rodar de novo não duplica; `--reenviar` manda de novo; erro do servidor de e-mail fica registrado e a rodada seguinte refaz só ele; desativado não recebe; escopo que não existe mais avisa no terminal e na lista de usuários; o link abre o escopo certo e o endereço guarda o escopo; as 138 conversas abaixo da meta do Geral na semana de 23/09 batem com a tela. Ainda por conferir no servidor (E11): entrega de verdade, SPF/DKIM e o botão depois do login com o domínio público.

---

## 6. Fora desta entrega

- **Recuperar a senha por e-mail e mandar o convite por e-mail no cadastro.** Com o SMTP pronto, é o próximo passo
  natural: sai do `PLANO_USUARIOS.md` §6.
- **A ficha do próprio atendente no e-mail.** O vínculo do usuário guarda o id de cadastro do atendente na FLW, e o
  relatório do atendente usa outro id (o das conversas), então isso precisa de um mapeamento antes.
- Cada pessoa escolher os próprios resumos ou a frequência (só semanal ou só mensal).
- Link de descadastro e contagem de aberturas e cliques.
- Alertas fora do calendário (por exemplo, "a nota da equipe caiu").
- O relatório inteiro em PDF anexado.
