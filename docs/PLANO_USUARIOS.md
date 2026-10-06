# Usuários e acesso — plano de implementação

**Objetivo:** cada pessoa entra no painel com o próprio e-mail e a própria senha, e um administrador cadastra,
desativa e reativa usuários pela tela. Todo usuário continua vendo os dados de todos os atendentes.

**Origem:** pedido de 06/10/2026: trocar o usuário e senha únicos (Basic Auth) por vários usuários, com um
administrador. Não é multiempresa: um painel só, com uma lista de quem tem acesso.

**Status:** decisões da §2 confirmadas em 06/10/2026 (A-D4 mudou de "excluir" para **desativar**). **A1 a A11 implementadas em 06/10/2026**
na branch `usuarios`, sem commit e sem push. Falta só A12 (o servidor).

**Ordem:** A1 a A3 montam a base (banco, senha e sessão) sem mudar a tela. A4 a A7 trocam o Basic Auth pelo login. A8
é a tela de usuários, A9 e A10 são o terminal e o ambiente de desenvolvimento, A11 é a verificação e A12 é o servidor.
Cada etapa termina com `pnpm test` e `pnpm web:build`.

**O que não muda:** o que cada pessoa vê, os jobs, os relatórios e o estilo do `docs/UI_REDESIGN.md`.

---

## 1. Como é hoje

- `src/proxy.ts` pede um usuário e uma senha únicos em toda rota (tela e `/api`), pela janela do próprio navegador
  (Basic Auth), e compara com `REPORT_BASIC_AUTH_USER`/`REPORT_BASIC_AUTH_PASS`. Sem as variáveis, libera tudo em
  desenvolvimento e responde 503 em produção.
- Não existe "Sair": o navegador guarda a senha até ser fechado. Trocar a senha é trocar a variável no EasyPanel e
  reiniciar, e todo mundo perde o acesso ao mesmo tempo.
- Não dá para saber quem entrou nem quando.
- As rotas de `src/app/api/**` não checam nada e confiam no proxy.
- `/status` e `/api/pipeline` mostram os erros dos jobs a qualquer um que tenha a senha. O painel chama
  `/api/pipeline` só para montar o "Atualizado…" (`page.tsx:135`).
- O banco já tem um modelo `Session`, que são as **conversas** da FLW. A sessão de login precisa de outro nome.
- `Agent` (atendentes vindos da FLW) tem e-mail, mas não serve como cadastro de acesso: é sobrescrito pelo sync, nem
  todo atendente vai ter acesso e um gestor pode não ser atendente.

---

## 2. Decisões (confirmadas em 06/10/2026)

