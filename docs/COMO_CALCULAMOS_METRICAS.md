# Como calculamos as métricas

Este documento explica de onde vêm os números do painel. São duas partes independentes:

1. **Indicadores sintéticos** (tempos, % sem resposta, fechamento, retomadas): só conta, **sem IA**.
2. **Nota de qualidade** (o anel e os 5 critérios): feita pela **IA**, uma conversa por vez, e depois agregada por conta.

Código de referência: `src/jobs/job-c-synthetics.ts`, `src/domain/session-metrics.ts`, `src/domain/message-kind.ts`, `src/domain/lost-reasons.ts`, `src/domain/stage1.ts`, `src/domain/aggregate.ts`, `src/domain/stage2.ts`.

---

## 1. Parte sintética (sem IA)

### Quem falou na conversa

Antes de qualquer conta, cada mensagem é classificada (`message-kind.ts`):

| Tipo | Regra |
|---|---|
| **Cliente** | mensagem que chega do canal (`FROM_HUB`) |
| **Atendente humano** | mensagem da loja com origem `DEFAULT` (painel da FLW) ou `GATEWAY` (digitada direto no WhatsApp) |
| **Automática** | origem `BOT`, `CAMPAIGN`, `OFFICE_HOURS`, `PAYMENT` ou `API`. **Não conta como resposta humana** |
| **Ignorada** | nota interna, transição, rastreio, mensagem que falhou ou foi apagada |

### Os indicadores

| Indicador (nome na tela) | Cálculo | Conversas consideradas |
|---|---|---|
| **Tempo da 1ª resposta** (TMR) | Da 1ª fala do cliente até a 1ª resposta humana depois dela. O número do painel é a **média** de todas as conversas que tiveram resposta. | Iniciadas na janela, qualquer status |
| **Tempo até resolver** (FTR) | Fim menos início da conversa. O número do painel é a **mediana**. | Só `COMPLETED` que **encerraram** na janela |
| **Sem resposta** | O cliente falou e (a) nunca houve resposta humana depois da 1ª fala dele, ou (b) a conversa **não** está concluída e a última fala do cliente é posterior à última fala humana. | Iniciadas na janela |
| **Resposta do cliente** | `100% − sem resposta` | Iniciadas na janela |
| **Conversas retomadas** (reativação) | Houve ≥ 24h de silêncio e a mensagem seguinte foi de um humano. | Iniciadas na janela |
| **Taxa de fechamento** | `ganhos ÷ (abertos + ganhos + perdas que contam)` | Cards **criados** na janela, com o status **atual** do card |

### Detalhes que mudam o número

- **Conversa iniciada pela loja** (o cliente nunca falou): TMR e "sem resposta" não se aplicam a ela.
- **Conversa concluída que termina com "ok, obrigado" do cliente**: não conta como sem resposta (a regra (b) só vale para conversa não concluída).
- **Sem mensagens salvas**: o TMR usa `primeira resposta − início` do campo da própria sessão (fallback). O relatório avisa quantas conversas foram assim.
- **Perdas no fechamento**: motivos "fora do controle da equipe" e "higienização" saem do denominador. O casamento é **exato** pelo nome do motivo (normalizado), nunca por trecho. As listas ficam no `.env`, separadas por `;`.
- **Sem dado = `null`**, mostrado como "—". Nunca 0% ou 100% no lugar de "não sei".
- **Médias e medianas**: TMR é média (um caso de horas sem resposta puxa o valor para cima). FTR é mediana (mais estável).

---

## 2. Parte de IA

### Estágio 1: nota por conversa

Código: `job-d-stage1-analysis.ts` e `stage1.ts`. Modelo padrão: `gpt-4.1-mini`, temperatura 0.

**Quais conversas entram na fila**

- Status `COMPLETED`.
- `endAt` preenchido e, se houver `GO_LIVE_AT`, `endAt >= GO_LIVE_AT`.
- Ainda sem análise `done` ou `skipped` na versão atual do prompt (`stage1-v2`).

**Quais são puladas** (viram `skipped`, sem nota)

- conversa de grupo;
- **sem nenhuma mensagem humana da operação**;
- sem conteúdo de conversa.

**O que a IA recebe**: transcrição anonimizada (uma mensagem por linha, até 8.000 tokens), atendente, equipe, painel e etapa.

