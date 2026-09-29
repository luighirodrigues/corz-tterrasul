import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tterrasul • Painel de Qualidade FLW",
  description: "Sistema de auditoria de qualidade de conversas FLW Chat com métricas sintéticas e análise com IA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