| # | Tema | Decisão |
|---|---|---|
| A-D1 | Perfis | **Administrador**: vê o painel, cadastra, edita, desativa e reativa usuários e vê a página técnica (`/status`). **Usuário**: vê o painel inteiro, com os dados de todos os atendentes. Pode haver mais de um administrador. |
| A-D2 | Como entra | E-mail e senha. O e-mail é único e não diferencia maiúsculas. Descartado: nome de usuário, que é mais uma coisa para a pessoa lembrar. |
| A-D3 | Primeira senha e senha esquecida | O administrador cadastra e o sistema gera uma **senha provisória**, mostrada uma única vez para ele copiar e mandar à pessoa. No primeiro acesso, a pessoa é obrigada a criar a própria senha. Se esquecer, o administrador gera outra provisória. Descartado: link por e-mail, porque o sistema não envia e-mail hoje (precisaria de um serviço de envio e de configurar o domínio). |
| A-D4 | Desativar | No lugar de excluir: o usuário continua cadastrado, mas perde o acesso na hora. Desativado, ele aparece numa seção separada da lista e pode ser reativado com a mesma senha que tinha. Se a pessoa não lembrar a senha, o administrador gera uma provisória. Ninguém desativa a si mesmo, e o último administrador ativo não pode ser desativado nem virar usuário comum. O e-mail continua ocupado: cadastrar de novo um e-mail desativado oferece "Reativar". Excluir de vez fica fora desta entrega (§6). |
| A-D5 | Sessão | Fica no banco (`user_sessions`). O cookie leva só um código aleatório, e o banco guarda o hash dele. Assim, desativar o usuário, gerar senha provisória ou trocar a senha derruba o acesso na hora, e não há segredo novo para configurar no servidor. Descartado: token assinado (JWT), que continuaria valendo até vencer, e bibliotecas prontas (Auth.js, Better Auth), que criam tabelas próprias (uma delas `session`, o mesmo nome das conversas) para um caso que cabe em poucos arquivos. |
| A-D6 | Tempo conectado | Até 30 dias sem usar, e cada uso renova o prazo (com no máximo uma gravação por dia). Quem abre o relatório uma vez por semana não precisa digitar a senha toda vez. |
| A-D7 | Regras da senha | Mínimo de 8 caracteres e diferente do e-mail, sem exigir maiúscula ou símbolo. Guardada com `scrypt`, que já vem no Node, sem dependência nova. |
| A-D8 | Tentativas erradas | 5 erros seguidos no mesmo e-mail bloqueiam a entrada por 15 minutos. A mensagem é sempre "E-mail ou senha incorretos.", sem dizer se o e-mail existe. Gerar uma senha provisória desbloqueia. |
| A-D9 | Página técnica | `/status` e `/api/pipeline` ficam só para administrador. O "Atualizado…" do painel deixa de depender de `/api/pipeline` (A5). |
| A-D10 | Vínculo com o atendente | Campo opcional "Atendente" no cadastro, com a lista de atendentes da FLW. Um atendente fica vinculado a um usuário só. Não muda nada na tela agora. Deixa pronto para, no futuro, abrir o painel na ficha da própria pessoa ou limitar o que ela vê, sem recadastrar ninguém. |
| A-D11 | Primeiro administrador | Comando no terminal do EasyPanel: `pnpm user:admin -- --email … --nome "…"`. Cria (ou promove) o administrador e imprime a senha provisória. Serve também para recuperar o acesso se nenhum administrador conseguir entrar. Descartado: e-mail e senha do administrador em variável de ambiente, que deixa a senha aberta no EasyPanel e cria dúvida sobre qual vale, a do banco ou a da variável. |
| A-D12 | Basic Auth | Sai por inteiro, com as variáveis `REPORT_BASIC_AUTH_*`. Em desenvolvimento o login também é exigido: não existe atalho que pule o login, para ele não chegar aberto à produção por engano. |
| A-D13 | Onde fica na tela | Botão redondo com as iniciais à direita do cabeçalho, ao lado do período. Abre um menu com nome, e-mail, "Trocar senha", "Usuários" (só administrador) e "Sair". O cadastro fica em `/usuarios`. |

---

## 3. Etapas

### A1 — Banco (migração `4_usuarios`)

```prisma
// Quem tem acesso ao painel. Sem tenant: o painel é um só (não é multiempresa).
model User {
  id                 String    @id @default(uuid())
  email              String    @unique // sempre em minúsculas
  name               String
  role               String    @default("usuario") // admin | usuario
  passwordHash       String    @map("password_hash")
  mustChangePassword Boolean   @default(true) @map("must_change_password") // senha provisória
  agentExternalId    String?   @unique @map("agent_external_id") // atendente na FLW (A-D10), sem efeito na tela
  deactivatedAt      DateTime? @map("deactivated_at") // preenchido = desativado (A-D4)
  failedLogins       Int       @default(0) @map("failed_logins")
  lockedUntil        DateTime? @map("locked_until")
  lastSeenAt         DateTime? @map("last_seen_at")
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  sessions UserSession[]

  @@map("users")
}

// Sessão de login. Não confundir com `Session`, que são as conversas da FLW.
model UserSession {
  id         String   @id @default(uuid())
  userId     String   @map("user_id")
  tokenHash  String   @unique @map("token_hash") // SHA-256 do código guardado no cookie
  expiresAt  DateTime @map("expires_at")
  lastSeenAt DateTime @default(now()) @map("last_seen_at")
  createdAt  DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("user_sessions")
}
```

- `migration.sql` e `down.sql`, no formato das migrações `2_equipes` e `3_periodos`.
- `agentExternalId` é único, mas aceita vários vazios (no Postgres, `NULL` não conta para o `UNIQUE`).
- O usuário nunca é apagado pela tela. O `onDelete: Cascade` só serve para quem apagar uma linha direto no banco.

