// Kambas on the phone (Task 4B.2): asking, answering, the list with who is in the street and where, and what kambas
// write to each other. Everything is asked of the API; the zone is not involved. What is new (asks, lines not read)
// is asked now and then while the game is open, a few hundred bytes each time (F-225), and said to whoever listens.

import { askAsPlayer } from "../world/account.ts";
// The count over the Telemóvel's button is drawn only once this has come: its look comes with it.
import "./rede-kambas.css";

export type Pedido = "pedido" | "kambas" | "ja" | "fechado" | "muitos";
export type EntreNos = "kambas" | "pedido_enviado" | "pedido_recebido" | "nada";
export type Jogo = "xadrez" | "damas" | "ludo";

export interface Ultima {
  readonly kind: "texto" | "convite";
  readonly texto: string;
  readonly jogo: string | null;
  readonly at: string;
  readonly minha: boolean;
}

/** A kamba as the list shows them: in the street now (which bairro, which copy, where they stand), or not. */
export interface Kamba {
  readonly nome: string;
  readonly bi: string;
  readonly desde: string;
  readonly calado: boolean;
  readonly porLer: number;
  readonly ultima: Ultima | null;
  readonly onde: { readonly districtId: string; readonly canal: number; readonly x?: number; readonly z?: number } | null;
}

export interface Lista {
  readonly kambas: readonly Kamba[];
  readonly pedidos: readonly { readonly nome: string; readonly bi: string; readonly at: string }[];
}

export interface Mensagem {
  readonly id: number;
  readonly minha: boolean;
  readonly kind: "texto" | "convite";
  readonly texto: string;
  readonly jogo: string | null;
  readonly districtId: string | null;
  readonly at: string;
}

/** The list, or null when the server cannot be reached. */
export async function lista(): Promise<Lista | null> {
  return (await askAsPlayer<Lista>("GET", "/v1/kambas")).answer;
}

/** "Adicionar". */
export async function pedir(bi: string): Promise<Pedido | "offline"> {
  return (await askAsPlayer<{ said: Pedido }>("POST", "/v1/kambas/pedir", { biNumber: bi })).answer?.said ?? "offline";
}

/** "Aceitar" or "Agora não". */
export async function responder(bi: string, sim: boolean): Promise<"kambas" | "recusado" | "sem_pedido" | "fechado" | "offline"> {
  return (await askAsPlayer<{ said: "kambas" | "recusado" | "sem_pedido" | "fechado" }>("POST", "/v1/kambas/responder", { biNumber: bi, sim })).answer?.said ?? "offline";
}

/** "Deixar de ser kamba". */
export async function deixar(bi: string): Promise<boolean> {
  return (await askAsPlayer<{ ok: boolean }>("POST", "/v1/kambas/deixar", { biNumber: bi })).answer?.ok === true;
}

/** "Silenciar" a conversation, and its undoing. */
export async function calar(bi: string, calado: boolean): Promise<boolean> {
  return (await askAsPlayer<{ ok: boolean }>("POST", "/v1/kambas/calar", { biNumber: bi, calado })).answer?.ok === true;
}

/** The conversation with a kamba, oldest first; reading it marks it read. */
export async function conversa(bi: string): Promise<Mensagem[] | null> {
  return (await askAsPlayer<{ mensagens: Mensagem[] }>("POST", "/v1/mensagens/conversa", { biNumber: bi })).answer?.mensagens ?? null;
}

export type Escreveu = { readonly said: "ok"; readonly mensagem: Mensagem } | { readonly said: "nao_kambas" | "palavras" | "endereco" | "vazio" | "offline" };

/** Writes a line, or a "come and play" in a bairro. */
export async function escrever(bi: string, escrito: { texto: string } | { convite: { jogo: Jogo; districtId: string } }): Promise<Escreveu> {
  const { answer, error } = await askAsPlayer<{ mensagem: Mensagem }>("POST", "/v1/mensagens/escrever", { biNumber: bi, ...escrito });
  if (answer) return { said: "ok", mensagem: answer.mensagem };
  return { said: error === "nao_kambas" || error === "palavras" || error === "endereco" || error === "vazio" ? error : "offline" };
}

/** What waits in Mensagens is asked this often while the game is open and in sight: a few hundred bytes (F-225). */
export const NOVIDADES_MS = 30_000;

/** What is waiting: asks, and lines not read. */
export interface Novidades {
  readonly pedidos: number;
  readonly porLer: number;
}

let last: Novidades = { pedidos: 0, porLer: 0 };
const listeners = new Set<(now: Novidades) => void>();

/** Asks what is new, and tells whoever listens when it changed. */
export async function verNovidades(): Promise<Novidades> {
  const answer = (await askAsPlayer<Novidades>("GET", "/v1/kambas/novidades")).answer;
  if (answer && (answer.pedidos !== last.pedidos || answer.porLer !== last.porLer)) {
    last = answer;
    for (const one of listeners) one(answer);
  }
  return last;
}

/** Listens for what is new; gives back how to stop. */
export function onNovidades(listener: (now: Novidades) => void): () => void {
  listeners.add(listener);
  listener(last);
  return () => void listeners.delete(listener);
}

/** What is new as last known, without asking. */
export const novidadesAgora = (): Novidades => last;

/**
 * Watches over the kambas while the street is open, fetched by the street after it opens (it is not part of the way
 * in): what waits is asked now and then, and while the game is in sight; `&kamba=<BI>` in the address says the phone
 * came to this copy of the bairro to go to that kamba ("Ir ter com"), and the compass is pointed at them. Gives back
 * how to stop.
 */
export function vigiar(onCount: (waiting: number) => void, onMark: (place: { x: number; z: number; name: string }) => void): () => void {
  const stop = onNovidades((now) => onCount(now.pedidos + now.porLer));
  const first = setTimeout(() => void verNovidades(), 2000);
  const every = setInterval(() => document.visibilityState === "visible" && void verNovidades(), NOVIDADES_MS);
  const kamba = new URLSearchParams(location.search).get("kamba");
  const toKamba = kamba
    ? setTimeout(() => {
        void lista().then((now) => {
          const one = now?.kambas.find((each) => each.bi === kamba);
          if (one?.onde?.x !== undefined && one.onde.z !== undefined) onMark({ x: one.onde.x / 1000, z: one.onde.z / 1000, name: one.nome });
        });
      }, 3000)
    : undefined;
  return () => {
    stop();
    clearTimeout(first);
    clearTimeout(toKamba);
    clearInterval(every);
  };
}
