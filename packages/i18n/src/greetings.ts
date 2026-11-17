// What counts as greeting someone in the street (the founder, 2026-11-17: "Bom
// dia, boa noite, boa tarde, tudo bem?, estás bem?, entre outros"). Two
// strangers who greet each other have met. The zone decides it; the phone
// uses the same reading to tell its player that they were greeted.
//
// Read in the plain form the chat filter uses (no accents, no punctuation,
// lower case), whole words only: "boas" is a greeting, "boas notícias" still
// begins with one, "caboas" is not one.

import { plainForm } from "./filter.ts";

/** Said anywhere in a line, these greet whoever is near. */
export const GREETINGS: readonly string[] = [
  "bom dia",
  "boa tarde",
  "boa noite",
  "boas",
  "ola",
  "oi",
  "alo",
  "tudo bem",
  "tudo bom",
  "tudo fixe",
  "tudo nice",
  "tudo numa boa",
  "ta tudo",
  "esta tudo",
  "estas bem",
  "estas bom",
  "estas boa",
  "estas fixe",
  "como estas",
  "como esta",
  "como vai",
  "como vais",
  "como e",
  "como te chamas",
  "prazer",
  "muito prazer",
  "bem vindo",
  "bem vinda",
  "seja bem vindo",
  "bom fim de semana",
  "ya kamba",
  "wi kamba",
  "salve",
];

/** The usual answers to one: a greeting too, when they are all, or nearly all, that is said. */
export const ANSWERS: readonly string[] = ["tudo", "fixe", "bem", "estou bem", "estou fixe", "tou bem", "tou fixe", "tranquilo", "tranquila", "na paz", "numa boa", "na boa", "bem e tu", "tudo e tu", "fixe e tu", "obrigado", "obrigada"];
/** An answer is believed in a line no longer than this many words. */
const ANSWER_WORDS_AT_MOST = 5;

const words = (phrase: string): string[] => plainForm(phrase).split(" ").filter(Boolean);
const GREETING_WORDS = GREETINGS.map(words);
const ANSWER_WORDS = ANSWERS.map(words);

const startsAt = (line: readonly string[], at: number, phrase: readonly string[]): boolean => phrase.every((word, n) => line[at + n] === word);

/** Whether a line greets whoever hears it. */
export function isGreeting(text: string): boolean {
  const line = words(text);
  if (line.length === 0) return false;
  for (let at = 0; at < line.length; at++) if (GREETING_WORDS.some((phrase) => startsAt(line, at, phrase))) return true;
  return line.length <= ANSWER_WORDS_AT_MOST && ANSWER_WORDS.some((phrase) => startsAt(line, 0, phrase));
}
