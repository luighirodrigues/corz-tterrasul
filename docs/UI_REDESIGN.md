# Redesign da interface — Fase 1

**Mockup (referência visual obrigatória):** https://claude.ai/artifact/63J2W8iPs2pavsmSHPapyX
Pranchas: Visão geral · Atendentes · Conversas · Detalhe da conversa · Pós-venda no celular · Guia de estilo.

**Objetivo:** a tela vai para o cliente (gestores da Tterrasul). Visual limpo no estilo dos produtos do Google
e **nenhum termo técnico visível**. Este documento é a fonte da verdade do estilo; o mockup mostra o resultado.

**Status:** aguardando validação do estilo. Depois de validado, executar a §9 na ordem.

---

## 1. Decisões já tomadas

| Tema | Decisão |
|---|---|
| Abas | **Visão geral · Atendentes · Conversas**. A aba "Pipeline & Jobs" sai do menu. |
| Parte técnica | Vai para a rota `/status` (sem link no menu, continua atrás do Basic Auth). Comandos de CLI saem da interface. |
| Escopo | O título da página vira o seletor (menu agrupado: Geral / Divisões / Painéis do CRM). Some a faixa de chips. |
| Ranking | Continua em cards (só visual novo). Tabela com ordenação fica para a Fase 2. |
| KPIs | **5** indicadores. "Resp. Cliente" sai: é só `100 − Sem resposta` (`job-c-synthetics.ts:131`). |
| Fonte | Figtree (Google Fonts, via `next/font`). |
| Tema escuro | Fora do escopo. |
| Bibliotecas | Nenhuma nova. Tailwind v4 + `lucide-react` (já instalados). |

---

## 2. Tokens — substituir `src/app/globals.css`

```css
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-figtree), system-ui, -apple-system, "Segoe UI", sans-serif;
}

@theme {
  /* neutros */
  --color-page: #F8F9FA;        /* fundo da página */
  --color-surface: #FFFFFF;     /* cards, cabeçalho */
  --color-line: #DADCE0;        /* borda de cards e campos */
  --color-divider: #E8EAED;     /* linhas internas, trilho das barras */
  --color-subtle: #F1F3F4;      /* busca, chips neutros, mensagem automática */
  --color-ink: #202124;         /* texto principal */
  --color-ink-2: #3C4043;       /* texto de apoio forte, marca da meta */
  --color-muted: #5F6368;       /* rótulos, legendas (nunca usar cinza mais claro para texto) */

  /* destaque (única cor de destaque) */
  --color-primary: #1A73E8;
  --color-primary-hover: #1765CC;
  --color-primary-soft: #E8F0FE;   /* seleção, mensagem do atendente */
  --color-primary-ink: #174EA6;    /* texto sobre primary-soft */
  --color-primary-faint: #AECBFA;  /* barras do histograma abaixo da meta */

  /* status: texto / fundo / gráfico */
  --color-good: #137333;  --color-good-soft: #E6F4EA;  --color-good-fill: #1E8E3E;
  --color-warn: #A15C00;  --color-warn-soft: #FEF7E0;  --color-warn-fill: #E37400;
  --color-bad: #C5221F;   --color-bad-soft: #FCE8E6;   --color-bad-fill: #D93025;

  --radius-card: 12px;
  --shadow-menu: 0 1px 3px rgba(60, 64, 67, 0.3), 0 4px 8px 3px rgba(60, 64, 67, 0.15);
}

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--color-line); border-radius: 999px; }
::-webkit-scrollbar-thumb:hover { background: var(--color-muted); }
```

Geram as classes `bg-page`, `bg-surface`, `border-line`, `border-divider`, `bg-subtle`, `text-ink`, `text-muted`,
`bg-primary`, `text-primary`, `bg-primary-soft`, `text-primary-ink`, `bg-good-soft`, `text-good`, `rounded-card`,
`shadow-menu` etc. **Nenhuma cor fora destes tokens** (nada de `slate-*`, `blue-*`, `emerald-*`, `rose-*`,
`amber-*`, `indigo-*`, `purple-*`, `cyan-*`).

## 3. Fonte — `src/app/layout.tsx`

