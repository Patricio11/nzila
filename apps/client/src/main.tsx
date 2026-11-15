import "@nzila/ui/tokens.css";
import "@nzila/ui/ui.css";
import { render } from "preact";
import "./shell.css";
import { PANOS, wearPano } from "./world/pano.ts";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("#app missing");

// The player's pano, before anything is drawn. `?pano=azul` shows another, for stills.
const asked = new URLSearchParams(location.search).get("pano");
let kept: unknown;
try {
  kept = (JSON.parse(localStorage.getItem("nzila.settings") ?? "{}") as { pano?: unknown }).pano;
} catch {
  kept = undefined;
}
wearPano({ pano: PANOS.find((pano) => pano === (asked ?? kept)) ?? "vermelho" });

const path = location.pathname.replace(/\/$/, "");
if (path === "/bench") {
  // The team's page too: the fixed run the founder does on the reference phones.
  const { Bench } = await import("./bench/bench-page.tsx");
  render(<Bench />, app);
} else if (path === "/cena") {
  // The test scene, to look at the light on.
  const { Cena } = await import("./cena/cena-page.tsx");
  render(<Cena />, app);
} else if (path === "/andar") {
  // One person walking the development district.
  const { Andar } = await import("./andar/andar-page.tsx");
  render(<Andar />, app);
} else if (path === "/provador") {
  // Where a player chooses how they look.
  const { Provador } = await import("./provador/provador-page.tsx");
  render(<Provador />, app);
} else if (path === "/origem") {
  // The card a new player is dealt: the family they were born into.
  const { Origem } = await import("./origem/origem-page.tsx");
  render(<Origem />, app);
} else if (path === "/corpo") {
  // The people, to look at before they are given a skeleton.
  const { Corpo } = await import("./corpo/corpo-page.tsx");
  render(<Corpo />, app);
} else if (path === "/styleguide") {
  // The team's page. Loaded only when asked for, so it adds nothing to the shell a player downloads.
  const { Styleguide } = await import("./styleguide/styleguide.tsx");
  render(<Styleguide />, app);
} else {
  // The front door. One line, one button, and what going in costs, said before a byte of it is fetched.
  const { FrontDoor } = await import("./frontdoor/front-door.tsx");
  render(<FrontDoor />, app);
}

// Kept on the phone: once fetched, the game and the districts visited open without the network (Task 1.8).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // The page above was chosen after a wait, so the window may have loaded already: ask now.
  void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}
