import { describe, expect, test } from "vitest";
import { ANSWERS, GREETINGS, isGreeting } from "./greetings.ts";
import { ptAO } from "./pt-AO.ts";

describe("greeting someone", () => {
  test("the greetings of the street are greetings, however they are written", () => {
    for (const line of ["Bom dia!", "boa tarde, vizinha", "BOA NOITE", "Olá", "oi", "Boas!", "Tudo bem?", "Estás bem?", "então, como estás?", "Tudo fixe?", "Como é?", "Prazer", "wi, kamba", "booom diaaa"]) expect(isGreeting(line), line).toBe(true);
  });

  test("the usual answers are greetings too, when they are what is said", () => {
    for (const line of ["Tudo", "Fixe, e tu?", "Estou bem, obrigada", "Bem e tu", "na paz"]) expect(isGreeting(line), line).toBe(true);
    // The same words at the head of a long line are just talk.
    expect(isGreeting("bem sei que o candongueiro já passou por aqui hoje")).toBe(false);
    expect(isGreeting("tudo o que ele disse era mentira, ouviste bem")).toBe(false);
  });

  test("ordinary talk is not a greeting, and a greeting is a whole word", () => {
    for (const line of ["Bora!", "onde fica a paragem", "caboas", "oitenta makuta", "a boia está no mar", "", "  ", "?!"]) expect(isGreeting(line), line).toBe(false);
  });

  test("one tap on a quick phrase greets: the first two are greetings", () => {
    expect(isGreeting(ptAO["chat.quick.goodMorning"])).toBe(true);
    expect(isGreeting(ptAO["chat.quick.allGood"])).toBe(true);
    expect(isGreeting(ptAO["chat.quick.letsGo"])).toBe(false);
  });

  test("each is listed once", () => {
    expect(new Set(GREETINGS).size).toBe(GREETINGS.length);
    expect(new Set(ANSWERS).size).toBe(ANSWERS.length);
  });
});
