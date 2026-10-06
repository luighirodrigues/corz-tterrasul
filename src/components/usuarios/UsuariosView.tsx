"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, EllipsisVertical, UserPlus, X } from "lucide-react";
import { criarUsuario, desativarUsuario, editarUsuario, gerarSenhaProvisoria, reativarUsuario, type Resultado } from "@/app/usuarios/actions";
import { PERFIL_ROTULO, fmtUltimoAcesso, type Perfil } from "@/auth/rules";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Campo, Erro, INPUT } from "@/components/auth/Campos";
import type { GrupoAssinavel } from "@/domain/report-scopes";
import { FREQUENCIAS, textoFrequencias, type FrequenciasDoUsuario } from "@/email/frequencias";

/** Um escopo que a pessoa acompanha por e-mail. `existe` é falso quando o grupo ou o painel saiu da configuração. */
export interface ResumoLinha {
  scopeType: string;
  scopeId: string;
  rotulo: string;
  existe: boolean;
}

export interface UsuarioLinha {
  id: string;
  name: string;
  email: string;
  role: Perfil;
  agentExternalId: string | null;
  agentNome: string | null;
  lastSeenAt: string | null;
  bloqueado: boolean;
  desativadoEm: string | null;
  resumos: ResumoLinha[];
  frequencias: FrequenciasDoUsuario;
  voce: boolean;
  motivoNaoDesativar: string | null;
}

export interface AtendenteOpcao {
  externalId: string;
  nome: string;
  /** Id do usuário a que o atendente já está vinculado. */
  vinculadoA: string | null;
}

type Janela =
  | { tipo: "novo" }
  | { tipo: "editar"; usuario: UsuarioLinha }
  | { tipo: "desativar"; usuario: UsuarioLinha }
  | { tipo: "gerar"; usuario: UsuarioLinha }
  | { tipo: "senha"; nome: string; senha: string };

const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

const ITEM =
  "flex w-full flex-col justify-center min-h-10 px-4 py-2 text-left hover:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 outline-primary";

interface AcaoMenu {
  rotulo: string;
  onClick: () => void;
  /** Por que a ação não está disponível: aparece no lugar dela. */
  motivo?: string | null;
}

