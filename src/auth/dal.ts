import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { VOLTA_HEADER } from "./constants";
import { getCurrentUser, type AuthUser } from "./session";

export type { AuthUser } from "./session";

async function paraLogin(): Promise<never> {
  const volta = (await headers()).get(VOLTA_HEADER);
  redirect(volta ? `/login?volta=${encodeURIComponent(volta)}` : "/login");
}

/**
 * Para páginas e ações de servidor. Sem sessão vai para o login; com senha provisória, para a troca de senha
 * (a própria página de troca pede `permitirProvisoria`).
 */
export async function requireUser(opcoes: { permitirProvisoria?: boolean } = {}): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) return paraLogin();
  if (user.mustChangePassword && !opcoes.permitirProvisoria) redirect("/trocar-senha");
  return user;
}

/** Página ou ação só de administrador: o usuário comum volta para o painel. */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

/**
 * Para as rotas da API: devolve o usuário ou a resposta pronta (401 sem sessão ou com senha provisória,
 * 403 sem o perfil pedido).
 *
 *     const auth = await authorizeApi();
 *     if (auth instanceof Response) return auth;
 */
export async function authorizeApi(perfil?: "admin"): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (perfil === "admin" && user.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  return user;
}
