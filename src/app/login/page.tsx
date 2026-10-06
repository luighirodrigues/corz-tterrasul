import { redirect } from "next/navigation";
import { caminhoSeguro } from "@/auth/rules";
import { getCurrentUser } from "@/auth/session";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Entrar · Tterrasul" };

/** Quem já está conectado vai direto para o painel; a única página aberta a quem não tem sessão. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ volta?: string | string[] }> }) {
  const { volta: bruto } = await searchParams;
  const volta = caminhoSeguro(Array.isArray(bruto) ? bruto[0] : bruto);
  if (await getCurrentUser()) redirect(volta);
  return <LoginForm volta={volta} />;
}
