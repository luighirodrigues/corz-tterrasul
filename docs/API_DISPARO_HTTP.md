# API de disparo das rotinas do painel

Guia para quem vai agendar ou chamar as rotinas do painel de qualidade a partir de outro serviço (agendador, n8n,
GitHub Actions, script). Ele cobre os endereços, a autenticação, os campos de entrada e de resposta, e como saber se a
execução deu certo.

> Substitua `https://<domínio-do-painel>` pelo endereço do painel em produção. O token é passado à parte, por canal
> seguro, e nunca vai em código, URL ou print.

---

## 1. Visão geral

São três rotinas, cada uma num endereço. Todas usam **`GET`**.

| Endereço | O que faz | Comando equivalente no servidor |
|---|---|---|
| `/api/jobs/daily` | Traz da FLW as conversas e os negócios novos, recalcula os indicadores e analisa com IA as conversas encerradas que ainda não têm nota. Com `email`, manda o **resumo do dia**. | `pnpm daily` |
| `/api/jobs/weekly` | Publica o relatório da **última semana encerrada** (segunda a domingo). Com `email`, manda o **resumo semanal**. | `pnpm publish:weekly` |
| `/api/jobs/monthly` | Publica o relatório do **último mês encerrado** (dia 1 ao último dia). Com `email`, manda o **resumo mensal**. | `pnpm publish:monthly` |

E um endereço para acompanhar a execução:

| Endereço | O que faz |
|---|---|
| `/api/jobs/execucoes/{id}` | Mostra se a execução ainda está rodando, o código de saída e as últimas linhas do log. |

**Como funciona:** a chamada inicia a rotina no servidor e **responde na hora**, sem esperar o fim (o `daily` com IA
leva vários minutos). Ela devolve um `id`; o resultado final se consulta em `/api/jobs/execucoes/{id}`.

---

## 2. Autenticação

Toda chamada, inclusive a de acompanhamento, leva o token no cabeçalho:

```
Authorization: Bearer <JOBS_TOKEN>
```

- O token **só vale no cabeçalho**. Na URL (`?token=...`) ele não autentica: sem o cabeçalho a resposta é 401, e com
  o cabeçalho o `token` vira um parâmetro desconhecido (400).
- Sem o cabeçalho ou com o token errado: **401**.
- Se o servidor estiver sem token configurado: **503** ("Disparo por HTTP desligado").
- Para trocar o token (vazou ou alguém saiu da equipe), o responsável pelo servidor troca a variável `JOBS_TOKEN` e
  reinicia o serviço. O token antigo para de valer na hora.

---

## 3. Parâmetros (query string)

Os parâmetros são as opções do comando, sem os traços: `--email` vira `?email`, `--week 2026-10-05` vira
`?week=2026-10-05`. Vários se juntam com `&`.

### 3.1 Tipos de valor

| Tipo | Como passar | Exemplo |
|---|---|---|
| **Liga/desliga** | Sem valor, `=1` ou `=true` liga. `=0` ou `=false` deixa desligado (o mesmo que não passar). | `?email`, `?email=true`, `?email=false` |
| **Data** | `AAAA-MM-DD`, uma data que exista. | `?week=2026-10-05` |
| **Mês** | `AAAA-MM`, mês de 01 a 12. | `?month=2026-09` |
| **Texto** | Até 500 caracteres, codificado na URL (espaço vira `%20`). | `?reason=Sync%20atrasado` |

### 3.2 Parâmetros por endereço

| Parâmetro | Tipo | `daily` | `weekly` | `monthly` | O que faz |
|---|---|:---:|:---:|:---:|---|
| `email` | liga/desliga | ✔ | ✔ | ✔ | Manda o resumo por e-mail no fim (dia, semana ou mês), para quem marcou aquela frequência na tela **Usuários**. Sem ele, **nenhum e-mail sai**. Quem já recebeu o resumo daquele período não recebe de novo. |
| `week` | data | | ✔ | | Publica a semana que contém essa data, em vez da última encerrada. Qualquer dia da semana serve: `week=2026-10-09` (uma sexta) publica de 05/10 a 11/10. |
| `month` | mês | | ✔ | | Publica um mês específico do calendário. É o jeito de publicar um mês que não seja o último encerrado, porque o `monthly` sempre usa o último encerrado. Não pode vir junto com `week`. |
| `dry-run` | liga/desliga | | ✔ | ✔ | Ensaio: não grava nada e não manda e-mail. Gera rascunhos no servidor. **Ainda chama a IA** (tem custo). |
| `allow-incomplete` | liga/desliga | | ✔ | ✔ | Publica mesmo com a trava de publicação falhando (§6); as falhas aparecem no relatório. **Evite**: o relatório pode sair sem parte das conversas. |
| `correct` | liga/desliga | | ✔ | ✔ | Refaz um relatório **já publicado**, guardando a versão anterior. Exige `reason`. Nunca manda e-mail. |
| `reason` | texto | | ✔ | ✔ | O motivo da correção, que aparece na tela. Só tem efeito junto com `correct`. |

