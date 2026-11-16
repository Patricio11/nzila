// Talk in the street (Task 3.5). Someone says a line; whoever is near hears
// that they spoke, and whoever is nearer still reads the words. So a
// conversation can be seen from across the street before it can be read, and
// words a player is too far away to read are never sent to their phone.
//
// What is decided here, with no sockets and no database:
//   - what a line is once it is tidied (one line, no control characters);
//   - whether it is said at all: not when it has a word the game does not
//     pass on, and not when its speaker is sending too many too fast;
//   - who hears it and who reads it, by how far they stand, leaving out
//     anyone the speaker has shut out or been shut out by.
//
// A line that is not said is still kept for moderation: by the room.

import { type ChatFilter } from "@nzila/i18n";
import { CHAT_MAX_CHARS, CHAT_REFUSAL, type EntityState } from "@nzila/protocol";

/** Within this, someone is seen to speak (a balloon); within the nearer, their words are read. Millimetres. */
export const HEAR_MM = 16_000;
export const READ_MM = 7_000;
/** A speaker's pace: at least this long between lines, and no more than this many in ten seconds. */
export const LINE_GAP_MS = 500;
export const LINES_IN_TEN_SECONDS = 6;
/**
 * An address to somewhere outside the game: a link, a site's name with its ending, a handle. Talk in the street
 * carries none (Rule 11: it is how strangers are led off to where nobody is watching, and how scams arrive).
 * Read on the line with its spaces taken out too, so that "w w w . sitio . com" is the same thing.
 */
const ADDRESS = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|ao|pt|br|co|io|me|ly|gg|tv|xyz|info|app|link|site|online|shop)\b|\bwa\.me\b|\bt\.me\b)/i;
/** A handle on some other service: an at-sign at the start of a word. Read only as written, or every "fixe @ praia" would be one. */
const HANDLE = /(^|\s)@[a-z0-9_.]{3,}/i;
export function carriesAddress(text: string): boolean {
  return HANDLE.test(text) || ADDRESS.test(text) || ADDRESS.test(text.replace(/\s+/g, "")) || ADDRESS.test(text.replace(/\s*(ponto|dot)\s*/gi, "."));
}

/** Line numbers remembered a speaker: a line sent twice over a bad network is said once (Rule 5). */
const REMEMBERED_IDS = 16;

export type Verdict =
  | { readonly kind: "say"; readonly text: string }
  /** Sent before: already said, or already refused. Nothing more is done. */
  | { readonly kind: "repeat" }
  /** Nothing left of it once tidied. Nothing is done. */
  | { readonly kind: "empty" }
  | { readonly kind: "refuse"; readonly text: string; readonly reason: (typeof CHAT_REFUSAL)[keyof typeof CHAT_REFUSAL] };

interface Speaker {
  /** When each of their recent lines was said, oldest first. */
  readonly said: number[];
  readonly ids: number[];
}

/** One line of text as it may be said: no line breaks, no control or invisible characters, single spaces, no longer than a line may be. */
export function tidy(text: string): string {
  return [...text.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, " ").replace(/\s+/g, " ").trim()].slice(0, CHAT_MAX_CHARS).join("");
}

export class Talk {
  private readonly filter: ChatFilter;
  private readonly speakers = new Map<number, Speaker>();

  constructor(filter: ChatFilter) {
    this.filter = filter;
  }

  /** What becomes of a line someone sends. */
  line(speaker: number, messageId: number, raw: string, nowMs: number): Verdict {
    let known = this.speakers.get(speaker);
    if (!known) this.speakers.set(speaker, (known = { said: [], ids: [] }));
    if (known.ids.includes(messageId)) return { kind: "repeat" };
    known.ids.push(messageId);
    if (known.ids.length > REMEMBERED_IDS) known.ids.shift();
    const text = tidy(raw);
    if (text.length === 0) return { kind: "empty" };
    while (known.said.length > 0 && known.said[0]! <= nowMs - 10_000) known.said.shift();
    const last = known.said[known.said.length - 1];
    if ((last !== undefined && nowMs - last < LINE_GAP_MS) || known.said.length >= LINES_IN_TEN_SECONDS) return { kind: "refuse", text, reason: CHAT_REFUSAL.SLOW_DOWN };
    known.said.push(nowMs);
    if (carriesAddress(text)) return { kind: "refuse", text, reason: CHAT_REFUSAL.LINKS };
    if (this.filter.find(text).length > 0) return { kind: "refuse", text, reason: CHAT_REFUSAL.WORDS };
    return { kind: "say", text };
  }

  /** Someone has left: what was remembered of them is let go. */
  forget(speaker: number): void {
    this.speakers.delete(speaker);
  }
}

/**
 * Who a speaker reaches: everyone within hearing, and for each whether they are near enough to read. The
 * speaker is always among them, reading their own words. `apart(a, b)` says two people have shut each other out.
 */
export function reached(everyone: readonly EntityState[], speaker: number, apart: (a: number, b: number) => boolean = () => false): { id: number; reads: boolean }[] {
  const from = everyone.find((one) => one.id === speaker);
  if (!from) return [];
  const out: { id: number; reads: boolean }[] = [];
  for (const one of everyone) {
    if (one.id === speaker) {
      out.push({ id: one.id, reads: true });
      continue;
    }
    if (one.kind !== "player" || apart(speaker, one.id)) continue;
    const far = Math.hypot(one.x - from.x, one.z - from.z);
    if (far <= HEAR_MM) out.push({ id: one.id, reads: far <= READ_MM });
  }
  return out;
}
