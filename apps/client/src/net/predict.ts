// The player's own body, ahead of the zone (Task 3.3). The phone walks its
// own avatar at once, with the very simulation the zone runs, and sends the
// stick. The zone answers ten times a second with where the avatar really is
// and which stick frame it had reached. The phone then starts again from the
// zone's word and walks the frames the zone has not had yet: when the two
// agree, which is nearly always, nothing is seen; when they do not, the body
// is where the zone says, and the picture slides there instead of jumping.
//
// Nothing here knows about sockets or pictures: it is arithmetic, and tested.

import { type InputFrame } from "@nzila/protocol";
import { type CharacterState } from "@nzila/sim";

/** How many frames each message repeats, newest first: a lost packet loses nothing. */
export const FRAMES_REPEATED = 3;
/** Frames kept while no answer comes: two seconds of them. Beyond that the oldest are let go. */
export const PENDING_AT_MOST = 40;
/** A difference smaller than this is not a difference: millimetres. */
export const AGREE_MM = 40;
/** A difference larger than this is not slid over: the body is simply there. */
export const SNAP_MM = 3000;

export interface Sent {
  readonly seq: number;
  /** Newest first: frames[i] is step seq - i. */
  readonly frames: InputFrame[];
}

/** Where the zone says the avatar is. */
export interface Said {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

export class Prediction {
  private pending: { seq: number; frame: InputFrame }[] = [];
  private seq = 0;

  /** How many frames the zone has not answered for yet. */
  get waiting(): number {
    return this.pending.length;
  }

  /** A frame the phone has just walked: remembered, numbered, and given back as what to send. */
  walked(frame: InputFrame): Sent {
    this.seq++;
    this.pending.push({ seq: this.seq, frame });
    if (this.pending.length > PENDING_AT_MOST) this.pending.shift();
    return { seq: this.seq, frames: this.pending.slice(-FRAMES_REPEATED).reverse().map((one) => one.frame) };
  }

  /**
   * The zone's word. `state` is the body as the phone has it and is changed when the zone disagrees;
   * `walk` takes one step of the simulation. Returns how far the picture must slide to stay where it
   * was (old place minus new, millimetres), or null when nothing changed. A body in the air is left
   * to land: a snapshot does not say how far through a jump it is.
   */
  reconcile(state: CharacterState, said: Said, lastInputSeq: number, walk: (body: CharacterState, frame: InputFrame) => void): { x: number; y: number; z: number } | null {
    this.pending = this.pending.filter((one) => one.seq > lastInputSeq);
    if ((state.air ?? 0) > 0) return null;
    const trial: CharacterState = { x: said.x, y: said.y, z: said.z, yaw: said.yaw };
    for (const one of this.pending) walk(trial, one.frame);
    // A jump begun in the frames not yet answered: the phone's own body is already where that goes.
    if ((trial.air ?? 0) > 0) return null;
    const off = Math.hypot(trial.x - state.x, trial.z - state.z);
    if (off < AGREE_MM) return null;
    const slide = off > SNAP_MM ? { x: 0, y: 0, z: 0 } : { x: state.x - trial.x, y: state.y - trial.y, z: state.z - trial.z };
    // The way they face is the phone's own while they agree on the place; after a correction it is the zone's.
    Object.assign(state, { x: trial.x, y: trial.y, z: trial.z, yaw: trial.yaw });
    return slide;
  }
}
