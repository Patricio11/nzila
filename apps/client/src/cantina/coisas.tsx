// The pictures of things (Tasks 4.2, 4.3): small, filled, drawn for Nzila on a 32 px grid, in the house's own
// colours (the classes below are painted in cantina.css from the tokens). Each is a few shapes, the way a cantina's
// hand-painted price board draws them: the loaf, the bottle, the sack, the can. No picture comes from anywhere else.

import "./coisas.css";

/** One shape: its paint (a class of cantina.css) and its path. A paint of "" is a line only. */
type Shape = readonly [string, string];

const bottle = (body: string, cap: string, label: string): Shape[] => [
  [body, "M13 4h6v4l2 4v15a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2V12l2-4z"],
  [cap, "M12.5 2.5h7v3h-7z"],
  [label, "M11 15h10v6H11z"],
];
const sack = (band: string): Shape[] => [
  ["k-papel", "M8 7c2-2 14-2 16 0l2 18c0 3-3 4-10 4S6 28 6 25z"],
  [band, "M7 15h18l.7 6H6.3z"],
  ["", "M10 7c1 1.5 3 2 6 2s5-.5 6-2"],
];
const packet = (body: string, mark: string): Shape[] => [
  [body, "M7 6h18v22H7z"],
  ["k-luz", "M10 10h12v7H10z"],
  [mark, "M10 20h12v5H10z"],
];

