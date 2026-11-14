// The base catalog. Every word a player reads lives here, in Portuguese of Angola.
// First drafts only: the founder is the first reviewer of every line.
export const ptAO = {
  "app.name": "Nzila",
  "frontdoor.tagline": "O teu caminho começa aqui.",
  "frontdoor.enter": "Entrar em Luanda",
  "frontdoor.building": "Ainda estamos a construir. Volta em breve.",
} as const;

export type MessageKey = keyof typeof ptAO;
