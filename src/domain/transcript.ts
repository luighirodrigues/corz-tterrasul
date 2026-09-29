import { DateTime } from "luxon";
import { anonymizeText, type AnonymizeOptions } from "../utils/anonymizer.js";
import {
  isAutomatedMessage,
  isClientMessage,
  isConversationMessage,
  isHumanOperatorMessage,
  isInternalNote,
} from "./message-kind.js";

export interface TranscriptMessage {
  timestamp: Date;
  direction: string;
  origin: string;
  type: string;
  status?: string | null;
  text?: string | null;
  transcription?: string | null;
  senderId?: string | null;
}

export type TranscriptDir = "cliente" | "operacao" | "nota_interna" | "sistema";

export interface TranscriptLine {
  n: number | null;
  t: string | null; // "2026-09-24 14:15", no fuso do tenant
  dir: TranscriptDir;
  origin: string | null;
  atendente: string | null;
  text: string;
}

export interface TranscriptStats {
  audioSemTranscricao: number;
  atendentesHumanos: number; // >1 indica transferência
  messagesOmitted: number;
  truncated: boolean;
}

export interface BuildTranscriptOptions {
  tz: string;
  agentNames?: Map<string, string>; // senderId/userId -> nome
  anonymize?: AnonymizeOptions;
  /** Teto aproximado de tokens do transcript. */
  maxTokens?: number;
}

const MEDIA_LABEL: Record<string, string> = {
  IMAGE: "[imagem]",
  VIDEO: "[vídeo]",
  DOCUMENT: "[documento]",
  STICKER: "[figurinha]",
  LOCATION: "[localização]",
  CONTACT: "[contato compartilhado]",
  LIST: "[lista]",
  BUTTONS: "[botões]",
};

/** Estimativa barata de tokens (≈ 3,5 caracteres por token em português). */
export const estimateTokens = (s: string) => Math.ceil(s.length / 3.5);

function contentOf(m: TranscriptMessage, anon: AnonymizeOptions, stats: TranscriptStats): string | null {
  const clean = (s: string) => anonymizeText(s, anon);
  const text = m.text?.trim() ? clean(m.text.trim()) : "";

  if (m.type === "AUDIO") {
    const tr = m.transcription?.trim();
    if (tr) return clean(tr);
    stats.audioSemTranscricao++;
    return "[áudio sem transcrição]";
  }
  const label = MEDIA_LABEL[m.type];
  if (label) return text ? `${label} ${text}` : label;
  return text || null; // TEXT / NOTE sem texto não entram
}

/**
 * Transcript compacto para o estágio 1. Ignora TRANSITION/TRACK e mensagens falhas;
 * nota interna vem marcada; mídia sem texto vira marcador (a IA não vê "buraco").
 * Se passar do teto, corta do meio (início + fim) e registra quantas mensagens foram omitidas.
 */
export function buildTranscript(
  messages: TranscriptMessage[],
  opts: BuildTranscriptOptions
): { lines: TranscriptLine[]; stats: TranscriptStats } {
  const anon = opts.anonymize ?? {};
  const stats: TranscriptStats = { audioSemTranscricao: 0, atendentesHumanos: 0, messagesOmitted: 0, truncated: false };
  const humans = new Set<string>();
  const built: TranscriptLine[] = [];

  const ordered = [...messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  for (const m of ordered) {
    const note = isInternalNote(m) && !["FAILED", "DELETED"].includes(m.status ?? "");
    if (!note && !isConversationMessage(m)) continue;

    const text = contentOf(m, anon, stats);
    if (!text) continue;

    let dir: TranscriptDir;
    if (note) dir = "nota_interna";
    else if (isClientMessage(m)) dir = "cliente";
    else dir = "operacao";

    const human = !note && isHumanOperatorMessage(m);
    if (human && m.senderId) humans.add(m.senderId);

    built.push({
      n: 0,
      t: DateTime.fromJSDate(m.timestamp, { zone: opts.tz }).toFormat("yyyy-LL-dd HH:mm"),
      dir,
      origin: dir === "cliente" ? null : m.origin,
      atendente: human || note ? (m.senderId ? opts.agentNames?.get(m.senderId) ?? null : null) : null,
      text,
    });
    void isAutomatedMessage; // origem automática fica explícita em `origin`; a IA decide pelo prompt
  }
  stats.atendentesHumanos = humans.size;

  let lines = built;
  const budget = opts.maxTokens ?? 8000;
  const cost = (l: TranscriptLine) => estimateTokens(JSON.stringify(l));
  const total = built.reduce((s, l) => s + cost(l), 0);

  if (total > budget && built.length > 2) {
    const headBudget = Math.floor(budget * 0.4);
    const tailBudget = Math.floor(budget * 0.6);
    let head = 0;
    let used = 0;
    while (head < built.length && used + cost(built[head]) <= headBudget) used += cost(built[head++]);
    let tail = 0;
    used = 0;
    while (tail < built.length - head && used + cost(built[built.length - 1 - tail]) <= tailBudget) {
      used += cost(built[built.length - 1 - tail]);
      tail++;
    }
    head = Math.max(head, 1);
    tail = Math.max(tail, 1);
    const omitted = built.length - head - tail;
    if (omitted > 0) {
      stats.truncated = true;
      stats.messagesOmitted = omitted;
      lines = [
        ...built.slice(0, head),
        { n: null, t: null, dir: "sistema", origin: null, atendente: null, text: `[... ${omitted} mensagens omitidas do meio ...]` },
        ...built.slice(built.length - tail),
      ];
    }
  }

  let n = 0;
  lines = lines.map((l) => (l.dir === "sistema" ? l : { ...l, n: ++n }));
  return { lines, stats };
}
