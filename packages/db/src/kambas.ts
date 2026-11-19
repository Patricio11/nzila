// Kambas (migration 0013, Task 4B.2): asking someone met to be a kamba, saying yes, the list of a player's kambas,
// and what kambas write to each other. A kamba is never made by one side: the other says yes, or both asked. Anyone
// shut out by either side can neither ask nor write, and blocking someone ends what there was (talk.ts).

import { type Sql } from "postgres";

/** How many kambas a player may have, and how many asks may wait unanswered from one player at once. */
export const KAMBAS_MAX = 200;
export const PEDIDOS_MAX = 20;
/** What kambas write is kept this long, as what is said in the street: docs/legal/RETENTION.md. */
export const MENSAGENS_KEPT_DAYS = 30;
/** How long a written line may be. */
export const MENSAGEM_MAX_CHARS = 280;

const fechados = async (sql: Sql, a: string, b: string): Promise<boolean> =>
  (await sql`SELECT 1 FROM player_blocks WHERE (player_id = ${a} AND blocked_id = ${b}) OR (player_id = ${b} AND blocked_id = ${a})`).length > 0;

const saoKambas = async (sql: Sql, a: string, b: string): Promise<boolean> => (await sql`SELECT 1 FROM kambas WHERE player_id = ${a} AND kamba_id = ${b}`).length > 0;

/** Both sides written: they are kambas now; any ask between them is answered. */
async function juntar(sql: Sql, a: string, b: string): Promise<void> {
  await sql`INSERT INTO kambas (player_id, kamba_id) VALUES (${a}, ${b}), (${b}, ${a}) ON CONFLICT DO NOTHING`;
  await sql`DELETE FROM kamba_pedidos WHERE (de = ${a} AND para = ${b}) OR (de = ${b} AND para = ${a})`;
}

export type Pedido = "pedido" | "kambas" | "ja" | "fechado" | "muitos";

/**
 * "Adicionar": asks someone to be a kamba. "pedido" when it waits for them; "kambas" when they had already asked
 * this player (two asks are a yes); "ja" when they are kambas already; "fechado" when either shut the other out;
 * "muitos" when this player has too many kambas or too many asks waiting.
 */
export async function pedirKamba(sql: Sql, de: string, para: string): Promise<Pedido> {
  return (await sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    // Two asks crossing each other are one yes, never two asks: held in order.
    await t`SELECT pg_advisory_xact_lock(hashtext(${[de, para].sort().join(":")}))`;
    if (await fechados(t, de, para)) return "fechado";
    if (await saoKambas(t, de, para)) return "ja";
    const [counts] = await t<{ kambas: string; pedidos: string }[]>`
      SELECT (SELECT count(*) FROM kambas WHERE player_id = ${de}) AS kambas, (SELECT count(*) FROM kamba_pedidos WHERE de = ${de}) AS pedidos`;
    if (Number(counts!.kambas) >= KAMBAS_MAX) return "muitos";
    if ((await t`SELECT 1 FROM kamba_pedidos WHERE de = ${para} AND para = ${de}`).length > 0) {
      await juntar(t, de, para);
      return "kambas";
    }
    if (Number(counts!.pedidos) >= PEDIDOS_MAX) return "muitos";
    await t`INSERT INTO kamba_pedidos (de, para) VALUES (${de}, ${para}) ON CONFLICT DO NOTHING`;
    return "pedido";
  })) as Pedido;
}

/** The answer to an ask: "kambas" on a yes, "recusado" on a no (the asker is not told), "sem_pedido" when there was none. */
export async function responderKamba(sql: Sql, eu: string, de: string, sim: boolean): Promise<"kambas" | "recusado" | "sem_pedido" | "fechado"> {
  return (await sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    await t`SELECT pg_advisory_xact_lock(hashtext(${[de, eu].sort().join(":")}))`;
    if ((await t`SELECT 1 FROM kamba_pedidos WHERE de = ${de} AND para = ${eu}`).length === 0) return "sem_pedido";
    if (!sim) {
      await t`DELETE FROM kamba_pedidos WHERE de = ${de} AND para = ${eu}`;
      return "recusado";
    }
    if (await fechados(t, de, eu)) return "fechado";
    await juntar(t, de, eu);
    return "kambas";
  })) as "kambas" | "recusado" | "sem_pedido" | "fechado";
}

