// What is being said in the street, as the phone knows it (Task 3.5): the
// balloon over each speaker, the three dots over whoever is typing, the last
// few lines to read back, and whom this player has chosen not to hear.
//
// The zone decides who hears what (apps/zone/src/talk.ts). This only keeps
// what arrived, for as long as it should be shown. No sockets, no pictures.

/** How long a balloon stays over a speaker: a moment for a short line, longer for a long one. Milliseconds. */
export const BALLOON_LEAST_MS = 3500;
export const BALLOON_MOST_MS = 9000;
const BALLOON_MS_A_LETTER = 70;
/** Three dots are believed this long without news: a phone that vanished while typing does not type for ever. */
export const TYPING_FOR_MS = 8000;
/** The lines kept to read back, and for how long each is shown in the log. */
export const LINES_KEPT = 30;
export const LINE_SHOWN_MS = 14_000;

export interface Balloon {
  /** The words, or "" for someone seen to speak from too far to read. */
  readonly text: string;
  readonly typing: boolean;
}

export interface SaidLine {
  /** Who said it: the name on their BI, or null for the player themselves. */
  readonly who: string | null;
  readonly text: string;
  readonly at: number;
}

export class Talking {
  private readonly balloons = new Map<number, { text: string; until: number }>();
  private readonly typers = new Map<number, number>();
  private readonly said: SaidLine[] = [];
  /** Entities this player does not hear: silenced on this phone, or shut out for good. */
  private readonly deaf = new Set<number>();
  private nextId = 1;

  /** The number for the next line this player sends: a line sent twice is said once. */
  takeId(): number {
    return this.nextId++;
  }

  /** A line arrived. `who` is the speaker's name, or null when it is this player's own line come back. */
  heard(from: number, who: string | null, text: string, now: number): void {
    this.typers.delete(from);
    if (this.deaf.has(from)) return;
    const shown = Math.min(BALLOON_MOST_MS, Math.max(BALLOON_LEAST_MS, [...text].length * BALLOON_MS_A_LETTER));
    this.balloons.set(from, { text, until: now + shown });
    // What could not be read is not written in the log: there is nothing to write.
    if (text.length === 0) return;
    this.said.push({ who, text, at: now });
    if (this.said.length > LINES_KEPT) this.said.shift();
  }

  typing(from: number, on: boolean, now: number): void {
    if (on && !this.deaf.has(from)) this.typers.set(from, now + TYPING_FOR_MS);
    else this.typers.delete(from);
  }

  /** Stops hearing someone, or hears them again. What they said stays in the log; their balloon goes. */
  silence(entity: number, on: boolean): void {
    if (on) {
      this.deaf.add(entity);
      this.balloons.delete(entity);
      this.typers.delete(entity);
    } else {
      this.deaf.delete(entity);
    }
  }

  silenced(entity: number): boolean {
    return this.deaf.has(entity);
  }

  /** Someone has gone from sight: nothing of theirs is left hanging in the air. */
  gone(entity: number): void {
    this.balloons.delete(entity);
    this.typers.delete(entity);
  }

  /** What is over someone's head now, if anything: their words while they last, else their dots. */
  over(entity: number, now: number): Balloon | null {
    const balloon = this.balloons.get(entity);
    if (balloon && balloon.until > now) return { text: balloon.text, typing: false };
    if (balloon) this.balloons.delete(entity);
    const until = this.typers.get(entity);
    if (until !== undefined && until > now) return { text: "", typing: true };
    if (until !== undefined) this.typers.delete(entity);
    return null;
  }

  /** Everyone with something over their head now. */
  speaking(now: number): number[] {
    return [...new Set([...this.balloons.keys(), ...this.typers.keys()])].filter((entity) => this.over(entity, now) !== null);
  }

  /** The last lines, oldest first, that are still fresh enough to show; `all` for the whole of what is kept. */
  lines(now: number, all = false): SaidLine[] {
    return all ? [...this.said] : this.said.filter((line) => LINE_SHOWN_MS > now - line.at).slice(-4);
  }
}
