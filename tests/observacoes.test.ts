import { describe, expect, it } from "vitest";
import { observacoes, traduzirLimitacoes } from "../src/lib/observacoes.js";

const textos = (linha: string) => observacoes(linha).map((o) => o.texto);

describe("observacoes: tradução das frases gravadas no servidor", () => {
  it("esconde as que só o servidor entende", () => {
    expect(observacoes("Amostra preliminar: 7 conversas com nota (mínimo 10).")).toEqual([]);
    expect(observacoes("TMR de 3 conversas veio do campo da sessão (sem mensagens no espelho).")).toEqual([]);
    expect(observacoes("Síntese de IA indisponível: OPENAI_API_KEY não configurada.")).toEqual([]);
    expect(observacoes('Item sobre "Conversa resolvida" descartado: faixa "baixo" na seção errada.')).toEqual([]);
  });

  it("separa as conversas fora da nota em uma linha para cada parte", () => {
    expect(textos("Conversas fora da nota: 56 puladas (sem fala humana), 2 com erro de análise, 1 ainda sem análise.")).toEqual([
      "56 conversas ficaram sem nota porque nenhuma pessoa respondeu.",
      "2 conversas não puderam ser avaliadas.",
      "1 conversa ainda vai ser avaliada.",
    ]);
    expect(textos("Conversas fora da nota: 1 puladas (sem fala humana).")).toEqual(["1 conversa ficou sem nota porque nenhuma pessoa respondeu."]);
  });

  it("troca card e esteira por negócio no CRM", () => {
    expect(textos("12 de 280 conversas sem card (sem esteira).")).toEqual(["12 de 280 conversas não estão ligadas a um negócio no CRM."]);
    expect(textos("3 sessões com mais de um card; usado o mais recente.")).toEqual([
      "3 conversas têm mais de um negócio no CRM; contamos o mais recente.",
    ]);
    expect(textos("1 sessões com mais de um card; usado o mais recente.")).toEqual(["1 conversa tem mais de um negócio no CRM; contamos o mais recente."]);
    expect(textos("Funil usa o status atual dos cards, não o status no fim da janela.")).toEqual([
      "Os negócios do CRM aparecem com a situação de hoje, não a do fim do período.",
    ]);
  });

  it("usa o nome do critério que aparece na tela", () => {
    expect(textos('Critério "Próximo passo combinado" fora da nota: aplicável em 12,5% das conversas.')).toEqual([
      "O critério “Combinou o próximo passo” ficou fora da nota: só vale para 12,5% das conversas.",
    ]);
    expect(textos('Critério "Pouco ou nenhum atrito" fora da nota: aplicável em 0% das conversas.')[0]).toContain("“Pouco atrito”");
  });

  it("traduz a falta de comparação", () => {
    expect(textos("Sem comparação com a semana anterior: só 40% das conversas dela têm análise na versão atual.")).toEqual([
      "Sem comparação com a semana anterior: ela foi avaliada antes da mudança nos critérios.",
    ]);
    expect(textos("Sem comparação com o mês anterior: só 10% das conversas dele têm análise na versão atual.")).toEqual([
      "Sem comparação com o mês anterior: ele foi avaliado antes da mudança nos critérios.",
    ]);
    const parcial = "Sem comparação com o mês anterior: ele é parcial (dados a partir de 10/09/2026).";
    expect(textos(parcial)).toEqual([parcial]);
  });

  it("mantém as que já estão em português e dá destaque às que mudam a leitura", () => {
    const equipes = "4 conversas não entram em nenhuma equipe: Caixa (3), Outros (1).";
    expect(textos(equipes)).toEqual([equipes]);
    const desde = "Dados a partir de 01/09/2026: o mês está incompleto.";
    expect(observacoes(desde)).toEqual([{ texto: desde, destaque: true }]);
    const antes = "O período começa antes dos dados: contado a partir de 01/09/2026.";
    expect(observacoes(antes)[0].destaque).toBe(true);
    const atualizando = "5 conversas com indicadores em atualização; o número de 1ª resposta pode mudar em alguns minutos.";
    expect(observacoes(atualizando)).toEqual([{ texto: atualizando, destaque: false }]);
  });

  it("frase desconhecida aparece como veio", () => {
    expect(textos("Qualquer coisa nova")).toEqual(["Qualquer coisa nova"]);
  });

  it("traduzirLimitacoes junta tudo e separa os avisos", () => {
    const r = traduzirLimitacoes(
      [
        "Amostra preliminar: 7 conversas com nota (mínimo 10).",
        "Dados a partir de 01/09/2026: o mês está incompleto.",
        "Conversas fora da nota: 56 puladas (sem fala humana).",
        "Funil usa o status atual dos cards, não o status no fim da janela.",
      ].join("\n"),
    );
    expect(r.avisos).toEqual(["Dados a partir de 01/09/2026: o mês está incompleto."]);
    expect(r.observacoes).toHaveLength(2);
    expect(traduzirLimitacoes(null)).toEqual({ avisos: [], observacoes: [] });
  });

  it("nenhuma tradução deixa termo técnico na tela", () => {
    const gravadas = [
      "12 de 280 conversas sem card (sem esteira).",
      "3 sessões com mais de um card; usado o mais recente.",
      "Funil usa o status atual dos cards, não o status no fim da janela.",
      "Conversas fora da nota: 5 puladas (sem fala humana), 1 com erro de análise, 2 ainda sem análise.",
      'Critério "Conversa resolvida" fora da nota: aplicável em 20% das conversas.',
      "Sem comparação com a semana anterior: só 40% das conversas dela têm análise na versão atual.",
    ];
    const proibidos = /esteira|\bcard|TMR|Funil|espelho|\bleva\b|descartad|janela|versão atual|puladas|sessões/i;
    for (const g of gravadas) for (const o of observacoes(g)) expect(o.texto).not.toMatch(proibidos);
  });
});
