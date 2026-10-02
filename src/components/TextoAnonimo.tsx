import React from "react";
import { MARCADORES } from "@/lib/labels";

const MARCADOR = /(\{\{\w+\}\})/g;

/** Texto com os dados ocultos pelo anonimizador: cada `{{cliente}}`, `{{fone}}`... vira uma marca discreta. */
export const TextoAnonimo: React.FC<{ texto: string }> = ({ texto }) => (
  <>
    {texto.split(MARCADOR).map((parte, i) => {
      const nome = /^\{\{(\w+)\}\}$/.exec(parte)?.[1];
      if (nome === undefined) return parte;
      return (
        <span key={i} className="bg-subtle text-muted rounded px-1">
          {MARCADORES[nome] ?? nome}
        </span>
      );
    })}
  </>
);