```tsx
import { Figtree } from "next/font/google";
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: "Tterrasul · Qualidade do atendimento",
  description: "Qualidade do atendimento por WhatsApp: notas, indicadores e análise das conversas.",
};
// <html lang="pt-BR" className={figtree.variable}>
// <body className="min-h-screen bg-page text-ink text-sm antialiased font-sans">
```

`next/font/google` baixa a fonte no build: o build do Docker/EasyPanel precisa de internet (normalmente tem).

## 4. Tipografia

| Uso | Classes | Tamanho |
|---|---|---|
| Nota no anel | `text-[44px] leading-[52px] font-medium` | 44/52 |
| Número de indicador | `text-[28px] leading-9 font-medium` | 28/36 |
| Título da página / seletor de visão | `text-2xl font-medium` | 24/32 |
| Título de janela (modal) | `text-xl font-medium` | 20/28 |
| Título de card | `text-base font-medium` | 16/24 |
| Texto | `text-sm` | 14/20 |
| Rótulo | `text-[13px] leading-5 font-medium text-muted` | 13/20 |
| Legenda | `text-xs text-muted` | 12/16 |

Pesos: só 400, 500 e 600 (600 só na marca "Tterrasul" e no "T" do logo). **Proibido:** `font-bold`, `font-extrabold`,
`font-black`, `uppercase`, `tracking-wider`, `text-[10px]`, `text-[11px]` (exceto os números do histograma, 11px).

## 5. Componentes (receitas)

| Componente | Classes |
|---|---|
| Card | `bg-surface border border-line rounded-card p-6` (sem sombra) |
| Indicador (KPI) | `bg-surface border border-line rounded-card px-5 py-4 flex flex-col gap-1` → rótulo / número / legenda |
| Chip de status | `inline-flex items-center h-6 px-2.5 rounded-full text-xs font-medium` + tom: `bg-good-soft text-good` · `bg-warn-soft text-warn` · `bg-bad-soft text-bad` · `bg-subtle text-muted` |
| Chip contornado | `inline-flex items-center h-[22px] px-2 rounded-full border border-line text-xs font-medium text-muted` |
| Aba | `h-12 px-4 pt-[3px] flex items-center font-medium border-b-[3px]` · ativa `text-primary border-primary` · inativa `text-muted border-transparent hover:text-ink` |
| Botão primário | `h-10 px-6 rounded-full bg-primary text-white font-medium hover:bg-primary-hover` |
| Botão contornado | `h-10 px-6 rounded-full border border-line text-primary font-medium hover:bg-primary-soft` |
| Botão de texto | `h-9 px-3 rounded-full text-primary font-medium hover:bg-primary-soft` |
| Seletor de semana | `<select>` nativo dentro de um contêiner `h-10 px-3 rounded-lg border border-line bg-surface font-medium` com ícones `Calendar` e `ChevronDown` (`text-muted`) |
| Busca | contêiner `flex items-center gap-2.5 h-11 px-4 rounded-full bg-subtle focus-within:bg-surface focus-within:shadow-menu` + `<input className="flex-1 min-w-0 bg-transparent outline-none text-[15px]">` + ícone `Search` |
| Menu (seletor de visão) | `absolute z-20 mt-1 w-80 py-2 bg-surface rounded-card shadow-menu` · grupo `px-4 pt-2.5 pb-1 text-xs font-medium text-muted` · item `flex w-full items-center justify-between h-10 px-4 text-left hover:bg-subtle` · selecionado `bg-primary-soft text-primary-ink font-medium` · nota do item `text-muted` |
| Aviso | `flex gap-2.5 px-3.5 py-3 rounded-card bg-warn-soft text-[13px] leading-[19px]` + ícone `Info` `text-warn` |
| Observações (recolhível) | botão `flex items-center justify-between w-full h-12 px-4 rounded-card border border-line bg-surface` "Observações sobre os dados (N)" + `ChevronDown`; aberto mostra lista `text-[13px]` |
| Barra de critério | trilho `relative h-2 rounded bg-divider` · preenchimento `h-2 rounded bg-primary` (largura = nota × 10%) · meta `absolute left-[80%] -top-1 w-0.5 h-4 rounded-sm bg-ink-2` |
| Janela (modal) | fundo `fixed inset-0 z-50 bg-ink/45 flex items-center justify-center p-4` · painel `bg-surface rounded-2xl shadow-menu w-full max-w-[1100px] max-h-[90vh] flex flex-col overflow-hidden` |
| Balões de mensagem | cliente `bg-surface border border-line rounded-[4px_16px_16px_16px]` (esquerda) · atendente `bg-primary-soft rounded-[16px_4px_16px_16px]` (direita, nome em `text-primary-ink font-medium`) · automática `bg-subtle border border-divider rounded-[16px_4px_16px_16px]` (direita, rótulo com ícone `Bot`) |
| Avatar com inicial | `w-8 h-8 rounded-full bg-primary-soft text-primary-ink text-[13px] font-semibold flex items-center justify-center` |

