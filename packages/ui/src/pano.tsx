// The pano: the game's own drawing of a Samakaka cloth, the print that says
// Angola at a glance (founder, 2026-11-15). Black, red, yellow and white,
// with a royal-blue colourway: rows of triangles, circles, stacked diamonds,
// and the black panel with a diamond inside a diamond.
//
// Drawn by us, shape by shape: no photograph of a cloth and no copy of a
// registered design. Colours come from the tokens, by class (ui.css).
//
// Two forms. `Pano` is the whole cloth, for the back of a card or a wide
// header. The band of triangles for edges is a class alone, `n-pano-faixa`
// (ui.css): it needs no drawing.

let made = 0;

/** The colourways of the cloth: what the ground is. */
export type PanoColour = "vermelho" | "azul" | "preto" | "dourado";

const TILE_W = 144;
const TILE_H = 120;

const diamond = (cx: number, cy: number, rx: number, ry: number): string => `${cx},${cy - ry} ${cx + rx},${cy} ${cx},${cy + ry} ${cx - rx},${cy}`;

/** One repeat of the cloth. Everything that touches an edge is drawn on both sides of it, so the repeats join. */
function Tile() {
  const teeth = [0, 1, 2, 3, 4, 5, 6];
  return (
    <>
      <rect class="n-pano-ground" width={TILE_W} height={TILE_H} />
      {/* The rows of triangles above and below the panel: yellow standing, white hanging. */}
      {teeth.map((n) => {
        const x = 30 + n * 12;
        return (
          <>
            <polygon class={n % 2 ? "n-pano-white" : "n-pano-yellow"} points={n % 2 ? `${x},12 ${x + 12},12 ${x + 6},23` : `${x},24 ${x + 12},24 ${x + 6},13`} />
            <polygon class={n % 2 ? "n-pano-white" : "n-pano-yellow"} points={n % 2 ? `${x},108 ${x + 12},108 ${x + 6},97` : `${x},96 ${x + 12},96 ${x + 6},107`} />
          </>
        );
      })}
      {/* The panel, and the diamond inside the diamond. */}
      <rect class="n-pano-black" x={30} y={24} width={84} height={72} />
      <polygon class="n-pano-yellow" points={diamond(72, 60, 27, 30)} />
      <polygon class="n-pano-black" points={diamond(72, 60, 19, 21)} />
      <polygon class="n-pano-white" points={diamond(72, 60, 12, 13)} />
      <polygon class="n-pano-black" points={diamond(72, 60, 5.5, 6)} />
      {[
        [59, 46],
        [85, 46],
        [59, 74],
        [85, 74],
      ].map(([x, y]) => (
        <circle class="n-pano-black" cx={x} cy={y} r={1.8} />
      ))}
      {/* The white marks at the sides of the panel: a cross above and below, a dot between. */}
      {[40, 104].map((x) => (
        <>
          <path class="n-pano-white" d={`M${x - 2.5} 31h5v5h5v5h-5v5h-5v-5h-5v-5h5z M${x - 2.5} 74h5v5h5v5h-5v5h-5v-5h-5v-5h5z`} />
          <circle class="n-pano-white" cx={x} cy={60} r={3} />
        </>
      ))}
      {/* Where the repeats meet at the sides: a black bar of three stacked diamonds, a white disc above and below. */}
      {[0, TILE_W].map((x) => (
        <>
          <rect class="n-pano-black" x={x - 11} y={36} width={22} height={48} />
          {[46, 60, 74].map((y) => (
            <polygon class="n-pano-yellow" points={diamond(x, y, 8, 5.5)} />
          ))}
          <circle class="n-pano-white n-pano-ring" cx={x} cy={18} r={7} />
          <circle class="n-pano-white n-pano-ring" cx={x} cy={102} r={7} />
        </>
      ))}
      {/* Where they meet above and below: a bar of four diamonds lying side by side. */}
      {[0, TILE_H].map((y) => (
        <>
          <rect class="n-pano-black" x={46} y={y - 6} width={52} height={12} />
          {[54, 66, 78, 90].map((x) => (
            <polygon class="n-pano-yellow" points={diamond(x, y, 4.5, 4.5)} />
          ))}
        </>
      ))}
    </>
  );
}

/**
 * The whole cloth, filling whatever it is put in. With no `colour` it is the
 * player's own pano, the one they chose in Definições. `scale` is how large one
 * repeat is drawn (1 is 144 px wide by 120 high); `shiftX` and `shiftY` slide
 * the cloth, in pixels, to choose what a narrow strip shows. It is decoration:
 * nothing reads it out.
 */
export function Pano({ colour = "meu", scale = 1, shiftX = 0, shiftY = 0 }: { colour?: PanoColour | "meu"; scale?: number; shiftX?: number; shiftY?: number }) {
  const id = `n-pano-${++made}`;
  return (
    <svg class={`n-pano n-pano-${colour}`} aria-hidden="true" focusable="false">
      <defs>
        <pattern id={id} width={TILE_W} height={TILE_H} patternUnits="userSpaceOnUse" patternTransform={`translate(${shiftX} ${shiftY}) scale(${scale})`}>
          <Tile />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
