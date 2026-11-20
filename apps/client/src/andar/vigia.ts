// What the street watches over once it is open, fetched after the way in (the way in is full: F-226): what waits for
// the player in Mensagens (the kambas, Task 4B.2), and Fome and Energia, whose bars are fetched the first time a need
// falls under half (Task 4.4). Gives back how to stop.

import type { NeedsSaid } from "../necessidades/barras.tsx";
import { vigiar as kambas } from "../telemovel/rede-kambas.ts";

type Bars = typeof import("../necessidades/barras.tsx").Necessidades;

export function vigiar(
  needs: () => NeedsSaid,
  onCount: (waiting: number) => void,
  onMark: (place: { x: number; z: number; name: string }) => void,
  onBars: (bars: Bars) => void,
): () => void {
  const stopKambas = kambas(onCount, onMark);
  const every = setInterval(() => {
    const now = needs();
    if (!now || (now.fome >= 5000 && now.energia >= 5000)) return;
    clearInterval(every);
    void import("../necessidades/barras.tsx").then((module) => onBars(module.Necessidades));
  }, 2000);
  return () => {
    stopKambas();
    clearInterval(every);
  };
}