Ícones: `lucide-react`, `strokeWidth={1.75}`, 18–22px, cor `text-muted` (ou a cor do status quando indica status).
Áreas clicáveis com no mínimo 40px de altura (44px no celular). Espaçamento: 24px entre blocos, 16px entre cards,
largura máxima do conteúdo `max-w-[1200px] mx-auto px-6` (`px-4` no celular).

## 6. Status da nota

```ts
export const META_NOTA = 8;
export type Tone = "good" | "warn" | "bad" | "neutral";
export function scoreStatus(n: number | null | undefined): { label: string; tone: Tone } {
  if (n == null) return { label: "Sem avaliação", tone: "neutral" };
  if (n >= 8) return { label: "Na meta", tone: "good" };
  if (n >= 6) return { label: "Atenção", tone: "warn" };
  return { label: "Abaixo da meta", tone: "bad" };
}
```

- Anel: cor do traço = `*-fill` do tom (neutro: `--color-line`); trilho `--color-divider`; traço 12.
- Status sempre aparece **com texto** (chip). Cor só reforça.
- Histograma: barras das notas 8–10 em `bg-primary`, 0–7 em `bg-primary-faint`; contagem acima de cada barra;
  legenda "Na meta (8 ou mais)" / "Abaixo da meta". Frase: "X de Y conversas atingiram a meta", com
  X = soma de `histograma[8..10]` e Y = soma do histograma.

## 7. Formatação — `src/lib/format.ts` (com testes em `tests/format.test.ts`)

| Função | Regra | Exemplos |
|---|---|---|
| `fmtNota(n)` | `null` → "—"; 1 casa, vírgula | 6.6 → "6,6"; 7 → "7,0" |
| `fmtPct(n)` | `null` → "—"; até 1 casa | 62.5 → "62,5%"; 69 → "69%" |
| `fmtDuracao(seg)` | `null` → "—"; < 60 → "menos de 1 min"; < 1h → "13 min"; < 24h → "1h 07min"; ≥ 24h → "1 dia e 6h" / "2 dias" | 4020 → "1h 07min"; 109620 → "1 dia e 6h" |
| `fmtPeriodo(ini, fim)` | mesmo mês: "18 a 24 de setembro"; meses diferentes: "29 de setembro a 5 de outubro" | |
| `fmtPeriodoCurto(ini, fim)` | para o seletor | "18 a 24 de set. de 2026" |
| `fmtAtualizado(iso)` | "hoje às 06:00" / "ontem às 06:00" / "em 28/09 às 06:00" | |

- Durações: usar `sinteticos.tmrMedioSegundos` e `sinteticos.ftrMedianaSegundos` (estão no JSON salvo, só faltam no
  tipo `KpiMetrics` — adicionar como `?: number | null`). Se ausentes, cair para `tmrMedioFormatado`/`ftrMedianaFormatada`.
- **Não alterar** `formatDuration` em `job-c-synthetics.ts` (usado pelo relatório HTML e por testes).
- Datas `"YYYY-MM-DD"` (vêm de `isoDay`): montar a data com os números, **não** com `new Date("YYYY-MM-DD")`
  (vira UTC e mostra o dia anterior no Brasil). ISO com hora: formatar com `timeZone: "America/Sao_Paulo"`.
- Fim da janela é inclusivo (`domain/period.ts`): mostrar `periodEnd` como está.