const PICTURES: Readonly<Record<string, readonly Shape[]>> = {
  pao: [
    ["k-pao", "M4 20c0-6 5-11 12-11s12 5 12 11c0 2-1 4-3 4H7c-2 0-3-2-3-4z"],
    ["", "M10 13l2 5 M15 12l2 5 M20 13l2 5"],
  ],
  pipocas: [
    ["k-luz", "M9 10a3 3 0 0 1 4-3 3.5 3.5 0 0 1 6 0 3 3 0 0 1 4 3 3 3 0 0 1-1 5H10a3 3 0 0 1-1-5z"],
    ["k-luz", "M8 14h16l-2 15H10z"],
    ["k-vermelho", "M11 14h3l-.6 15H10z M18 14h3l-1 15h-2.6z"],
  ],
  ginguba: [
    ["k-papel", "M5 10h22L16 30z"],
    ["k-terra", "M9 10a2 2 0 0 1 3-2.5 2 2 0 0 1 4 0 2 2 0 0 1 4 0 2 2 0 0 1 3 2.5z"],
    ["", "M11 15l10 0 M13 20h6"],
  ],
  bolachas: [...packet("k-azul", "k-ouro"), ["k-pao", "M13 13.5a3 2.5 0 1 0 6 0 3 2.5 0 0 0-6 0z"]],
  rebucados: [
    ["k-vermelho", "M10 16a6 6 0 1 0 12 0 6 6 0 0 0-12 0z"],
    ["k-ouro", "M10 16l-6-4v8z M22 16l6-4v8z"],
    ["k-luz", "M13 13l2 1"],
  ],
  chocolate: [
    ["k-chocolate", "M6 9h20v14H6z"],
    ["", "M12.6 9v14 M19.3 9v14 M6 16h20"],
    ["k-ouro", "M18 23l8-8v8z"],
  ],
  agua: bottle("k-agua", "k-azul", "k-luz"),
  sumo: [
    ["k-laranja", "M8 9l3-3h10l3 3v20H8z"],
    ["k-ouro", "M11 15a5 5 0 1 0 10 0 5 5 0 0 0-10 0z"],
    ["k-ganho", "M16 10c1-2 3-2 4-1-1 1-2 2-4 1z"],
    ["", "M21 6l3-5"],
  ],
  gasosa: bottle("k-noite", "k-ouro", "k-vermelho"),
  ovos: [
    ["k-papel", "M3 18h26l-2 8H5z"],
    ["k-ovo", "M7 18a3 4 0 1 1 6 0z M13 18a3 4 0 1 1 6 0z M19 18a3 4 0 1 1 6 0z"],
  ],
  arroz: sack("k-azul"),
  fuba: sack("k-vermelho"),
  massa: [
    ["k-luz", "M5 11h22v10H5z"],
    ["k-ouro", "M7 13h18v2H7z M7 17h18v2H7z"],
    ["k-azul", "M5 11h5v10H5z"],
  ],
  oleo: [
    ["k-oleo", "M12 6h8v3l2 3v16a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V12l2-3z"],
    ["k-vermelho", "M11.5 3h9v3h-9z"],
    ["k-luz", "M10 17h12v6H10z"],
  ],
  acucar: packet("k-luz", "k-azul"),
  sal: [
    ["k-azul", "M10 8h12v20H10z"],
    ["k-luz", "M10 13h12v8H10z"],
    ["k-luz", "M11 4h10v4H11z"],
  ],
  sardinha: [
    ["k-prata", "M3 16a13 8 0 1 0 26 0 13 8 0 0 0-26 0z"],
    ["k-vermelho", "M7 16a9 5 0 1 0 18 0 9 5 0 0 0-18 0z"],
    ["k-prata", "M10 16c3-3 8-3 11 0-3 3-8 3-11 0z M21 16l3-2v4z"],
  ],
  tomate: [
    ["k-vermelho", "M5 20a5 5 0 1 0 10 0 5 5 0 0 0-10 0z M17 20a5 5 0 1 0 10 0 5 5 0 0 0-10 0z M11 13a5 5 0 1 0 10 0 5 5 0 0 0-10 0z"],
    ["k-ganho", "M14 8.5l2 1.5 2-1.5-1 2.5h-2z"],
  ],
  leite: [
    ["k-luz", "M8 7h16v21H8z"],
    ["k-azul", "M8 12h16v8H8z"],
    ["k-prata", "M8 5h16v3H8z"],
  ],
  sabao: [
    ["k-mar", "M4 13l6-4h18v10l-6 4H4z"],
    ["", "M4 13h18l6-4 M22 13v10"],
  ],
  velas: [
    ["k-luz", "M9 12h5v16H9z M18 9h5v19h-5z"],
    ["k-ouro", "M11.5 4c1.5 2 2 3.5 0 6-2-2.5-1.5-4 0-6z M20.5 1c1.5 2 2 3.5 0 6-2-2.5-1.5-4 0-6z"],
  ],
  fosforos: [
    ["k-vermelho", "M5 13h22v12H5z"],
    ["k-ouro", "M8 16h16v6H8z"],
    ["k-pao", "M10 13V5h2v8z M14 13V4h2v9z"],
    ["k-vermelho", "M10 5a1 1 0 1 1 2 0z M14 4a1 1 0 1 1 2 0z"],
  ],
  pilhas: [
    ["k-noite", "M7 9h7v19H7z M18 9h7v19h-7z"],
    ["k-ouro", "M7 9h7v7H7z M18 9h7v7h-7z"],
    ["k-prata", "M9 6h3v3H9z M20 6h3v3h-3z"],
  ],
  carvao: [
    ["k-saco", "M7 6c2-2 16-2 18 0l2 19c0 3-3 4-11 4S5 28 5 25z"],
    ["k-noite", "M10 9a2.5 2 0 1 0 5 0 2.5 2 0 0 0-5 0z M15 8a2.5 2 0 1 0 5 0 2.5 2 0 0 0-5 0z M19 9.5a2 2 0 1 0 4 0 2 2 0 0 0-4 0z"],
    ["", "M9 18h14"],
  ],
  // Two scoops on a cone: múcua under, coco over.
  gelado: [
    ["k-pao", "M10.5 16h11L16 30z"],
    ["", "M12.5 19l5 5 M19.5 19l-5 5"],
    ["k-laranja", "M9.5 16a6.5 6 0 0 1 13 0z"],
    ["k-luz", "M11.5 10.5a4.5 4.5 0 0 1 9 0z"],
  ],
  // The banca's (D-10.1). A bunch in its paper, tied with a ribbon.
  flores: [
    ["k-ganho", "M9 15c-2-1-3-3-2-5 2 0 4 2 4 5z M23 15c2-1 3-3 2-5-2 0-4 2-4 5z"],
    ["k-papel", "M8 14h16l-4.5 16h-7z"],
    ["k-vermelho", "M7.5 10a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0z M17.5 10a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0z"],
    ["k-ouro", "M12.5 6.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0z"],
    ["k-vermelho", "M10.6 21h10.8l-.8 3h-9.2z"],
  ],
  // A small square bottle, its gold stopper, and a breath of it.
  perfume: [
    ["k-agua", "M9 13h14v14a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2z"],
    ["k-ouro", "M13 6h6v4h-6z M14.5 10h3v3h-3z"],
    ["k-luz", "M12 18h8v6h-8z"],
    ["", "M22 5l3-1.5 M22.5 8h3"],
  ],
  // The cloth folded in four, its border showing.
  pano: [
    ["k-chocolate", "M5 24h22l-2 4H7z"],
    ["k-vermelho", "M4 9h24v15H4z"],
    ["k-ouro", "M4 13h24v3.5H4z"],
    ["k-noite", "M4 20h24v2H4z"],
    ["", "M6 18.5l2.5-1.5 2.5 1.5 2.5-1.5 2.5 1.5 2.5-1.5 2.5 1.5 2.5-1.5 2.5 1.5"],
  ],
};

/** A thing's picture. A thing the game has no picture for yet is a plain parcel tied with string. */
export function Coisa({ item, size = 40 }: { item: string; size?: number }) {
  const shapes = PICTURES[item] ?? [["k-papel", "M6 9h20v16H6z"], ["", "M16 9v16 M6 17h20"]];
  return (
    <svg class="k-coisa" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {shapes.map(([paint, d]) => (
        <path class={paint || "k-linha"} d={d} />
      ))}
    </svg>
  );
}