### A2 — Senha (`src/auth/password.ts`)

- `hashPassword` e `verifyPassword` com `crypto.scrypt`: sal aleatório por senha, gravado como
  `scrypt$N$r$p$sal$hash` para dar para aumentar o custo depois sem invalidar as senhas antigas. A comparação usa
  `timingSafeEqual`.
- `generateTemporaryPassword()`: 10 caracteres de um alfabeto sem letras e números que se confundem (0/O, 1/l/I), fácil
  de ditar ou copiar.
- `validateNewPassword(senha, email)`: aplica A-D7 e devolve a mensagem em português.
- São funções puras, com teste.

### A3 — Sessão e checagem de acesso (`src/auth/session.ts`, `src/auth/dal.ts`, `src/auth/rules.ts`)

- `createSession(userId)`: 32 bytes aleatórios em base64url no cookie `sessao` (`httpOnly`, `sameSite: "lax"`,
  `path: "/"`, `secure` em produção, validade de 30 dias). O banco guarda só o SHA-256.
- `getCurrentUser()`, com `cache()` do React para fazer uma consulta por requisição: lê o cookie, busca pelo hash e
  recusa sessão vencida ou de usuário desativado. Desativar já apaga as sessões, então essa checagem é uma garantia a
  mais. Renova `expiresAt` e o `lastSeenAt` (da sessão e do usuário) no máximo uma vez por dia.
- `requireUser()` e `requireAdmin()`, para páginas e ações de servidor:
  - sem sessão: `redirect("/login?volta=…")`;
  - com senha provisória: `redirect("/trocar-senha")`;
  - usuário comum em página de administrador: volta para `/`.
- `authorizeApi(perfil?)`, para as rotas da API: devolve o usuário ou a resposta pronta (401 sem sessão ou com senha
  provisória, 403 sem o perfil pedido).
- `endSession()` e `endAllSessions(userId, exceto?)`.
- `src/auth/rules.ts` (puro, com teste): ninguém desativa a si mesmo, e o último administrador **ativo** não pode ser
  desativado nem rebaixado. Na conta de administradores entram só os ativos.
- Os arquivos de sessão começam com `import "server-only"` (no Next 16 o pacote é opcional).

### A4 — Proxy (`src/proxy.ts`)

O Basic Auth sai, e entra a checagem rápida que o guia do Next recomenda: o proxy roda em toda requisição, inclusive
nas de pré-carregamento, então só olha se o cookie existe e não consulta o banco.

- Livres: `/login`, `/_next/*` e `favicon.ico`.
- Sem o cookie `sessao`: `/api/*` responde 401 em JSON, e as páginas vão para `/login?volta=<caminho>`.
- Com o cookie: segue. Quem valida a sessão de verdade é A3, em cada página, rota e ação.

### A5 — Toda página, rota e ação checa o acesso

- As 7 rotas de `src/app/api/**` começam com `authorizeApi()`. `/api/pipeline` usa `authorizeApi("admin")`.
- `src/app/page.tsx` vira componente de servidor: chama `requireUser()`, busca o horário do último sync (a mesma
  consulta de `live-loader.ts:44`) e renderiza o painel, que vai sem mudança de comportamento para
  `src/components/Dashboard.tsx`. O "Atualizado…" passa a vir daí, e o painel para de chamar `/api/pipeline`.
- `src/app/status/page.tsx` fica no mesmo formato, com `requireAdmin()`.
- No painel, uma resposta 401 leva para `/login` (usuário desativado ou sessão vencida durante o uso). Isso fica num
  helper só (`src/lib/api.ts`), usado pelos 9 `fetch` de `page.tsx`, `ConversationsList.tsx` e `WeeksOfMonthBlock.tsx`.
- Teste novo, `tests/auth-guard.test.ts`, no formato do `web-imports.test.ts`:
  - toda `route.ts` de `src/app/api` chama `authorizeApi`;
  - toda `page.tsx` fora de `/login` chama `requireUser` ou `requireAdmin`;
  - toda função exportada de um arquivo `"use server"` chama `requireUser` ou `requireAdmin`, exceto `entrar`, porque
    uma ação de servidor é um endereço público.

  Uma rota nova sem checagem quebra o teste.

### A6 — Entrar (`/login`)