## 8. Vocabulário — `src/lib/labels.ts`

Todo texto visível sai daqui ou do JSX em português simples. Nenhum destes pode aparecer na tela do cliente:
**TMR, FTR, WON, LOST, OPEN, Pry, FLW, Estágio, OpenAI, Structured Outputs, prompt, modelo, job, pipeline, leva,
janela fechada, polaridade, pesos, N/D, N/A, `{{fone}}`, `npm run`.**

| Antes | Depois |
|---|---|
| TTERRASUL / "Qualidade FLW" / "Auditoria de Conversas & CRM • Padrão Pry" | Tterrasul / "Qualidade do atendimento" |
| Dashboard por Escopo / Ranking de Atendentes / Auditoria de Conversas | Visão geral / Atendentes / Conversas |
| "Última publicada" (seletor) | "Semana mais recente" |
| "Janela fechada de 2026-09-18 a 2026-09-24" | "Semana de 18 a 24 de setembro · 124 conversas avaliadas" |
| "Amostra preliminar (menos de 10 conversas na janela)" | "Amostra pequena: menos de 10 conversas avaliadas. Leia os números como uma indicação inicial." |
| "Limitações desta leva" | "Observações sobre os dados" (recolhível, fechado) |
| TMR Médio · 1ª resposta humana | **Tempo da 1ª resposta** · Média até uma pessoa responder |
| FTR Mediana · Tempo resolução | **Tempo até resolver** · Tempo típico do início ao fim |
| Sem Resposta · Cliente no vácuo | **Sem resposta** · (acima de 30%: chip "Acima do limite de 30%") |
| Fechamento · Cards WON / Total | **Taxa de fechamento** · Negócios ganhos no CRM |
| Reativação · Retomada ≥ 24h | **Conversas retomadas** · Cliente voltou após 24h ou mais |
| Índice de Qualidade do Atendimento | **Nota da semana** · Média dos 5 critérios, de 0 a 10 |
| Desempenho nos 5 Critérios Analíticos / "via OpenAI Structured Outputs" / "Pesos de 20%" | **Critérios avaliados** · Cada conversa recebe uma nota de 0 a 10 em cada critério |
| "Polaridade do Atrito…" / "Meta Operacional: ≥ 8.0" | legenda "Meta 8,0" com o traço da meta |
| Pouco ou Nenhum Atrito | **Pouco atrito** · Conversa fluida, sem desgaste com o cliente |
| Apresentou Solução Clara | **Apresentou solução clara** · Deu uma resposta real para o pedido |
| Entendeu a Necessidade | **Entendeu a necessidade** · Ouviu e identificou o que o cliente buscava |
| Combinou Próximo Passo | **Combinou o próximo passo** · Deixou claro o que acontece depois |
| Conversa Concluída / Resolvida | **Conversa resolvida** · Terminou com agendamento ou retorno firmado |
| Funil do Painel CRM & Desfechos / "cards" | **Negócios no CRM** · "97 negócios na semana" |
| Ganhos (WON) / Perdidos (LOST) / Em Aberto (OPEN) | Ganhos / Perdidos / Em negociação |
| Volume por Etapa do Pipeline | Por etapa |
| Principais Motivos de Perda (LOST) | Motivos de perda |
| Síntese de Inteligência Artificial & Coaching Operacional + "Estágio 2 • modelo • prompt" | **Análise da semana** · Resumo gerado por IA a partir das N conversas avaliadas (sem modelo/versão) |
| Pontos Fortes Comprovados / Oportunidades & Scripts de Coaching | O que está funcionando / Onde melhorar |
| "Script Recomendado:" / "N conversas" (chip) | "Sugestão de fala" / "Base: N conversas" |
| "Abrir Ficha Completa" | "Ver detalhes" |
| "N conversas auditadas" / "nota 0-10" | "N conversas avaliadas" (0 → "Nenhuma conversa avaliada") |
| "nota IA" | "Nota" |
| "Resumo em 1 Linha (IA)" | "Resumo" |
| "Avaliação dos 5 Critérios & Evidências" | "Avaliação por critério" |
| "Transcrição Anonimizada do WhatsApp" | "Mensagens" + legenda "Nome e telefone do cliente ficam ocultos" |
| `[AUTOMÁTICO · BOT]` | "Mensagem automática · Robô" |
| "Banco indisponível. Nenhum dado é exibido sem o banco." | "Não foi possível carregar os dados agora. Tente novamente em alguns minutos." |
| "Nenhum relatório publicado." | "Ainda não há resultados publicados para esta semana." |
| "Síntese de IA indisponível nesta leva." | "A análise desta semana ainda não está disponível." |
| "Carregando painel de qualidade..." | "Carregando…" |

