// What only a server reads: the word lists, from their files. Not for the client, which never filters anything
// (it could not be trusted to).

import { readFileSync } from "node:fs";
import { createChatFilter, parseWordList, type ChatFilter } from "./filter.ts";

/** The filter for names and for talk: Portuguese in general, and Angolan Portuguese. */
export function loadChatFilter(): ChatFilter {
  const list = (file: string): string[] => parseWordList(readFileSync(new URL(`../filter/${file}`, import.meta.url), "utf8"));
  return createChatFilter([...list("pt.txt"), ...list("ao.txt")]);
}
