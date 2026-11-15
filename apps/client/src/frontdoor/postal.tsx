// The postcard: a small living picture of the Marginal for the screens that
// would otherwise be plain (the front door, arriving). The sun goes down over
// the bay, the city stands across the water, palms go by, a candongueiro
// bounces along with its phrase on the back, a zungueira walks the other
// way, birds cross. Touch the van and it hoots.
//
// It is drawn with the interface's own tokens and moved by the stylesheet:
// no picture is downloaded for it, and it weighs a few kilobytes.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { Van } from "@nzila/ui";
import { useState } from "preact/hooks";

/** Where the stars are, across and down the sky in hundredths, and when each begins to twinkle. */
const STARS: readonly (readonly [number, number, number])[] = [[8, 12, 0], [22, 34, -1.2], [37, 8, -0.4], [49, 26, -2.1], [63, 14, -0.9], [78, 30, -1.7], [90, 9, -0.2], [15, 55, -2.6], [71, 52, -1.4], [44, 62, -0.7], [86, 66, -2.2], [30, 76, -1.0]];

/** A palm: a trunk and seven fronds, swaying. `x` across the picture, `tall` its height. */
function Palm({ x, tall, late }: { x: number; tall: number; late: number }) {
  const top = 186 - tall;
  return (
    <g class="postal-palm" style={{ animationDelay: `${late}s`, transformOrigin: `${x}px 186px` }}>
      <path class="postal-trunk" d={`M${x} 186 Q${x + 5} ${186 - tall / 2} ${x + 2} ${top}`} />
      {[-78, -50, -22, 0, 22, 50, 78].map((turn) => (
        <path class="postal-frond" d={`M${x + 2} ${top} q${Math.sin((turn * Math.PI) / 180) * 16} ${-10 + Math.abs(turn) / 9} ${Math.sin((turn * Math.PI) / 180) * 30} ${4 + Math.abs(turn) / 5}`} />
      ))}
    </g>
  );
}

/** `progress` (0 to 1) moves the van along the road when given; without it the van keeps the middle. */
export function Postal({ progress }: { progress?: number }) {
  const [hoots, setHoots] = useState(0);
  const along = progress === undefined ? 50 : 14 + Math.min(1, Math.max(0, progress)) * 72;
  return (
    <div class="postal">
      {/* The first stars, in whatever sky there is above the picture. */}
      <div class="postal-stars" aria-hidden="true">
        {STARS.map(([left, top, late]) => (
          <i style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${late}s` }} />
        ))}
      </div>
      <div class="postal-stage">
      <svg class="postal-picture" viewBox="0 0 360 240" aria-hidden="true">
        <defs>
          <linearGradient id="postal-sky" x1="0" y1="0" x2="0" y2="1">
            <stop class="postal-sky-high" offset="0" />
            <stop class="postal-sky-mid" offset="0.55" />
            <stop class="postal-sky-low" offset="1" />
          </linearGradient>
        </defs>
        <rect class="postal-sky" width="360" height="150" />
        <circle class="postal-sun-glow" cx="250" cy="112" r="46" />
        <circle class="postal-sun" cx="250" cy="112" r="24" />
        {/* Birds, crossing in a loose line. */}
        <g class="postal-birds">
          {[0, 1, 2].map((n) => (
            <path class="postal-bird" d={`M${-40 - n * 22} ${40 + n * 9} q5 -6 10 0 q5 -6 10 0`} />
          ))}
        </g>
        {/* The city across the bay: the fortress on its hill with the flag, the dome, the towers. */}
        <g class="postal-city">
          <path d="M0 150 V126 Q22 104 52 112 L60 112 V104 H88 V112 Q104 118 112 150 Z" />
          <path d="M112 150 V118 H128 V96 H142 V150 Z M146 150 V84 H162 V150 Z M168 150 V108 H190 V150 Z M196 150 V124 Q208 108 220 124 V150 Z M228 150 V92 H240 V72 H252 V150 Z M258 150 V110 H282 V150 Z M288 150 V98 H300 V150 Z M306 150 V120 H332 V104 H346 V150 Z M350 150 V128 H360 V150 Z" />
          <path class="postal-mast" d="M74 104 V84" />
          <path class="postal-flag-red" d="M74 84 h13 v4.5 h-13 z" />
          <path class="postal-flag-black" d="M74 88.5 h13 v4.5 h-13 z" />
        </g>
        <rect class="postal-bay" y="150" width="360" height="24" />
        <g class="postal-glints">
          {[20, 70, 118, 172, 214, 262, 318].map((gx, n) => (
            <path class="postal-glint" d={`M${gx} ${156 + (n % 3) * 6} h${10 + (n % 2) * 8}`} style={{ animationDelay: `${n * 0.37}s` }} />
          ))}
        </g>
        <rect class="postal-walk" y="174" width="360" height="14" />
        {/* The palms go by, the same row twice over so that it never ends. */}
        <g class="postal-row">
          {[0, 360].map((shift) => (
            <g transform={`translate(${shift} 0)`}>
              <Palm x={34} tall={62} late={0} />
              <Palm x={128} tall={74} late={-1.1} />
              <Palm x={214} tall={58} late={-0.5} />
              <Palm x={306} tall={70} late={-1.8} />
              <path class="postal-lamp" d="M172 186 V150 h10" />
              <path class="postal-lamp" d="M352 186 V150 h-10" />
            </g>
          ))}
        </g>
        {/* A zungueira with her bacia, walking the other way. */}
        <g class="postal-zungueira">
          <g class="postal-step">
            <path class="postal-pano" d="M-5 170 h10 l3 16 h-16 z" />
            <path class="postal-blusa" d="M-5 158 h10 v12 h-10 z" />
            <circle class="postal-head" cx="0" cy="153" r="4.4" />
            <path class="postal-bacia" d="M-11 145 h22 l-4 5 h-14 z" />
            <path class="postal-goods" d="M-8 145 q3 -6 6 0 q3 -6 6 0 q3 -5 5 0 z" />
            <path class="postal-arm" d="M5 160 L8 149" />
          </g>
        </g>
        <rect class="postal-tar" y="188" width="360" height="52" />
        <path class="postal-lane" d="M-40 214 H400" />
      </svg>
      <button type="button" class={`postal-van${hoots % 2 ? " postal-hoot-b" : hoots ? " postal-hoot-a" : ""}`} style={{ left: `${along}%` }} aria-label={tr.t("frontdoor.hoot")} onClick={() => setHoots(hoots + 1)}>
        <Van width={78} />
        <span class="postal-dust" aria-hidden="true" />
        {hoots ? (
          <span key={hoots} class="postal-said">
            {tr.t(hoots % 5 === 0 ? "frontdoor.hoot.many" : "frontdoor.hoot.said")}
          </span>
        ) : null}
      </button>
      </div>
    </div>
  );
}