### 3.3 Regras de validação

A chamada é **recusada com 400, sem rodar nada**, quando:

- vem um parâmetro que o endereço não aceita (por exemplo `?emial`, ou `week` no `monthly`);
- um valor está fora do formato (data inexistente, mês `2026-9`, liga/desliga com `=talvez`);
- um parâmetro aparece duas vezes (`?email&email=0`);
- `week` e `month` vêm juntos;
- `correct` vem sem `reason`, ou `reason` vem vazio ou com mais de 500 caracteres.

A resposta 400 lista os parâmetros aceitos no campo `aceitas`.

---

## 4. Respostas

Todas as respostas são JSON, com `Cache-Control: no-store`. Datas e horas vêm em ISO 8601, **em UTC** (`...Z`).

### 4.1 Disparo iniciado — `202 Accepted`

```json
{
  "id": "a1b2c3",
  "comando": "pnpm daily -- --email",
  "status": "rodando",
  "inicio": "2026-10-09T21:00:00.000Z",
  "acompanhar": "/api/jobs/execucoes/a1b2c3"
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | Identificador da execução, com 6 caracteres. Use no acompanhamento. |
| `comando` | string | O comando que está rodando no servidor, para conferência. |
| `status` | string | Quase sempre `rodando`. Pode vir `concluido` se a rotina terminou em menos de 2 segundos. |
| `inicio` | string | Quando começou (UTC). |
| `acompanhar` | string | Caminho do acompanhamento: junte com o domínio. |

**202 quer dizer que começou, não que deu certo.** O resultado está no acompanhamento (§4.2).

### 4.2 Acompanhamento — `GET /api/jobs/execucoes/{id}` → `200 OK`

```json
{
  "id": "a1b2c3",
  "comando": "pnpm daily -- --email",
  "status": "concluido",
  "codigo": 0,
  "inicio": "2026-10-09T21:00:00.000Z",
  "fim": "2026-10-09T21:06:12.000Z",
  "saida": [
    "=== ROTINA DIÁRIA: SYNC INCREMENTAL + IA ESTÁGIO 1 ===",
    "..."
  ]
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | O mesmo do disparo. |
| `comando` | string | O comando que rodou. |
| `status` | string | `rodando`, `concluido` (terminou com sucesso) ou `erro`. |
| `codigo` | number ou null | Código de saída: `0` é sucesso; qualquer outro número é erro. `null` enquanto roda. |
| `inicio` | string | Quando começou (UTC). |
| `fim` | string ou null | Quando terminou (UTC); `null` enquanto roda. |
| `saida` | string[] | As últimas 300 linhas do log, na ordem. Em caso de erro, o motivo está nas últimas linhas. |

`status: "erro"` com `codigo: 1` aparece também quando a rotina fez todo o trabalho mas o **envio de e-mail falhou**
(servidor de e-mail fora, por exemplo). O log diz qual foi o caso.

Se o id não existe, a resposta é **404** ("Execução não encontrada (o servidor pode ter reiniciado)"). O servidor
guarda só as **20 últimas execuções**, e a lista é zerada quando o serviço reinicia ou recebe um deploy.

### 4.3 Erros

Em todos os erros, o motivo vem no campo `error`.

| Código | Quando | Corpo |
|---|---|---|
| **400** | Parâmetro desconhecido ou valor errado (§3.3). Nada rodou. | `{ "error": "...", "aceitas": ["email"] }` |
| **401** | Sem o cabeçalho `Authorization` ou com token errado. Vem com `WWW-Authenticate: Bearer`. | `{ "error": "Token ausente ou inválido." }` |
| **404** | Execução não encontrada (só no acompanhamento). | `{ "error": "Execução não encontrada (o servidor pode ter reiniciado)." }` |
| **405** | Método diferente de `GET`, inclusive `HEAD`. Vem com `Allow: GET`. | `{ "error": "Use GET." }` |
| **409** | Já tem uma rotina rodando, disparada por aqui ou pelo terminal do servidor. Nada novo rodou. | `{ "error": "Outro comando já está em andamento. Aguarde ele terminar." }` |
| **500** | A rotina começou e falhou nos primeiros 2 segundos. O corpo traz os campos do acompanhamento (§4.2) para ver o motivo. | `{ "error": "O comando falhou logo ao começar.", "id": "...", "status": "erro", "codigo": 1, "saida": [...] , ... }` |
| **503** | Disparo desligado (token não configurado no servidor), token do servidor curto demais ou banco fora do ar. | `{ "error": "Disparo por HTTP desligado: configure JOBS_TOKEN." }` |

---

## 5. Exemplos

### 5.1 curl

```bash
TOKEN="<JOBS_TOKEN>"
BASE="https://<domínio-do-painel>"

# Rotina diária, sem e-mail (madrugada)
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/jobs/daily"

# Rotina diária com o resumo do dia (fim da tarde)
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/jobs/daily?email"

# Publica a última semana encerrada e manda o resumo semanal
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/jobs/weekly?email"

# Publica o último mês encerrado e manda o resumo mensal
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/jobs/monthly?email"

# Publica uma semana específica, sem e-mail
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/jobs/weekly?week=2026-10-05"

# Publica um mês específico (setembro de 2026), sem e-mail
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/jobs/weekly?month=2026-09"

# Corrige o último mês publicado
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/jobs/monthly?correct&reason=Sync%20atrasado"

# Acompanha uma execução
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/jobs/execucoes/a1b2c3"
```

### 5.2 Disparar e esperar o resultado (bash + jq)

Para agendadores que precisam saber se deu certo, por exemplo um job de CI que deve falhar quando a rotina falhar:

```bash
#!/usr/bin/env bash
set -euo pipefail
TOKEN="$JOBS_TOKEN"
BASE="https://<domínio-do-painel>"
ROTA="${1:-daily?email}"   # ex.: "daily", "daily?email", "weekly?email", "monthly?email"

resp=$(curl -sS -w '\n%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE/api/jobs/$ROTA")
http=$(tail -n1 <<<"$resp"); body=$(sed '$d' <<<"$resp")
if [ "$http" != "202" ]; then echo "Disparo recusado ($http): $body"; exit 1; fi

id=$(jq -r .id <<<"$body")
while :; do
  sleep 30
  exec=$(curl -sS -H "Authorization: Bearer $TOKEN" "$BASE/api/jobs/execucoes/$id")
  status=$(jq -r .status <<<"$exec")
  [ "$status" = "rodando" ] || break
done

jq -r '.saida[-20:][]' <<<"$exec"   # últimas linhas do log
[ "$status" = "concluido" ] || { echo "Terminou com erro (código $(jq -r .codigo <<<"$exec"))"; exit 1; }
echo "Concluído."
```

### 5.3 n8n (nó HTTP Request) ou outro agendador

| Campo | Valor |
|---|---|
| Method | `GET` |
| URL | `https://<domínio-do-painel>/api/jobs/daily?email` (ou outro endereço e parâmetros) |
| Authentication | Header Auth: nome `Authorization`, valor `Bearer <JOBS_TOKEN>` (guarde como credencial, não no texto do nó) |
| Timeout | 30 s é suficiente: a resposta volta em até uns 2 segundos |
| Retry | Repetir em **409** depois de 10 a 15 minutos; **não** repetir em 400 e 401 |

---

## 6. Agendamento recomendado

Horários de Brasília. Ajuste se o agendador estiver em UTC (por exemplo, 05:00 de Brasília = 08:00 UTC).

| Quando | Chamada | Por quê |
|---|---|---|
| Todo dia, **05:00** | `/api/jobs/daily` | Completa o dia anterior. |
| Todo dia, **18:00** | `/api/jobs/daily?email` | Atualiza e manda o resumo do dia (hoje até a hora do sync). |
| Toda **segunda, 08:00** | `/api/jobs/weekly?email` | A semana fecha no domingo à meia-noite; publica depois do `daily` das 05:00. |
| Todo **dia 2, 08:00** | `/api/jobs/monthly?email` | Publica o mês que acabou de fechar, depois do `daily`. |

Cuidados:

- **Ordem:** o `weekly` e o `monthly` precisam rodar **depois** de um `daily` concluído no mesmo dia. A publicação tem
  uma trava: ela só sai se a semana ou o mês já fechou, se o sync terminou depois do fim do período e se todas as
  conversas encerradas do período já têm nota da IA. Sem isso, a execução termina com `status: "erro"` e o log mostra
  "Publicação bloqueada" com a lista do que falta. A solução é rodar o `daily` e disparar de novo.
- **Uma rotina por vez:** se o `daily` ainda estiver rodando na hora do `weekly`, a resposta é 409. Deixe intervalo
  entre os horários ou repita depois de alguns minutos.
- **Um agendador só:** se o servidor também tiver cron para essas rotinas, desligue um dos dois; senão, cada rotina
  roda duas vezes.
- **Repetir é seguro:** chamar de novo o `weekly` ou o `monthly` de um período já publicado não duplica nada (o que já
  existe é mantido), e o `email` não reenvia para quem já recebeu.
- **Deploy:** um deploy ou reinício do servidor interrompe a rotina que estiver rodando. Evite deploy nos horários
  agendados.

---

## 7. Resumo rápido

```
GET https://<domínio-do-painel>/api/jobs/{daily|weekly|monthly}?<parâmetros>
Authorization: Bearer <JOBS_TOKEN>

→ 202 { id, comando, status, inicio, acompanhar }

GET https://<domínio-do-painel>/api/jobs/execucoes/{id}
Authorization: Bearer <JOBS_TOKEN>

→ 200 { id, comando, status: rodando|concluido|erro, codigo, inicio, fim, saida[] }
```

Detalhes de cada rotina e da operação do servidor: `docs/COMANDOS.md` (§2 e §8) e `docs/DEPLOY_EASYPANEL.md`.
