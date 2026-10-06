"use client";

import React, { useActionState } from "react";
import { entrar } from "@/app/login/actions";
import { BOTAO_PRIMARIO, Campo, CampoSenha, CartaoAcesso, Erro, INPUT } from "./Campos";

export const LoginForm: React.FC<{ volta: string }> = ({ volta }) => {
  const [estado, acao, pendente] = useActionState(entrar, undefined);
  return (
    <CartaoAcesso titulo="Entrar">
      <form action={acao} className="flex flex-col gap-4">
        <input type="hidden" name="volta" value={volta} />
        <Campo id="email" rotulo="E-mail">
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
            defaultValue={estado?.email}
            className={INPUT}
          />
        </Campo>
        <Campo id="senha" rotulo="Senha">
          <CampoSenha id="senha" name="senha" autoComplete="current-password" />
        </Campo>
        {estado?.erro && <Erro>{estado.erro}</Erro>}
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </CartaoAcesso>
  );
};
