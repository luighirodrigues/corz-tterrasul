/** Regras de acesso que não dependem do banco nem do Next: ficam aqui para serem testadas. */

export type Perfil = "admin" | "usuario";

export const PERFIS: Perfil[] = ["usuario", "admin"];
export const PERFIL_ROTULO: Record<Perfil, string> = { usuario: "Usuário", admin: "Administrador" };

export interface UsuarioRegra {
  id: string;
  role: string;
  deactivatedAt: Date | null;
}

const ativo = (u: UsuarioRegra) => u.deactivatedAt === null;
const admins = (todos: UsuarioRegra[]) => todos.filter((u) => u.role === "admin" && ativo(u));

/** O motivo de o alvo não poder ser desativado, ou null se pode. */
export function motivoNaoDesativar(alvo: UsuarioRegra, todos: UsuarioRegra[], quemFaz: string): string | null {
  if (alvo.id === quemFaz) return "Você não pode desativar o seu próprio acesso.";
  if (alvo.role === "admin" && ativo(alvo) && admins(todos).length <= 1) return "Este é o único administrador ativo.";
  return null;
}

/** O motivo de o alvo não poder mudar de perfil, ou null se pode. */
export function motivoNaoMudarPerfil(alvo: UsuarioRegra, novo: Perfil, todos: UsuarioRegra[]): string | null {
  if (alvo.role === "admin" && novo !== "admin" && ativo(alvo) && admins(todos).length <= 1) {
    return "Este é o único administrador ativo: deixe outro administrador antes.";
  }
  return null;
}

const BASE_INTERNA = "http://painel.invalid";

/**
 * Só caminho interno. Recusa barra invertida e caractere de controle em qualquer posição: o navegador lê "\" como "/"
 * e apaga tab e quebra de linha, então "/<tab>/outro.site" vira "//outro.site". No fim, confere se o endereço
 * resolvido continua no próprio painel.
 */
export function caminhoSeguro(volta: string | null | undefined, padrao = "/"): string {
  if (!volta || !volta.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(volta)) return padrao;
  try {
    if (new URL(volta, BASE_INTERNA).origin !== BASE_INTERNA) return padrao;
  } catch {
    return padrao;
  }
  return volta;
}

export const SENHA_MINIMO = 8;
export const TENTATIVAS_MAXIMAS = 5;
export const BLOQUEIO_MINUTOS = 15;

/** "Hoje", "Ontem", "Há 3 dias", "Há 2 semanas" / "Nunca entrou". */
export function fmtUltimoAcesso(quando: Date | string | null, agora: Date = new Date()): string {
  if (!quando) return "Nunca entrou";
  const d = new Date(quando);
  const dia = (x: Date) => Math.floor(new Date(x.getTime() - 3 * 3600_000).getTime() / 86_400_000); // dia em Brasília
  const diff = dia(agora) - dia(d);
  if (diff <= 0) return "Hoje";
  if (diff === 1) return "Ontem";
  if (diff < 14) return `Há ${diff} dias`;
  if (diff < 60) return `Há ${Math.floor(diff / 7)} semanas`;
  return `Há ${Math.floor(diff / 30)} meses`;
}
