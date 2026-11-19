// The board on the phone (Task 4B.1): opened when the player sits at a table, the game as the zone says it
// stands, drawn with the player's own side nearest them. A piece tapped lights the squares it may go to; a square
// tapped plays the move. Não te irrites has its throw button. The zone decides everything: nothing here is
// believed until it comes back as the table's new state.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { damasMoves, ludoMoves, xadrezMoves, type Partida } from "@nzila/games";
import type { MesaDita } from "@nzila/protocol";
import { Button } from "@nzila/ui";
import { useEffect, useRef, useState } from "preact/hooks";
import { CORES, LUDO_CORES, LUDO_FUNDOS, ludoCell, paintLudo, squareSeen, squareUnder } from "./casas.ts";
import type { Mesas } from "./mesas.ts";
import "./mesas.css";

tr.extend(ptAOLater);

/** The pieces of xadrez as drawn on the phone, in a box 100 wide: our own shapes, not a font's. */
const FIGURAS: Record<string, string> = {
  p: "M50 18a12 12 0 1 1 0 24a12 12 0 1 1 0-24zM36 82c2-14 6-26 14-34c8 8 12 20 14 34zM26 82h48v10h-48z",
  r: "M28 92h44v-10h-6v-36h8v-18h-10v8h-8v-8h-12v8h-8v-8h-10v18h8v36h-6z",
  n: "M30 92h44v-10c0-22-6-40-22-52l-6-12-6 12c-10 4-18 14-21 24l5 7 11-6c4 6-2 14-9 21c-4 5-6 8-6 16z",
  b: "M50 8a6 6 0 1 1 0 12a6 6 0 1 1 0-12zM30 92h40v-10h-6c5-14 7-27 1-40c-4-8-9-14-15-19c-6 5-11 11-15 19c-6 13-4 26 1 40h-6z",
  q: "M24 92h52v-10h-6l8-48l-14 16l-6-26l-8 24l-8-24l-6 26l-14-16l8 48h-6z",
  k: "M47 4h6v8h7v6h-7v8h-6v-8h-7v-6h7zM26 92h48v-10h-6l6-34c-4-8-12-12-24-12s-20 4-24 12l6 34h-6z",
};

interface Props {
  mesas: Mesas;
  mesa: number;
}

/** The world's colours, for the sheet's stylesheet to paint the boards with as the street has them. */
const PALETA: Record<string, string> = {
  "--ms-xadrez-claro": CORES.xadrezClaro,
  "--ms-xadrez-escuro": CORES.xadrezEscuro,
  "--ms-xadrez-moldura": CORES.xadrezMoldura,
  "--ms-damas-claro": CORES.damasClaro,
  "--ms-damas-escuro": CORES.damasEscuro,
  "--ms-damas-faixa": CORES.damasFaixa,
  "--ms-marfim": CORES.marfim,
  "--ms-ebano": CORES.ebano,
  "--ms-carica-clara": CORES.caricaClara,
  "--ms-carica-clara-borda": CORES.caricaClaraBorda,
  "--ms-carica-escura": CORES.caricaEscura,
  "--ms-carica-escura-borda": CORES.caricaEscuraBorda,
  "--ms-dado": CORES.dado,
};

/** The seat whose turn it is, while a game is played. */
function turnOf(said: MesaDita | null, partida: Partida): number | null {
  if (!said || said.fase !== "jogo") return null;
  if (partida.jogo === "ludo") return partida.estado.turn;
  const first = partida.jogo === "xadrez" ? partida.estado.turn === "w" : partida.estado.turn === 0;
  return first ? said.primeiro : 1 - said.primeiro;
}

