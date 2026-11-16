// The player's presence in a channel of the zone, as the walking page uses
// it (Task 3.3): the line, the player's own body ahead of the zone, everyone
// else a moment behind, and their bodies in the street. The page asks four
// things of it a frame and knows nothing of sockets.
//
// With no line (no network, no zone, a van being ridden) everything here
// answers "alone", and the page walks its own street as it always did.

import { type InputFrame, type Snapshot } from "@nzila/protocol";
import { PERSON_BODY_MM, type CharacterState, type Obstacle } from "@nzila/sim";
import { type Named } from "../render/names.ts";
import { Players } from "../render/players.ts";
import { type WorldRenderer } from "../render/world-renderer.ts";
import { openLink, type Link } from "./link.ts";
import { Others } from "./others.ts";
import { Prediction, type Said } from "./predict.ts";

/** A line that could not be opened, or dropped, is tried again: this long after, then twice as long, a few times. */
const RETRY_MS = 4000;
const RETRIES = 4;

export const STILL: InputFrame = { dx: 0, dz: 0, run: false, brake: false };

export class Session {
  private readonly districtId: string;
  private readonly token: string;
  private readonly players: Players;
  private link: Link | null = null;
  private prediction = new Prediction();
  private others = new Others();
  /** The zone's newest word on the player's own body, not yet acted on. */
  private mine: { said: Said; lastInputSeq: number } | null = null;
  private first: Said | null = null;
  private retries = 0;
  /** Each attempt to come in has a number: an answer to an older attempt is thrown away. */
  private attempt = 0;
  private closed = false;
  /** How many times the zone has had to put the body right: for the tests and the bench. */
  corrections = 0;
  /** Why the line was last lost, until the page has read it. */
  lost: "dropped" | "elsewhere" | null = null;

  constructor(renderer: WorldRenderer, districtId: string, token: string) {
    this.districtId = districtId;
    this.token = token;
    this.players = new Players(renderer);
  }

  /** Whether the zone is deciding where the player is. */
  get linked(): boolean {
    return this.link !== null;
  }

  /** How many other players have a body in the street. */
  get count(): number {
    return this.players.count;
  }

  get channel(): number | null {
    return this.link?.accepted.channel ?? null;
  }

  /** Comes into a channel: where the player last stood, or beside a paragem when they have just got off there. */
  join(paragem?: string): void {
    const attempt = ++this.attempt;
    void openLink(this.districtId, this.token, paragem, {
      snapshot: (snapshot) => attempt === this.attempt && this.hear(snapshot),
      who: (who) => attempt === this.attempt && this.players.know(who),
      closed: (why) => {
        if (attempt !== this.attempt) return;
        this.link = null;
        this.arrived = false;
        this.lost = why;
        // A dropped line is picked up again where the player stands for the zone (Task 3.4 makes this seamless).
        // One taken by the same player on another phone is left to them.
        if (why === "dropped") this.again(attempt);
      },
    }).then((link) => {
      if (!link) return this.again(attempt);
      if (attempt !== this.attempt || this.closed) return link.close();
      this.prediction = new Prediction();
      this.others = new Others();
      this.mine = null;
      this.first = null;
      this.arrived = false;
      this.retries = 0;
      this.link = link;
    });
  }

  private again(attempt: number): void {
    if (this.closed || attempt !== this.attempt || this.retries >= RETRIES) return;
    this.retries++;
    setTimeout(() => {
      if (!this.closed && attempt === this.attempt) this.join();
    }, RETRY_MS * this.retries);
  }

  /** Goes out of the channel: the others stop seeing the player, and the player walks alone. */
  leave(): void {
    this.attempt++;
    this.link?.close();
    this.link = null;
    this.mine = null;
    this.first = null;
    this.arrived = false;
    this.others = new Others();
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
    // Kept as a mark that it was given: `first` is set once a join.
    this.first = null;
    this.arrived = true;
    return first;
  }

  /** Whether the zone has said where the player is: before that the page must not send a stick from the wrong place. */
  private arrived = false;
  get walking(): boolean {
    return this.link !== null && this.arrived;
  }

  /** The other players, as bodies the player's own may not walk into: what the zone holds against them too. */
  bodies(): Obstacle[] {
    if (!this.link) return [];
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

  /** Draws the other players where they are now, and gives them back as people who may be named. */
  draw(elapsedMs: number, seconds: number): Named[] {
    return this.players.update(this.link ? this.others.at(performance.now()) : [], elapsedMs, seconds);
  }

  close(): void {
    this.closed = true;
    this.leave();
    this.players.close();
  }
}
