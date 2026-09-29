import { NextResponse, type NextRequest } from "next/server";

/**
 * Basic Auth em todas as rotas (tela e /api). As telas e a API expõem conversas de clientes.
 * Sem REPORT_BASIC_AUTH_USER/PASS configurados, só libera em desenvolvimento.
 */
export function proxy(request: NextRequest) {
  const user = process.env.REPORT_BASIC_AUTH_USER;
  const pass = process.env.REPORT_BASIC_AUTH_PASS;

  if (!user || !pass) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Autenticação não configurada.", { status: 503 });
    }
    return NextResponse.next();
  }

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [u, ...rest] = atob(header.slice(6)).split(":");
      if (u === user && rest.join(":") === pass) return NextResponse.next();
    } catch {
      // cai no 401
    }
  }

  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Qualidade FLW"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