const clock = (ms: number): string => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function Tabuleiro({ mesas, mesa }: Props) {
  const [, redraw] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [promoting, setPromoting] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => {
    const stop = mesas.listen(() => redraw((n) => n + 1));
    // The clock goes down between what the zone says.
    const ticking = setInterval(() => redraw((n) => n + 1), 500);
    return () => (stop(), clearInterval(ticking));
  }, [mesas]);

  const table = mesas.tables[mesa]!;
  const said = mesas.said[mesa] ?? null;
  // A piece chosen is let go when this table changes: a move was made, here. The other tables' games go on too.
  const versao = said?.versao ?? 0;
  useEffect(() => {
    setChosen(null);
    setPromoting(null);
  }, [versao]);
  const partida = mesas.partidaOf(mesa);
  const me = mesas.me;
  const mySeat = said ? said.lugares.findIndex((one) => one.entidade !== 0 && one.entidade === me) : -1;
  const turn = turnOf(said, partida);
  const myTurn = turn !== null && turn === mySeat;
  const left = mesas.leftMs(mesa);
  const refused = mesas.refused && mesas.refused.until > performance.now() ? mesas.refused.why : null;
  const nameAt = (lugar: number): string => {
    const entity = said?.lugares[lugar]?.entidade ?? 0;
    if (entity === 0 && said?.lugares[lugar]?.guardado) return tr.t("mesa.guardado");
    return entity === 0 ? tr.t(`mesa.kota.${(mesa * 2 + lugar) % 4}` as "mesa.kota.0") : (mesas.nameOf(entity) ?? tr.t("mesa.alguem"));
  };
  const ask = (pedido: Parameters<Mesas["ask"]>[0]): void => mesas.ask(pedido);

  // What is said under the board: whose turn, the wait, the result.
  let line: string;
  if (refused) line = tr.t(`mesa.recusa.${refused}` as "mesa.recusa.vez");
  else if (!said || said.fase === "espera") line = tr.t("mesa.espera", { s: Math.ceil(left / 1000) });
  else if (said.fase === "fim") {
    const won = winner(said);
    line = won < 0 ? tr.t("mesa.empate") : won === mySeat ? tr.t("mesa.ganhaste") : tr.t("mesa.ganhou", { nome: nameAt(won) });
  } else if (myTurn && partida.jogo === "ludo") {
    // A throw of the player's that moved nothing is said, with what came out; then what to do now.
    const last = said?.ultimo;
    const nothing = last?.lugar === mySeat && last.lance.jogo === "ludo" && last.lance.lance === null;
    line = partida.dado !== null ? tr.t("mesa.escolhe", { n: partida.dado }) : nothing ? tr.t("mesa.outraVez", { n: last.lance.jogo === "ludo" ? last.lance.dado : 0 }) : tr.t("mesa.lanca");
  } else if (myTurn) line = tr.t("mesa.tuaVez");
  else line = tr.t("mesa.vezDe", { nome: nameAt(turn ?? 0) });

  return (
    <div class="ms-sheet" style={PALETA} role="dialog" aria-label={tr.t(`mesa.jogo.${table.game}` as "mesa.jogo.xadrez")}>
      <div class="ms-band" aria-hidden="true" />
      <header class="ms-head">
        <h2>{tr.t(`mesa.jogo.${table.game}` as "mesa.jogo.xadrez")}</h2>
        <ol class="ms-seats">
          {table.seats.map((_, lugar) => (
            <li key={lugar} class={`ms-seat${turn === lugar ? " ms-seat-turn" : ""}${lugar === mySeat ? " ms-seat-me" : ""}`}>
              <i class="ms-side" style={{ background: sideColour(table.game, lugar, said) }} />
              <span>{lugar === mySeat ? tr.t("mesa.tu") : nameAt(lugar)}</span>
              {turn === lugar && said?.lugares[lugar]?.entidade !== 0 ? <b>{clock(left)}</b> : null}
            </li>
          ))}
        </ol>
      </header>
      <div class="ms-board">
        {partida.jogo === "ludo" ? (
          <LudoBoard mesas={mesas} mesa={mesa} said={said} partida={partida} mySeat={mySeat} myTurn={myTurn} ask={ask} />
        ) : (
          <Squares partida={partida} said={said} mySeat={mySeat} myTurn={myTurn} chosen={chosen} setChosen={setChosen} play={(casas) => ask({ mesa, pedido: "jogar", casas })} promote={setPromoting} />
        )}
        {promoting ? (
          <div class="ms-promote">
            {(["q", "r", "b", "n"] as const).map((letter, n) => (
              <button key={letter} type="button" aria-label={tr.t(`mesa.peca.${letter}` as "mesa.peca.q")} onClick={() => (ask({ mesa, pedido: "jogar", casas: [promoting.from, promoting.to, n + 1] }), setPromoting(null), setChosen(null))}>
                <svg viewBox="0 0 100 100"><path class={mySeat === (said?.primeiro ?? 0) ? "ms-white" : "ms-black"} d={FIGURAS[letter]} /></svg>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <p class={`ms-line${refused ? " ms-line-no" : myTurn ? " ms-line-go" : ""}`} aria-live="polite">{line}</p>
      <footer class="ms-foot">
        {said?.fase === "espera" && mySeat >= 0 ? <Button kind="quiet" onPress={() => ask({ mesa, pedido: "comecar" })}>{tr.t("mesa.comecar")}</Button> : null}
        {partida.jogo === "ludo" && myTurn && partida.dado === null ? <Button onPress={() => ask({ mesa, pedido: "lancar" })}>{tr.t("mesa.lancar")}</Button> : null}
        <Button kind="quiet" onPress={() => ask({ mesa, pedido: "levantar" })}>{tr.t("mesa.levantar")}</Button>
      </footer>
    </div>
  );
}

/** The seat that won, or -1 for a draw. */
function winner(said: MesaDita): number {
  const partida = said.partida;
  if (partida.jogo === "ludo") return partida.estado.winner ?? -1;
  const result = partida.estado.result;
  if (result === null || result === "empate") return -1;
  return result === "w" || result === 0 ? said.primeiro : 1 - said.primeiro;
}

/** The colour a seat plays: ivory or ebony, the caps' white or red, or its colour at Não te irrites. */
function sideColour(jogo: string, lugar: number, said: MesaDita | null): string {
  if (jogo === "ludo") return LUDO_CORES[lugar]!;
  const first = lugar === (said?.primeiro ?? 0);
  return jogo === "xadrez" ? (first ? CORES.marfim : CORES.ebano) : first ? CORES.caricaClara : CORES.caricaEscura;
}

interface SquaresProps {
  partida: Extract<Partida, { jogo: "xadrez" | "damas" }>;
  said: MesaDita | null;
  mySeat: number;
  myTurn: boolean;
  chosen: number | null;
  setChosen: (square: number | null) => void;
  play: (casas: number[]) => void;
  promote: (move: { from: number; to: number }) => void;
}

/** An 8 × 8 board, the player's side at the bottom. */
function Squares({ partida, said, mySeat, myTurn, chosen, setChosen, play, promote }: SquaresProps) {
  const virado = (said?.primeiro ?? 0) === 1;
  // Seen from the player's seat: seat 1 sees the board as built turned round.
  const flip = mySeat === 1;
  const at = (square: number): { x: number; y: number } => {
    const { row, col } = squareSeen(square, virado);
    return flip ? { x: 7 - col, y: 7 - row } : { x: col, y: row };
  };
  const squareAtCell = (x: number, y: number): number => (flip ? squareUnder(7 - y, 7 - x, virado) : squareUnder(y, x, virado));
  // The moves the rules allow the player, from the piece chosen.
  type Target = { to: number; casas: number[]; promotion: boolean };
  const targets: Target[] = [];
  const movable = new Set<number>();
  if (myTurn) {
    if (partida.jogo === "xadrez") {
      for (const move of xadrezMoves(partida.estado)) {
        movable.add(move.from);
        if (move.from === chosen && !targets.some((one) => one.to === move.to)) targets.push({ to: move.to, casas: [move.from, move.to], promotion: move.promotion !== undefined });
      }
    } else {
      for (const move of damasMoves(partida.estado)) {
        movable.add(move.path[0]!);
        if (move.path[0] === chosen) targets.push({ to: move.path[move.path.length - 1]!, casas: [...move.path], promotion: false });
      }
    }
  }
  const last = said?.ultimo?.lance;
  const lastSquares = last?.jogo === "xadrez" ? [last.lance.from, last.lance.to] : last?.jogo === "damas" ? [last.lance.path[0]!, last.lance.path[last.lance.path.length - 1]!] : [];
  const tap = (square: number): void => {
    const target = targets.find((one) => one.to === square);
    if (target) {
      if (target.promotion) promote({ from: target.casas[0]!, to: target.to });
      else play(target.casas);
      return;
    }
    setChosen(movable.has(square) ? square : null);
  };
  const cells = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const square = squareAtCell(x, y);
      const dark = (Math.floor(square / 8) + (square % 8)) % 2 === 1;
      cells.push(<rect key={`s${square}`} x={x} y={y} width={1} height={1} class={dark ? "ms-dark" : "ms-light"} onClick={() => tap(square)} />);
    }
  }
  const marks = lastSquares.map((square) => {
    const p = at(square);
    return <rect key={`l${square}`} x={p.x} y={p.y} width={1} height={1} class="ms-last" />;
  });
  const pieces = [];
  for (let square = 0; square < 64; square++) {
    const p = at(square);
    if (partida.jogo === "xadrez") {
      const piece = partida.estado.board[square]!;
      if (piece === ".") continue;
      const white = piece !== piece.toLowerCase();
      pieces.push(
        <g key={`p${square}`} transform={`translate(${p.x} ${p.y}) scale(0.01)`} class={`ms-piece${square === chosen ? " ms-chosen" : ""}${myTurn && movable.has(square) ? " ms-can" : ""}`} onClick={() => tap(square)}>
          <rect width="100" height="100" fill="transparent" />
          <path class={white ? "ms-white" : "ms-black"} d={FIGURAS[piece.toLowerCase()]} />
        </g>,
      );
    } else {
      const piece = partida.estado.board[square]!;
      if (piece === 0) continue;
      pieces.push(
        <g key={`p${square}`} transform={`translate(${p.x + 0.5} ${p.y + 0.5})`} class={`ms-piece${square === chosen ? " ms-chosen" : ""}${myTurn && movable.has(square) ? " ms-can" : ""}`} onClick={() => tap(square)}>
          <circle r="0.4" class={piece > 0 ? "ms-cap-light" : "ms-cap-dark"} />
          <circle r="0.29" class="ms-cap-ring" />
          {Math.abs(piece) === 2 ? <path class="ms-crown" d="M-0.18 0.08h0.36l0.04-0.2l-0.12 0.08l-0.1-0.14l-0.1 0.14l-0.12-0.08z" /> : null}
        </g>,
      );
    }
  }
  const dots = targets.map((target) => {
    const p = at(target.to);
    return <circle key={`t${target.to}`} cx={p.x + 0.5} cy={p.y + 0.5} r={0.22} class="ms-target" onClick={() => tap(target.to)} />;
  });
  return (
    <svg class={`ms-squares ms-${partida.jogo}`} viewBox="-0.25 -0.25 8.5 8.5">
      <rect x="-0.25" y="-0.25" width="8.5" height="8.5" class="ms-frame" />
      {cells}
      {marks}
      {pieces}
      {dots}
    </svg>
  );
}

/** The die: white, its dots, its rim in the thrower's colour. */
function Die({ value, colour }: { value: number; colour: string }) {
  const spots: Record<number, [number, number][]> = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
  return (
    <svg class="ms-die" viewBox="0 0 30 30" role="img" aria-label={String(value)} style={{ boxShadow: `0 3px 0 ${colour}, 0 0 0 3px ${colour}` }}>
      {spots[value]!.map(([i, j]) => <circle key={`${i}${j}`} cx={7 + i * 8} cy={7 + j * 8} r={value === 1 ? 4 : 2.8} fill={value === 1 ? CORES.pontoUm : CORES.ponto} />)}
    </svg>
  );
}

interface LudoProps {
  mesas: Mesas;
  mesa: number;
  said: MesaDita | null;
  partida: Extract<Partida, { jogo: "ludo" }>;
  mySeat: number;
  myTurn: boolean;
  ask: (pedido: Parameters<Mesas["ask"]>[0]) => void;
}

/** Não te irrites, the player's arm at the bottom; the pieces that can move with the throw glow, a tap moves one. */
function LudoBoard({ mesa, said, partida, mySeat, myTurn, ask }: LudoProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // The board turned so that the player's colour is nearest them.
  const turns = mySeat > 0 ? (4 - mySeat) % 4 : 0;
  useEffect(() => {
    const pen = canvas.current?.getContext("2d");
    if (!pen) return;
    pen.save();
    pen.translate(352, 352);
    pen.rotate((turns * Math.PI) / 2);
    pen.translate(-352, -352);
    paintLudo(pen, 704);
    pen.restore();
  }, [turns]);
  const view = ([col, row]: readonly [number, number]): [number, number] => {
    let at: [number, number] = [col, row];
    for (let n = 0; n < turns; n++) at = [10 - at[1], at[0]];
    return at;
  };
  const game = partida.estado;
  const moves = myTurn && partida.dado !== null ? ludoMoves(game, partida.dado) : [];
  const pieces = [];
  for (let seat = 0; seat < game.pieces.length; seat++) {
    for (let piece = 0; piece < 4; piece++) {
      const [x, y] = view(ludoCell(game, seat, piece));
      const move = seat === mySeat ? moves.find((one) => one.piece === piece) : undefined;
      const colour = game.colours[seat]!;
      pieces.push(
        <g key={`${seat}-${piece}`} transform={`translate(${x + 0.5} ${y + 0.5})`} class={`ms-piece${move ? " ms-can" : ""}`} onClick={() => move && ask({ mesa, pedido: "jogar", casas: [piece] })}>
          <circle r="0.36" fill={LUDO_CORES[colour]} stroke={LUDO_FUNDOS[colour]} stroke-width="0.07" />
          <circle r="0.14" cy="-0.06" class="ms-shine" />
        </g>,
      );
      if (move) {
        const [tx, ty] = view(ludoCell({ ...game, pieces: game.pieces.map((one, s) => (s === seat ? one.map((p, n) => (n === piece ? move.to : p)) : one)) }, seat, piece));
        pieces.push(<circle key={`t${piece}`} cx={tx + 0.5} cy={ty + 0.5} r={0.18} class="ms-target" />);
      }
    }
  }
  // The die shows the last throw, in the colour of whoever threw it, rolling in each time it is thrown.
  const last = said?.ultimo;
  const thrown = partida.dado ?? (last?.lance.jogo === "ludo" ? last.lance.dado : null);
  const by = partida.dado !== null ? game.turn : (last?.lugar ?? 0);
  return (
    <div class="ms-ludo">
      <canvas ref={canvas} width={704} height={704} />
      <svg class="ms-ludo-pieces" viewBox="0 0 11 11">{pieces}</svg>
      {thrown !== null ? <Die key={said?.versao ?? 0} value={thrown} colour={LUDO_CORES[game.colours[by] ?? 0]!} /> : null}
    </div>
  );
}