const MenuAcoes: React.FC<{ nome: string; acoes: AcaoMenu[] }> = ({ nome, acoes }) => {
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

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        ref={botao}
        type="button"
        onClick={() => (open ? fechar(false) : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Ações de ${nome}`}
        className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:bg-subtle focus-visible:outline-2 outline-primary"
      >
        <EllipsisVertical className="w-5 h-5" strokeWidth={1.75} />
      </button>
      {open && (
        <div ref={menu} role="menu" aria-label={`Ações de ${nome}`} className="absolute z-30 right-0 top-full mt-1 w-[280px] max-w-[calc(100vw-32px)] py-2 bg-surface rounded-card shadow-menu">
          {acoes.map((a) =>
            a.motivo ? (
              <div key={a.rotulo} className="px-4 py-2 text-muted">
                <div>{a.rotulo}</div>
                <div className="text-xs">{a.motivo}</div>
              </div>
            ) : (
              <button
                key={a.rotulo}
                type="button"
                role="menuitem"
                className={ITEM}
                onClick={() => {
                  fechar(false);
                  a.onClick();
                }}
              >
                {a.rotulo}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
};

const Modal: React.FC<{ titulo: string; onClose: () => void; children: React.ReactNode }> = ({ titulo, onClose, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="w-full sm:max-w-[460px] max-h-[92vh] overflow-y-auto bg-surface rounded-t-card sm:rounded-card p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{titulo}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center text-muted hover:bg-subtle focus-visible:outline-2 outline-primary">
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const CaixaResumo: React.FC<{ valor: string; rotulo: string; marcado: boolean; nome?: string }> = ({ valor, rotulo, marcado, nome = "resumo" }) => (
  <label className="flex items-center gap-3 min-h-10 cursor-pointer">
    <input type="checkbox" name={nome} value={valor} defaultChecked={marcado} className="w-[18px] h-[18px] accent-primary shrink-0" />
    <span>{rotulo}</span>
  </label>
);

const FormUsuario: React.FC<{
  inicial?: UsuarioLinha;
  atendentes: AtendenteOpcao[];
  grupos: GrupoAssinavel[];
  onFeito: (r: Extract<Resultado, { ok: true }>) => void;
  onCancelar: () => void;
}> = ({ inicial, atendentes, grupos, onFeito, onCancelar }) => {
  const [pendente, comecar] = useTransition();
  const [resposta, setResposta] = useState<Extract<Resultado, { ok: false }> | null>(null);
  const livres = atendentes.filter((a) => a.vinculadoA === null || a.vinculadoA === inicial?.id);
  const marcados = new Set((inicial?.resumos ?? []).map((r) => `${r.scopeType}:${r.scopeId}`));
  // O que a pessoa acompanha e já não existe: continua marcado, para o administrador desmarcar.
  const sumidos = (inicial?.resumos ?? []).filter((r) => !r.existe);
  // Quem já existe começa com o que a pessoa recebe hoje; no cadastro, Semanal e Mensal.
  const frequencias = inicial?.frequencias ?? { resumoDia: false, resumoSemana: true, resumoMes: true };

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const dados = {
      nome: String(f.get("nome") ?? ""),
      email: String(f.get("email") ?? ""),
      perfil: String(f.get("perfil") ?? "usuario"),
      agente: String(f.get("agente") ?? "") || null,
      frequencias: f.getAll("frequencia").map(String),
      resumos: f.getAll("resumo").map((v) => {
        const [scopeType, ...resto] = String(v).split(":");
        return { scopeType, scopeId: resto.join(":") };
      }),
    };
    comecar(async () => {
      const r = inicial ? await editarUsuario(inicial.id, dados) : await criarUsuario(dados);
      if (r.ok) onFeito(r);
      else setResposta(r);
    });
  };

  const reativar = (id: string) =>
    comecar(async () => {
      const r = await reativarUsuario(id);
      if (r.ok) onFeito(r);
      else setResposta(r);
    });

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <Campo id="u-nome" rotulo="Nome">
        <input id="u-nome" name="nome" required autoFocus defaultValue={inicial?.name} autoComplete="off" className={INPUT} />
      </Campo>
      <Campo id="u-email" rotulo="E-mail">
        <input id="u-email" name="email" type="email" required defaultValue={inicial?.email} autoComplete="off" autoCapitalize="none" spellCheck={false} className={INPUT} />
      </Campo>
      <Campo id="u-perfil" rotulo="Perfil" dica="O administrador também cadastra usuários e vê a página técnica. Os dois veem o painel inteiro.">
        <div className="relative">
          <select id="u-perfil" name="perfil" defaultValue={inicial?.role ?? "usuario"} className={`${INPUT} appearance-none pr-10`}>
            <option value="usuario">{PERFIL_ROTULO.usuario}</option>
            <option value="admin">{PERFIL_ROTULO.admin}</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-3 w-5 h-5 text-muted" strokeWidth={1.75} />
        </div>
      </Campo>
      <Campo id="u-agente" rotulo="Atendente (opcional)" dica="Liga esta pessoa à ficha dela na aba Atendentes.">
        <div className="relative">
          <select id="u-agente" name="agente" defaultValue={inicial?.agentExternalId ?? ""} className={`${INPUT} appearance-none pr-10`}>
            <option value="">Nenhum</option>
            {livres.map((a) => (
              <option key={a.externalId} value={a.externalId}>
                {a.nome}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-3 w-5 h-5 text-muted" strokeWidth={1.75} />
        </div>
      </Campo>
      <fieldset className="flex flex-col gap-3 min-w-0">
        <legend className="font-medium">Resumos por e-mail</legend>
        <p className="text-xs text-muted -mt-1">O diário chega uma vez por dia, com o dia até a hora do envio. O semanal e o mensal chegam quando sai o relatório.</p>
        <div role="group" aria-label="Com que frequência" className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Com que frequência</span>
          {FREQUENCIAS.map((f) => (
            <CaixaResumo key={f.granularity} nome="frequencia" valor={f.granularity} rotulo={f.rotulo} marcado={frequencias[f.campo]} />
          ))}
        </div>
        {grupos.map((g) => (
          <div key={g.tipo} role="group" aria-label={g.titulo} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">{g.titulo}</span>
            {g.escopos.map((e) => (
              <CaixaResumo key={`${e.scopeType}:${e.scopeId}`} valor={`${e.scopeType}:${e.scopeId}`} rotulo={e.nome} marcado={marcados.has(`${e.scopeType}:${e.scopeId}`)} />
            ))}
          </div>
        ))}
        {sumidos.length > 0 && (
          <div role="group" aria-label="Que não existem mais" className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Que não existem mais</span>
            {sumidos.map((r) => (
              <CaixaResumo key={`${r.scopeType}:${r.scopeId}`} valor={`${r.scopeType}:${r.scopeId}`} rotulo={`${r.rotulo} (não existe mais)`} marcado />
            ))}
          </div>
        )}
      </fieldset>
      {resposta && (
        <div className="flex flex-col gap-2">
          <Erro>{resposta.erro}</Erro>
          {/* Só no cadastro: na edição, reativar outra pessoa fecharia a janela sem salvar o que foi editado. */}
          {resposta.reativar && !inicial && (
            <button type="button" disabled={pendente} onClick={() => reativar(resposta.reativar!.id)} className={BOTAO_SECUNDARIO}>
              Reativar {resposta.reativar.nome}
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? "Salvando…" : inicial ? "Salvar" : "Adicionar"}
        </button>
        <button type="button" onClick={onCancelar} className={BOTAO_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  );
};

const SenhaProvisoria: React.FC<{ senha: string; onFechar: () => void }> = ({ senha, onFechar }) => {
  const [copiado, setCopiado] = useState<"senha" | "mensagem" | null>(null);
  const mensagem = `Acesse ${window.location.origin} com o seu e-mail e a senha provisória ${senha}. No primeiro acesso você cria a sua senha.`;

  const copiar = async (que: "senha" | "mensagem") => {
    try {
      await navigator.clipboard.writeText(que === "senha" ? senha : mensagem);
      setCopiado(que);
    } catch {
      setCopiado(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-2">Esta senha aparece só agora. Copie e mande para a pessoa: ela cria a própria senha no primeiro acesso.</p>
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-subtle">
        <code className="text-xl font-medium tracking-wider select-all">{senha}</code>
        <button type="button" onClick={() => copiar("senha")} className="h-9 px-4 rounded-full border border-line bg-surface text-primary font-medium hover:bg-primary-soft focus-visible:outline-2 outline-primary">
          {copiado === "senha" ? "Copiado" : "Copiar"}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted">Mensagem pronta para enviar</span>
        <p className="p-3 rounded-lg border border-line text-[13px] select-all">{mensagem}</p>
        <button type="button" onClick={() => copiar("mensagem")} className={`${BOTAO_SECUNDARIO} self-start`}>
          {copiado === "mensagem" ? "Mensagem copiada" : "Copiar mensagem"}
        </button>
      </div>
      <button type="button" onClick={onFechar} className={`${BOTAO_PRIMARIO} self-start`}>
        Pronto
      </button>
    </div>
  );
};

/** Reativar mantém a senha: o aviso diz isso, porque nenhuma senha provisória aparece. */
const avisoReativado = (nome: string) => `Acesso de ${nome} reativado. A senha continua a mesma de antes.`;

export const UsuariosView: React.FC<{ ativos: UsuarioLinha[]; desativados: UsuarioLinha[]; atendentes: AtendenteOpcao[]; grupos: GrupoAssinavel[] }> = ({
  ativos,
  desativados,
  atendentes,
  grupos,
}) => {
  const [janela, setJanela] = useState<Janela | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();
  const fechar = () => setJanela(null);
  const abrir = (j: Janela) => {
    setErro(null);
    setAviso(null);
    setJanela(j);
  };

  const executar = (acao: () => Promise<Resultado>, depois?: (r: Extract<Resultado, { ok: true }>) => void) => {
    setErro(null);
    setAviso(null);
    comecar(async () => {
      const r = await acao();
      if (r.ok) depois?.(r);
      else setErro(r.erro);
      if (r.ok && !depois) fechar();
    });
  };

  // "Adicionar usuário" termina com a senha provisória, ou com o aviso, quando o e-mail era de alguém desativado.
  const depoisDeAdicionar = (r: Extract<Resultado, { ok: true }>) => {
    if (r.senhaProvisoria) {
      setJanela({ tipo: "senha", nome: r.nome ?? "", senha: r.senhaProvisoria });
      return;
    }
    fechar();
    setAviso(avisoReativado(r.nome ?? "usuário"));
  };

  const acoesDe = (u: UsuarioLinha): AcaoMenu[] => [
    { rotulo: "Editar", onClick: () => abrir({ tipo: "editar", usuario: u }) },
    {
      rotulo: "Gerar nova senha provisória",
      onClick: () => abrir({ tipo: "gerar", usuario: u }),
      motivo: u.voce ? "Para trocar a sua senha, use «Trocar senha» no menu da sua conta." : null,
    },
    { rotulo: "Desativar", onClick: () => abrir({ tipo: "desativar", usuario: u }), motivo: u.motivoNaoDesativar },
  ];

  const titulos: Record<Janela["tipo"], string> = {
    novo: "Adicionar usuário",
    editar: "Editar usuário",
    desativar: "Desativar usuário",
    gerar: "Gerar nova senha provisória",
    senha: "Senha provisória",
  };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/" className="inline-flex items-center gap-1.5 self-start text-[13px] text-primary font-medium hover:underline focus-visible:outline-2 outline-primary">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Voltar ao painel
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl leading-8 font-medium">Usuários</h1>
            <span className="text-muted">Quem pode entrar no painel. Todos veem os dados de todos os atendentes.</span>
          </div>
          <button type="button" onClick={() => abrir({ tipo: "novo" })} className={`${BOTAO_PRIMARIO} inline-flex items-center gap-2`}>
            <UserPlus className="w-[18px] h-[18px]" strokeWidth={1.75} />
            Adicionar usuário
          </button>
        </div>
      </div>

      {erro && !janela && <Erro>{erro}</Erro>}
      {aviso && (
        <p role="status" className="p-3 rounded-lg bg-primary-soft text-primary-ink text-[13px]">
          {aviso}
        </p>
      )}

      <ul className="bg-surface border border-line rounded-card divide-y divide-divider">
        {ativos.map((u) => (
          <li key={u.id} className="flex items-start gap-3 p-4">
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{u.name}</span>
                {u.voce && <span className="text-xs text-muted">(você)</span>}
                {u.role === "admin" && <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-primary-soft text-primary-ink text-xs font-medium">Administrador</span>}
                {u.bloqueado && <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-warn-soft text-warn text-xs font-medium">Bloqueado por tentativas</span>}
              </div>
              <span className="text-[13px] text-ink-2 break-all">{u.email}</span>
              <span className="text-xs text-muted">
                {u.agentNome ? `Atendente: ${u.agentNome} · ` : ""}
                {fmtUltimoAcesso(u.lastSeenAt)}
              </span>
              {u.resumos.length > 0 && (
                <span className="text-xs text-muted">
                  Recebe: {u.resumos.map((r) => (r.existe ? r.rotulo : `${r.rotulo} (não existe mais)`)).join(", ")} · {textoFrequencias(u.frequencias)}
                </span>
              )}
            </div>
            <MenuAcoes nome={u.name} acoes={acoesDe(u)} />
          </li>
        ))}
      </ul>

      {desativados.length > 0 && (
        <details className="group bg-surface border border-line rounded-card">
          <summary className="flex items-center justify-between gap-3 h-12 px-4 cursor-pointer font-medium list-none focus-visible:outline-2 -outline-offset-2 outline-primary rounded-card">
            Desativados ({desativados.length})
            <ChevronDown className="w-5 h-5 text-muted group-open:rotate-180" strokeWidth={1.75} />
          </summary>
          <ul className="divide-y divide-divider border-t border-divider">
            {desativados.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex-1 min-w-[200px] flex flex-col gap-0.5">
                  <span className="font-medium text-ink-2">{u.name}</span>
                  <span className="text-[13px] text-muted break-all">{u.email}</span>
                  {u.desativadoEm && <span className="text-xs text-muted">Desativado em {dataBr(u.desativadoEm)}</span>}
                </div>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => executar(() => reativarUsuario(u.id), (r) => setAviso(avisoReativado(r.nome ?? u.name)))}
                  className="h-9 px-4 rounded-full border border-line bg-surface text-primary font-medium hover:bg-primary-soft focus-visible:outline-2 outline-primary disabled:opacity-60"
                >
                  Reativar
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {janela && (
        <Modal titulo={titulos[janela.tipo]} onClose={fechar}>
          {janela.tipo === "novo" && (
            <FormUsuario atendentes={atendentes} grupos={grupos} onCancelar={fechar} onFeito={depoisDeAdicionar} />
          )}
          {janela.tipo === "editar" && <FormUsuario inicial={janela.usuario} atendentes={atendentes} grupos={grupos} onCancelar={fechar} onFeito={fechar} />}
          {janela.tipo === "desativar" && (
            <div className="flex flex-col gap-4">
              <p className="text-[13px] text-ink-2">Desativar {janela.usuario.name}? O acesso é encerrado na hora, e dá para reativar depois.</p>
              {erro && <Erro>{erro}</Erro>}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={pendente} onClick={() => executar(() => desativarUsuario(janela.usuario.id))} className={BOTAO_PRIMARIO}>
                  {pendente ? "Desativando…" : "Desativar"}
                </button>
                <button type="button" onClick={fechar} className={BOTAO_SECUNDARIO}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {janela.tipo === "gerar" && (
            <div className="flex flex-col gap-4">
              <p className="text-[13px] text-ink-2">
                Gerar uma nova senha provisória para {janela.usuario.name}? A senha atual deixa de valer, e quem estiver conectado com
                este usuário sai na hora.
              </p>
              {erro && <Erro>{erro}</Erro>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() =>
                    executar(
                      () => gerarSenhaProvisoria(janela.usuario.id),
                      (r) => setJanela({ tipo: "senha", nome: r.nome ?? janela.usuario.name, senha: r.senhaProvisoria ?? "" }),
                    )
                  }
                  className={BOTAO_PRIMARIO}
                >
                  {pendente ? "Gerando…" : "Gerar senha"}
                </button>
                <button type="button" onClick={fechar} className={BOTAO_SECUNDARIO}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {janela.tipo === "senha" && (
            <>
              <p className="text-[13px] text-muted -mt-3">Para {janela.nome}</p>
              <SenhaProvisoria senha={janela.senha} onFechar={fechar} />
            </>
          )}
        </Modal>
      )}
    </main>
  );
};