**O que a IA devolve**: nota inteira de 0 a 10 em cada critério, com `aplica` (sim/não) e uma evidência curta:

| Critério | Pergunta |
|---|---|
| Atrito | Houve dificuldade de entendimento? (**polaridade invertida**: 10 = pouco atrito) |
| Solução | O atendente ofereceu solução clara? |
| Necessidade | O atendente entendeu o que o cliente queria? |
| Próximo passo | Ficou combinado o que fazer depois? |
| Resolvida | Houve conclusão no diálogo (agendamento, retorno combinado...)? Não é venda no CRM. |

Regras do prompt: não inventar falas; critério que não se aplica vira `aplica=false` e nota nula; conteúdo que a IA não vê (áudio, imagem, trecho omitido) não pode ser suposto.

**Correção antes de gravar** (`normalizeStage1`): `aplica=true` sem nota vira não aplicável; `aplica=false` com nota ignora a nota; nota fora de 0–10 é cortada. Nada disso derruba a análise.

**Nota da conversa** = média simples dos critérios aplicáveis.

### Agregação do período (conta, sem IA) — `aggregate.ts`

- **Nota geral** = média das notas das conversas **que têm nota**. Conversa sem nenhum critério aplicável fica de fora.
- **Critério com pouca cobertura**: se ele se aplica a menos de **30%** das conversas (`CRITERION_MIN_COVERAGE`), sai da nota e do painel, e o relatório avisa.
- **Faixas**: baixo 0–4, médio 5–7, alto 8–10.
- **Distribuição das notas**: histograma de 0 a 10.
- **Preliminar**: com menos de 10 conversas com nota, o relatório sai marcado como amostra preliminar.
- **Evolução semanal**: a semana anterior é **recalculada com a mesma régua** da atual. A seta só aparece se ≥ 80% das conversas da semana anterior tiverem análise na versão atual.

### Estágio 2: texto gerencial — `stage2.ts`

Modelo padrão: `gpt-4.1`, temperatura 0,3.

- **Recebe só números já calculados**: médias, contagens por faixa, 3 maiores gaps, 3 maiores pontos fortes, KPIs sintéticos e até 10 casos de exemplo (metade das piores notas, metade das melhores).
- **Produz** 2 a 4 pontos fortes e 2 a 4 oportunidades, com script sugerido nas oportunidades.
- **Não escreve quantidades.** Usa os marcadores `{n_casos}` e `{n_total}`, e **o sistema preenche os números reais**.
- **Validação**: o código descarta o item se o critério está indisponível, se a faixa está na seção errada, se não há nenhuma conversa naquela faixa ou se o texto traz um número inventado (ex.: "6 das conversas"). Cada descarte vai para as limitações do relatório.
- **Sem nenhuma conversa com nota**: o estágio 2 nem roda. Os textos ficam vazios.

---

## 3. Relatórios por equipe

Cada **equipe** do relatório é um grupo de equipes da FLW, definido no `.env` (`TEAM_GROUPS`). Na FLW a maioria das equipes é a fila de uma pessoa ("Keity Consultora", "Sérgio Vendas"); o grupo junta essas filas para o relatório não repetir o de cada atendente. As equipes de entrada e do robô (`IGNORED_TEAMS`) ficam fora e só aparecem no relatório geral.

Regras:

- **Em que equipe a conversa conta:** na equipe em que ela **terminou**. Uma conversa transferida conta na equipe final. A lista de membros não entra na conta, porque uma pessoa pode estar em várias equipes.
- **Nota e critérios:** as mesmas regras do geral, só com as conversas concluídas que encerraram na semana e são da equipe.
- **Tempos, sem resposta e retomadas:** conversas da equipe iniciadas na semana.
- **Taxa de fechamento:** cards criados na semana e ligados a conversas da equipe.
- **Funil:** não aparece no relatório de equipe. Os cards de uma equipe se espalham por vários painéis, com etapas diferentes.
- **Conversas fora de qualquer equipe:** o relatório geral traz a observação "N conversas não entram em nenhuma equipe: Nome (n)". Conversa sem equipe nenhuma não entra nessa conta.
- **Equipe nova na FLW sem grupo:** o sync avisa no log, e a observação acima aparece no geral até ela ser colocada num grupo.
- **Equipe do atendente na tela:** é o grupo em que ele concluiu mais conversas na semana.
- **Semanas passadas:** os relatórios de equipe gerados depois do fato usam os dados de hoje (status atual dos cards, conversas sincronizadas depois). Os relatórios publicados não mudam, então a soma das equipes pode não bater exatamente com o geral daquela semana.

