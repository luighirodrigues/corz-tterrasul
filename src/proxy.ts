import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, VOLTA_HEADER, sessionCookieOptions } from "@/auth/constants";

/**
 * Checagem rápida em toda requisição: só olha se o cookie de sessão existe, sem consultar o banco (o proxy roda
 * até nas de pré-carregamento). Quem valida a sessão de verdade é `src/auth/dal.ts`, em cada página, rota e ação.
 * Livre: /login, /_next/* e o favicon.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/_next/")) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const api = pathname.startsWith("/api/");

  if (!token) {
    if (api) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    // O Next exige endereço completo no redirecionamento. Atrás do proxy do EasyPanel, o endereço público
    // vem nos cabeçalhos x-forwarded-*; o `request.url` pode trazer o host interno.
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? request.nextUrl.protocol.replace(":", "");
    return NextResponse.redirect(`${proto}://${host}/login?volta=${encodeURIComponent(pathname + search)}`);
  }

  // O login volta para a página que a pessoa pediu quando a sessão não vale mais.
  const headers = new Headers(request.headers);
  headers.set(VOLTA_HEADER, pathname + search);
  const response = NextResponse.next({ request: { headers } });

  // Cada uso renova o prazo do cookie (o do banco é renovado em `getCurrentUser`). Ações de servidor são POST e ficam de fora,
  // para não brigar com o cookie que "Sair" apaga.
  if (request.method === "GET" && !api) response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
