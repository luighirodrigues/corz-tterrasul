import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  EXECUCOES_GUARDADAS,
  LINHAS_GUARDADAS,
  aguardar,
  algumaRodando,
  buscarExecucao,
  execucaoParaJson,
  iniciarExecucao,
} from "../src/jobs/http/execucoes";

/** O processo filho de verdade, com um script no lugar do CLI (não chama a FLW, a OpenAI nem o banco). */
const script = path.resolve(__dirname, "fixtures", "cli-falso.mjs");
const rodar = (...argv: string[]) => iniciarExecucao(argv, { script });

describe("execuções disparadas por HTTP", () => {
  beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterAll(() => vi.restoreAllMocks());

  it("guarda a saída do stdout e do stderr, o código e o fim", async () => {
    const exec = rodar("daily", "--email", "--reason", "Sync atrasado");
    expect(exec.status).toBe("rodando");
    expect(exec.comando).toBe('pnpm daily -- --email --reason "Sync atrasado"');
    await aguardar(exec, 10_000);

    expect(exec.status).toBe("concluido");
    expect(exec.codigo).toBe(0);
    expect(exec.fim).toBeInstanceOf(Date);
    expect(exec.saida).toContain('argv: ["daily","--email","--reason","Sync atrasado"]');
    expect(exec.saida).toContain("aviso no stderr");
    expect(exec.saida).toContain("sem quebra no fim");
    expect(buscarExecucao(exec.id)).toBe(exec);
    expect(execucaoParaJson(exec)).toMatchObject({ id: exec.id, status: "concluido", codigo: 0, fim: expect.any(String) });
  });

  it("código diferente de zero é erro", async () => {
    const exec = rodar("daily", "--codigo", "3");
    await aguardar(exec, 10_000);
    expect(exec).toMatchObject({ status: "erro", codigo: 3 });
  });

  it("guarda só as últimas linhas", async () => {
    const exec = rodar("daily", "--linhas", String(LINHAS_GUARDADAS + 50));
    await aguardar(exec, 10_000);
    expect(exec.saida).toHaveLength(LINHAS_GUARDADAS);
    expect(exec.saida).toContain(`linha ${LINHAS_GUARDADAS + 50}`);
    expect(exec.saida).not.toContain("linha 1");
  });

  it("aguardar devolve no prazo com o comando ainda rodando", async () => {
    const exec = rodar("daily", "--espera", "1500");
    const antes = Date.now();
    await aguardar(exec, 100);
    expect(Date.now() - antes).toBeLessThan(1000);
    expect(exec.status).toBe("rodando");
    expect(algumaRodando()).toBe(true);

    await aguardar(exec, 10_000);
    expect(exec.status).toBe("concluido");
    expect(algumaRodando()).toBe(false);
  });

  it(`guarda só as ${EXECUCOES_GUARDADAS} últimas execuções`, async () => {
    const primeira = rodar("daily");
    await aguardar(primeira, 10_000);
    const resto = Array.from({ length: EXECUCOES_GUARDADAS }, () => rodar("daily"));
    await Promise.all(resto.map((e) => aguardar(e, 10_000)));
    expect(buscarExecucao(primeira.id)).toBeUndefined();
    for (const e of resto) expect(buscarExecucao(e.id)).toBe(e);
  }, 30_000);
});
