"use client";

import React, { useActionState } from "react";
import Link from "next/link";
import { sair, trocarSenha } from "@/app/trocar-senha/actions";
import { SENHA_MINIMO } from "@/auth/rules";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Campo, CampoSenha, CartaoAcesso, Erro } from "./Campos";

export const TrocarSenhaForm: React.FC<{ provisoria: boolean }> = ({ provisoria }) => {
  const [estado, acao, pendente] = useActionState(trocarSenha, undefined);
  return (
    <CartaoAcesso
      titulo={provisoria ? "Crie a sua senha" : "Trocar senha"}
      texto={provisoria ? "A senha que você recebeu vale só para este primeiro acesso. Escolha uma senha só sua." : undefined}
    >
      <form action={acao} className="flex flex-col gap-4">
        {!provisoria && (
          <Campo id="atual" rotulo="Senha atual">
            <CampoSenha id="atual" name="atual" autoComplete="current-password" autoFocus />
          </Campo>
        )}
        <Campo id="nova" rotulo="Nova senha" dica={`Pelo menos ${SENHA_MINIMO} caracteres.`}>
          <CampoSenha id="nova" name="nova" autoComplete="new-password" autoFocus={provisoria} />
        </Campo>
        <Campo id="confirmacao" rotulo="Repita a nova senha">
          <CampoSenha id="confirmacao" name="confirmacao" autoComplete="new-password" />
        </Campo>
        {estado?.erro && <Erro>{estado.erro}</Erro>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
            {pendente ? "Salvando…" : "Salvar senha"}
          </button>
          {!provisoria && (
            <Link href="/" className={BOTAO_SECUNDARIO}>
              Cancelar
            </Link>
          )}
        </div>
      </form>
      {provisoria && (
        <form action={sair}>
          <button type="submit" className="text-[13px] text-primary font-medium hover:underline focus-visible:outline-2 outline-primary">
            Sair
          </button>
        </form>
      )}
    </CartaoAcesso>
  );
};