- Página simples, no estilo do painel: marca, "Entrar", e-mail, senha (com botão para mostrar) e o botão "Entrar".
  Funciona no celular.
- Ação de servidor `entrar`:
  - o e-mail vai para minúsculas e sem espaços;
  - e-mail inexistente também passa por `verifyPassword` (com um hash falso), para o tempo de resposta não revelar quem
    tem cadastro;
  - erro: "E-mail ou senha incorretos."; bloqueado: "Muitas tentativas. Tente de novo em 15 minutos.";
  - desativado: com a senha certa, "Seu acesso está desativado. Fale com o administrador."; com a senha errada, a
    mensagem de erro de sempre, para não revelar o cadastro a quem não sabe a senha;
  - acerto: zera o contador, cria a sessão e vai para `volta` (só caminho interno, começando com `/` e sem `//`) ou
    para `/`.
- Quem já está conectado e abre `/login` vai direto para `/`.

### A7 — Trocar senha e Sair

- `/trocar-senha` serve ao primeiro acesso (obrigatório, sem pedir a senha atual, que acabou de ser digitada) e a quem
  quer trocar (pede a senha atual). Campos: nova senha e confirmação, com as regras de A2. Ao salvar, a senha deixa de
  ser provisória e as outras sessões da pessoa são encerradas.
- Menu do usuário no `AppHeader.tsx` (A-D13), no mesmo padrão do menu de período: Esc fecha e o foco fica visível.
- "Sair" é uma ação de servidor que apaga a sessão no banco e o cookie, e vai para `/login`.

### A8 — Tela de usuários (`/usuarios`, só administrador)

- Lista dos ativos com nome, e-mail, perfil, atendente vinculado (se houver) e último acesso ("Hoje", "Há 3 dias",
  "Nunca entrou"). Mostra "Bloqueado por tentativas" quando for o caso.
- Abaixo, a seção "Desativados (N)", fechada por padrão, com nome, e-mail e a data em que foi desativado. Sem
  desativados, a seção não aparece.
- "Adicionar usuário": nome, e-mail, perfil (Usuário ou Administrador) e atendente (opcional, com os atendentes ativos
  que ainda não têm usuário). Ao salvar, mostra a senha provisória **uma vez**, com o botão "Copiar" e um texto pronto
  para mandar: "Acesse <endereço> com o seu e-mail e a senha provisória XXXX. No primeiro acesso você cria a sua senha."
- Menu de cada linha ativa:
  - "Editar": nome, e-mail, perfil e atendente;
  - "Gerar nova senha provisória": encerra as sessões da pessoa e desbloqueia;
  - "Desativar": pede confirmação ("Desativar Fulano? O acesso é encerrado na hora, e dá para reativar depois.").
    Apaga as sessões e preenche `deactivatedAt`.
- Linha desativada: "Reativar", que limpa `deactivatedAt` e mantém a senha. A pessoa volta a entrar com a senha que
  tinha. Se não lembrar, o administrador usa "Gerar nova senha provisória".
- Quando a regra de A3 impede uma ação (a si mesmo ou ao último administrador ativo), o motivo aparece no lugar da
  opção.
- E-mail repetido de um usuário ativo: "Já existe um usuário com este e-mail." De um desativado: "Este e-mail é de
  Fulano, que está desativado.", com o botão "Reativar".
- Atendente já vinculado a outro usuário: não aparece na lista de escolha. Se a escolha for feita ao mesmo tempo em
  dois cadastros, o segundo recebe "Este atendente já está vinculado a Fulano." (garantido pelo `@unique`). O
  vínculo de um desativado continua ocupado, para valer de novo se ele for reativado.
- As ações ficam em `src/app/usuarios/actions.ts`. Cada uma começa com `requireAdmin()`, valida a entrada com `zod`
  (já está no projeto) e termina com `revalidatePath("/usuarios")`.

### A9 — Comando `pnpm user:admin`

- `pnpm user:admin -- --email ana@empresa.com.br --nome "Ana"` cria o administrador. Se o e-mail já existe, torna-o
  administrador, reativa (se estiver desativado), gera uma nova senha provisória, desbloqueia e encerra as sessões.
  Imprime a senha provisória.
- `--senha <senha>` grava uma senha definitiva, sem troca obrigatória. É para o ambiente de desenvolvimento e para os
  prints de A10.
