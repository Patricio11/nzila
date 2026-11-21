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
  voltar: "M14.5 5.5L8 12l6.5 6.5",
  fechar: "M6.5 6.5l11 11 M17.5 6.5l-11 11",
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
  // The Mochila: a backpack, its flap and a strap.
  mochila: "M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7 M6 9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z M6 12h12 M10 12v2h4v-2",
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
  // What a place is: the signs that float over points of interest (render/markers.ts).
  ponto: "M12 21s6-6.1 6-11a6 6 0 1 0-12 0c0 4.9 6 11 6 11z M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  vista: "M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  musica: "M9 18V6l10-2v12 M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z M19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
  gelado: "M7 10a5 5 0 0 1 10 0z M7.5 10l4.5 11 4.5-11",
  sol: "M3 17h18 M7 17a5 5 0 0 1 10 0 M12 6v3 M5.5 9.5l2 2 M18.5 9.5l-2 2 M6 21h12",
  palmeira: "M12 21V10 M12 10c-2.5-3.5-6.5-3-8-1 M12 10c2.5-3.5 6.5-3 8-1 M12 10c-1-3.5-4.5-5.5-7-4.5 M12 10c1-3.5 4.5-5.5 7-4.5",
  pontao: "M3 9h18 M6 9v8 M12 9v8 M18 9v8 M2 20c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0",
  livro: "M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z M20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z",
  fruta: "M12 8c-4-2-7 1-7 5s3 7 7 7 7-3 7-7-3-7-7-5z M12 8c0-2 1-4 3-5",
  xadrez: "M12 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6z M9 10h6 M10 10l-2 8h8l-2-8 M6 20h12",
  megafone: "M4 10v4l10 4V6z M14 9a4 4 0 0 1 0 6 M7 15l1 5",
  cinema: "M4 5h16v14H4z M8 5v14 M16 5v14 M4 9h4 M4 15h4 M16 9h4 M16 15h4",
  // A cantina: its awning in stripes, the grille of its window, the door beside it.
  cantina: "M3 9l2-5h14l2 5 M3 9a2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0A2.25 2.25 0 0 0 21 9 M5 11.5V20h14v-8.5 M7.5 13h4v4h-4z M9.5 13v4 M7.5 15h4 M14.5 20v-6h2.5v6",
  // A banca of gifts (D-10.1): one flower on its stem, a leaf either side.
  flores: "M8 4c0 5.5 1.5 8 4 8s4-2.5 4-8l-2 2.2L12 3l-2 3.2z M12 12v9 M12 19c-3 0-5-1.8-5-4.5 3 0 5 1.8 5 4.5z M12 17c3 0 5-1.8 5-4.5-3 0-5 1.8-5 4.5z",
  pintura: "M12 4a8 8 0 1 0 0 16c1.5 0 2-1 1.5-2.2-.6-1.4.3-2.8 2-2.8H18a3 3 0 0 0 3-3c0-4.4-4-8-9-8z M8 11h.01 M11 8h.01 M15 9h.01",
} as const;

export type GlyphName = keyof typeof GLYPHS;

/** The nine apps, in the order of the Telemóvel's home grid. */
export const APP_GLYPHS = ["mapa", "mensagens", "banco", "biscatos", "casa", "garagem", "negocio", "bi", "definicoes"] as const satisfies readonly GlyphName[];
