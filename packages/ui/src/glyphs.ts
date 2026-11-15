// The house glyphs. Drawn for Nzila on a 24 px grid: one 2 px line with round
// ends, no fills, the colour of the text around them. No icon library is used
// anywhere in the game (a test fails the build on one).
//
// First drawings, 2026-11-14. Nothing ships that the founder has not looked
// at (D-0.23): he sees them on the /styleguide page.

export const GLYPHS = {
  // The HUD
  carteira: "M4 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z M4 8V7a2 2 0 0 1 2-2h10 M16 14h.01",
  telemovel: "M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3z M11 18h2",
  // A person running and a person jumping, drawn plainly: a button must say what it does (founder, 2026-11-15).
  correr: "M13.6 4.6a1.7 1.7 0 1 0 3.4 0 1.7 1.7 0 0 0-3.4 0z M14 8.4l-3.2 5.4 M14 8.4l3.4 2.6 2.8-1 M13.6 8.6l-4.2.4-2 2.8 M10.8 13.8l4 2.2.4 4.6 M10.8 13.8l-2.4 3.4-4.4.4",
  saltar: "M10.3 4.2a1.7 1.7 0 1 0 3.4 0 1.7 1.7 0 0 0-3.4 0z M12 7.6v5.6 M12 8.8L7.6 4.8 M12 8.8l4.4-4 M12 13.2l-3.8 1.4 1.2 3.6 M12 13.2l3.8 1.4-1.2 3.6 M6.5 21.6h11",
  emote: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8.5 14.5a4.5 4.5 0 0 0 7 0 M9 9.5v.5 M15 9.5v.5",
  conversa: "M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  paragem: "M7 21V4h9l3 3-3 3H7",
  relogio: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  calor: "M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.5 1.5 1.5 2 2 2 0-3-.5-5 1-7.5z",
  escudo: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z",
  dados: "M12 4v10 M8 10l4 4 4-4 M5 19h14",
  poupanca: "M5 19c0-8 5-13 14-14 0 9-5 14-13 14 M5 19c3-5 6-8 10-10",
  fome: "M4 11h16a8 8 0 0 1-16 0z M9 5c0 1.5 1 1.5 1 3 M14 5c0 1.5 1 1.5 1 3",
  energia: "M13 3L5 13h6l-1 8 8-10h-6l1-8z",
  // The nine apps of the Telemóvel
  mapa: "M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2V6z M9 4v14 M15 6v14",
  mensagens: "M4 6h16v12H4z M4 7l8 6 8-6",
  banco: "M4 10l8-5 8 5 M5 10h14 M7 10v7 M12 10v7 M17 10v7 M4 19h16",
  biscatos: "M4 9h16v10H4z M9 9V6h6v3 M4 13h16",
  casa: "M4 11l8-7 8 7 M6 10v9h12v-9 M10 19v-5h4v5",
  garagem: "M5 16v-4l2-5h10l2 5v4 M4 16h16 M7.5 16v2 M16.5 16v2 M7 12h10",
  negocio: "M4 10l1.5-5h13L20 10 M4 10a2.7 2.7 0 0 0 5.33 0 2.7 2.7 0 0 0 5.34 0A2.7 2.7 0 0 0 20 10 M6 12.5V19h12v-6.5 M10 19v-4h4v4",
  bi: "M3 6h18v12H3z M7 10.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0z M6 15c.5-1.5 4.5-1.5 5 0 M14 10h4 M14 13.5h4",
  definicoes: "M5 7h8 M17 7h2 M15 5v4 M5 12h2 M11 12h8 M9 10v4 M5 17h9 M18 17h1 M16 15v4",
} as const;

export type GlyphName = keyof typeof GLYPHS;

/** The nine apps, in the order of the Telemóvel's home grid. */
export const APP_GLYPHS = ["mapa", "mensagens", "banco", "biscatos", "casa", "garagem", "negocio", "bi", "definicoes"] as const satisfies readonly GlyphName[];