/** "Deixar de ser kamba", and what blocking does too: both sides go, and any ask between them. What was written stays its days. */
export async function separar(sql: Sql, a: string, b: string): Promise<void> {
  await sql`DELETE FROM kambas WHERE (player_id = ${a} AND kamba_id = ${b}) OR (player_id = ${b} AND kamba_id = ${a})`;
  await sql`DELETE FROM kamba_pedidos WHERE (de = ${a} AND para = ${b}) OR (de = ${b} AND para = ${a})`;
}

/** "Silenciar" a conversation, and its undoing: what comes is kept and not pointed out. */
export async function calarKamba(sql: Sql, eu: string, outro: string, calado: boolean): Promise<boolean> {
  return (await sql`UPDATE kambas SET calado = ${calado} WHERE player_id = ${eu} AND kamba_id = ${outro}`).count > 0;
}

/** Where two players stand to each other, as the sheet of one shows the other. */
export async function entreNos(sql: Sql, eu: string, outro: string): Promise<"kambas" | "pedido_enviado" | "pedido_recebido" | "nada"> {
  if (await saoKambas(sql, eu, outro)) return "kambas";
  const [row] = await sql<{ de: string }[]>`SELECT de FROM kamba_pedidos WHERE (de = ${eu} AND para = ${outro}) OR (de = ${outro} AND para = ${eu}) LIMIT 1`;
  return !row ? "nada" : row.de === eu ? "pedido_enviado" : "pedido_recebido";
}

/** The last thing in a conversation, as the list shows it. */
export interface Ultima {
  readonly kind: "texto" | "convite";
  readonly texto: string;
  readonly jogo: string | null;
  readonly at: string;
  /** Written by the player reading the list. */
  readonly minha: boolean;
}

/** One kamba as a player's list shows them. */
export interface Kamba {
  readonly playerId: string;
  readonly nome: string;
  readonly bi: string;
  readonly desde: string;
  readonly calado: boolean;
  readonly porLer: number;
  readonly ultima: Ultima | null;
}

/** A player's kambas: whoever wrote last first, then the rest by name. Deleted accounts are nobody's kambas. */
export async function kambasDe(sql: Sql, eu: string): Promise<Kamba[]> {
  const rows = await sql<{ id: string; name: string; bi_number: string; desde: Date; calado: boolean; por_ler: string; kind: string | null; texto: string | null; jogo: string | null; at: Date | null; de: string | null }[]>`
    SELECT p.id, p.name, p.bi_number, k.desde, k.calado,
      (SELECT count(*) FROM mensagens m WHERE m.para = ${eu} AND m.de = k.kamba_id AND m.lida_at IS NULL) AS por_ler,
      u.kind, u.texto, u.jogo, u.at, u.de
    FROM kambas k JOIN players p ON p.id = k.kamba_id
    LEFT JOIN LATERAL (
      SELECT kind, texto, jogo, at, de FROM mensagens m
      WHERE (m.de = ${eu} AND m.para = k.kamba_id) OR (m.de = k.kamba_id AND m.para = ${eu})
      ORDER BY at DESC, id DESC LIMIT 1
    ) u ON true
    WHERE k.player_id = ${eu} AND p.status = 'active' AND p.name IS NOT NULL AND p.bi_number IS NOT NULL
    ORDER BY u.at DESC NULLS LAST, p.name`;
  return rows.map((row) => ({
    playerId: row.id,
    nome: row.name,
    bi: row.bi_number,
    desde: row.desde.toISOString(),
    calado: row.calado,
    porLer: Number(row.por_ler),
    ultima: row.at ? { kind: row.kind as "texto" | "convite", texto: row.texto ?? "", jogo: row.jogo, at: row.at.toISOString(), minha: row.de === eu } : null,
  }));
}

/** Who has asked this player to be their kamba, newest first. */
export async function pedidosPara(sql: Sql, eu: string): Promise<{ nome: string; bi: string; at: string }[]> {
  const rows = await sql<{ name: string; bi_number: string; at: Date }[]>`
    SELECT p.name, p.bi_number, k.at FROM kamba_pedidos k JOIN players p ON p.id = k.de
    WHERE k.para = ${eu} AND p.status = 'active' AND p.name IS NOT NULL AND p.bi_number IS NOT NULL ORDER BY k.at DESC LIMIT 50`;
  return rows.map((row) => ({ nome: row.name, bi: row.bi_number, at: row.at.toISOString() }));
}