- Entra no `switch` de `src/cli.ts` e no `package.json`, como os outros comandos.

### A10 — Documentação, desenvolvimento e prints

- `.env.example`, `docs/COMANDOS.md`, `docs/DEPLOY_EASYPANEL.md` e o comentário do `Dockerfile`: sai o Basic Auth e
  entra o `pnpm user:admin`.
- `scratch/telas.mjs`: entra pelo `/login` antes dos prints (com `TELAS_EMAIL` e `TELAS_SENHA`) e passa a tirar prints
  também de `/login`, `/trocar-senha` e `/usuarios`.
- `tests/web-imports.test.ts`: entram na lista as páginas e as ações novas.

### A11 — Verificação

- `pnpm test` (senha, regras de administrador e o teste de A5) e `pnpm web:build`.
- Sem cookie: `/api/sessions` responde 401 e `/` vai para `/login?volta=/`.
- Usuário comum: `/api/pipeline` responde 403 e `/status` e `/usuarios` voltam para `/`.
- O usuário desativado durante o uso cai no login na próxima ação e, ao tentar entrar, vê o aviso de acesso
  desativado. Reativado, ele entra com a senha que tinha. Depois de gerar uma senha provisória, o outro navegador da
  pessoa também cai no login.
- Vincular o mesmo atendente a dois usuários é recusado, inclusive quando o primeiro está desativado.
- Prints em 1280 e 390: o cabeçalho com o botão do usuário continua com até 110px no celular.

### A12 — Servidor

1. Deploy. O container roda `prisma migrate deploy`, que cria `users` e `user_sessions`.
2. No terminal do EasyPanel: `pnpm user:admin -- --email … --nome "…"`.
3. Entrar com a senha provisória, criar a senha definitiva e cadastrar os demais.
4. Apagar `REPORT_BASIC_AUTH_USER` e `REPORT_BASIC_AUTH_PASS` do EasyPanel.

Entre o passo 1 e o 2, a tela mostra o login e ninguém consegue entrar, então os dados não ficam expostos em nenhum
momento.

---

## 4. Riscos

- **Ação de servidor atrás do proxy do EasyPanel.** O Next recusa uma ação de servidor quando a origem do navegador não
  bate com o host que chega ao app (`x-forwarded-host` ou `host`). Se o login funcionar no desenvolvimento e falhar no
  servidor, a correção é pôr o domínio em `experimental.serverActions.allowedOrigins` no `next.config.mjs`. Conferir
  no passo 3 de A12.
- **Acesso sem HTTPS.** Em produção o cookie é `secure`: quem abrir pelo IP com `http://` não fica conectado. O acesso
  é só pelo domínio com HTTPS, como o `DEPLOY_EASYPANEL.md` já orienta.
- **Rota nova sem checagem.** O proxy só verifica se o cookie existe, e quem valida a sessão é a rota. O teste de A5
  pega a rota que esquecer a checagem.
- **Senha provisória pelo WhatsApp.** Fica no histórico da conversa, mas só vale até o primeiro acesso, quando a troca
  é obrigatória.
- **`page.tsx` vira componente de servidor (A5).** O painel muda de arquivo. Mover o código sem mexer no comportamento
  e repetir os prints do `PLANO_PRIMEIRO_USO.md` (U16) reduz o risco.
- **Nenhum administrador consegue entrar.** Resolve com `pnpm user:admin` no terminal (A9).

---

## 5. Como saber que ficou pronto

- [ ] Sem estar conectado, nenhuma tela nem rota da API devolve dados.
- [ ] O administrador cadastra uma pessoa, copia a senha provisória, e a pessoa entra e é obrigada a criar a própria senha.
- [ ] O usuário comum vê o painel inteiro, com os dados de todos os atendentes, e não vê "Usuários" nem a página técnica.
- [ ] Desativar ou gerar senha provisória derruba o acesso da pessoa na próxima ação.
- [ ] O desativado aparece em "Desativados" e, reativado, volta a entrar com a mesma senha.
- [ ] Não dá para desativar a si mesmo nem ficar sem administrador ativo.
- [ ] Um atendente fica vinculado a um usuário só.
- [ ] 5 senhas erradas seguidas bloqueiam por 15 minutos, e a mensagem não diz se o e-mail existe.
- [ ] "Sair" funciona, e quem não sai continua conectado por 30 dias de uso.
- [ ] Login, troca de senha e cadastro funcionam em 390px, sem termo técnico na tela.
- [ ] `REPORT_BASIC_AUTH_*` não aparece mais no código nem na documentação.
- [ ] `pnpm test` e `pnpm web:build` passam.

