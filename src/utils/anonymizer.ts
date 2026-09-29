/**
 * Utilitário de higienização e anonimização de transcrições e evidências.
 * Em conformidade com as regras do PRD (§3 e §11):
 * - Mascara telefones, emails, CPFs e CNPJs
 * - Substitui o nome do cliente por {{cliente}}
 * - O nome do atendente é mantido pois o relatório é interno.
 */

export interface AnonymizeOptions {
  /** Compatibilidade: um único nome. Prefira `clientNames`. */
  clientName?: string | null;
  clientNames?: Array<string | null | undefined>;
  clientPhone?: string | null;
}

const PHONE_REGEX = /(?:\+?55\s?)?(?:\(?0?[1-9]{2}\)?\s?)?(?:9\s?)?[0-9]{4}[-\s]?[0-9]{4}/g;
const EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;
const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_REGEX = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;

export function anonymizeText(text: string, options: AnonymizeOptions = {}): string {
  if (!text) return "";

  let result = text;

  // 1. E-mail
  result = result.replace(EMAIL_REGEX, "{{email}}");

  // 2. CNPJ antes de CPF (o CNPJ contém sequências que casariam como CPF)
  result = result.replace(CNPJ_REGEX, "{{cnpj}}");
  result = result.replace(CPF_REGEX, (m) =>
    /^\d{11}$/.test(m) && /^[1-9]{2}9\d{8}$/.test(m) ? m : "{{cpf}}" // 11 dígitos com cara de celular ficam para a regra de telefone
  );

  // 3. Telefone conhecido do contato
  if (options.clientPhone && options.clientPhone.trim().length >= 8) {
    const rawPhone = options.clientPhone.replace(/\D/g, "");
    if (rawPhone.length >= 8) {
      const lastDigits = rawPhone.slice(-8);
      const phonePattern = new RegExp(`\\b\\D*${lastDigits.slice(0, 4)}[\\s-]?${lastDigits.slice(4)}\\D*`, "g");
      result = result.replace(phonePattern, " {{fone}} ");
    }
  }

  // 4. Padrões gerais de telefone
  result = result.replace(PHONE_REGEX, "{{fone}}");

  // 5. Nomes do cliente (nome no cadastro e nome no WhatsApp)
  const names = [...(options.clientNames ?? []), options.clientName];
  const parts = new Set<string>();
  for (const name of names) {
    if (!name || name.trim().length < 3) continue;
    for (const part of name.trim().split(/\s+/)) {
      if (part.length >= 3) parts.add(part);
    }
  }
  for (const part of parts) {
    result = result.replace(new RegExp(`\\b${escapeRegExp(part)}\\b`, "gi"), "{{cliente}}");
  }

  return result.replace(/[ \t]+/g, " ").trim();
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Trunca uma evidência para no máximo maxChars caracteres, anonimizando antes.
 */
export function truncateEvidence(text: string, maxChars = 200, options: AnonymizeOptions = {}): string {
  if (!text) return "";
  const cleaned = anonymizeText(text, options);
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.substring(0, maxChars - 3).trim() + "...";
}
