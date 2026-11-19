import { describe, expect, test } from "vitest";
import { squareAt, xadrezMoves, type Xadrez } from "./xadrez.ts";
import {
  DESCANSO_MS, ESPERA_MS, FALTAS, GUARDA_MS, KOTAS, KOTAS_MS, KOTA_MS, LUGARES, RAPIDA_MS, VEZ_MS, VEZ_RAPIDA_MS,
  comecar, escolherRapida, ganhaPorTempo, guardar, kotaDe, resta, vezMs, jogar, lancar, levantar, lugarDe, lugarGuardado, reservar, novaMesa, passo, recusou, sentar, vezDe, type Mesa, type Recusa,
} from "./mesa.ts";

/** What was done, when it had to be done: a test that meant it to be refused says so. */
const feito = (mesa: Mesa | Recusa): Mesa => {
  if (recusou(mesa)) throw new Error(`refused: ${mesa}`);
  return mesa;
};
const seis = (): number => 6;
const e2e4 = { jogo: "xadrez" as const, lance: { from: squareAt("e2"), to: squareAt("e4") } };
const e7e5 = { jogo: "xadrez" as const, lance: { from: squareAt("e7"), to: squareAt("e5") } };

describe("a table in the street", () => {
  test("as the street first has it: kotas playing, nobody sitting, two seats or four", () => {
    for (const jogo of ["xadrez", "damas", "ludo"] as const) {
      const mesa = novaMesa(jogo, 0);
      expect(mesa.lugares).toHaveLength(LUGARES[jogo]);
      expect(mesa.fase).toBe("jogo");
      expect(vezDe(mesa)).toBe(0);
    }
  });

  test("among kotas alone, a move every few seconds, slowly enough to watch", () => {
    const mesa = novaMesa("xadrez", 0);
    expect(passo(mesa, KOTAS_MS - 1, seis)).toBe(mesa);
    const moved = passo(mesa, KOTAS_MS, seis);
    expect(moved.versao).toBe(2);
    expect(moved.ultimo?.lugar).toBe(0);
    expect(vezDe(moved)).toBe(1);
    const damas = passo(novaMesa("damas", 0), KOTAS_MS, seis);
    expect(damas.ultimo?.lance.jogo).toBe("damas");
    // Não te irrites: a throw, and then, a little later, the move.
    const thrown = passo(novaMesa("ludo", 0), KOTAS_MS, seis);
    expect(thrown.partida.jogo === "ludo" && thrown.partida.dado).toBe(6);
    const played = passo(thrown, 2 * KOTAS_MS, seis);
    expect(played.partida.jogo === "ludo" && played.partida.estado.pieces[0]![0]).toBe(0);
  });

  test("the first to sit sets the board up afresh and waits; a second fills the table; the game begins", () => {
    const kotas = passo(novaMesa("xadrez", 0), KOTAS_MS, seis);
    const one = feito(sentar(kotas, 1, "ana", 100_000));
    expect(one.fase).toBe("espera");
    expect(one.ultimo).toBeNull();
    expect(one.partida.jogo === "xadrez" && one.partida.estado.board[squareAt("e2")]).toBe("P");
    expect(lugarDe(one, "ana")).toBe(1);
    expect(vezDe(one)).toBeNull();
    // Waiting, nothing moves.
    expect(passo(one, 100_000 + ESPERA_MS - 1, seis)).toBe(one);
    const two = feito(sentar(one, 0, "beto", 101_000));
    expect(two.fase).toBe("jogo");
    expect(two.desde).toBe(101_000);
  });

  test("nobody else comes: a kota sits after a while, or at once when asked", () => {
    const one = feito(sentar(novaMesa("damas", 0), 0, "ana", 0));
    const waited = passo(one, ESPERA_MS, seis);
    expect(waited.fase).toBe("jogo");
    const asked = feito(comecar(one, "ana", 5_000));
    expect(asked.fase).toBe("jogo");
    expect(comecar(asked, "ana", 6_000)).toBe("fase");
    expect(comecar(one, "beto", 6_000)).toBe("fora");
    // Ana plays first; the kota answers in a moment.
    const played = feito(jogar(asked, "ana", { jogo: "damas", lance: { path: [41, 32], takes: [] } }, 7_000));
    expect(vezDe(played)).toBe(1);
    expect(passo(played, 7_000 + KOTA_MS - 1, seis)).toBe(played);
    expect(vezDe(passo(played, 7_000 + KOTA_MS, seis))).toBe(0);
  });

  test("four seats of Não te irrites wait for all four, or for the time", () => {
    let mesa = feito(sentar(novaMesa("ludo", 0), 0, "ana", 0));
    mesa = feito(sentar(mesa, 1, "beto", 1));
    expect(mesa.fase).toBe("espera");
    mesa = feito(sentar(mesa, 2, "carla", 2));
    mesa = feito(sentar(mesa, 3, "dino", 3));
    expect(mesa.fase).toBe("jogo");
  });

  test("a seat that is not there, taken, kept for another, or a second seat for the same player: refused", () => {
    const one = feito(sentar(novaMesa("xadrez", 0), 0, "ana", 0));
    expect(sentar(one, 2, "beto", 0)).toBe("lugar");
    expect(sentar(one, 0, "beto", 0)).toBe("ocupado");
    expect(sentar(one, 1, "ana", 0)).toBe("sentado");
    const kept = feito(guardar(one, "ana", 1, "carla", 1_000));
    expect(sentar(kept, 1, "beto", 2_000)).toBe("ocupado");
    // The one it was kept for sits in it; and once the keeping has run out, anyone may.
    expect(lugarDe(feito(sentar(kept, 1, "carla", 2_000)), "carla")).toBe(1);
    expect(lugarDe(feito(sentar(kept, 1, "beto", 1_000 + GUARDA_MS)), "beto")).toBe(1);
  });

  test("keeping a seat for someone invited: only a seated player, only a free seat, and the wait holds for them", () => {
    const one = feito(sentar(novaMesa("xadrez", 0), 0, "ana", 0));
    expect(guardar(one, "ana", 5, "carla", 0)).toBe("lugar");
    expect(guardar(one, "beto", 1, "carla", 0)).toBe("fora");
    expect(guardar(one, "ana", 0, "carla", 0)).toBe("ocupado");
    const kept = feito(guardar(one, "ana", 1, "carla", 0));
    expect(guardar(kept, "ana", 1, "dino", 0)).toBe("ocupado");
    // The wait does not end while the seat is kept; when the keeping runs out it does.
    expect(passo(kept, ESPERA_MS, seis)).toBe(kept);
    expect(passo(kept, GUARDA_MS, seis).fase).toBe("jogo");
    // Begun at once, a kota takes the kept seat.
    expect(feito(comecar(kept, "ana", 1)).lugares[1]!.guardado).toBeNull();
  });

  test("someone who sits where a kota plays against a player takes the kota's place; the game goes on", () => {
    const begun = feito(comecar(feito(sentar(novaMesa("xadrez", 0), 0, "ana", 0)), "ana", 0));
    const moved = feito(jogar(begun, "ana", e2e4, 1_000));
    const joined = feito(sentar(moved, 1, "beto", 1_500));
    expect(joined.fase).toBe("jogo");
    expect(joined.desde).toBe(1_000);
    expect(joined.partida.jogo === "xadrez" && joined.partida.estado.board[squareAt("e4")]).toBe("P");
    // No kota moves for Beto now: it is his turn, and his time.
    expect(passo(joined, 1_000 + KOTA_MS, seis)).toBe(joined);
    expect(feito(jogar(joined, "beto", e7e5, 2_000)).ultimo?.lugar).toBe(1);
  });

  test("a move out of turn, by someone not sitting, outside a game, or against the rules: refused", () => {
    const begun = feito(sentar(feito(sentar(novaMesa("xadrez", 0), 0, "ana", 0)), 1, "beto", 0));
    expect(jogar(begun, "carla", e2e4, 1)).toBe("fora");
    expect(jogar(begun, "beto", e2e4, 1)).toBe("vez");
    expect(jogar(begun, "ana", { jogo: "xadrez", lance: { from: squareAt("e2"), to: squareAt("e5") } }, 1)).toBe("regras");
    expect(jogar(begun, "ana", { jogo: "damas", lance: { path: [41, 32], takes: [] } }, 1)).toBe("regras");
    const waiting = feito(sentar(novaMesa("xadrez", 0), 0, "ana", 0));
    expect(jogar(waiting, "ana", e2e4, 1)).toBe("fase");
  });

  test("the fool's mate ends the game; a rest; the next begins with the first side at the other seat", () => {
    let mesa = feito(sentar(feito(sentar(novaMesa("xadrez", 0), 0, "ana", 0)), 1, "beto", 0));
    const lance = (from: string, to: string) => ({ jogo: "xadrez" as const, lance: { from: squareAt(from), to: squareAt(to) } });
    mesa = feito(jogar(mesa, "ana", lance("f2", "f3"), 1));
    mesa = feito(jogar(mesa, "beto", lance("e7", "e5"), 2));
    mesa = feito(jogar(mesa, "ana", lance("g2", "g4"), 3));
    mesa = feito(jogar(mesa, "beto", lance("d8", "h4"), 4));
    expect(mesa.fase).toBe("fim");
    expect(vezDe(mesa)).toBeNull();
    expect(passo(mesa, 4 + DESCANSO_MS - 1, seis)).toBe(mesa);
    const next = passo(mesa, 4 + DESCANSO_MS, seis);
    expect(next.fase).toBe("jogo");
    expect(next.primeiro).toBe(1);
    expect(next.ultimo).toBeNull();
    // Beto has White now: his turn first.
    expect(vezDe(next)).toBe(1);
    expect(feito(jogar(next, "beto", e2e4, 5 + DESCANSO_MS)).versao).toBe(next.versao + 1);
  });

  test("damas, the dark side's turn is the seat after the first", () => {
    const begun = feito(sentar(feito(sentar(novaMesa("damas", 0), 0, "ana", 0)), 1, "beto", 0));
    const played = feito(jogar(begun, "ana", { jogo: "damas", lance: { path: [41, 32], takes: [] } }, 1));
    expect(vezDe(played)).toBe(1);
  });

  test("a player who gets up leaves the seat to a kota; with nobody left the kotas play on", () => {
    const begun = feito(sentar(feito(sentar(novaMesa("xadrez", 0), 0, "ana", 0)), 1, "beto", 0));
    expect(levantar(begun, "carla", 1)).toBe("fora");
    const left = feito(levantar(begun, "ana", 1));
    expect(left.lugares[0]!.jogador).toBeNull();
    expect(left.desde).toBe(0);
    // Ana's side is a kota's: it plays at a kota's pace, Beto still being there.
    expect(passo(left, KOTA_MS, seis).ultimo?.lugar).toBe(0);
    // The only player gets up while waiting: the kotas take the table and play.
    const alone = feito(sentar(novaMesa("damas", 0), 0, "ana", 0));
    expect(feito(levantar(alone, "ana", 10)).fase).toBe("jogo");
    // Getting up after a game has ended changes nothing in the rest.
    const ended = { ...begun, fase: "fim" as const };
    expect(feito(levantar(ended, "ana", 50)).fase).toBe("fim");
  });

  test("a player's time runs out: the kota plays it for them; three in a row and the seat is the kota's", () => {
    let mesa = feito(comecar(feito(sentar(novaMesa("xadrez", 0), 0, "ana", 0)), "ana", 0));
    expect(passo(mesa, VEZ_MS.xadrez - 1, seis)).toBe(mesa);
    let clock = 0;
    for (let n = 1; n <= FALTAS; n++) {
      clock += VEZ_MS.xadrez;
      // Ana's time runs out: her move is made for her.
      mesa = passo(mesa, clock, seis);
      expect(mesa.ultimo?.lugar).toBe(0);
      expect(mesa.lugares[0]!.faltas).toBe(n < FALTAS ? n : 0);
      // The kota opposite answers.
      clock += KOTAS_MS;
      mesa = passo(mesa, clock, seis);
      expect(mesa.ultimo?.lugar).toBe(1);
    }
    expect(mesa.lugares[0]!.jogador).toBeNull();
  });

  test("a move made clears what was let run out; a second player waiting while the first gets up keeps the wait", () => {
    let mesa = feito(sentar(feito(sentar(novaMesa("xadrez", 0), 0, "ana", 0)), 1, "beto", 0));
    mesa = passo(mesa, VEZ_MS.xadrez, seis);
    const reply = (state: Mesa) => ({ jogo: "xadrez" as const, lance: xadrezMoves(state.partida.estado as Xadrez)[0]! });
    mesa = feito(jogar(mesa, "beto", reply(mesa), VEZ_MS.xadrez + 1));
    // Ana let one run out; now she plays and it is forgotten.
    expect(mesa.lugares[0]!.faltas).toBe(1);
    mesa = feito(jogar(mesa, "ana", reply(mesa), VEZ_MS.xadrez + 2));
    expect(mesa.lugares[0]!.faltas).toBe(0);
    const two = feito(sentar(feito(sentar(novaMesa("ludo", 0), 0, "ana", 0)), 1, "beto", 0));
    expect(feito(levantar(two, "ana", 5)).fase).toBe("espera");
  });

  test("Não te irrites: the table throws the dice; the move goes with that throw; nothing to move, the turn is played out", () => {
    let mesa = feito(sentar(feito(sentar(novaMesa("ludo", 0), 0, "ana", 0)), 1, "beto", 0));
    mesa = feito(comecar(mesa, "ana", 0));
    expect(lancar(mesa, "carla", 6, 1)).toBe("fora");
    expect(lancar(mesa, "beto", 6, 1)).toBe("vez");
    // A 3 with all four at home: nothing moves, and Ana throws again (three tries).
    const three = feito(lancar(mesa, "ana", 3, 1));
    expect(three.ultimo).toEqual({ lugar: 0, lance: { jogo: "ludo", lance: null, dado: 3 } });
    expect(vezDe(three)).toBe(0);
    const six = feito(lancar(three, "ana", 6, 2));
    expect(lancar(six, "ana", 6, 3)).toBe("regras");
    const out = { jogo: "ludo" as const, lance: { piece: 0, from: -1, to: 0 }, dado: 6 };
    expect(jogar(six, "ana", { ...out, dado: 5 }, 3)).toBe("regras");
    expect(jogar(three, "ana", out, 3)).toBe("regras");
    expect(jogar(six, "ana", e2e4, 3)).toBe("regras");
    const moved = feito(jogar(six, "ana", out, 3));
    expect(moved.partida.jogo === "ludo" && moved.partida.estado.pieces[0]![0]).toBe(0);
    // A 6 throws again.
    expect(vezDe(moved)).toBe(0);
    expect(lancar(novaMesa("xadrez", 0), "ana", 6, 0)).toBe("fora");
    const chess = feito(sentar(feito(sentar(novaMesa("xadrez", 0), 0, "ana", 0)), 1, "beto", 0));
    expect(lancar(chess, "ana", 6, 0)).toBe("regras");
    const waiting = feito(sentar(novaMesa("ludo", 0), 0, "ana", 0));
    expect(lancar(waiting, "ana", 6, 0)).toBe("fase");
  });

  test("Não te irrites, a player's time runs out: the kota throws and moves for them at once", () => {
    let mesa = feito(sentar(feito(sentar(novaMesa("ludo", 0), 0, "ana", 0)), 1, "beto", 0));
    mesa = feito(comecar(mesa, "ana", 0));
    mesa = passo(mesa, VEZ_MS.ludo, seis);
    expect(mesa.partida.jogo === "ludo" && mesa.partida.dado).toBeNull();
    expect(mesa.partida.jogo === "ludo" && mesa.partida.estado.pieces[0]![0]).toBe(0);
    expect(mesa.lugares[0]!.faltas).toBe(1);
    // With a throw that moves nothing, the turn is all there is to play.
    const stuck = feito(comecar(feito(sentar(novaMesa("ludo", 0), 0, "ana", 0)), "ana", 0));
    const after = passo(stuck, VEZ_MS.ludo, () => 2);
    expect(after.ultimo).toEqual({ lugar: 0, lance: { jogo: "ludo", lance: null, dado: 2 } });
  });

  test("a game of Não te irrites among kotas comes to its end and starts again", () => {
    let mesa = novaMesa("ludo", 0);
    let clock = 0;
    let rolls = 7;
    const dado = (): number => {
      rolls = (Math.imul(rolls, 1103515245) + 12345) >>> 0;
      return ((rolls >>> 16) % 6) + 1;
    };
    for (let n = 0; n < 5000 && mesa.fase === "jogo"; n++) {
      clock += KOTAS_MS;
      mesa = passo(mesa, clock, dado);
    }
    expect(mesa.fase).toBe("fim");
    expect(passo(mesa, clock + DESCANSO_MS, dado).primeiro).toBe(1);
    // In the new game, the second seat throws first.
    expect(vezDe(passo(mesa, clock + DESCANSO_MS, dado))).toBe(1);
  });

  test("two who agreed to play: a seat kept for each; nobody else sits in them; the first to sit waits for the other", () => {
    const kotas = novaMesa("xadrez", 0);
    const kept = feito(reservar(kotas, ["ana", "beto"], 0));
    expect([lugarGuardado(kept, "ana", 1), lugarGuardado(kept, "beto", 1), lugarGuardado(kept, "carla", 1)]).toEqual([0, 1, -1]);
    // The kotas play on meanwhile.
    expect(passo(kept, KOTAS_MS, seis).ultimo).not.toBeNull();
    expect(sentar(kept, 0, "carla", 5)).toBe("ocupado");
    const one = feito(sentar(kept, 0, "ana", 5));
    expect(one.fase).toBe("espera");
    // The wait holds for Beto, whose seat is kept.
    expect(passo(one, ESPERA_MS + 10, seis)).toBe(one);
    expect(feito(sentar(one, 1, "beto", 20)).fase).toBe("jogo");
    // Run out, the keeping is forgotten.
    expect(lugarGuardado(kept, "ana", GUARDA_MS)).toBe(-1);
  });

  test("seats are kept only where there are enough free ones, and not for someone already sitting", () => {
    const sat = feito(sentar(novaMesa("xadrez", 0), 0, "ana", 0));
    expect(reservar(sat, ["beto", "carla"], 0)).toBe("ocupado");
    expect(reservar(sat, ["ana", "beto"], 0)).toBe("sentado");
    // One free seat, kept for one.
    expect(lugarGuardado(feito(reservar(sat, ["beto"], 0)), "beto", 1)).toBe(1);
    // A keeping run out frees the seat for another.
    const old = feito(reservar(novaMesa("ludo", 0), ["ana", "beto", "carla", "dino"], 0));
    expect(reservar(old, ["eva"], 1)).toBe("ocupado");
    expect(lugarGuardado(feito(reservar(old, ["eva"], GUARDA_MS)), "eva", GUARDA_MS + 1)).toBe(0);
  });
});

