// A bad line, on purpose (Task 3.4). In development and in the tests the
// game can be made to play as it will on a weak network in Luanda:
// `&rede=250,5` in the address is a round trip of 250 ms with 5% of packets
// lost. The game is judged there, not on the office's fibre.
//
// A WebSocket never loses a message: under it, a lost packet is sent again,
// and everything behind it waits. So loss here is what a player feels of it:
// now and then the line stalls for a moment, and then everything held up
// arrives at once, in order.
//
// One of these stands on each direction of the line. Arithmetic only.

/** How long a lost packet holds the line up before it is sent again and gets through. */
export const RESEND_MS = 300;

export class Conditioner {
  private readonly delayMs: number;
  private readonly loss: number;
  private readonly random: () => number;
  /** Nothing is delivered before what was sent ahead of it. */
  private last = 0;

  /** `delayMs` is one way (half the round trip); `lossPercent` is of messages. */
  constructor(delayMs: number, lossPercent: number, random: () => number = Math.random) {
    this.delayMs = Math.max(0, delayMs);
    this.loss = Math.min(100, Math.max(0, lossPercent)) / 100;
    this.random = random;
  }

  /** When a message handed over at `now` comes out at the other end. */
  due(now: number): number {
    let at = now + this.delayMs;
    // Lost, and perhaps lost again: each time it waits to be sent once more.
    while (this.loss > 0 && this.loss < 1 && this.random() < this.loss) at += RESEND_MS;
    if (this.loss >= 1) at += RESEND_MS;
    this.last = Math.max(this.last, at);
    return this.last;
  }
}

/** What `&rede=250,5` asks for: a round trip in milliseconds and a loss in percent. Null when the address asks for nothing, or for nonsense. */
export function askedLine(search: string): { roundTripMs: number; lossPercent: number } | null {
  const asked = new URLSearchParams(search).get("rede");
  if (!asked) return null;
  const [roundTripMs, lossPercent = 0] = asked.split(",").map(Number);
  if (roundTripMs === undefined || !Number.isFinite(roundTripMs) || !Number.isFinite(lossPercent) || roundTripMs < 0 || lossPercent < 0) return null;
  return { roundTripMs: Math.min(roundTripMs, 5000), lossPercent: Math.min(lossPercent, 100) };
}

/**
 * Hands things over late, in the order they were given: one line, one queue. Timers alone would not do: two
 * waits that end in the same millisecond may fire in either order, and a line never delivers out of order.
 */
export class LateLine {
  private readonly waiting: { at: number; run: () => void }[] = [];
  private readonly conditioner: Conditioner;
  private readonly now: () => number;
  private readonly wake: (run: () => void, ms: number) => void;
  private asked = false;

  constructor(conditioner: Conditioner, now: () => number = () => performance.now(), wake: (run: () => void, ms: number) => void = (run, ms) => void setTimeout(run, ms)) {
    this.conditioner = conditioner;
    this.now = now;
    this.wake = wake;
  }

  /** Does `run` when its time on the line has passed, after everything given before it. */
  give(run: () => void): void {
    const now = this.now();
    const at = this.conditioner.due(now);
    this.waiting.push({ at, run });
    this.wake(() => this.pump(), Math.max(0, at - now));
  }

  private pump(): void {
    // Half a millisecond of grace: a timer may wake a hair early.
    while (this.waiting.length > 0 && this.waiting[0]!.at <= this.now() + 0.5) this.waiting.shift()!.run();
    // Woken well before the head of the queue was due: asked again for when it is, once, so that nothing is left waiting on a timer that has already gone.
    if (this.waiting.length > 0 && !this.asked) {
      this.asked = true;
      this.wake(() => {
        this.asked = false;
        this.pump();
      }, Math.max(0, this.waiting[0]!.at - this.now()));
    }
  }
}
