import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O Next (Turbopack) não resolve `import "./x.js"` para `./x.ts`. Tudo o que a tela alcança — as rotas da API,
 * os loaders e, a partir deles, o cálculo de escopo e os módulos de domínio — tem de importar sem a extensão `.js`.
 * Os jobs rodam com `tsx`, que resolve os dois jeitos.
 */
const ROOT = path.resolve(__dirname, "..", "src");
const ENTRIES = [
  "app/api/reports/route.ts",
  "app/api/reports/live/route.ts",
  "app/api/reports/weeks/route.ts",
  "app/api/reports/history/route.ts",
  "app/api/reports/periods/route.ts",
  "app/api/sessions/route.ts",
  "app/api/pipeline/route.ts",
  "app/page.tsx",
  "app/status/page.tsx",
];

const IMPORT_RE = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function resolveFile(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null; // pacote
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate) && /\.(tsx?)$/.test(candidate)) return candidate;
  }
  return null;
}

describe("módulos que a tela alcança", () => {
  it("não importam arquivos .ts/.tsx com a extensão .js", () => {
    const seen = new Set<string>();
    const bad: string[] = [];
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, "utf-8");
      for (const m of src.matchAll(IMPORT_RE)) {
        const spec = m[1];
        if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;
        if (spec.endsWith(".js")) {
          // .js que existe de verdade (client do Prisma gerado) é permitido
          const real = path.resolve(path.dirname(file), spec);
          const tsTwin = real.replace(/\.js$/, ".ts");
          if (existsSync(tsTwin) && !existsSync(real)) bad.push(`${path.relative(ROOT, file)} → ${spec}`);
          continue;
        }
        const next = resolveFile(spec, file);
        if (next) visit(next);
      }
    };
    for (const e of ENTRIES) visit(path.join(ROOT, e));

    expect(seen.size).toBeGreaterThan(20); // o grafo foi mesmo percorrido
    expect(bad).toEqual([]);
  });
});