Origem de mensagem automática (`AUTOMATED_ORIGINS`): `BOT` Robô · `OFFICE_HOURS` Fora do horário ·
`CAMPAIGN` Campanha · `PAYMENT` Pagamento · `API` Integração · outro → Sistema.

Nomes de escopo: tirar prefixos ("Divisão ", "Painel CRM - ", "Atendente - "). No menu: grupos "Geral",
"Divisões", "Painéis do CRM".

---

## 9. Plano da Fase 1 (executar na ordem; ao fim de cada passo: `pnpm test` e `pnpm web:build`)

### Passo 1 — Base visual
- `globals.css` (§2) e `layout.tsx` (§3).
- **Pronto quando:** build passa e a tela antiga continua abrindo.

### Passo 2 — Formatação e vocabulário
- Criar `src/lib/format.ts` (§6 e §7) e `src/lib/labels.ts` (§8), com `tests/format.test.ts`.
- Adicionar `tmrMedioSegundos?`/`ftrMedianaSegundos?` em `KpiMetrics` (`src/lib/types.ts`).
- **Pronto quando:** testes novos passam.

### Passo 3 — Quebrar `src/app/page.tsx` (sem mudar o visual)
- `page.tsx` fica só com estado e busca de dados.
- Novos: `src/components/layout/AppHeader.tsx`, `src/components/tabs/OverviewTab.tsx`, `AgentsTab.tsx`, `ConversationsTab.tsx`.
- Tipo da aba: `"visao" | "atendentes" | "conversas"`.
- **Pronto quando:** a tela funciona igual à de antes.

### Passo 4 — Cabeçalho e navegação (`AppHeader`)
- Marca: quadrado "T" 36px `bg-primary rounded-[10px] text-white font-semibold`, "Tterrasul" (16px, 600) e legenda "Qualidade do atendimento".
- Direita: "Atualizado {fmtAtualizado}" (primeiro job de `pipeline.recentJobs` com `status === "completed"` e `finishedAt`; sem nenhum, não mostrar) e o seletor de semana.
- Remover o selo verde piscando com o nome da empresa.
- Abas com sublinhado (§5). No celular: marca numa linha, seletor de semana em largura total na linha seguinte, abas com `flex-1`. **O seletor não pode sumir no celular.**

### Passo 5 — Rota técnica `/status`
- `src/app/status/page.tsx` (`"use client"`): mover o conteúdo da antiga aba Pipeline, aplicando os tokens.
- **Apagar** o bloco "Comandos CLI Rápidos". Aqui termos técnicos são permitidos (só o desenvolvedor acessa).
- Sem link no menu.

### Passo 6 — Visão geral (`OverviewTab` + componentes)
- **Seletor de visão** (`ScopeMenu`): o título da página é o botão; menu agrupado (§5), fecha ao escolher, ao clicar fora e com Esc.
  Atendentes não entram no menu. Com um atendente selecionado: acima do título, botão de texto "← Atendentes" (volta para a aba) e título = nome do atendente.
- Subtítulo: "Semana de {fmtPeriodo} · {totalConversas} conversas avaliadas".
- Avisos: `preliminar` → Aviso (§8); `correctedAt` → aviso neutro "Corrigido em dd/mm: {motivo}"; `limitacoes` → "Observações sobre os dados (N)", fechado.
- `KpiStrip`: 5 indicadores (§8), `grid-cols-2 lg:grid-cols-5` (no celular o último ocupa 2 colunas).
- Card "Nota da semana" (5/12): anel 176px, chip "{status} · meta 8,0", frase da meta, histograma (§6),
  "Evolução semanal" (`TrendChart` com tokens: linha `primary`, grade `divider`, texto `muted`; vazio: "O gráfico aparece a partir da 2ª semana publicada.").
  Se houver `comparativo`: "▲ +0,4 em relação à semana anterior" (`text-good`/`text-bad`), mantendo o `title` explicativo.
