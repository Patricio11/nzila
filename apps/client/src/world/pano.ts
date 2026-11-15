// The player's own pano (D-0.52; founder, 2026-11-15: "the cloths can be
// different, the players can change their cloths"). A Samakaka cloth comes in
// colourways; the player picks one in Definições and the whole interface wears
// it: the ground of the cloth on the back of a card, the line under every band.

import { type Settings } from "./provider.ts";

/** The colourways a player may choose. The first is what a new player wears. */
export const PANOS = ["vermelho", "azul", "preto", "dourado"] as const;
export type MeuPano = (typeof PANOS)[number];

/** Puts the chosen pano on the page. Called when the game opens and whenever the choice changes. */
export function wearPano(settings: Pick<Settings, "pano">): void {
  const root = document.documentElement;
  for (const pano of PANOS) root.classList.toggle(`n-meu-pano-${pano}`, pano === settings.pano && pano !== "vermelho");
}
