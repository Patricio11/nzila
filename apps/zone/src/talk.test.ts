// Talk in the street, with no sockets: what is said, what is not, and who is reached.

import { createChatFilter } from "@nzila/i18n";
import { CHAT_MAX_CHARS, CHAT_REFUSAL, DOING, type EntityState } from "@nzila/protocol";
import { describe, expect, test } from "vitest";
import { HEAR_MM, LINES_IN_TEN_SECONDS, LINE_GAP_MS, READ_MM, Talk, carriesAddress, reached, tidy } from "./talk.ts";

const filter = createChatFilter(["palavrao", "muito feio"]);
const body = (id: number, x: number, z = 0, kind: EntityState["kind"] = "player"): EntityState => ({ id, kind, x, y: 0, z, yaw: 0, anim: DOING.idle, vehicleId: null, seat: null });

describe("a line, tidied", () => {
  test("is one line of plain text: no breaks, no invisible characters, single spaces, no longer than a line may be", () => {
    expect(tidy("  Bom   dia!\n\nTudo\tfixe?  ")).toBe("Bom dia! Tudo fixe?");
    expect(tidy("a\u0000b​c‮d")).toBe("a b c d");
    expect(tidy("\n \t ")).toBe("");
    expect([...tidy("é".repeat(500))]).toHaveLength(CHAT_MAX_CHARS);
    // Letters of every alphabet and their accents are words like any others.
    expect(tidy("Ngã, kamba! Estás bué fixe 😀")).toBe("Ngã, kamba! Estás bué fixe 😀");
  });
});

describe("whether a line is said", () => {
  test("an ordinary line is said, tidied; nothing at all is nothing", () => {
    const talk = new Talk(filter);
    expect(talk.line(1, 1, "  Bom dia!  ", 0)).toEqual({ kind: "say", text: "Bom dia!" });
    expect(talk.line(1, 2, "   ", 1000)).toEqual({ kind: "empty" });
  });

  test("a line with a word the game does not pass on is not said, however the word is dressed up; the same letters inside another word are", () => {
    const talk = new Talk(filter);
    expect(talk.line(1, 1, "és um PALAVRÃO", 0)).toEqual({ kind: "refuse", text: "és um PALAVRÃO", reason: CHAT_REFUSAL.WORDS });
    expect(talk.line(1, 2, "p a l a v r a o", 1000)).toMatchObject({ kind: "refuse", reason: CHAT_REFUSAL.WORDS });
    expect(talk.line(1, 3, "isso é muito   feio", 2000)).toMatchObject({ kind: "refuse", reason: CHAT_REFUSAL.WORDS });
    expect(talk.line(1, 4, "que palavraozinho", 3000)).toEqual({ kind: "say", text: "que palavraozinho" });
  });

  test("a line that carries an address to somewhere outside the game is not said, however it is spelled out; ordinary talk with dots and at-signs is", () => {
    const talk = new Talk(filter);
    expect(talk.line(1, 1, "vai a https://exemplo.com/premio", 0)).toMatchObject({ kind: "refuse", reason: CHAT_REFUSAL.LINKS });
    for (const line of ["www.sitio.ao", "ganha makuta em sitio.com", "s i t i o . c o m", "sitio ponto com", "fala comigo no wa.me/244900", "segue @kamba_fixe", "t.me/grupo"]) expect(carriesAddress(line), line).toBe(true);
    for (const line of ["Bom dia. Tudo fixe?", "vou às 15.30", "custa 1.500 Mk", "espera... já vou", "o Sr. Zé está", "a.m. ou p.m.?", "fixe @ praia"]) expect(carriesAddress(line), line).toBe(false);
  });

  test("a line sent twice over a bad network is said once", () => {
    const talk = new Talk(filter);
    expect(talk.line(1, 7, "Bora!", 0).kind).toBe("say");
    expect(talk.line(1, 7, "Bora!", 50)).toEqual({ kind: "repeat" });
    // The same number from someone else is their own line.
    expect(talk.line(2, 7, "Bora!", 60).kind).toBe("say");
    // Only so many numbers are remembered: a very old one coming back is a new line.
    for (let n = 8; n < 40; n++) talk.line(1, n, "ok", n * 2000);
    expect(talk.line(1, 7, "Bora!", 90_000).kind).toBe("say");
  });

  test("a speaker keeps a pace: not two lines in half a second, and not more than six in ten", () => {
    const talk = new Talk(filter);
    expect(talk.line(1, 1, "um", 0).kind).toBe("say");
    expect(talk.line(1, 2, "dois", LINE_GAP_MS - 1)).toMatchObject({ kind: "refuse", reason: CHAT_REFUSAL.SLOW_DOWN });
    let said = 1;
    for (let n = 0; n < 12; n++) if (talk.line(1, 10 + n, "mais", 600 + n * 600).kind === "say") said++;
    expect(said).toBe(LINES_IN_TEN_SECONDS);
    // Ten seconds on, they may speak again; and one who has left is forgotten.
    expect(talk.line(1, 99, "voltei", 20_000).kind).toBe("say");
    talk.forget(1);
    expect(talk.line(1, 99, "voltei", 20_001).kind).toBe("say");
    // Someone else's pace is their own.
    expect(talk.line(2, 1, "olá", 20_002).kind).toBe("say");
  });
});

describe("who a speaker reaches", () => {
  test("whoever is near is seen to speak; whoever is nearer reads the words; whoever is far knows nothing of it", () => {
    const everyone = [body(1, 0), body(2, READ_MM - 100), body(3, READ_MM + 100), body(4, HEAR_MM + 100), body(5, 3000, 3000)];
    expect(reached(everyone, 1)).toEqual([
      { id: 1, reads: true },
      { id: 2, reads: true },
      { id: 3, reads: false },
      { id: 5, reads: true },
    ]);
    expect(reached(everyone, 99)).toEqual([]);
  });

  test("someone the speaker has shut out, or been shut out by, is not reached at all; and only people hear", () => {
    const everyone = [body(1, 0), body(2, 1000), body(3, 2000), body(4, 1500, 0, "npc"), body(5, 1500, 0, "vehicle")];
    const apart = (a: number, b: number): boolean => (a === 1 && b === 2) || (a === 2 && b === 1);
    expect(reached(everyone, 1, apart).map((one) => one.id)).toEqual([1, 3]);
    expect(reached(everyone, 2, apart).map((one) => one.id)).toEqual([2, 3]);
    expect(reached(everyone, 3, apart).map((one) => one.id)).toEqual([1, 2, 3]);
  });
});