---

## 6. Fora desta entrega

- Limitar o que cada pessoa vê (por exemplo, o atendente só ver a própria ficha). O vínculo de A-D10 e a checagem
  centralizada de A3 deixam o caminho pronto.
- Recuperar a senha por e-mail, que precisa de um serviço de envio.
- Entrar com conta Google ou Microsoft.
- Verificação em duas etapas.
- Histórico de acessos (quem viu o quê). Nesta entrega fica só o último acesso.
- Excluir de vez, por exemplo num pedido de remoção de dados pessoais. Até lá, apagar a linha em `users` direto no
  banco também apaga as sessões.
- Cadastrar em lote a partir dos atendentes da FLW.

---

## 7. O que ficou diferente do plano

**Na implementação:**

- **Volta depois do login (A3, A4).** O proxy repassa o endereço pedido no cabeçalho `x-volta`, e o `requireUser`
  usa esse cabeçalho para montar o `/login?volta=…` quando a sessão não vale mais.
- **Prazo do cookie (A4).** Além da renovação no banco (no máximo uma por dia, em `getCurrentUser`), o proxy renova o
  prazo do cookie a cada página aberta. As ações de servidor ficam de fora, para não brigar com o cookie que "Sair"
  apaga.
- **"Sair" (A7).** A ação fica em `src/app/trocar-senha/actions.ts`, usada pelo menu da conta e pelo botão "Sair" da
  tela de primeiro acesso.
- **Senha provisória para si mesmo (A8).** O administrador não gera senha provisória para a própria conta: a opção
  mostra "use «Trocar senha» no menu da sua conta".
- **Lista de atendentes (A8).** Mostra os atendentes ativos e também os inativos que já estão vinculados a alguém, para a
  edição não perder o vínculo.

**Depois da validação de 06/10/2026:**

- **Tentativas simultâneas (A6, A-D8).** O app checava o bloqueio, conferia a senha e só depois contava o erro: 30
  pedidos ao mesmo tempo tiveram as 30 senhas conferidas. Agora cada pedido gasta a tentativa **antes** de conferir a
  senha, numa instrução só no banco (`gastarTentativa`, em `src/app/login/actions.ts`). A 5ª tentativa já deixa o e-mail
  bloqueado: se ela acertar a senha, o acerto desbloqueia; se errar, aparece "Muitas tentativas". Um bloqueio vencido
  recomeça a conta. Senha certa zera a conta, até para quem está desativado.
- **Caminho de volta (A6).** `caminhoSeguro` aceitava `/<tab>/outro.site`, que o navegador transforma em
  `//outro.site`. Agora recusa barra invertida e caractere de controle em qualquer posição e confere se o endereço
  resolvido continua no painel. Os casos novos estão em `tests/auth-rules.test.ts`.
- **"Gerar nova senha provisória" (A8)** pede confirmação antes, porque derruba o acesso da pessoa na hora.
- **Reativar pelo cadastro (A8).** O "Reativar" que aparece ao cadastrar o e-mail de alguém desativado abria a janela
  de senha provisória sem senha. Agora fecha a janela e mostra "Acesso de Fulano reativado. A senha continua a mesma de
  antes.", o mesmo aviso do "Reativar" da seção Desativados. Na edição, a opção de reativar outra pessoa não aparece,
  porque fecharia a janela sem salvar o que foi editado.
- **Vocabulário.** A dica do campo Atendente dizia "FLW". Agora diz "Liga esta pessoa à ficha dela na aba
  Atendentes.", e o `scratch/telas.mjs` passou a recusar "FLW" na tela.

**Ficou como está:** "Muitas tentativas" só aparece para e-mail cadastrado, então quem erra 5 vezes descobre que o
e-mail existe. É a troca que A-D8 e A6 já faziam: avisar a pessoa bloqueada pesa mais que esconder o cadastro.
