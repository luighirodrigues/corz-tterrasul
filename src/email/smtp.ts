import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export interface MensagemEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Quem envia. Nos testes e no `--dry-run` entra outra função no lugar. */
export type Enviar = (mensagem: MensagemEmail) => Promise<void>;

export interface Remetente {
  enviar: Enviar;
  fechar: () => void;
}

/** O envio só liga quando o servidor de e-mail está configurado (`SMTP_HOST`). */
export const emailLigado = (): boolean => env.SMTP_HOST.trim() !== "";

/** Remetente do .env, ou o próprio usuário do SMTP quando for um e-mail. */
export function remetente(): string {
  return env.EMAIL_FROM.trim() || (env.SMTP_USER.includes("@") ? env.SMTP_USER : "");
}

/**
 * Transporte do nodemailer com as variáveis do .env: uma conexão aberta e no máximo 1 e-mail por segundo,
 * para não esbarrar no limite do provedor.
 */
export function criarRemetente(): Remetente {
  if (!emailLigado()) throw new Error("Envio de e-mail desligado: configure SMTP_HOST.");
  const from = remetente();
  if (!from) throw new Error("Configure EMAIL_FROM com o remetente, por exemplo: Tterrasul Qualidade <qualidade@tterrasul.com.br>.");

  const transporte = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    pool: true,
    maxConnections: 1,
    rateDelta: 1000,
    rateLimit: 1,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  return {
    enviar: async (m) => {
      await transporte.sendMail({ from, to: m.to, subject: m.subject, html: m.html, text: m.text });
    },
    fechar: () => transporte.close(),
  };
}

/** O erro do servidor de e-mail por extenso, para o terminal e para a página técnica. */
export function textoDoErro(err: unknown): string {
  const e = err as { message?: string; code?: string; response?: string; command?: string };
  const partes = [e?.message ?? String(err)];
  if (e?.code && !partes[0].includes(e.code)) partes.push(`código ${e.code}`);
  if (e?.response && !partes[0].includes(e.response)) partes.push(`resposta: ${e.response}`);
  return partes.join(" · ").slice(0, 500);
}
