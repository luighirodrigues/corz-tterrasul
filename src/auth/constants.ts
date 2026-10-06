export const SESSION_COOKIE = "sessao";
export const SESSION_DAYS = 30;
/** Cabeçalho em que o proxy repassa o endereço pedido, para o login voltar para ele. */
export const VOLTA_HEADER = "x-volta";

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 3600,
  };
}
