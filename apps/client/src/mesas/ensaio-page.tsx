// /mesa: a board alone (F-222). The board a player has at a table, played here by the same rules without a zone, from
// any position the address gives: so that every move of every piece can be tried by a thumb and by the browser tests
// (castling, en passant, promotion, a run of captures at damas, a crowning, a piece sent home at Não te irrites).
// For the team and the tests; a player never comes here.
//
//   /mesa?jogo=xadrez&fen=<FEN>            the position, and the player sits on the side to move
//   /mesa?jogo=damas&damas=<64>&vez=0|1    each square: . empty, b and B the light man and dama, p and P the dark
//   /mesa?jogo=ludo&ludo=<a,b,c,d;...>&vez=<seat>&dado=<n>   each seat's four pieces (-1 at home), whose turn, the throw
//   &kota                                  a kota answers each move, as at a table in the street

import { KOTA_MS, escolherRapida, fromFen, jogar, lancar, lanceDe, newDamas, newLudo, newXadrez, novaMesa, passo, recusou, vezDe, type Mesa, type Partida, type Square } from "@nzila/games";
import { MESA_RECUSAS, type MesaDita, type MesaPedido } from "@nzila/protocol";
import { useEffect, useState } from "preact/hooks";
import type { Table } from "./mesas.ts";
import { Tabuleiro, type MesasVista } from "./tabuleiro.tsx";

declare global {
  interface Window {
    /** How the board on this page stands, for the tests. */
    __mesa?: { partida: Partida; versao: number; recusa: string | null; ultimo: Mesa["ultimo"] };
  }
}

const ME = 1;

/** The game the address asks for, and the seat whose turn it is (where the player sits). */
function fromAddress(params: URLSearchParams): { partida: Partida; lugar: number } {
  const jogo = params.get("jogo");
  if (jogo === "damas") {
    const text = params.get("damas");
    const vez = params.get("vez") === "1" ? 1 : 0;
    const map: Record<string, Square> = { ".": 0, b: 1, B: 2, p: -1, P: -2 };
    const board = text && text.length === 64 ? [...text].map((char) => map[char] ?? 0) : newDamas().board;
    return { partida: { jogo: "damas", estado: { board, turn: vez, quiet: 0, cerco: 0, result: null } }, lugar: vez };
  }
  if (jogo === "ludo") {
    const vez = Number(params.get("vez") ?? 0);
    const pieces = (params.get("ludo") ?? "-1,-1,-1,-1;-1,-1,-1,-1;-1,-1,-1,-1;-1,-1,-1,-1").split(";").map((seat) => seat.split(",").map(Number));
    return { partida: { jogo: "ludo", estado: { ...newLudo([0, 1, 2, 3]), pieces, turn: vez }, dado: null }, lugar: vez };
  }
  const fen = params.get("fen");
  const estado = fen ? fromFen(fen) : newXadrez();
  return { partida: { jogo: "xadrez", estado }, lugar: estado.turn === "w" ? 0 : 1 };
}

/** One table, held here: what the board asks of it is done by the rules at once. */
class Ensaio implements MesasVista {
  readonly tables: readonly Table[];
  readonly said: (MesaDita | null)[] = [null];
  refused: MesasVista["refused"] = null;
  readonly me = ME;
  private mesa: Mesa;
  private readonly listeners = new Set<() => void>();
  private readonly dado: number;
  private readonly kota: boolean;

  constructor(params: URLSearchParams) {
    const { partida, lugar } = fromAddress(params);
    this.dado = Math.min(6, Math.max(1, Number(params.get("dado") ?? 6)));
    this.kota = params.has("kota");
    const base = novaMesa(partida.jogo, 0);
    this.mesa = { ...base, partida, fase: "jogo", lugares: base.lugares.map((one, n) => (n === lugar ? { ...one, jogador: "eu" } : one)) };
    const seats = base.lugares.map((_, n) => ({ pos: [0, 0, 0] as [number, number, number], facing: n * (360 / base.lugares.length) }));
    this.tables = [{ id: "ensaio", game: partida.jogo, pos: [0, 0, 0], facing: 0, size: 0.6, seats } as unknown as Table];
    this.publish();
  }

  private publish(): void {
    const mesa = this.mesa;
    this.said[0] = {
      mesa: 0,
      versao: mesa.versao,
      fase: mesa.fase,
      primeiro: mesa.primeiro,
      restaMs: 90_000,
      rapida: mesa.rapida,
      fimMs: 0,
      porTempo: mesa.porTempo,
      lugares: mesa.lugares.map((one) => ({ entidade: one.jogador === "eu" ? ME : 0, guardado: false })),
      partida: mesa.partida,
      ultimo: mesa.ultimo,
    };
    window.__mesa = { partida: mesa.partida, versao: mesa.versao, recusa: this.refused?.why ?? null, ultimo: mesa.ultimo };
    for (const listener of this.listeners) listener();
  }

  listen(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  ask(pedido: MesaPedido): void {
    const now = performance.now();
    let done: Mesa | (typeof MESA_RECUSAS)[number] = "regras";
    if (pedido.pedido === "jogar") {
      const lance = lanceDe(this.mesa, pedido.casas);
      if (lance) done = jogar(this.mesa, "eu", lance, now);
    } else if (pedido.pedido === "lancar") done = lancar(this.mesa, "eu", this.dado, now);
    else if (pedido.pedido === "rapida") done = escolherRapida(this.mesa, "eu", pedido.sim);
    else return;
    if (recusou(done)) {
      this.refused = { why: done, until: performance.now() + 3500 };
      this.publish();
      return;
    }
    this.refused = null;
    this.mesa = done;
    this.publish();
    if (this.kota) setTimeout(() => this.answer(), 300);
  }

  /** A kota plays the other seats, as quickly as at a table with a player at it. */
  private answer(): void {
    const next = passo(this.mesa, this.mesa.desde + KOTA_MS, () => this.dado);
    if (next === this.mesa) return;
    this.mesa = next;
    this.publish();
    const seat = vezDe(this.mesa);
    if (seat !== null && this.mesa.lugares[seat]?.jogador !== "eu") setTimeout(() => this.answer(), 300);
  }

  partidaOf(): Partida {
    return this.mesa.partida;
  }

  leftMs(): number {
    return 90_000;
  }

  fimLeftMs(): number {
    return 0;
  }

  nameOf(): string | null {
    return null;
  }

  aVer(): number {
    return 0;
  }

  ladoDe(): number {
    return 0;
  }

  guardadoNome(): string | null {
    return null;
  }

  deixarDeVer(): void {}
}

export function MesaEnsaio() {
  const [mesas] = useState(() => new Ensaio(new URLSearchParams(location.search)));
  useEffect(() => {
    document.title = "Mesa de ensaio";
  }, []);
  return (
    <main class="ms-ensaio">
      <Tabuleiro mesas={mesas} mesa={0} />
    </main>
  );
}
