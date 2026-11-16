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

import { type InputFrame, type Snapshot } from "@nzila/protocol";
import { PERSON_BODY_MM, type CharacterState, type Obstacle } from "@nzila/sim";
import { type Named } from "../render/names.ts";
import { Players } from "../render/players.ts";
import { type WorldRenderer } from "../render/world-renderer.ts";
import { playSeat, type PlaySeat } from "../world/account.ts";
import { openLink, type Link } from "./link.ts";
import { Others } from "./others.ts";
import { Prediction, type Said } from "./predict.ts";
import { ALONE_RETRIES, ALONE_RETRY_MS, SAY_AFTER_MS, nextTry, type NetState } from "./retry.ts";

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
  /** How many times the zone has had to put the body right, and how many times a fallen line was picked up: for the tests and the bench. */
  corrections = 0;
  reconnections = 0;

  constructor(renderer: WorldRenderer, districtId: string, invited?: number) {
    this.districtId = districtId;
    this.invited = invited;
    this.players = new Players(renderer);
  }

  /** How it stands with the zone, as the player should be told. A fall that has only just happened is not mentioned yet. */
  get state(): NetState {
    if (this.link) return "linked";
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
      who: (who) => attempt === this.attempt && this.players.know(who),
      closed: (why) => {
        if (attempt !== this.attempt) return;
        this.wasEntity = this.link?.accepted.entityId ?? null;
        this.link = null;
        this.arrived = false;
        this.mine = null;
        // Taken by the same player on another phone: that is where they are now, and this one walks alone.
        if (why === "elsewhere") return this.alone();
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
      this.link = link;
    });
  }

  /** Another try, in a while: how long depends on whether a line fell (quick, for a minute) or there never was a zone (slow, a few times). */
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
      wait = this.tries < ALONE_RETRIES ? ALONE_RETRY_MS * (this.tries + 1) : null;
      if (wait === null) return;
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
    const me = snapshot.entities.find((entity) => entity.id === link.accepted.entityId);
    if (me) {
      const said = { x: me.x, y: me.y, z: me.z, yaw: me.yaw };
      // Where they arrive is the first word of a stay, and only the first.
      if (!this.arrived) this.first ??= said;
      this.mine = { said, lastInputSeq: snapshot.lastInputSeq };
    }
    this.others.take(snapshot, link.accepted.entityId, performance.now());
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
