/**
 * Utilitário de higienização e anonimização de transcrições e evidências.
 * Em conformidade com as regras do PRD (§3 e §11):
 * - Mascara telefones, emails e CPFs
 * - Substitui o nome do cliente por {{cliente}}
 * - O nome do atendente é mantido pois o relatório é interno.
 */

export interface AnonymizeOptions {
  clientName?: string | null;
  clientPhone?: string | null;
}

const PHONE_REGEX = /(?:\+?55\s?)?(?:\(?0?[1-9]{2}\)?\s?)?(?:9\s?)?[0-9]{4}[-\s]?[0-9]{4}/g;
const EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;
const CPF_REGEX = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;

export function anonymizeText(text: string, options: AnonymizeOptions = {}): string {
  if (!text) return "";

  let result = text;

  // 1. Mascarar email
  result = result.replace(EMAIL_REGEX, "{{email}}");

  // 2. Mascarar CPF com pontuação formal
  result = result.replace(CPF_REGEX, "{{cpf}}");

  // 3. Mascarar telefone explícito do contato se fornecido

  if (options.clientPhone && options.clientPhone.trim().length >= 8) {
    const rawPhone = options.clientPhone.replace(/\D/g, "");
    if (rawPhone.length >= 8) {
      // Cria regex flexível para os dígitos do telefone
      const lastDigits = rawPhone.slice(-8);
      const phonePattern = new RegExp(`\\b\\D*${lastDigits.slice(0, 4)}[\\s-]?${lastDigits.slice(4)}\\D*`, "g");
      result = result.replace(phonePattern, " {{fone}} ");
    }
  }

  // 4. Mascarar padrões gerais de telefone
  result = result.replace(PHONE_REGEX, "{{fone}}");

  // 5. Mascarar nome do cliente se fornecido (com mais de 2 letras para evitar falso positivo)
  if (options.clientName && options.clientName.trim().length >= 3) {
    const nameParts = options.clientName.trim().split(/\s+/).filter(part => part.length >= 3);
    for (const part of nameParts) {
      const nameRegex = new RegExp(`\\b${escapeRegExp(part)}\\b`, "gi");
      result = result.replace(nameRegex, "{{cliente}}");
    }
  }

  // Normalizar espaços duplicados
  return result.replace(/[ \t]+/g, " ").trim();
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Trunca uma evidência para no máximo maxChars caracteres respeitando palavras.
 */
export function truncateEvidence(text: string, maxChars = 200): string {
  if (!text) return "";
  const cleaned = anonymizeText(text);
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.substring(0, maxChars - 3).trim() + "...";
}
