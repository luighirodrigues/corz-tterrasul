"use client";

import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export const INPUT =
  "w-full h-11 px-3 rounded-lg border border-line bg-surface text-ink text-base focus-visible:outline-2 outline-offset-0 outline-primary";
export const BOTAO_PRIMARIO =
  "h-11 px-6 rounded-full bg-primary text-white font-medium hover:bg-primary-hover focus-visible:outline-2 outline-offset-2 outline-primary disabled:opacity-60 disabled:cursor-wait";
export const BOTAO_SECUNDARIO =
  "h-11 px-6 inline-flex items-center justify-center rounded-full border border-line bg-surface text-primary font-medium hover:bg-primary-soft focus-visible:outline-2 outline-offset-2 outline-primary";

export const Campo: React.FC<{ id: string; rotulo: string; dica?: string; children: React.ReactNode }> = ({ id, rotulo, dica, children }) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
      {rotulo}
    </label>
    {children}
    {dica && <span className="text-xs text-muted">{dica}</span>}
  </div>
);

/** Campo de senha com botão para mostrar o que foi digitado. */
export const CampoSenha: React.FC<{ id: string; name: string; autoComplete: string; autoFocus?: boolean }> = ({ id, name, autoComplete, autoFocus }) => {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      <input id={id} name={name} type={visivel ? "text" : "password"} autoComplete={autoComplete} autoFocus={autoFocus} required className={`${INPUT} pr-11`} />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Esconder a senha" : "Mostrar a senha"}
        aria-pressed={visivel}
        className="absolute right-1 top-1 w-9 h-9 flex items-center justify-center rounded-full text-muted hover:bg-subtle focus-visible:outline-2 outline-primary"
      >
        {visivel ? <EyeOff className="w-[18px] h-[18px]" strokeWidth={1.75} /> : <Eye className="w-[18px] h-[18px]" strokeWidth={1.75} />}
      </button>
    </div>
  );
};

export const Erro: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p role="alert" className="p-3 rounded-lg bg-bad-soft text-bad text-[13px]">
    {children}
  </p>
);

/** Cartão centralizado das telas de entrada e de troca de senha. */
export const CartaoAcesso: React.FC<{ titulo: string; texto?: string; children: React.ReactNode }> = ({ titulo, texto, children }) => (
  <main className="min-h-screen flex items-start sm:items-center justify-center px-4 py-10">
    <div className="w-full max-w-[400px] flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 shrink-0 rounded-[10px] bg-primary text-white flex items-center justify-center text-lg font-semibold">T</div>
        <div className="flex flex-col">
          <span className="text-base leading-5 font-semibold">Tterrasul</span>
          <span className="text-xs text-muted">Qualidade do atendimento</span>
        </div>
      </div>
      <section className="bg-surface border border-line rounded-card p-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl leading-8 font-medium">{titulo}</h1>
          {texto && <p className="text-[13px] text-muted">{texto}</p>}
        </div>
        {children}
      </section>
    </div>
  </main>
);
