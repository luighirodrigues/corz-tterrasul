import { describe, expect, it } from "vitest";
import { assuntoResumo, frasesDoBloco, linkResumo, montarEmailResumo, type BlocoEmail, type EntradaEmail } from "../src/email/resumo-email.js";

const medias = { atrito: 8.4, solucao: 7.1, necessidade: 8, proximoPasso: 6.2, resolvida: 5.6 };
const semana = { granularity: "semana" as const, start: "2026-09-23T03:00:00.000Z", end: "2026-09-30T02:59:59.999Z" };
const mes = { granularity: "mes" as const, start: "2026-09-01T03:00:00.000Z", end: "2026-10-01T02:59:59.999Z" };
// O dia de hoje (06/10) com os números até as 18:05 de Brasília, e o mesmo dia já passado (sem "até").
const diaHoje = { granularity: "dia" as const, start: "2026-10-06T03:00:00.000Z", end: "2026-10-07T02:59:59.999Z", ate: "2026-10-06T21:05:00.000Z" };
const diaPassado = { granularity: "dia" as const, start: "2026-10-06T03:00:00.000Z", end: "2026-10-07T02:59:59.999Z" };

const geral: BlocoEmail = { scopeType: "geral", scopeId: "geral", rotulo: "Geral", notaGeral: 7.4, delta: 0.3, medias, abaixo: 138, preliminar: false };
const pecas: BlocoEmail = {
  scopeType: "equipe",
  scopeId: "Peças",
  rotulo: "Equipe Peças",
  notaGeral: 8.6,
  delta: -0.2,
  medias: { ...medias, resolvida: 8.1, proximoPasso: 8.3, solucao: 8.5 },
  abaixo: 1,
  preliminar: true,
};

const entrada = (extra: Partial<EntradaEmail> = {}): EntradaEmail => ({
  pessoa: { nome: "Ana Souza" },
  periodo: semana,
  blocos: [geral, pecas],
  appUrl: "https://qualidade.exemplo.com.br/",
  ...extra,
});

/** Termos que a tela do cliente não mostra (`docs/UI_REDESIGN.md` §8), mais os do envio de e-mail. */
const PROIBIDOS = ["TMR", "FTR", "WON", "LOST", "OPEN", "Pry", "FLW", "Estágio", "OpenAI", "prompt", "modelo", "job", "pipeline", "leva", "janela fechada", "polaridade", "SMTP", "{{"];

describe("assunto", () => {
  it("semana e mês, com o escopo quando é um só", () => {
    expect(assuntoResumo(semana, [geral, pecas])).toBe("Resumo da semana de 23 a 29/09");
    expect(assuntoResumo(mes, [geral, pecas])).toBe("Resumo de setembro");
    expect(assuntoResumo(semana, [pecas])).toBe("Resumo da semana de 23 a 29/09 · Equipe Peças");
    expect(assuntoResumo(mes, [pecas])).toBe("Resumo de setembro · Equipe Peças");
  });

  it("semana que cruza o mês mostra os dois meses", () => {
    expect(assuntoResumo({ granularity: "semana", start: "2026-09-30T03:00:00.000Z", end: "2026-10-07T02:59:59.999Z" }, [geral])).toBe(
      "Resumo da semana de 30/09 a 06/10 · Geral",
    );
  });
});

describe("link do botão", () => {
  it("abre o período e o escopo; o Geral não leva escopo; o mensal leva tipo=mes", () => {
    expect(linkResumo("https://x.com.br/", semana, geral)).toBe("https://x.com.br/?period=2026-09-23T03%3A00%3A00.000Z");
    expect(linkResumo("https://x.com.br", semana, pecas)).toBe("https://x.com.br/?period=2026-09-23T03%3A00%3A00.000Z&escopo=equipe%3APe%C3%A7as");
    expect(linkResumo("https://x.com.br", mes, pecas)).toBe("https://x.com.br/?tipo=mes&period=2026-09-01T03%3A00%3A00.000Z&escopo=equipe%3APe%C3%A7as");
  });
});

