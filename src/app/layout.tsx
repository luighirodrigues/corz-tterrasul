import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tterrasul · Qualidade do atendimento",
  description: "Qualidade do atendimento por WhatsApp: notas, indicadores e análise das conversas.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={figtree.variable}>
      <body className="min-h-screen bg-page text-ink text-sm antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