- `CriteriaBars` (7/12): uma cor só + traço da meta; nota `null` → "—" e barra vazia.
- `FunnelChart` → "Negócios no CRM": barra empilhada (good-fill / bad-fill / primary) + legenda com número e %;
  "Por etapa" em ordem decrescente (barra relativa à maior); "Motivos de perda" ou "Nenhum motivo de perda registrado.";
  se `desconsideradas` > 0: legenda "Não entram na taxa de fechamento: X perdas fora do controle da equipe e Y cadastros duplicados ou de quem já é cliente."
- `AiInsightsBlock` → "Análise da semana": remover props `model`/`promptVersion`; receber `totalConversas`; itens separados por divisor; "Sugestão de fala" em caixa `bg-page rounded-lg px-4 py-3`.

### Passo 7 — Atendentes (`AgentsTab`)
- Cards como no mockup: posição (1º–3º `bg-primary-soft text-primary-ink`, demais `bg-subtle text-muted`), nome, "N conversas avaliadas",
  nota 28px, chip de status, chip contornado "Amostra pequena" quando `preliminar`, "1ª resposta" (`fmtDuracao`) e "Sem resposta" (`text-bad` acima de 30%),
  botão de texto "Ver detalhes" (abre a Visão geral com o atendente).
- Legenda no topo: "Amostra pequena = menos de 10 conversas avaliadas na semana".
- Remover medalhas coloridas e a citação em itálico.

### Passo 8 — Conversas e janela da conversa
- **Backend:** `/api/sessions?period=<periodStart ISO>` → `loadAuditedSessions({ agent, periodStart })`. Sem `period`, usar a última semana publicada
  (mesma regra de `loadReports`). Filtrar `endAt` entre `periodStart` e `periodEnd` do `periodReport` dessa semana. Manter `take: 50`.
  O `useEffect` da página passa `selectedPeriod` para essa chamada.
- Não exibir telefone (hoje aparece o texto literal `{{fone}}` — `sessions-loader.ts:48`).
- Lista em um card só, linhas com divisor (colunas: Atendente · Resumo · Painel · Data/duração · Nota com ponto colorido · seta).
  No celular, empilhar: atendente + nota / resumo / painel + data.
- Busca "Buscar por atendente" (pill). Vazio: "Nenhuma conversa encontrada para “{busca}”." / "Nenhuma conversa avaliada nesta semana."
- `ConversationModal`: título "Conversa de {data}", linha com atendente · painel · duração, nota + chip, botão fechar (`aria-label="Fechar"`).
  **Fecha com Esc, clique no fundo e no X.** Esquerda: Resumo + "Avaliação por critério" (nota e evidência entre aspas). Direita: "Mensagens" com os balões (§5).

### Passo 9 — Limpeza e verificação
- Remover imports e ícones não usados.
- `rg "slate-|blue-|emerald-|rose-|amber-|indigo-|purple-|cyan-|font-bold|font-extrabold|font-black|uppercase|tracking-wider" src/app src/components` → nada.
- Conferir que nenhum termo da lista proibida (§8) aparece em texto visível.
- `pnpm test` e `pnpm web:build` passando.
- Abrir com `pnpm web:dev` e comparar com o mockup em 1280px e 390px: as três abas, o menu de visão, a janela da conversa e o `/status`.

## 10. Fora do escopo da Fase 1
- Não mexer em `src/jobs`, `src/domain`, `src/flw` nem no relatório HTML estático (`src/report/html-reporter.ts`), exceto o filtro de semana em `sessions-loader.ts` + `/api/sessions`.
- Fase 2: ranking em tabela com ordenação, filtros (nota, painel) e paginação em Conversas, exportar PDF, e aplicar o mesmo vocabulário ao relatório HTML estático (que ainda mostra "Padrão Pry / FLW Quality v1", "Cards WON", "TMR Médio").
