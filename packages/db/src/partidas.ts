// The games of the tables and the ranking (migration 0012, Task 4B.1). The zone says a game has ended and how; this
// writes it down and moves each player's points, all in one transaction, so two games ending at the same moment
// never lose a change. The points are counted by packages/games (classificacao.ts).

import { PONTOS_INICIAIS, ajuste, pontosDoKota, type Jogo, type Resultado } from "@nzila/games";
import { type Sql } from "postgres";

/** A game that has ended at a table: where, what, and each seat (a player, or a kota by its number) with how it went. */
export interface PartidaAcabada {
  readonly districtId: string;
  readonly mesa: number;
  readonly jogo: Jogo;
  readonly rapida: boolean;
  readonly porTempo: boolean;
  readonly lugares: readonly { readonly playerId: string | null; readonly kota: number; readonly resultado: Resultado }[];
}

/** What a game did to a player's points. */
export interface Pontuado {
  readonly playerId: string;
  readonly antes: number;
  readonly depois: number;
}

/** Writes a finished game down and moves each player's points at that game, in that bairro. */
export async function recordPartida(sql: Sql, partida: PartidaAcabada): Promise<Pontuado[]> {
  const ids = partida.lugares.flatMap((lugar) => (lugar.playerId ? [lugar.playerId] : []));
  return (await sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    // Held while they change: another game of theirs ending now waits for this one.
    const had = ids.length === 0 ? [] : await t<{ player_id: string; pontos: number }[]>`
      SELECT player_id, pontos FROM classificacao WHERE player_id IN ${t(ids)} AND jogo = ${partida.jogo} AND district_id = ${partida.districtId} FOR UPDATE`;
    const pontosDe = new Map(had.map((row) => [row.player_id, row.pontos]));
    const sentados = partida.lugares.map((lugar) => (lugar.playerId ? { pontos: pontosDe.get(lugar.playerId) ?? PONTOS_INICIAIS, jogador: true } : { pontos: pontosDoKota(lugar.kota, partida.jogo), jogador: false }));
    const delta = ajuste(sentados, partida.lugares.map((lugar) => lugar.resultado));
    const [row] = await t<{ id: string }[]>`
      INSERT INTO partidas (district_id, mesa, jogo, rapida, por_tempo) VALUES (${partida.districtId}, ${partida.mesa}, ${partida.jogo}, ${partida.rapida}, ${partida.porTempo}) RETURNING id`;
    const pontuados: Pontuado[] = [];
    for (const [lugar, seat] of partida.lugares.entries()) {
      const antes = sentados[lugar]!.pontos;
      const depois = antes + delta[lugar]!;
      if (!seat.playerId) {
        await t`INSERT INTO partida_lugares (partida_id, lugar, kota, resultado) VALUES (${row!.id}, ${lugar}, ${seat.kota}, ${seat.resultado})`;
        continue;
      }
      await t`INSERT INTO partida_lugares (partida_id, lugar, player_id, resultado, pontos_antes, pontos_depois) VALUES (${row!.id}, ${lugar}, ${seat.playerId}, ${seat.resultado}, ${antes}, ${depois})`;
      const [v, e, d] = [seat.resultado === "ganhou" ? 1 : 0, seat.resultado === "empate" ? 1 : 0, seat.resultado === "perdeu" ? 1 : 0];
      await t`
        INSERT INTO classificacao (player_id, jogo, district_id, pontos, jogos, vitorias, empates, derrotas)
        VALUES (${seat.playerId}, ${partida.jogo}, ${partida.districtId}, ${depois}, 1, ${v}, ${e}, ${d})
        ON CONFLICT (player_id, jogo, district_id) DO UPDATE SET pontos = ${depois}, jogos = classificacao.jogos + 1, vitorias = classificacao.vitorias + ${v},
          empates = classificacao.empates + ${e}, derrotas = classificacao.derrotas + ${d}, atualizado = now()`;
      pontuados.push({ playerId: seat.playerId, antes, depois });
    }
    return pontuados;
  })) as Pontuado[];
}

/** One line of a ranking. */
export interface NaClassificacao {
  readonly playerId: string;
  readonly nome: string;
  readonly pontos: number;
  readonly jogos: number;
  readonly vitorias: number;
}

/** The best at a game in a bairro, most points first; a deleted account is nobody's and is left out. */
export async function classificacaoDe(sql: Sql, jogo: Jogo, districtId: string, limite = 10): Promise<NaClassificacao[]> {
  const rows = await sql<{ player_id: string; name: string; pontos: number; jogos: number; vitorias: number }[]>`
    SELECT c.player_id, p.name, c.pontos, c.jogos, c.vitorias FROM classificacao c JOIN players p ON p.id = c.player_id
    WHERE c.jogo = ${jogo} AND c.district_id = ${districtId} AND p.status <> 'deleted' AND p.name IS NOT NULL
    ORDER BY c.pontos DESC, c.vitorias DESC, c.jogos ASC, c.player_id LIMIT ${limite}`;
  return rows.map((row) => ({ playerId: row.player_id, nome: row.name, pontos: row.pontos, jogos: row.jogos, vitorias: row.vitorias }));
}

/** Where a player stands at a game in a bairro: their place (1 the best), points, games and wins; null before their first game there. */
export async function lugarNaClassificacao(sql: Sql, playerId: string, jogo: Jogo, districtId: string): Promise<{ posicao: number; pontos: number; jogos: number; vitorias: number } | null> {
  const [mine] = await sql<{ pontos: number; jogos: number; vitorias: number }[]>`
    SELECT pontos, jogos, vitorias FROM classificacao WHERE player_id = ${playerId} AND jogo = ${jogo} AND district_id = ${districtId}`;
  if (!mine) return null;
  const [above] = await sql<{ count: string }[]>`
    SELECT count(*) AS count FROM classificacao c JOIN players p ON p.id = c.player_id
    WHERE c.jogo = ${jogo} AND c.district_id = ${districtId} AND p.status <> 'deleted' AND p.name IS NOT NULL AND c.pontos > ${mine.pontos}`;
  return { posicao: Number(above!.count) + 1, pontos: mine.pontos, jogos: mine.jogos, vitorias: mine.vitorias };
}

/** A player's points at every game and bairro, for what the player may ask to see of their data. */
export async function classificacaoDoJogador(sql: Sql, playerId: string): Promise<{ jogo: string; districtId: string; pontos: number; jogos: number; vitorias: number; empates: number; derrotas: number }[]> {
  const rows = await sql<{ jogo: string; district_id: string; pontos: number; jogos: number; vitorias: number; empates: number; derrotas: number }[]>`
    SELECT jogo, district_id, pontos, jogos, vitorias, empates, derrotas FROM classificacao WHERE player_id = ${playerId} ORDER BY jogo, district_id`;
  return rows.map((row) => ({ jogo: row.jogo, districtId: row.district_id, pontos: row.pontos, jogos: row.jogos, vitorias: row.vitorias, empates: row.empates, derrotas: row.derrotas }));
}