/** What a player is waiting to be told: asks for them, and lines from kambas not read (a muted conversation's are not counted). */
export async function novidades(sql: Sql, eu: string): Promise<{ pedidos: number; porLer: number }> {
  const [row] = await sql<{ pedidos: string; por_ler: string }[]>`
    SELECT (SELECT count(*) FROM kamba_pedidos k JOIN players p ON p.id = k.de WHERE k.para = ${eu} AND p.status = 'active') AS pedidos,
      (SELECT count(*) FROM mensagens m JOIN kambas k ON k.player_id = ${eu} AND k.kamba_id = m.de WHERE m.para = ${eu} AND m.lida_at IS NULL AND NOT k.calado) AS por_ler`;
  return { pedidos: Number(row!.pedidos), porLer: Number(row!.por_ler) };
}

/** A line of a conversation. */
export interface Mensagem {
  readonly id: number;
  readonly minha: boolean;
  readonly kind: "texto" | "convite";
  readonly texto: string;
  readonly jogo: string | null;
  readonly districtId: string | null;
  readonly at: string;
}

/** What is written: a line, or "come and play" a game in a bairro. */
export type Escrito = { readonly kind: "texto"; readonly texto: string } | { readonly kind: "convite"; readonly jogo: "xadrez" | "damas" | "ludo"; readonly districtId: string };

/** Writes to a kamba. Null when they are not (or no longer) kambas, or either shut the other out. */
export async function escrever(sql: Sql, de: string, para: string, escrito: Escrito): Promise<Mensagem | null> {
  if (!(await saoKambas(sql, de, para)) || (await fechados(sql, de, para))) return null;
  const [row] = await sql<{ id: string; at: Date }[]>`
    INSERT INTO mensagens (de, para, kind, texto, jogo, district_id)
    VALUES (${de}, ${para}, ${escrito.kind}, ${escrito.kind === "texto" ? escrito.texto : ""}, ${escrito.kind === "convite" ? escrito.jogo : null}, ${escrito.kind === "convite" ? escrito.districtId : null})
    RETURNING id, at`;
  return { id: Number(row!.id), minha: true, kind: escrito.kind, texto: escrito.kind === "texto" ? escrito.texto : "", jogo: escrito.kind === "convite" ? escrito.jogo : null, districtId: escrito.kind === "convite" ? escrito.districtId : null, at: row!.at.toISOString() };
}

/** The last lines between a player and a kamba, oldest first; what the kamba wrote is read now. */
export async function conversa(sql: Sql, eu: string, outro: string, limite = 50): Promise<Mensagem[]> {
  const rows = await sql<{ id: string; de: string; kind: string; texto: string; jogo: string | null; district_id: string | null; at: Date }[]>`
    SELECT id, de, kind, texto, jogo, district_id, at FROM mensagens
    WHERE (de = ${eu} AND para = ${outro}) OR (de = ${outro} AND para = ${eu})
    ORDER BY at DESC, id DESC LIMIT ${limite}`;
  await sql`UPDATE mensagens SET lida_at = now() WHERE para = ${eu} AND de = ${outro} AND lida_at IS NULL`;
  return rows.reverse().map((row) => ({ id: Number(row.id), minha: row.de === eu, kind: row.kind as "texto" | "convite", texto: row.texto, jogo: row.jogo, districtId: row.district_id, at: row.at.toISOString() }));
}

/** Everything a player wrote to kambas, for what they may ask to see of their data: to whom by BI number, not by id. */
export async function mensagensDoJogador(sql: Sql, eu: string): Promise<{ at: string; para: string | null; kind: string; texto: string }[]> {
  const rows = await sql<{ at: Date; bi_number: string | null; kind: string; texto: string }[]>`
    SELECT m.at, p.bi_number, m.kind, m.texto FROM mensagens m JOIN players p ON p.id = m.para WHERE m.de = ${eu} ORDER BY m.at, m.id`;
  return rows.map((row) => ({ at: row.at.toISOString(), para: row.bi_number, kind: row.kind, texto: row.texto }));
}
