// The chat filter's machinery (Task 0.10). The word lists themselves are
// filled in Task 3.6, by people who know how Luanda insults: see ../filter/.
//
// People dodge filters by writing "m3rd4", "m e r d a" or "meeerda". So text
// and words are both reduced to a plain form before they are compared:
// lower case, no accents, look-alike digits and symbols turned back into
// letters, repeated letters collapsed, and separators dropped inside a word.

const LOOKALIKES: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/** The plain form of a text: what is left when the usual disguises are removed. Words stay separated by one space. */
export function plainForm(text: string): string {
  const lowered = text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  let out = "";
  for (const ch of lowered) {
    const letter = LOOKALIKES[ch] ?? ch;
    if (/[a-z]/.test(letter)) {
      if (out[out.length - 1] !== letter) out += letter;
    } else if (/\s/.test(letter) && out[out.length - 1] !== " ") {
      out += " ";
    }
    // Anything else (dots, dashes, asterisks between letters) is dropped.
  }
  return out.trim();
}

/** Reads a word list: one word or phrase per line, "#" starts a comment. */
export function parseWordList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
}

export interface ChatFilter {
  /** The listed words found in a text, each once, as they are written in the list. */
  find(text: string): string[];
}

interface Scanner extends ChatFilter {
  scan(text: string, found: Set<string>): void;
}

export function createChatFilter(words: readonly string[]): ChatFilter {
  const entries = words.map((word) => ({ word, plain: plainForm(word).replace(/ /g, "") })).filter((entry) => entry.plain.length > 0);
  const filter: Scanner = {
    find(text) {
      const found = new Set<string>();
      // Read twice: as written, and with digits and symbols stuck on the ends of
      // words removed, so "banana1" and "123banana" hide nothing.
      const trimmed = text.replace(/(^|\s)[^\p{L}\s]+(?=\p{L})|(?<=\p{L})[^\p{L}\s]+(?=\s|$)/gu, "$1");
      for (const reading of new Set([text, trimmed])) this.scan(reading, found);
      return [...found];
    },
    scan(text: string, found: Set<string>) {
      const tokens = plainForm(text).split(" ").filter(Boolean);
      // Letters spelled out one by one ("m e r d a") are joined back into a word.
      const joined: string[] = [];
      let spelled = "";
      for (const token of tokens) {
        if (token.length === 1) spelled += token;
        else {
          if (spelled) joined.push(spelled);
          spelled = "";
          joined.push(token);
        }
      }
      if (spelled) joined.push(spelled);
      for (const { word, plain } of entries) {
        // A whole word, or a run of whole words for a phrase: "puta" must not be found in "disputa".
        for (let i = 0; i < joined.length; i++) {
          let run = "";
          for (let j = i; j < joined.length && run.length < plain.length; j++) run += joined[j];
          if (run === plain) found.add(word);
        }
      }
    },
  };
  return filter;
}
