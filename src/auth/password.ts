import { SENHA_MINIMO } from "./rules";
import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

/** Custo do scrypt. Vai gravado em cada senha, então dá para aumentar depois sem invalidar as antigas. */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;

const scrypt = (senha: string, sal: Buffer, n: number, r: number, p: number): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scryptCb(senha, sal, KEY_LEN, { N: n, r, p, maxmem: 256 * n * r }, (err, key) => (err ? reject(err) : resolve(key))),
  );

/** `scrypt$N$r$p$sal$hash` (sal e hash em base64url). */
export async function hashPassword(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scrypt(senha, sal, N, R, P);
  return ["scrypt", N, R, P, sal.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(senha: string, guardado: string): Promise<boolean> {
  const [tipo, n, r, p, sal, hash] = guardado.split("$");
  if (tipo !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64url");
  const calculado = await scrypt(senha, Buffer.from(sal, "base64url"), Number(n), Number(r), Number(p));
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/** Sem 0/O, 1/l/I: fácil de ditar ou copiar. */
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generateTemporaryPassword(tamanho = 10): string {
  let s = "";
  for (let i = 0; i < tamanho; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

/** Regras de A-D7. Devolve a mensagem para a pessoa, ou null se a senha serve. */
export function validateNewPassword(senha: string, email: string): string | null {
  if (senha.length < SENHA_MINIMO) return `A senha precisa ter pelo menos ${SENHA_MINIMO} caracteres.`;
  if (senha.trim().toLowerCase() === email.trim().toLowerCase()) return "A senha não pode ser igual ao e-mail.";
  return null;
}