Código de referência: `src/domain/teams.ts`, `src/jobs/job-e-stage2-report.ts`, `src/jobs/job-c-synthetics.ts`.

---

## 4. Exemplo: tempos aparecendo, mas "Sem avaliação"

Tela da semana **9 a 15 de set. de 2026**:

| Card | Valor |
|---|---|
| Tempo da 1ª resposta | 8h 16min |
| Tempo até resolver | 2 dias e 19h |
| Sem resposta | 75% |
| Taxa de fechamento | 0% |
| Conversas retomadas | 0% |
| Nota da semana | — de 10 ("Sem avaliação") |
| Distribuição das notas | tudo 0 |
| Os 5 critérios | todos "—" |

### Por que os tempos existem se ninguém foi avaliado

As duas partes **usam filtros e fontes diferentes**:

| | Sintéticos | Nota de qualidade |
|---|---|---|
| Depende da IA? | Não | Sim |
| Quais conversas | Todas as iniciadas na janela (TMR, sem resposta, retomadas) ou todas as `COMPLETED` encerradas nela (FTR) | Só `COMPLETED` encerradas na janela **e** com análise `done` na versão atual |
| Precisa de mensagem humana? | Não (sem resposta é justamente a falta dela) | **Sim**: sem fala humana a conversa é pulada |

Ou seja, os tempos saem do cadastro da sessão e das mensagens. A nota só existe depois que o estágio 1 roda e termina com sucesso.

### O que a tela já nos diz

- **O "Tempo até resolver" aparece** (2 dias e 19h). O FTR só é calculado sobre `COMPLETED` encerradas na janela. Logo, **existem conversas concluídas na semana**. O problema não é falta de conversa.
- **75% sem resposta**: três em cada quatro conversas iniciadas na semana não tiveram resposta humana.
- **O "Tempo da 1ª resposta" (8h16) é a média só de quem foi respondido** (os outros 25%). Por isso a amostra é pequena e o valor é alto.
- **Fechamento 0%** (e não "—"): existem cards criados na semana, mas nenhum com status ganho. Sem cards, o card mostraria "—".
- **Retomadas 0%**: existem conversas na semana, mas nenhuma teve um humano reabrindo após 24h de silêncio.

### Causas prováveis para a nota estar vazia

Em ordem de probabilidade, dado o 75% sem resposta. Eu **não verifiquei** qual delas é a verdadeira no banco:

1. **As conversas concluídas foram puladas por não ter fala humana** (`skipped: sem mensagens humanas da operação`). Se a maior parte da semana é "sem resposta humana", é esperado que nenhuma sobre para ser avaliada. Nesse caso `nComNota = 0` e o relatório lista "N puladas (sem fala humana)".
2. **O estágio 1 ainda não rodou** para essas conversas (ficam como "ainda sem análise"). A trava de publicação normalmente barra isso, a não ser que o relatório tenha sido publicado com `--allow-incomplete`.
3. **A conversa terminou antes do `GO_LIVE_AT`**: o estágio 1 ignora tudo que encerrou antes dessa data.
4. **Erro na análise** (resposta cortada, recusa do modelo, limite de custo `OPENAI_MAX_USD_PER_RUN`). Tenta de novo com espera, até o limite de tentativas.
5. **Análise feita com outra versão do prompt**: só vale `stage1-v2`. Análises de versão antiga não entram na nota.

### O que acontece no relatório nesse caso

- `qualidade.nComNota = 0` → `notaGeral = null` → anel mostra "—" e "Sem avaliação".
- Histograma todo zerado e os 5 critérios sem nota.
- O estágio 2 **não é chamado**: não há texto de pontos fortes nem de oportunidades.
- Os sintéticos continuam normais, porque não dependem da IA.
- A seção de limitações explica o porquê (puladas, com erro, sem análise).

### Como descobrir qual causa é a real

Rode o estágio 1 em modo manual e leia o resumo final, que informa quantas foram analisadas, puladas e com erro. Ou consulte `SessionAnalysis` para a semana, agrupando por `status` e `skippedReason`.
