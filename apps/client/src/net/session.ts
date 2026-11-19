// The player's presence in a channel of the zone, as the walking page uses
// it (Tasks 3.3 and 3.4): the line, the player's own body ahead of the zone,
// everyone else a moment behind, and their bodies in the street. The page
// asks a few things of it a frame and knows nothing of sockets.
//
// With no line (no network, no zone, a van being ridden) everything here
// answers "alone", and the page walks its own street as it always did.
//
// A line that falls is picked up again, quietly: the zone keeps the player's
// body standing where it was for a minute, and the matchmaker sends them back
// to that very channel. Meanwhile the world goes on being drawn and the
// others stay where they were last seen; they do not vanish. Only after a
// minute of trying is the player told there is no network.

import { isGreeting } from "@nzila/i18n";
import { type Object3D } from "three";
import { type TrafficSaid, CHAT_REFUSAL, EMOTE_NAMES, EVENT, type EmoteName, type InputFrame, type Snapshot, type Who, type WorldEvent } from "@nzila/protocol";
import { PERSON_BODY_MM, type CharacterState, type Obstacle } from "@nzila/sim";
import { type Named } from "../render/names.ts";
import { Players } from "../render/players.ts";
import { type WorldRenderer } from "../render/world-renderer.ts";
import { playSeat, type KeptOut, type PlaySeat } from "../world/account.ts";
import { openLink, type Link } from "./link.ts";
import { Others } from "./others.ts";
import { Prediction, type Said } from "./predict.ts";
import { ALONE_RETRY_MOST_MS, ALONE_RETRY_MS, OUT_RETRY_MS, SAY_AFTER_MS, nextTry, type NetState } from "./retry.ts";
import { Talking } from "./talking.ts";

/** Why a line was not said: a word the game does not pass on, too many too fast, or an address to somewhere outside. */
export type Refused = "words" | "slow" | "links" | "muted";

