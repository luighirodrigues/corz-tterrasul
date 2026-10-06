import { describe, expect, it } from "vitest";
import { generateTemporaryPassword, hashPassword, validateNewPassword, verifyPassword } from "../src/auth/password";

describe("senha", () => {
  it("confere a senha certa e recusa a errada", async () => {
    const guardado = await hashPassword("minha-senha-boa");
    expect(guardado.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(await verifyPassword("minha-senha-boa", guardado)).toBe(true);
    expect(await verifyPassword("minha-senha-boaa", guardado)).toBe(false);
    expect(await verifyPassword("", guardado)).toBe(false);
  });

  it("usa um sal diferente a cada senha", async () => {
    expect(await hashPassword("igual-igual")).not.toBe(await hashPassword("igual-igual"));
  });

  it("recusa um valor guardado malformado, sem lançar", async () => {
    expect(await verifyPassword("x", "texto-qualquer")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$a$b")).toBe(false);
  });

  it("gera senha provisória de 10 caracteres sem os que se confundem", () => {
    for (let i = 0; i < 200; i++) {
      const s = generateTemporaryPassword();
      expect(s).toHaveLength(10);
      expect(s).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
    }
    expect(generateTemporaryPassword()).not.toBe(generateTemporaryPassword());
  });

  it("valida a senha nova (A-D7)", () => {
    expect(validateNewPassword("curta", "a@b.com")).toMatch(/pelo menos 8/);
    expect(validateNewPassword("ana.silva@x.com", "Ana.Silva@x.com")).toMatch(/igual ao e-mail/);
    expect(validateNewPassword("12345678", "a@b.com")).toBeNull(); // sem exigir maiúscula, número ou símbolo
  });
});
