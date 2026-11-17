// The words below are stand-ins. The real lists are written in Task 3.6.
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { createChatFilter, parseWordList, plainForm } from "./filter.ts";

describe("the plain form", () => {
  test("lower case, no accents, single spaces", () => {
    expect(plainForm("  Coração   de MÃE ")).toBe("coracao de mae");
  });

  test("digits and symbols read as the letters they imitate", () => {
    expect(plainForm("b4n4n4 p0dr3 $1m 7udo @qui")).toBe("banana podre sim tudo aqui");
  });

  test("repeated letters collapse and separators inside a word are dropped", () => {
    expect(plainForm("baaaanaaana")).toBe("banana");
    expect(plainForm("b.a-n*a_n.a")).toBe("banana");
    expect(plainForm("Bom dia! Tudo fixe?")).toBe("bom dia tudo fixe");
  });

  test("text with no letters at all is empty", () => {
    expect(plainForm("... 😀 ---")).toBe("");
  });
});

describe("the filter", () => {
  const filter = createChatFilter(["banana", "Limão Podre", "  ", "ovo"]);

  test("finds a listed word however it is disguised", () => {
    for (const text of ["banana", "BANANA", "b4n4n4", "baaanaaana", "b.a.n.a.n.a", "b a n a n a", "és uma bánaná mesmo", "banana!"]) {
      expect(filter.find(text), text).toEqual(["banana"]);
    }
  });

  test("digits and symbols stuck on the ends of a word hide nothing", () => {
    for (const text of ["banana1", "banana!!!1", "123banana", "**banana**", "és banana7 pá", "b4n4n4 99"]) {
      expect(filter.find(text), text).toEqual(["banana"]);
    }
  });

  test("finds a phrase across its words", () => {
    expect(filter.find("isso é limao podre, pá")).toEqual(["Limão Podre"]);
    expect(filter.find("l1m40 p0dr3")).toEqual(["Limão Podre"]);
    expect(filter.find("limão muito podre")).toEqual([]);
  });

  test("does not find a word inside another word", () => {
    expect(filter.find("uma bananada com povo novo")).toEqual([]);
    expect(filter.find("bananas")).toEqual([]);
  });

  test("reports each word once, and nothing in clean text", () => {
    expect(filter.find("banana banana ovo banana")).toEqual(["banana", "ovo"]);
    expect(filter.find("Bom dia! Tudo fixe? Bora à Ilha comer mufete.")).toEqual([]);
    expect(filter.find("")).toEqual([]);
    expect(filter.find("a b")).toEqual([]);
  });

  test("an empty list finds nothing", () => {
    expect(createChatFilter([]).find("banana")).toEqual([]);
  });
});

describe("the word list files", () => {
  test("comments and blank lines are skipped", () => {
    expect(parseWordList("# heading\n\nbanana # why\r\n  limão podre  \n#\n")).toEqual(["banana", "limão podre"]);
  });

  const load = async (name: string): Promise<string[]> =>
    parseWordList(await readFile(new URL(`../filter/${name}`, import.meta.url), "utf8"));

  test("the Portuguese list has a first set of words, each usable and listed once", async () => {
    const words = await load("pt.txt");
    expect(words.length).toBeGreaterThan(20);
    const plain = words.map((word) => plainForm(word));
    for (const form of plain) expect(form.length).toBeGreaterThan(1);
    expect(new Set(plain).size).toBe(plain.length);
  });

  test("the Portuguese list leaves honest words alone", async () => {
    const filter = createChatFilter(await load("pt.txt"));
    const honest = [
      "O puto está na bicha do candongueiro.",
      "Bora ver a disputa no campo, depois o computador.",
      "Uma cuca? Não, uma gasosa. O cubo de gelo é teu.",
      "Vou cortar o cabelo e comprar um corneto.",
      "Tudo fixe? Bom dia! Já comeste o mufete?",
      "Bom fds, kota. O pau da bandeira caiu e a vaca fugiu.",
      "É um rapé antigo. Mata a sede, come e cala.",
      "O sexo vem no BI. A fada do conto tinha um corneto e uma pilha.",
    ];
    for (const line of honest) expect(filter.find(line), line).toEqual([]);
  });

  test("the Angolan list is short, each word usable and in neither list twice, and it leaves how Luanda talks alone", async () => {
    const words = await load("ao.txt");
    expect(words.length).toBeGreaterThan(5);
    const plain = [...words, ...(await load("pt.txt"))].map((word) => plainForm(word));
    expect(new Set(plain).size).toBe(plain.length);
    const filter = createChatFilter(words);
    for (const line of ["Wi, kota, tudo fixe? Bora ao mufete com a mboa.", "O pula e o mwangolé foram ao Bailundo de candongueiro.", "Ya madiê, a kizomba está bué fixe. Langar não é palavra."]) expect(filter.find(line), line).toEqual([]);
    expect(filter.find("és um m4tumb0")).toEqual(["matumbo"]);
    expect(filter.find("sunji a mama")).toEqual(["sunji a mama"]);
  });
});
