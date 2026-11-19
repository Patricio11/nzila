// The tables of the bairro in the street (Task 4B.1), fetched when a district has any. Each kind looks like itself:
// the stone tables of xadrez with their pieces turned in wood, damas played with bottle caps on a painted plank,
// Não te irrites with its coloured cross, its pawns and its die. The boards and the pieces are drawn here as the
// zone says the games stand; where no player sits, a kota of the bairro does, and plays.
//
// This is also where the phone hears the tables: the session hands over what the zone said of them, and what the
// player asks of a table goes from here.

import { type Partida, newDamas, newLudo, newXadrez } from "@nzila/games";
import { decodeMesa, encodeMesaPedido, EVENT, MESA_RECUSAS, type MesaDita, type MesaPedido } from "@nzila/protocol";
import { tableObstacles, type Manifest } from "@nzila/world/client";
import { BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from "three";
import type { Session } from "../net/session.ts";
import { askAsPlayer } from "../world/account.ts";
import type { DistrictScene } from "../render/district-scene.ts";
import type { Person } from "../render/person.ts";
import type { WorldRenderer } from "../render/world-renderer.ts";
import { CORES, FRAME, LUDO_CORES, ludoCell, paintLudo, paintSquares, squareSeen } from "./casas.ts";
import { Ui } from "./ui.tsx";

export type Table = NonNullable<Manifest["tables"]>[number];
export type Jogo = Table["game"];
/** A seat as the page sits a body in it: metres, and the way the sitter faces in radians. */
export interface SeatPlace {
  x: number;
  y: number;
  z: number;
  facing: number;
}

/** How near a seat the player must stand for the button to offer it; how near a table its kotas and pieces are drawn; and how near its kotas are drawn whole. Metres. */
export const SIT_REACH_M = 2.0;
/** How near a table's middle the player must stand to be offered its board to watch, and how far they may wander
 * while watching before it closes; and how near someone must stand to be counted as watching. Metres. */
export const WATCH_REACH_M = 4.5;
const WATCH_LEAVE_M = 7;
const DRAWN_WITHIN_M = 60;
const WHOLE_WITHIN_M = 9;
/** How long a move takes to be seen, in seconds. */
const MOVE_S = 0.45;

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** A shape turned on a lathe: a profile of (radius, height) pairs from the bottom, round the vertical, `sides` times. */
function lathe(profile: readonly (readonly [number, number])[], sides: number, into: number[] = []): number[] {
  for (let k = 0; k < sides; k++) {
    const a0 = (k / sides) * Math.PI * 2;
    const a1 = ((k + 1) / sides) * Math.PI * 2;
    for (let n = 0; n < profile.length - 1; n++) {
      const [r0, y0] = profile[n]!;
      const [r1, y1] = profile[n + 1]!;
      const p = (r: number, y: number, a: number): number[] => [Math.cos(a) * r, y, Math.sin(a) * r];
      into.push(...p(r0, y0, a0), ...p(r1, y1, a1), ...p(r1, y1, a0), ...p(r0, y0, a0), ...p(r0, y0, a1), ...p(r1, y1, a1));
    }
  }
  return into;
}

/** A box added to a shape: its middle, its size, turned about X by `tilt`. */
function block(into: number[], at: readonly [number, number, number], size: readonly [number, number, number], tilt = 0): number[] {
  const box = new BoxGeometry(...size).rotateX(tilt).translate(...at).toNonIndexed();
  into.push(...(box.getAttribute("position").array as Float32Array));
  box.dispose();
  return into;
}

function shape(points: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** The pieces of xadrez, turned in wood, a square wide; by their letter. The knight's head looks toward +Z. */
const BASE = [[0.36, 0], [0.36, 0.07], [0.27, 0.12]] as const;
const XADREZ: Record<string, () => BufferGeometry> = {
  p: () => shape(lathe([...BASE, [0.15, 0.2], [0.11, 0.38], [0.19, 0.43], [0.12, 0.47], [0.17, 0.53], [0.18, 0.62], [0.12, 0.7], [0, 0.72]], 10)),
  r: () => shape(lathe([...BASE, [0.21, 0.2], [0.2, 0.6], [0.28, 0.64], [0.28, 0.82], [0.2, 0.82], [0.2, 0.76], [0, 0.76]], 10)),
  b: () => shape(lathe([...BASE, [0.15, 0.25], [0.11, 0.56], [0.19, 0.61], [0.12, 0.65], [0.17, 0.74], [0.17, 0.84], [0.1, 0.94], [0.05, 0.97], [0.06, 1.01], [0, 1.04]], 10)),
  q: () => shape(lathe([...BASE, [0.16, 0.3], [0.12, 0.72], [0.21, 0.77], [0.13, 0.81], [0.19, 0.87], [0.25, 1.0], [0.15, 1.04], [0.07, 1.1], [0.07, 1.13], [0, 1.16]], 10)),
  k: () => shape(block(block(lathe([...BASE, [0.16, 0.32], [0.13, 0.78], [0.22, 0.84], [0.14, 0.88], [0.2, 0.96], [0.2, 1.08], [0.08, 1.12], [0, 1.12]], 10), [0, 1.2, 0], [0.06, 0.2, 0.06]), [0, 1.22, 0], [0.18, 0.05, 0.06])),
  n: () => shape(block(block(block(lathe([...BASE, [0.22, 0.2], [0, 0.2]], 10), [0, 0.38, -0.03], [0.24, 0.4, 0.3], -0.25), [0, 0.62, 0.08], [0.2, 0.18, 0.42], 0.35), [0, 0.74, -0.12], [0.08, 0.14, 0.12], 0)),
};
/** Ivory and ebony: the two sides of xadrez. */
const BRANCAS = new Color(CORES.marfim);
const PRETAS = new Color(CORES.ebano);
/** The bottle caps of damas: red and white, as they come off the crates. */
const CARICA_CLARA = new Color(CORES.caricaClara);
const CARICA_ESCURA = new Color(CORES.caricaEscura);

/** A board's picture, painted once for every table of its kind. */
function boardTexture(jogo: Jogo): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = jogo === "ludo" ? 704 : 512;
  const pen = canvas.getContext("2d")!;
  if (jogo === "xadrez") paintSquares(pen, 512, 512 * FRAME, CORES.xadrezClaro, CORES.xadrezEscuro, CORES.xadrezMoldura);
  else if (jogo === "damas") {
    // Painted by hand on a plank: cream and black, in a red band with its little yellow triangles.
    paintSquares(pen, 512, 512 * FRAME, CORES.damasClaro, CORES.damasEscuro, CORES.damasFaixa, true);
    pen.fillStyle = CORES.damasTriangulo;
    const band = 512 * FRAME;
    const triangle = (points: readonly (readonly [number, number])[]): void => {
      pen.beginPath();
      pen.moveTo(...points[0]!);
      for (const point of points.slice(1)) pen.lineTo(...point);
      pen.fill();
    };
    // Along each side of the band, small triangles pointing in, as the pano Samakaka has them.
    for (let n = 0; n < 32; n++) {
      const a = n * 16;
      triangle([[a + 3, 3], [a + 13, 3], [a + 8, band - 3]]);
      triangle([[a + 3, 509], [a + 13, 509], [a + 8, 512 - band + 3]]);
      triangle([[3, a + 3], [3, a + 13], [band - 3, a + 8]]);
      triangle([[509, a + 3], [509, a + 13], [512 - band + 3, a + 8]]);
    }
  } else paintLudo(pen, 704);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** The six faces of the die, each its own picture: white with black dots. */
function dieFaces(): MeshLambertMaterial[] {
  const spots: Record<number, [number, number][]> = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
  return [1, 2, 3, 4, 5, 6].map((value) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const pen = canvas.getContext("2d")!;
    pen.fillStyle = CORES.dado;
    pen.fillRect(0, 0, 64, 64);
    pen.fillStyle = value === 1 ? CORES.pontoUm : CORES.ponto;
    for (const [i, j] of spots[value]!) {
      pen.beginPath();
      pen.arc(14 + i * 18, 14 + j * 18, value === 1 ? 9 : 6.5, 0, Math.PI * 2);
      pen.fill();
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return new MeshLambertMaterial({ map: texture });
  });
}

/** What the street shows of one table. */
interface Shown {
  readonly table: Table;
  readonly board: Group;
  /** The kotas in its seats: light bodies from across the square, whole ones up close. */
  readonly kotas: (Person | null)[];
  readonly whole: (Person | null)[];
  fetching: boolean;
  fetchingWhole: boolean;
  /** The die of Não te irrites, and when it was last thrown. */
  readonly die: Mesh | null;
  thrownAt: number;
  /** The move being shown: the square it ends on, by the board as built, and the places it goes through. */
  moving: { to: number; path: { x: number; z: number }[]; began: number } | null;
}

/** The ranking of a game in a bairro, as the API gives it: the best, and the player's own place. */
export interface Classificacao {
  readonly top: readonly { readonly nome: string; readonly pontos: number; readonly jogos: number; readonly vitorias: number; readonly eu: boolean }[];
  readonly eu: { readonly posicao: number; readonly pontos: number; readonly jogos: number; readonly vitorias: number } | null;
}

/** What the player can do at a table, as the page asks each frame. */
export interface AtTables {
  /** The seat the zone has the player in, and where it is. */
  readonly mine: { readonly mesa: number; readonly lugar: number; readonly seat: SeatPlace } | null;
  /** The nearest seat free for the player, within reach. */
  readonly near: { readonly mesa: number; readonly lugar: number; readonly jogo: Jogo } | null;
}

export class Mesas {
  readonly tables: readonly Table[];
  /** How each table stands, as the zone last said, and when that was heard (this phone's clock). */
  readonly said: (MesaDita | null)[];
  readonly heardAt: number[];
  /** Why the last thing asked of a table was not done, and until when to say so. */
  refused: { why: (typeof MESA_RECUSAS)[number]; until: number } | null = null;
  /** The board on the phone, for the page to draw. */
  readonly Ui = Ui;
  /** An invitation to play, waiting for the player's answer: who, at which table, until when. */
  convite: { entidade: number; nome: string; mesa: number; ate: number } | null = null;
  /** The table where a seat is kept for the player (an invitation accepted, theirs or another's), until when. */
  destino: { mesa: number; ate: number } | null = null;
  /** The seat kept for someone the player invited or was invited by, and their name: so the board can say whose
   * seat it is before a kota is asked to take it (F-213). */
  guardadoPara: { mesa: number; nome: string; ate: number } | null = null;
  /** The table near enough to watch, as the last frame found it; and the one whose board is open to watch (F-210). */
  perto: number | null = null;
  vendo: number | null = null;
  /** What the last game the player finished did to their points, at which table, until when to say so. */
  pontos: { mesa: number; depois: number; delta: number; ate: number } | null = null;
  /** Something to say for a moment: an invitation sent, accepted, declined. */
  aviso: { kind: "aceitou" | "recusou"; nome: string; ate: number } | null = null;
  /** Where the player stands, as the last frame had it: for the nearest table, and the way to one. */
  x = 0;
  z = 0;
  /** The gold mark over the table where a seat is kept for the player. */
  private readonly marca: Mesh;
  private readonly renderer: WorldRenderer;
  private readonly scene: DistrictScene;
  private readonly session: Session | null;
  private readonly shown: Shown[];
  private readonly pieces: { xadrez: Record<string, InstancedMesh>; carica: InstancedMesh; peao: InstancedMesh };
  private readonly listeners = new Set<() => void>();
  /** The die's six faces, by the number on each, less one. */
  private readonly faces: MeshLambertMaterial[];
  private lastAsked = { what: "", at: 0 };
  private readonly matrix = new Matrix4();
  private readonly turn = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);

  constructor(scene: DistrictScene, renderer: WorldRenderer, session: Session | null) {
    this.scene = scene;
    this.renderer = renderer;
    this.session = session;
    this.tables = scene.manifest.tables ?? [];
    // The tables are solid as the zone has them (packages/world: tableObstacles): added to the bodies the district
    // shares with the zone, which is the list itself, kept for the whole visit.
    scene.shared().push(...tableObstacles(this.tables));
    this.said = this.tables.map(() => null);
    this.heardAt = this.tables.map(() => 0);
    const textures = new Map<Jogo, CanvasTexture>();
    const faces = this.tables.some((table) => table.game === "ludo") ? dieFaces() : [];
    this.faces = faces;
    this.shown = this.tables.map((table): Shown => {
      let texture = textures.get(table.game);
      if (!texture) textures.set(table.game, (texture = boardTexture(table.game)));
      // Seen from seat 0, the picture's left is the seat's left and its top the far side (casas.ts).
      const board = new Group();
      board.position.set(table.pos[0], table.pos[1] + 0.002, table.pos[2]);
      board.rotation.y = radians(table.facing) + Math.PI;
      const plane = new Mesh(new PlaneGeometry(table.size, table.size), new MeshLambertMaterial({ map: texture }));
      plane.rotation.x = -Math.PI / 2;
      plane.receiveShadow = true;
      board.add(plane);
      renderer.scene.add(board);
      let die: Mesh | null = null;
      if (table.game === "ludo") {
        // Each die has its own six faces; the top one is changed to show the throw.
        die = new Mesh(new BoxGeometry(0.032, 0.032, 0.032), [...faces]);
        die.castShadow = true;
        renderer.scene.add(die);
      }
      return { table, board, kotas: table.seats.map(() => null), whole: table.seats.map(() => null), fetching: false, fetchingWhole: false, die, thrownAt: -9, moving: null };
    });
    // A mark over the table a seat is kept at: a gold cone pointing down, turning, seen from across the square.
    this.marca = new Mesh(new ConeGeometry(0.22, 0.42, 4).rotateX(Math.PI), new MeshBasicMaterial({ color: new Color(CORES.damasTriangulo) }));
    this.marca.visible = false;
    renderer.scene.add(this.marca);
    const count = (jogo: Jogo): number => this.tables.filter((table) => table.game === jogo).length;
    const instanced = (geometry: BufferGeometry, most: number): InstancedMesh => {
      const mesh = new InstancedMesh(geometry, new MeshLambertMaterial(), Math.max(1, most));
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      renderer.scene.add(mesh);
      return mesh;
    };
    const chess = count("xadrez");
    this.pieces = {
      xadrez: Object.fromEntries(Object.entries(XADREZ).map(([letter, make]) => [letter, instanced(make(), chess * 16)])),
      // A cap is a short drum with a crimped edge; a dama is two, one on the other, as on any pavement.
      carica: instanced(new CylinderGeometry(0.4, 0.42, 0.09, 14).translate(0, 0.045, 0), count("damas") * 48),
      peao: instanced(shape(lathe([[0.3, 0], [0.3, 0.05], [0.2, 0.12], [0.11, 0.42], [0.17, 0.5], [0.2, 0.58], [0.16, 0.68], [0, 0.72]], 10)), count("ludo") * 16),
    };
  }

  /** The player's own number in the channel, when among others. */
  get me(): number | null {
    return this.session?.me ?? null;
  }

  /** The name of a player at a table, by their number in the channel. */
  nameOf(entity: number): string | null {
    return this.session?.who(entity)?.name ?? null;
  }

  /** The games this street has tables for, when there is a zone to play them with. */
  jogos(): Jogo[] {
    return this.session?.walking ? [...new Set(this.tables.map((table) => table.game))] : [];
  }

  /** Whether a table has room for two who want to play: no player at it, nobody's seat kept. */
  private livre(mesa: number): boolean {
    const said = this.said[mesa];
    return !said || said.lugares.every((one) => one.entidade === 0 && !one.guardado);
  }

  /** Invites someone, by their number in the channel, to play `jogo` at the nearest table of it that has room. */
  convidar(jogo: string, entidade: number): void {
    const tables = this.tables.flatMap((table, mesa) => (table.game === jogo ? [{ mesa, far: Math.hypot(table.pos[0] - this.x, table.pos[2] - this.z), livre: this.livre(mesa) }] : []));
    const chosen = tables.sort((a, b) => Number(b.livre) - Number(a.livre) || a.far - b.far)[0];
    if (!chosen) return;
    this.ask({ mesa: chosen.mesa, pedido: "convidar", entidade });
  }

  /** The player answers the invitation waiting for them. */
  responder(sim: boolean): void {
    const convite = this.convite;
    if (!convite) return;
    this.ask({ mesa: convite.mesa, pedido: sim ? "aceitar" : "recusar", entidade: convite.entidade });
    if (sim) {
      this.destino = { mesa: convite.mesa, ate: performance.now() + 10 * 60_000 };
      this.guardadoPara = { mesa: convite.mesa, nome: convite.nome, ate: performance.now() + 10 * 60_000 };
    }
    this.convite = null;
    for (const listener of this.listeners) listener();
  }

  /** Opens a table's board to watch, without sitting (F-210). */
  ver(mesa: number): void {
    this.vendo = mesa;
    for (const listener of this.listeners) listener();
  }

  /** Closes the board being watched. */
  deixarDeVer(): void {
    if (this.vendo === null) return;
    this.vendo = null;
    for (const listener of this.listeners) listener();
  }

  /** How many stand round a table watching: the players near it who are not sitting at it, and the player. */
  aVer(mesa: number): number {
    const table = this.tables[mesa]!;
    const seated = new Set(this.said[mesa]?.lugares.map((one) => one.entidade) ?? []);
    const others = (this.session?.heads() ?? []).filter((one) => !seated.has(one.id) && one.id !== this.me && Math.hypot(one.x - table.pos[0], one.z - table.pos[2]) < WATCH_REACH_M).length;
    return others + (this.vendo === mesa ? 1 : 0);
  }

  /** The seat of a table nearest where the player stands: the side a watcher sees the board from. */
  ladoDe(mesa: number): number {
    const seats = this.tables[mesa]!.seats;
    let best = 0;
    let nearest = Infinity;
    for (const [lugar, seat] of seats.entries()) {
      const far = Math.hypot(seat.pos[0] - this.x, seat.pos[2] - this.z);
      if (far < nearest) {
        nearest = far;
        best = lugar;
      }
    }
    return best;
  }

  /** The name the seat kept at a table is kept for, while it is kept; null when there is none or it is not known. */
  guardadoNome(mesa: number): string | null {
    const kept = this.guardadoPara;
    return kept && kept.mesa === mesa && kept.ate > performance.now() && kept.nome ? kept.nome : null;
  }

  /** How far the player is from the table where a seat is kept for them, in metres. */
  longeDoDestino(): number {
    const destino = this.destino;
    if (!destino) return 0;
    const table = this.tables[destino.mesa]!;
    return Math.hypot(table.pos[0] - this.x, table.pos[2] - this.z);
  }

  /** Tells `listener` whenever a table changes; gives back how to stop. */
  listen(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Asks the zone something of a table. The same thing asked twice within a second is asked once. */
  ask(pedido: MesaPedido): void {
    const what = JSON.stringify(pedido);
    const now = performance.now();
    if (what === this.lastAsked.what && now - this.lastAsked.at < 1000) return;
    this.lastAsked = { what, at: now };
    this.session?.post(encodeMesaPedido(pedido));
  }

  /** The bairro's best at a table's game, and where the player stands; null when it could not be asked. */
  async classificacao(mesa: number): Promise<Classificacao | null> {
    const { answer } = await askAsPlayer<Classificacao>("POST", "/v1/classificacao", { jogo: this.tables[mesa]!.game, districtId: this.scene.manifest.id });
    return answer;
  }

  /** What a quick game being played at a table has left, by this phone's clock; 0 when none is being played. */
  fimLeftMs(mesa: number): number {
    const said = this.said[mesa];
    return said && said.fimMs > 0 ? Math.max(0, said.fimMs - (performance.now() - this.heardAt[mesa]!)) : 0;
  }

  /** The time a table's turn (or wait, or rest) has left, by this phone's clock. */
  leftMs(mesa: number): number {
    const said = this.said[mesa];
    return said ? Math.max(0, said.restaMs - (performance.now() - this.heardAt[mesa]!)) : 0;
  }

  /** Who sits where at a table, as entities (0 for a kota), and how the game stands; the start of a game where the zone has said nothing. */
  partidaOf(mesa: number): Partida {
    const said = this.said[mesa];
    if (said) return said.partida;
    const jogo = this.tables[mesa]!.game;
    return jogo === "xadrez" ? { jogo, estado: newXadrez() } : jogo === "damas" ? { jogo, estado: newDamas() } : { jogo, estado: newLudo([0, 1, 2, 3]), dado: null };
  }

  /** The seat of a table as a place to sit. */
  seatOf(mesa: number, lugar: number): SeatPlace {
    const seat = this.tables[mesa]!.seats[lugar]!;
    return { x: seat.pos[0], y: seat.pos[1], z: seat.pos[2], facing: radians(seat.facing) };
  }

  /** One frame: what the zone said is read, the pieces and the kotas are drawn, and the page is told what the player can do. */
  frame(seconds: number, x: number, z: number): AtTables {
    const me = this.session?.me ?? null;
    const session = this.session;
    if (session) {
      for (const bytes of session.mesas.splice(0)) {
        try {
          const said = decodeMesa(bytes);
          if (said.mesa >= this.tables.length) continue;
          const before = this.said[said.mesa];
          if (before && before.versao >= said.versao) continue;
          this.said[said.mesa] = said;
          this.heardAt[said.mesa] = performance.now();
          this.began(said.mesa, before ?? null, said, seconds);
          for (const listener of this.listeners) listener();
        } catch {
          // A table that cannot be read is drawn as it was.
        }
      }
      if (session.mesaRefused !== null) {
        this.refused = { why: MESA_RECUSAS[session.mesaRefused] ?? "regras", until: performance.now() + 3500 };
        session.mesaRefused = null;
        for (const listener of this.listeners) listener();
      }
      // Invitations to play, and the answers to the player's own (Task 4B.1).
      for (const event of session.convites.splice(0)) {
        // A game written down: what it did to the player's points (the ranking).
        if (event.kind === EVENT.PONTOS) {
          if (event.subject < this.tables.length) this.pontos = { mesa: event.subject, depois: event.args[0] ?? 0, delta: event.args[1] ?? 0, ate: performance.now() + 30_000 };
          for (const listener of this.listeners) listener();
          continue;
        }
        const nome = session.who(event.subject)?.name ?? "";
        const mesa = event.args[0] ?? 0;
        if (mesa >= this.tables.length) continue;
        if (event.kind === EVENT.CONVITE) this.convite = { entidade: event.subject, nome, mesa, ate: performance.now() + 60_000 };
        else if (event.args[1] === 1) {
          this.destino = { mesa, ate: performance.now() + 10 * 60_000 };
          this.guardadoPara = { mesa, nome, ate: performance.now() + 10 * 60_000 };
          this.aviso = { kind: "aceitou", nome, ate: performance.now() + 6000 };
        } else this.aviso = { kind: "recusou", nome, ate: performance.now() + 5000 };
        for (const listener of this.listeners) listener();
      }
    }
    this.x = x;
    this.z = z;
    const agora = performance.now();
    if (this.convite && this.convite.ate < agora) this.convite = null;
    if (this.destino && this.destino.ate < agora) this.destino = null;
    this.draw(seconds, x, z);
    let mine: AtTables["mine"] = null;
    const camera = this.renderer.camera;
    let near: AtTables["near"] = null;
    let nearest = SIT_REACH_M;
    for (const [mesa, table] of this.tables.entries()) {
      const said = this.said[mesa];
      for (const [lugar, seat] of table.seats.entries()) {
        const sitter = said?.lugares[lugar];
        if (me !== null && sitter?.entidade === me) mine = { mesa, lugar, seat: this.seatOf(mesa, lugar) };
        const far = Math.hypot(seat.pos[0] - x, seat.pos[2] - z);
        // A seat is free when a kota has it: the kota gets up for a player.
        // A seat kept for someone is not offered, but at the table where one is kept for the player: the zone seats them in theirs.
        if (far < nearest && (!sitter || (sitter.entidade === 0 && (!sitter.guardado || this.destino?.mesa === mesa)))) {
          nearest = far;
          near = { mesa, lugar, jogo: table.game };
        }
      }
    }
    // Seated, the board covers the lower part of the screen: the picture's middle is moved up into what is left,
    // near the top, and the street seen closer. In the screen's own proportions: the camera
    // takes them from what it is given here.
    // Watching: the nearest table with a game the zone tells of; the board closes for a seat, or a walk away.
    let perto: number | null = null;
    if (!mine && this.session?.walking) {
      let closest = WATCH_REACH_M;
      for (const [mesa, table] of this.tables.entries()) {
        const far = Math.hypot(table.pos[0] - x, table.pos[2] - z);
        if (far < closest && this.said[mesa]) {
          closest = far;
          perto = mesa;
        }
      }
    }
    const vendo = this.vendo;
    if (vendo !== null && (mine || Math.hypot(this.tables[vendo]!.pos[0] - x, this.tables[vendo]!.pos[2] - z) > WATCH_LEAVE_M)) this.vendo = null;
    if (perto !== this.perto || vendo !== this.vendo) {
      this.perto = perto;
      for (const listener of this.listeners) listener();
    }
    if (this.guardadoPara && this.guardadoPara.ate < agora) this.guardadoPara = null;
    const aspect = camera.aspect;
    const board = mine !== null || this.vendo !== null;
    if (board && !camera.view?.enabled) camera.setViewOffset(aspect * 1.8, 1.8, aspect * 0.4, 0.76, aspect, 1);
    else if (!board && camera.view?.enabled) camera.clearViewOffset();
    // Sat down, the way to a kept seat is done with; until then a gold mark turns over the table.
    if (mine) this.destino = null;
    const destino = this.destino;
    this.marca.visible = destino !== null;
    if (destino) {
      const table = this.tables[destino.mesa]!;
      this.marca.position.set(table.pos[0], table.pos[1] + 1.9 + Math.sin(seconds * 2.4) * 0.12, table.pos[2]);
      this.marca.rotation.y = seconds * 1.6;
    }
    // A seat is offered only where the zone is there to give it: alone in the street, the tables are to look at.
    return { mine, near: mine || !this.session?.walking ? null : near };
  }

  /** A table has changed: the move just made is shown going from where it was to where it is. */
  private began(mesa: number, before: MesaDita | null, now: MesaDita, seconds: number): void {
    const shown = this.shown[mesa]!;
    const last = now.ultimo;
    if (!before || !last || now.versao !== before.versao + 1) {
      shown.moving = null;
      return;
    }
    if (last.lance.jogo === "ludo") {
      shown.thrownAt = seconds;
      if (!last.lance.lance || now.partida.jogo !== "ludo") return;
      const game = now.partida.estado;
      const was = before.partida.jogo === "ludo" ? before.partida.estado : game;
      const from = this.cellAt(mesa, ludoCell(was, last.lugar, last.lance.lance.piece));
      const to = this.cellAt(mesa, ludoCell(game, last.lugar, last.lance.lance.piece));
      shown.moving = { to: last.lugar * 4 + last.lance.lance.piece, path: [from, to], began: seconds };
      return;
    }
    const virado = now.primeiro === 1;
    const squares = last.lance.jogo === "xadrez" ? [last.lance.lance.from, last.lance.lance.to] : last.lance.lance.path;
    shown.moving = { to: squares[squares.length - 1]!, path: squares.map((square) => this.squareAt(mesa, square, virado)), began: seconds };
  }

  /** Where the middle of a square of an 8 × 8 board is, in the world. */
  private squareAt(mesa: number, square: number, virado: boolean): { x: number; z: number } {
    const table = this.tables[mesa]!;
    const { row, col } = squareSeen(square, virado);
    const side = (table.size * (1 - 2 * FRAME)) / 8;
    return this.offset(table, (3.5 - col) * side, (3.5 - row) * side);
  }

  /** Where the middle of a cell of Não te irrites is, in the world. */
  private cellAt(mesa: number, [col, row]: readonly [number, number]): { x: number; z: number } {
    const table = this.tables[mesa]!;
    const cell = table.size / 11;
    return this.offset(table, (5 - col) * cell, (5 - row) * cell);
  }

  /** A point of a table's top, so far to seat 0's left and so far ahead of it. */
  private offset(table: Table, left: number, ahead: number): { x: number; z: number } {
    const f = radians(table.facing);
    return { x: table.pos[0] + Math.cos(f) * left + Math.sin(f) * ahead, z: table.pos[2] - Math.sin(f) * left + Math.cos(f) * ahead };
  }

  private place(mesh: InstancedMesh, index: number, x: number, y: number, z: number, scale: number, yaw: number, colour: Color): void {
    this.turn.setFromAxisAngle(this.up, yaw);
    this.matrix.compose(new Vector3(x, y, z), this.turn, new Vector3(scale, scale, scale));
    mesh.setMatrixAt(index, this.matrix);
    mesh.setColorAt(index, colour);
  }

  /** Where a piece is drawn: on its square, or on its way there, a little lifted in the middle of the move. */
  private along(shown: Shown, key: number, at: { x: number; z: number }, seconds: number): { x: number; z: number; lift: number } {
    const moving = shown.moving;
    if (!moving || moving.to !== key) return { ...at, lift: 0 };
    const t = Math.min(1, (seconds - moving.began) / MOVE_S);
    if (t >= 1) {
      shown.moving = null;
      return { ...at, lift: 0 };
    }
    const legs = moving.path.length - 1;
    const leg = Math.min(legs - 1, Math.floor(t * legs));
    const u = t * legs - leg;
    const a = moving.path[leg]!;
    const b = moving.path[leg + 1]!;
    const ease = u * u * (3 - 2 * u);
    return { x: a.x + (b.x - a.x) * ease, z: a.z + (b.z - a.z) * ease, lift: Math.sin(u * Math.PI) * 0.035 };
  }

  private draw(seconds: number, x: number, z: number): void {
    const counts = { xadrez: {} as Record<string, number>, carica: 0, peao: 0 };
    for (const letter of Object.keys(XADREZ)) counts.xadrez[letter] = 0;
    const people = this.scene.people;
    for (const [mesa, shown] of this.shown.entries()) {
      const table = shown.table;
      const far = Math.hypot(table.pos[0] - x, table.pos[2] - z);
      const near = far < DRAWN_WITHIN_M;
      shown.board.visible = far < DRAWN_WITHIN_M * 2;
      const said = this.said[mesa];
      const partida = this.partidaOf(mesa);
      const top = table.pos[1] + 0.003;
      if (near && partida.jogo === "xadrez") {
        const side = (table.size * (1 - 2 * FRAME)) / 8;
        const virado = (said?.primeiro ?? 0) === 1;
        for (const [square, piece] of partida.estado.board.entries()) {
          if (piece === ".") continue;
          const letter = piece.toLowerCase();
          const white = piece !== letter;
          const at = this.along(shown, square, this.squareAt(mesa, square, virado), seconds);
          // The white pieces start nearest the seat that plays first; a knight looks across the board.
          const across = radians(table.facing) + (white !== virado ? 0 : Math.PI);
          this.place(this.pieces.xadrez[letter]!, counts.xadrez[letter]!++, at.x, top + at.lift, at.z, side * 1.1, across, white ? BRANCAS : PRETAS);
        }
      } else if (near && partida.jogo === "damas") {
        const side = (table.size * (1 - 2 * FRAME)) / 8;
        const virado = (said?.primeiro ?? 0) === 1;
        for (const [square, piece] of partida.estado.board.entries()) {
          if (piece === 0) continue;
          const at = this.along(shown, square, this.squareAt(mesa, square, virado), seconds);
          const colour = piece > 0 ? CARICA_CLARA : CARICA_ESCURA;
          // Each cap turned its own way, as caps are.
          const spin = square * 2.39;
          this.place(this.pieces.carica, counts.carica++, at.x, top + at.lift, at.z, side, spin, colour);
          if (Math.abs(piece) === 2) this.place(this.pieces.carica, counts.carica++, at.x, top + at.lift + side * 0.09, at.z, side, spin + 1, colour);
        }
      } else if (near && partida.jogo === "ludo") {
        const cell = table.size / 11;
        const game = partida.estado;
        for (let seat = 0; seat < game.pieces.length; seat++) {
          for (let piece = 0; piece < 4; piece++) {
            const at = this.along(shown, seat * 4 + piece, this.cellAt(mesa, ludoCell(game, seat, piece)), seconds);
            this.place(this.pieces.peao, counts.peao++, at.x, top + at.lift, at.z, cell * 1.15, 0, new Color(LUDO_CORES[game.colours[seat]!]!));
          }
        }
        // The die: before the seat whose throw it is, showing the last throw; tumbling for a moment when thrown.
        const die = shown.die!;
        die.visible = true;
        const turnSeat = said?.fase === "jogo" ? game.turn : 0;
        const value = partida.dado ?? (said?.ultimo?.lance.jogo === "ludo" ? said.ultimo.lance.dado : 6);
        const spot = this.offset(table, (turnSeat === 1 ? 1 : turnSeat === 3 ? -1 : 0.62) * table.size * 0.42, (turnSeat === 0 ? -1 : turnSeat === 2 ? 1 : -0.62) * table.size * 0.42);
        const tumble = Math.max(0, 1 - (seconds - shown.thrownAt) / 0.6);
        die.position.set(spot.x, top + 0.016 + Math.sin(tumble * Math.PI) * 0.06, spot.z);
        // The face up (the box's third) is the throw's; while it tumbles, any.
        const shownValue = tumble > 0 ? 1 + (Math.floor(seconds * 23) % 6) : value;
        (die.material as MeshLambertMaterial[])[2] = this.faces[shownValue - 1]!;
        die.rotation.set(tumble * 9, tumble * 7 + radians(table.facing), tumble * 5);
      }
      if (!near && shown.die) shown.die.visible = false;
      // The kotas: whoever has a seat no player has, sitting, thinking, laughing when they win. Up close, whole.
      const close = far < WHOLE_WITHIN_M && shown.whole.every((one) => one !== null);
      for (const [lugar, seat] of table.seats.entries()) {
        // A seat kept for someone invited is left empty for them: no kota sits in it.
        const isKota = !said || (said.lugares[lugar]?.entidade === 0 && !said.lugares[lugar]?.guardado);
        const light = shown.kotas[lugar];
        const whole = shown.whole[lugar];
        if (light) light.root.visible = false;
        if (whole) whole.root.visible = false;
        const kota = close ? whole : light;
        if (!kota || !near || !isKota) continue;
        kota.root.visible = true;
        const facing = radians(seat.facing);
        kota.root.position.set(seat.pos[0] + Math.sin(facing) * 0.08, seat.pos[1] - 0.46 * (kota.height / 1.7), seat.pos[2] + Math.cos(facing) * 0.08);
        kota.root.rotation.y = facing;
        const won = said?.fase === "fim" && winnerSeat(said) === lugar;
        kota.pose({ speed: 0, phase: 0, time: seconds + mesa * 3.1 + lugar * 1.7 }, { sit: 1, ...(won ? { emote: { kind: "rir" as const, seconds: seconds % 2.6 } } : {}) });
      }
      const fetch = (whole: boolean): void => {
        void Promise.all(table.seats.map(async (_, lugar) => {
          const who = people!.pick("kota", mesa * 2 + lugar);
          const body = who ? await people!.make(who, !whole) : null;
          if (!body) return;
          body.shadow = whole;
          body.root.visible = false;
          this.renderer.scene.add(body.root);
          (whole ? shown.whole : shown.kotas)[lugar] = body;
        }));
      };
      if (near && people && !shown.fetching) {
        shown.fetching = true;
        fetch(false);
      }
      if (far < WHOLE_WITHIN_M && people && !shown.fetchingWhole) {
        shown.fetchingWhole = true;
        fetch(true);
      }
    }
    for (const [letter, mesh] of Object.entries(this.pieces.xadrez)) this.finish(mesh, counts.xadrez[letter]!);
    this.finish(this.pieces.carica, counts.carica);
    this.finish(this.pieces.peao, counts.peao);
  }

  private finish(mesh: InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  close(): void {
    this.marca.removeFromParent();
    this.marca.geometry.dispose();
    for (const shown of this.shown) {
      shown.board.removeFromParent();
      shown.die?.removeFromParent();
      for (const kota of [...shown.kotas, ...shown.whole]) {
        kota?.root.removeFromParent();
        kota?.release();
      }
    }
    for (const mesh of [...Object.values(this.pieces.xadrez), this.pieces.carica, this.pieces.peao]) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
  }
}

/** The seat that won the game just ended, or -1 for a draw. */
export function winnerSeat(said: MesaDita): number {
  const partida = said.partida;
  if (partida.jogo === "ludo") return partida.estado.winner ?? -1;
  const result = partida.estado.result;
  if (result === null || result === "empate") return -1;
  const firstWon = result === "w" || result === 0;
  return firstWon ? said.primeiro : 1 - said.primeiro;
}