describe("frases do bloco (as mesmas do resumo do topo do painel)", () => {
  it("nota, diferença, ponto mais fraco e conversas abaixo da meta", () => {
    expect(frasesDoBloco(geral, "semana")).toEqual({
      nota: "7,4",
      status: "Abaixo da meta de 8,0",
      tom: "warn",
      comparacao: "0,3 acima da semana anterior",
      fraco: "Ponto mais fraco: Conversa resolvida, média 5,6",
      abaixo: "138 conversas ficaram abaixo da meta",
      aviso: null,
    });
  });

  it("na meta, todos os critérios na meta, uma conversa e aviso de poucas conversas", () => {
    expect(frasesDoBloco(pecas, "semana")).toMatchObject({
      status: "Na meta de 8,0",
      tom: "good",
      comparacao: "0,2 abaixo da semana anterior",
      fraco: "Todos os critérios estão na meta",
      abaixo: "1 conversa ficou abaixo da meta",
      aviso: "Poucas conversas: números ainda instáveis",
    });
  });

  it("mês compara com o nome do mês anterior; zero abaixo da meta; sem diferença some", () => {
    const f = frasesDoBloco({ ...geral, delta: 0, mesAnterior: "agosto", abaixo: 0 }, "mes");
    expect(f.comparacao).toBe("Igual a agosto");
    expect(f.abaixo).toBe("Nenhuma conversa ficou abaixo da meta");
    expect(frasesDoBloco({ ...geral, delta: null }, "semana").comparacao).toBeNull();
  });

  it("sem nota: só a frase de que não há conversa com nota", () => {
    expect(frasesDoBloco({ ...geral, notaGeral: null }, "mes")).toMatchObject({ nota: null, aviso: "Nenhuma conversa com nota neste mês." });
  });
});

describe("e-mail montado", () => {
  const email = montarEmailResumo(entrada());

  it("um e-mail só, com um bloco e um botão para cada escopo", () => {
    expect(email.assunto).toBe("Resumo da semana de 23 a 29/09");
    expect(email.html.match(/Abrir o resumo/g)).toHaveLength(2);
    expect(email.html).toContain("Olá, Ana. Este é o resumo da semana de 23 a 29/09.");
    expect(email.html).toContain('href="https://qualidade.exemplo.com.br/?period=2026-09-23T03%3A00%3A00.000Z"');
    expect(email.html).toContain("escopo=equipe%3APe%C3%A7as");
    expect(email.html.indexOf("Geral")).toBeLessThan(email.html.indexOf("Equipe Peças"));
  });

  it("o texto traz os mesmos números e a frase de descadastro", () => {
    expect(email.texto).toBe(
      [
        "Olá, Ana. Este é o resumo da semana de 23 a 29/09.",
        "",
        "Geral",
        "Nota 7,4 · Abaixo da meta de 8,0",
        "0,3 acima da semana anterior",
        "Ponto mais fraco: Conversa resolvida, média 5,6",
        "138 conversas ficaram abaixo da meta",
        "Abrir o resumo: https://qualidade.exemplo.com.br/?period=2026-09-23T03%3A00%3A00.000Z",
        "",
        "Equipe Peças",
        "Nota 8,6 · Na meta de 8,0",
        "0,2 abaixo da semana anterior",
        "Todos os critérios estão na meta",
        "1 conversa ficou abaixo da meta",
        "Poucas conversas: números ainda instáveis",
        "Abrir o resumo: https://qualidade.exemplo.com.br/?period=2026-09-23T03%3A00%3A00.000Z&escopo=equipe%3APe%C3%A7as",
        "",
        "Você acompanha: Geral, Equipe Peças",
        "Para deixar de receber, fale com o administrador do painel.",
      ].join("\n"),
    );
    expect(email.html).toContain("Você acompanha: Geral, Equipe Peças");
    expect(email.html).toContain("Para deixar de receber, fale com o administrador do painel.");
  });

  it("nenhum termo técnico, no HTML nem no texto", () => {
    const todos = [
      montarEmailResumo(entrada()),
      montarEmailResumo(entrada({ periodo: mes })),
      montarEmailResumo(entrada({ blocos: [{ ...geral, notaGeral: null }] })),
      montarEmailResumo(entrada({ periodo: diaHoje })),
      montarEmailResumo(entrada({ periodo: diaPassado })),
      montarEmailResumo(entrada({ periodo: diaHoje, blocos: [{ ...geral, notaGeral: null }] })),
    ];
    for (const e of todos) {
      const texto = `${e.assunto}\n${e.texto}\n${e.html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ")}`;
      for (const termo of PROIBIDOS) {
        const escapado = termo.replace(/[{}]/g, "\\$&");
        expect(texto, termo).not.toMatch(new RegExp(`(^|[^\\p{L}])${escapado}([^\\p{L}]|$)`, "iu"));
      }
    }
  });

  it("escapa o que vem de fora (nome da pessoa e do escopo)", () => {
    const e = montarEmailResumo(entrada({ pessoa: { nome: '<b>Ana</b> "x"' }, blocos: [{ ...geral, rotulo: "Equipe <i>A</i> & B" }] }));
    expect(e.html).not.toContain("<b>Ana</b>");
    expect(e.html).not.toContain("<i>A</i>");
    expect(e.html).toContain("Equipe &lt;i&gt;A&lt;/i&gt; &amp; B");
  });

  it("é de uma coluna, com estilo no próprio elemento (sem <style>) e legível no celular", () => {
    expect(email.html).not.toMatch(/<style/i);
    expect(email.html).toContain('name="viewport"');
    expect(email.html).toContain("max-width:560px");
  });

  it("no mensal, o botão leva tipo=mes e o assunto diz o mês", () => {
    const m = montarEmailResumo(entrada({ periodo: mes, blocos: [{ ...pecas, mesAnterior: "agosto" }] }));
    expect(m.assunto).toBe("Resumo de setembro · Equipe Peças");
    expect(m.texto).toContain("0,2 abaixo de agosto");
    expect(m.html).toContain("tipo=mes&amp;period=2026-09-01T03%3A00%3A00.000Z");
  });
});