describe("the kotas of the bairro, each with a character", () => {
  test("each seat has its own kota, the same in the zone and on every phone: four, in turn round the tables", () => {
    expect([kotaDe(0, 0), kotaDe(0, 1), kotaDe(1, 0), kotaDe(1, 1), kotaDe(2, 0), kotaDe(3, 3)]).toEqual([0, 1, 2, 3, 0, 1]);
    expect(KOTAS.map((kota) => kota.forca.xadrez)).toEqual(["principiante", "conhecedor", "conhecedor", "temido"]);
    // Mamã Joana is feared at Não te irrites; Kota Domingos at the boards.
    expect(KOTAS[2]!.forca.ludo).toBe("temido");
    expect(KOTAS[2]!.mulher).toBe(true);
    expect(novaMesa("damas", 0).kotas).toEqual([1, 1]);
    expect(novaMesa("ludo", 0, [0, 1, 2, 3]).kotas).toEqual([0, 1, 2, 3]);
  });

  test("a beginner sometimes plays without thinking (a throw of 1 or 2 says so), and otherwise thinks a move ahead", () => {
    // Kota Zeca against Kota Domingos: the dice say "without thinking", then which move.
    let rolls = [1, 3, 5];
    const dice = (): number => rolls.shift() ?? 6;
    const careless = passo(novaMesa("xadrez", 0, [0, 3]), KOTAS_MS, dice);
    expect(careless.ultimo?.lugar).toBe(0);
    expect(rolls).toEqual([]);
    rolls = [6];
    const careful = passo(novaMesa("xadrez", 0, [0, 3]), KOTAS_MS, dice);
    expect(careful.ultimo?.lugar).toBe(0);
    // A feared kota throws nothing to decide: it only thinks.
    rolls = [1, 1, 1];
    const feared = passo(novaMesa("xadrez", 0, [3, 0]), KOTAS_MS, dice);
    expect(feared.ultimo?.lugar).toBe(0);
    expect(rolls).toEqual([1, 1, 1]);
  });

  test("whole games among kotas of every strength end, by the rules, at every table", () => {
    for (const jogo of ["xadrez", "damas", "ludo"] as const) {
      for (const kotas of jogo === "ludo" ? [[0, 1, 2, 3], [3, 2, 1, 0]] : [[0, 3], [3, 0], [0, 0], [3, 3]]) {
        let seed = 7;
        const dice = (): number => ((seed = (seed * 1103515245 + 12345) % 2147483648) % 6) + 1;
        let mesa = novaMesa(jogo, 0, kotas);
        let agora = 0;
        for (let n = 0; n < 1200 && mesa.fase === "jogo"; n++) {
          agora += KOTAS_MS;
          mesa = passo(mesa, agora, dice);
        }
        // Xadrez among kotas can go on a long while: what is asked is that every move was the rules', and most end.
        expect(["jogo", "fim"]).toContain(mesa.fase);
        expect(mesa.versao).toBeGreaterThan(20);
      }
    }
  }, 60_000);
});