/** Where the players this phone has silenced are kept, by the number of their BI: silence outlives the visit. */
const SILENCED_KEY = "nzila.silenciados";
function silencedHere(): Set<string> {
  try {
    const kept = JSON.parse(localStorage.getItem(SILENCED_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(kept) ? kept.filter((one): one is string => typeof one === "string").slice(-500) : []);
  } catch {
    return new Set();
  }
}

/** Whom the player has met (a wave answered by a wave), by the number of their BI: kept on this phone until friends have a home on the server (10.1). */
const KNOWN_KEY = "nzila.conhecidos";
function knownHere(): Set<string> {
  try {
    const kept = JSON.parse(localStorage.getItem(KNOWN_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(kept) ? kept.filter((one): one is string => typeof one === "string").slice(-500) : []);
  } catch {
    return new Set();
  }
}

export const STILL: InputFrame = { dx: 0, dz: 0, run: false, brake: false };

export class Session {
  private readonly districtId: string;
  /** The channel a friend's link asked for, if any: the matchmaker is asked for that one. */
  private readonly invited: number | undefined;
  private readonly players: Players;
  private link: Link | null = null;
  private prediction = new Prediction();
  private others = new Others();
  /** The zone's newest word on the player's own body, not yet acted on. */
  private mine: { said: Said; lastInputSeq: number } | null = null;
  private first: Said | null = null;
  /** Whether the zone has said where the player is: before that the page must not send a stick from the wrong place. */
  private arrived = false;
  /** The newest snapshot acted on in this stay. */
  private heardTick = -1;
  /** Each attempt to come in has a number: an answer to an older attempt is thrown away. */
  private attempt = 0;
  private tries = 0;
  /** When the line fell, if it has and is not yet mended; and whether the minute of trying is over. */
  private fellAt: number | null = null;
  private gaveUp = false;
  /** Who the player was in the channel before the line fell: back as the same body, the others are kept as they were. */
  private wasEntity: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  /** What is being said in the street, and whether talk is open in this channel at all. */
  readonly talk = new Talking();
  private chatOpen = false;
  private readonly silencedBi = silencedHere();
  private readonly knownBi = knownHere();
  /** Someone just met, and someone who has just waved, until the page has said so. */
  met: string | null = null;
  waved: { entity: number; name: string; spoke?: boolean } | null = null;
  /** How many copies of the bairro were open on coming in. */
  private copies = 1;
  /** Why the player's last line was not said, until the page has shown it. */
  refused: Refused | null = null;
  /** How the street's traffic is waiting, as the zone last said, until the page has taken it. */
  traffic: TrafficSaid | null = null;
  /** The tables the zone has spoken of, as it said them, until the code that draws tables has read them; and why the last thing asked of one was not done. */
  mesas: Uint8Array[] = [];
  mesaRefused: number | null = null;
  private readonly offsets: number[] = [];
  /** How far the zone's clock is ahead of this phone's, in milliseconds; null before it has said anything. */
  get zoneClockAhead(): number | null {
    return this.offsets.length === 0 ? null : Math.max(...this.offsets);
  }
  /** Kept out by a moderator, as the matchmaker last said: which, and until when. */
  out: KeptOut | null = null;
  /** How many times the zone has had to put the body right, and how many times a fallen line was picked up: for the tests and the bench. */
  corrections = 0;
  reconnections = 0;

  constructor(renderer: WorldRenderer, districtId: string, invited?: number) {
    this.districtId = districtId;
    this.invited = invited;
    this.players = new Players(renderer);
    this.players.knows = (bi) => this.knownBi.has(bi);
  }

  /** How many people the player has met, on this phone: for the tests. */
  get known(): number {
    return this.knownBi.size;
  }

  /** The channel, when it is worth naming: only when the bairro has more than one copy (D-3.13). */
  get namedChannel(): number | null {
    const channel = this.channel;
    return channel !== null && (this.copies > 1 || channel > 1) ? channel : null;
  }

  /** How it stands with the zone, as the player should be told. A fall that has only just happened is not mentioned yet. */
  get state(): NetState {
    if (this.link) return "linked";
    if (this.out) return "out";
    if (this.gaveUp) return "lost";
    if (this.fellAt !== null) return performance.now() - this.fellAt > SAY_AFTER_MS ? "reconnecting" : "linked";
    return "alone";
  }

  /** How many other players have a body in the street. */
  get count(): number {
    return this.players.count;
  }

  get channel(): number | null {
    return this.link?.accepted.channel ?? null;
  }

  /** Whether the zone is deciding where the player is, and has said where that is. */
  get walking(): boolean {
    return this.link !== null && this.arrived;
  }

  /** Comes into a channel: where the player last stood, or beside a paragem when they have just got off there. */
  join(paragem?: string): void {
    const attempt = ++this.attempt;
    if (this.timer) clearTimeout(this.timer);
    // First the matchmaker: which channel, in which zone, and a ticket for the seat. Then the line itself.
    void playSeat(this.districtId, this.invited).then((seat) => {
      if (attempt !== this.attempt || this.closed) return;
      if (seat && "out" in seat) {
        // Kept out by a moderator. The player is told, walks their own street, and is asked about again in a while.
        this.out = seat.out;
        this.alone();
        this.timer = setTimeout(() => !this.closed && attempt === this.attempt && this.join(), OUT_RETRY_MS);
        return;
      }
      this.out = null;
      if (!seat) return this.again(attempt);
      void this.open(seat, paragem, attempt);
    });
  }

  /** The player asks for another try, after being told there is no network. */
  retry(): void {
    this.gaveUp = false;
    this.fellAt = performance.now();
    this.tries = 0;
    this.join();
  }

  private open(seat: PlaySeat, paragem: string | undefined, attempt: number): Promise<void> {
    return openLink(seat, paragem, {
      snapshot: (snapshot) => attempt === this.attempt && this.hear(snapshot),
      traffic: (said) => {
        if (attempt !== this.attempt) return;
        this.traffic = said;
        // The zone's clock as this phone can know it: what it said less how long the saying took, which only ever
        // makes it look earlier. The latest of the last few is the nearest the truth (F-152).
        this.offsets.push(said.nowMs - Date.now());
        if (this.offsets.length > 20) this.offsets.shift();
      },
      mesa: (bytes) => attempt === this.attempt && this.mesas.length < 64 && this.mesas.push(bytes),
      who: (who) => {
        if (attempt !== this.attempt) return;
        this.players.know(who);
        // Someone this phone silenced on another day is silent still.
        if (who.bi && this.silencedBi.has(who.bi)) this.talk.silence(who.entityId, true);
      },
      heard: (from, text) => {
        if (attempt !== this.attempt) return;
        const mine = from === this.link?.accepted.entityId;
        const name = mine ? null : this.players.nameOf(from);
        // Someone whose name has not arrived is not yet anyone: their line waits for nothing and is dropped.
        if (mine || name !== null) this.talk.heard(from, name, text, performance.now());
        // Greeted in words by someone not yet met: the page says so, so that it can be answered.
        const who = mine ? null : this.players.who(from);
        if (who && who.bi && !this.knownBi.has(who.bi) && !this.talk.silenced(from) && isGreeting(text)) this.waved = { entity: from, name: who.name, spoke: true };
      },
      typing: (from, on) => attempt === this.attempt && this.talk.typing(from, on, performance.now()),
      event: (event) => attempt === this.attempt && this.happened(event),
      closed: (why) => {
        if (attempt !== this.attempt) return;
        this.wasEntity = this.link?.accepted.entityId ?? null;
        this.link = null;
        this.arrived = false;
        this.mine = null;
        // Taken by the same player on another phone: that is where they are now, and this one walks alone.
        if (why === "elsewhere") return this.alone();
        // Put out by staff: the matchmaker is asked at once. Someone who was only stuck comes in again at the
        // district's door; someone suspended is told so.
        if (why === "put_out") {
          this.alone();
          return this.join();
        }
        // Fallen: picked up again, and the others are kept on the screen as they were.
        this.fellAt = performance.now();
        this.tries = 0;
        this.again(attempt);
      },
    }).then((link) => {
      if (!link) return this.again(attempt);
      if (attempt !== this.attempt || this.closed) return link.close();
      // Back as the same body in the same channel: everyone else is where they were. Anything else is a new street.
      if (link.accepted.entityId !== this.wasEntity) this.others = new Others();
      if (this.fellAt !== null) this.reconnections++;
      this.prediction = new Prediction();
      this.mine = null;
      this.first = null;
      this.arrived = false;
      this.fellAt = null;
      this.gaveUp = false;
      this.tries = 0;
      this.chatOpen = false;
      this.heardTick = -1;
      this.copies = seat.copies ?? 1;
      this.link = link;
    });
  }

  /** Another try, in a while: how long depends on whether a line fell (quick, for a minute) or there never was a zone (slow, for as long as the player plays). */
  private again(attempt: number): void {
    if (this.closed || attempt !== this.attempt) return;
    let wait: number | null;
    if (this.fellAt !== null) {
      wait = nextTry(performance.now() - this.fellAt, this.tries);
      if (wait === null) {
        // A minute has passed. The player is told, the others are let go, and nothing more is tried until asked.
        this.gaveUp = true;
        this.fellAt = null;
        this.others = new Others();
        return;
      }
    } else {
      // Nobody to walk with yet: the player walks their own street and is told nothing, and the phone goes on
      // looking, slowly, for as long as they play. A street with people in it is the game.
      wait = Math.min(ALONE_RETRY_MOST_MS, ALONE_RETRY_MS * (this.tries + 1));
    }
    this.tries++;
    this.timer = setTimeout(() => {
      if (!this.closed && attempt === this.attempt) this.join();
    }, wait);
  }

  private alone(): void {
    this.fellAt = null;
    this.gaveUp = false;
    this.wasEntity = null;
    this.others = new Others();
  }

  /** Goes out of the channel on purpose: the others stop seeing the player, and the player walks alone. */
  leave(): void {
    this.attempt++;
    if (this.timer) clearTimeout(this.timer);
    this.link?.close();
    this.link = null;
    this.mine = null;
    this.first = null;
    this.arrived = false;
    this.alone();
  }

  private hear(snapshot: Snapshot): void {
    const link = this.link;
    if (!link) return;
    // Only ever forwards: an older word arriving after a newer one changes nothing.
    if (snapshot.tick <= this.heardTick) return;
    this.heardTick = snapshot.tick;
    const me = snapshot.entities.find((entity) => entity.id === link.accepted.entityId);
    if (me) {
      this.myRide = me.vehicleId === null ? null : { vehicle: me.vehicleId, seat: me.seat ?? 0 };
      const said = { x: me.x, y: me.y, z: me.z, yaw: me.yaw };
      // Where they arrive is the first word of a stay, and only the first.
      if (!this.arrived) this.first ??= said;
      this.mine = { said, lastInputSeq: snapshot.lastInputSeq };
    }
    this.others.take(snapshot, link.accepted.entityId, performance.now());
  }

  private happened(event: WorldEvent): void {
    if (event.kind === EVENT.CHAT_OPEN) this.chatOpen = true;
    else if (event.kind === EVENT.CHAT_REFUSED) this.refused = event.args[0] === CHAT_REFUSAL.SLOW_DOWN ? "slow" : event.args[0] === CHAT_REFUSAL.LINKS ? "links" : event.args[0] === CHAT_REFUSAL.MUTED ? "muted" : "words";
    else if (event.kind === EVENT.RIDE_REFUSED) this.rideRefused = true;
    else if (event.kind === EVENT.GIVEN) this.given = true;
    else if (event.kind === EVENT.MESA_REFUSED) this.mesaRefused = event.args[0] ?? 0;
    else if (event.kind === EVENT.EMOTE) {
      const name = EMOTE_NAMES[event.args[0] ?? -1];
      if (name && !this.talk.silenced(event.subject)) this.players.gesture(event.subject, name);
      // A wave from someone not yet met: the page says so if they are close, so that it can be answered.
      const who = this.players.who(event.subject);
      if (name === "acenar" && who && who.bi && !this.knownBi.has(who.bi) && !this.talk.silenced(event.subject)) this.waved = { entity: event.subject, name: who.name };
    } else if (event.kind === EVENT.MET) {
      const who = this.players.who(event.subject);
      if (!who || !who.bi) return;
      this.knownBi.add(who.bi);
      this.met = who.name;
      this.waved = null;
      try {
        localStorage.setItem(KNOWN_KEY, JSON.stringify([...this.knownBi]));
      } catch {
        // Storage is off: they are known for this visit.
      }
    }
  }

  /** "Silenciar", and its undoing: at once, on this phone, and remembered here by the number of their BI. */
  silence(entity: number, on: boolean): void {
    this.talk.silence(entity, on);
    const bi = this.players.who(entity)?.bi;
    if (!bi) return;
    if (on) this.silencedBi.add(bi);
    else this.silencedBi.delete(bi);
    try {
      localStorage.setItem(SILENCED_KEY, JSON.stringify([...this.silencedBi]));
    } catch {
      // Storage is off: they are silent for this visit.
    }
  }

  /** Whether the player can talk here now: in a channel where talk is open. */
  get canTalk(): boolean {
    return this.walking && this.chatOpen;
  }

  /** The player's own number in the channel, when they are in one. */
  get me(): number | null {
    return this.link?.accepted.entityId ?? null;
  }

  /** Says a line to whoever is near. It comes back from the zone when it has been said, and is shown then: never before. */
  say(text: string): void {
    if (this.canTalk) this.link!.say(this.talk.takeId(), text);
  }

  typing(on: boolean): void {
    if (this.canTalk) this.link!.typing(on);
  }

  /** A gesture, for the others to see. */
  /** The van the zone has the player riding, and their seat in it; null on foot, or before the zone has said. */
  myRide: { vehicle: number; seat: number } | null = null;
  /** The zone would not let the player on a van (it had gone, or was full), until the page has taken it. */
  rideRefused = false;

  /** How other players who ride are seated: where their van is drawn, and where its seats are. */
  seatOthers(vanAt: (vehicle: number) => Object3D | null, seatAt: (seat: number) => readonly [number, number, number] | null): void {
    this.players.vanAt = vanAt;
    this.players.seatAt = seatAt;
  }

  /** Someone beside the player says they have just handed them something, until the page has looked. */
  given = false;

  /** Tells the player with this BI number, if they are here, to look in their wallet. */
  nudge(bi: string): void {
    const entity = this.players.entityOf(bi);
    if (this.walking && entity !== null) this.link!.nudge(entity);
  }

  /** Says something to the zone made elsewhere: what the player asks of a table. */
  post(bytes: Uint8Array): void {
    if (this.walking) this.link!.post(bytes);
  }

  /** Asks to get on a van, by its place in the district's list of vehicles. */
  board(vehicle: number): void {
    if (this.walking) this.link!.ride({ on: vehicle });
  }

  /** Asks to get off, at this place beside the van (millimetres). */
  alight(x: number, z: number): void {
    this.myRide = null;
    if (this.walking) this.link!.ride({ off: { x: Math.round(x), z: Math.round(z) } });
  }

  /** How many of the others this phone is told of are riding: for the tests. */
  othersRiding(): number {
    return this.others.latest().filter((one) => one.vehicleId !== null).length;
  }

  /** Which seats of a van other players have taken, as far as this phone is told. */
  seatsTaken(vehicle: number): number[] {
    return this.others.latest().filter((one) => one.vehicleId === vehicle && one.seat !== null).map((one) => one.seat!);
  }

  gesture(name: EmoteName): void {
    if (this.walking) this.link!.gesture(EMOTE_NAMES.indexOf(name));
  }

  /** What each body in the street is doing with its hands, for the tests: the gesture under way, or null. */
  gesturing(): (string | null)[] {
    return this.players.gesturing();
  }

  /** Who a body is: their name, their BI number and their look, as the zone said. */
  who(entity: number): Who | null {
    return this.players.who(entity);
  }

  /** The bodies in the street as places on the ground, for a balloon to hang over or a finger to land on. */
  heads(): { id: number; x: number; y: number; z: number }[] {
    return this.players.heads();
  }

  /** Where the zone put the player on coming in: given once, when it is first known. */
  arrival(): Said | null {
    const first = this.first;
    if (!first || !this.link) return null;
    this.first = null;
    this.arrived = true;
    return first;
  }

  /**
   * The other players, as bodies the player's own may not walk into: what the zone holds against them too.
   * While a fallen line is being picked up they are where they were last seen.
   */
  bodies(): Obstacle[] {
    return this.others.latest().map((other): Obstacle => ({ kind: "circle", x: other.x, z: other.z, radiusMm: PERSON_BODY_MM }));
  }

  /** A frame the page has just walked (or stood through): sent to the zone. */
  walked(frame: InputFrame): void {
    if (this.walking) this.link!.send(this.prediction.walked(frame));
  }

  /**
   * Acts on the zone's newest word about the player's own body. Returns how far the picture must
   * slide to stay where it was (millimetres), or null when the zone and the phone agree.
   */
  settle(state: CharacterState, walk: (body: CharacterState, frame: InputFrame) => void): { x: number; y: number; z: number } | null {
    const mine = this.mine;
    if (!mine || !this.walking) return null;
    this.mine = null;
    const slide = this.prediction.reconcile(state, mine.said, mine.lastInputSeq, walk);
    if (slide) this.corrections++;
    return slide;
  }

  /** Draws the other players where they are now (or where they were last seen), and gives them back as people who may be named. */
  draw(elapsedMs: number, seconds: number): Named[] {
    return this.players.update(this.others.at(performance.now()), elapsedMs, seconds);
  }

  /** For the tests and a developer: the line falls, as in a tunnel. */
  fall(): void {
    this.link?.fall();
  }

  close(): void {
    this.closed = true;
    this.leave();
    this.players.close();
  }
}