describe("resumo do dia", () => {
  it("assunto: o dia, e o escopo quando é um só", () => {
    expect(assuntoResumo(diaHoje, [geral, pecas])).toBe("Resumo do dia 06/10");
    expect(assuntoResumo(diaHoje, [pecas])).toBe("Resumo do dia 06/10 · Equipe Peças");
  });

  it("o botão abre o dia como período livre de um dia só, com o escopo", () => {
    expect(linkResumo("https://x.com.br/", diaHoje, geral)).toBe("https://x.com.br/?de=2026-10-06&ate=2026-10-06");
    expect(linkResumo("https://x.com.br", diaHoje, pecas)).toBe("https://x.com.br/?de=2026-10-06&ate=2026-10-06&escopo=equipe%3APe%C3%A7as");
  });

  it("hoje: a abertura diz até que hora vão os números e avisa que o dia não terminou", () => {
    const e = montarEmailResumo(entrada({ periodo: diaHoje }));
    expect(e.html).toContain("Olá, Ana. Este é o resumo do dia 06/10, com as conversas até as 18:05.");
    expect(e.html).toContain("O dia ainda não terminou: no painel, os números mudam conforme chegam novas conversas.");
    expect(e.texto.split("\n").slice(0, 3)).toEqual([
      "Olá, Ana. Este é o resumo do dia 06/10, com as conversas até as 18:05.",
      "O dia ainda não terminou: no painel, os números mudam conforme chegam novas conversas.",
      "",
    ]);
    expect(e.html).toContain('href="https://qualidade.exemplo.com.br/?de=2026-10-06&amp;ate=2026-10-06"');
  });

  it("um dia que já passou não leva o até nem o aviso", () => {
    const e = montarEmailResumo(entrada({ periodo: diaPassado }));
    expect(e.html).toContain("Olá, Ana. Este é o resumo do dia 06/10.");
    expect(e.html).not.toContain("até as");
    expect(e.html).not.toContain("ainda não terminou");
    expect(e.texto).not.toContain("ainda não terminou");
  });

  it("não compara com o dia anterior, mesmo que o bloco traga a diferença", () => {
    expect(frasesDoBloco(geral, "dia").comparacao).toBeNull();
    const e = montarEmailResumo(entrada({ periodo: diaHoje }));
    expect(e.texto).not.toMatch(/acima d|abaixo d(a|e) (semana|agosto|setembro)|Igual a/);
    expect(e.texto).toContain("138 conversas ficaram abaixo da meta");
  });

  it("sem nota no dia: a frase fala do dia", () => {
    expect(frasesDoBloco({ ...geral, notaGeral: null }, "dia").aviso).toBe("Nenhuma conversa com nota neste dia.");
  });
});