describe("a quick game (partida rápida)", () => {
  test("chosen by a seated player while the table waits or rests, not in the middle of a game; a table nobody sits at goes back to the slow game", () => {
    const waiting = feito(sentar(novaMesa("xadrez", 0), 0, "ana", 0));
    expect(waiting.rapida).toBe(false);
    expect(escolherRapida(waiting, "beto", true)).toBe("fora");
    const quick = feito(escolherRapida(waiting, "ana", true));
    expect(quick).toMatchObject({ rapida: true, versao: waiting.versao + 1, desde: waiting.desde });
    // The same choice twice changes nothing.
    expect(escolherRapida(quick, "ana", true)).toBe(quick);
    const begun = feito(comecar(quick, "ana", 5_000));
    expect(begun).toMatchObject({ fase: "jogo", inicio: 5_000 });
    expect(escolherRapida(begun, "ana", false)).toBe("fase");
    // Up and gone: the kotas play their slow game.
    expect(feito(levantar(begun, "ana", 6_000)).rapida).toBe(false);
  });

  test("shorter turns, and the time of the whole game counted from its start", () => {
    const begun = feito(comecar(feito(escolherRapida(feito(sentar(novaMesa("damas", 0), 0, "ana", 0)), "ana", true)), "ana", 1_000));
    expect(vezMs(begun)).toBe(VEZ_RAPIDA_MS.damas);
    expect(vezMs(novaMesa("damas", 0))).toBe(VEZ_MS.damas);
    expect(resta(begun, 61_000)).toBe(RAPIDA_MS - 60_000);
    expect(resta(begun, 1_000 + RAPIDA_MS + 5)).toBe(0);
    expect(resta(novaMesa("damas", 0), 0)).toBeNull();
    // A player's quick turn runs out sooner: the kota plays it for them.
    const late = passo(begun, 1_000 + VEZ_RAPIDA_MS.damas, seis);
    expect(late.versao).toBeGreaterThan(begun.versao);
    expect(late.lugares[0]!.faltas).toBe(1);
  });

  test("when the three minutes are up the game ends, won by whoever is ahead, and it is said that the clock ended it", () => {
    const begun = feito(comecar(feito(escolherRapida(feito(sentar(novaMesa("xadrez", 0), 0, "ana", 0)), "ana", true)), "ana", 0));
    // White a knight ahead.
    const ahead = { ...begun, partida: { jogo: "xadrez" as const, estado: { ...begun.partida.estado as Xadrez, board: (begun.partida.estado as Xadrez).board.map((piece) => (piece === "n" ? "." : piece)) } } };
    const over = passo(ahead, RAPIDA_MS, seis);
    expect(over).toMatchObject({ fase: "fim", porTempo: true });
    expect(over.partida.jogo === "xadrez" && over.partida.estado.result).toBe("w");
    // The next game is not ended by the clock until its own three minutes are up.
    const next = passo(over, RAPIDA_MS + DESCANSO_MS, seis);
    expect(next).toMatchObject({ fase: "jogo", porTempo: false, inicio: RAPIDA_MS + DESCANSO_MS });
  });

  test("who is ahead: at xadrez by the pieces' worth, at damas a dama for two men, at Não te irrites pieces home and then how far; level is a draw", () => {
    const xadrez = novaMesa("xadrez", 0).partida as Extract<ReturnType<typeof ganhaPorTempo>, { jogo: "xadrez" }>;
    expect(ganhaPorTempo(xadrez)).toMatchObject({ estado: { result: "empate" } });
    const blackAhead = { ...xadrez, estado: { ...xadrez.estado, board: xadrez.estado.board.map((piece) => (piece === "Q" ? "." : piece)) } };
    expect(ganhaPorTempo(blackAhead)).toMatchObject({ estado: { result: "b" } });
    const damas = novaMesa("damas", 0).partida as Extract<ReturnType<typeof ganhaPorTempo>, { jogo: "damas" }>;
    expect(ganhaPorTempo(damas)).toMatchObject({ estado: { result: "empate" } });
    // One dark dama against two light men: level. One more light man: light ahead. Two dark damas: dark ahead.
    const board = (pieces: [number, -2 | -1 | 1 | 2][]): typeof damas => ({ ...damas, estado: { ...damas.estado, board: Array.from({ length: 64 }, (_, n) => pieces.find(([at]) => at === n)?.[1] ?? 0) } });
    expect(ganhaPorTempo(board([[0, -2], [62, 1], [60, 1]]))).toMatchObject({ estado: { result: "empate" } });
    expect(ganhaPorTempo(board([[0, -2], [62, 1], [60, 1], [58, 1]]))).toMatchObject({ estado: { result: 0 } });
    expect(ganhaPorTempo(board([[0, -2], [2, -2], [62, 1]]))).toMatchObject({ estado: { result: 1 } });
    const ludo = novaMesa("ludo", 0).partida as Extract<ReturnType<typeof ganhaPorTempo>, { jogo: "ludo" }>;
    // Seat 2 has one home; seat 1 is far on with all four but none home: one home counts more.
    const pieces = [[-1, -1, -1, -1], [30, 31, 32, 33], [40, -1, -1, -1], [-1, -1, -1, 5]];
    expect(ganhaPorTempo({ ...ludo, estado: { ...ludo.estado, pieces }, dado: 4 })).toMatchObject({ estado: { winner: 2 }, dado: null });
  });
});
