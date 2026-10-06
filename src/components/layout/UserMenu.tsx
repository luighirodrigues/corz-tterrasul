"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { sair } from "@/app/trocar-senha/actions";

export interface UsuarioMenu {
  name: string;
  email: string;
  role: string;
}

/** "Ana Paula Souza" → "AS". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

const ITEM =
  "flex w-full items-center h-10 px-4 text-left hover:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 outline-primary";

export const UserMenu: React.FC<{ usuario: UsuarioMenu }> = ({ usuario }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const fechar = (devolverFoco = true) => {
    setOpen(false);
    if (devolverFoco) botao.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fechar(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const navegar = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const itens = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = itens.indexOf(e.target as HTMLElement);
    if (i === -1) return;
    const j = e.key === "Home" ? 0 : e.key === "End" ? itens.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + itens.length) % itens.length;
    e.preventDefault();
    itens[j]?.focus();
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        ref={botao}
        type="button"
        onClick={() => (open ? fechar(false) : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Conta de ${usuario.name}`}
        className="w-10 h-10 rounded-full bg-primary-soft text-primary-ink text-[13px] font-semibold flex items-center justify-center hover:bg-primary-faint focus-visible:outline-2 outline-offset-2 outline-primary"
      >
        {iniciais(usuario.name)}
      </button>

      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Conta"
          onKeyDown={navegar}
          className="absolute z-50 right-0 top-full mt-1 w-[260px] max-w-[calc(100vw-32px)] py-2 bg-surface rounded-card shadow-menu"
        >
          <div className="px-4 pt-1 pb-2.5 mb-1 border-b border-divider">
            <div className="font-medium truncate">{usuario.name}</div>
            <div className="text-xs text-muted truncate">{usuario.email}</div>
          </div>
          <Link href="/trocar-senha" role="menuitem" className={ITEM} onClick={() => fechar(false)}>
            Trocar senha
          </Link>
          {usuario.role === "admin" && (
            <Link href="/usuarios" role="menuitem" className={ITEM} onClick={() => fechar(false)}>
              Usuários
            </Link>
          )}
          <form action={sair}>
            <button type="submit" role="menuitem" className={ITEM}>
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
