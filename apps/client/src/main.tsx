import { t } from "@nzila/i18n";
import { Wordmark } from "@nzila/ui";
import "@nzila/ui/tokens.css";
import "@nzila/ui/ui.css";
import { render } from "preact";
import "./shell.css";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("#app missing");

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
} else if (path === "/corpo") {
  // The people, to look at before they are given a skeleton.
  const { Corpo } = await import("./corpo/corpo-page.tsx");
  render(<Corpo />, app);
} else if (path === "/styleguide") {
  // The team's page. Loaded only when asked for, so it adds nothing to the shell a player downloads.
  const { Styleguide } = await import("./styleguide/styleguide.tsx");
  render(<Styleguide />, app);
} else {
  render(
    <div class="frontdoor n-on-dark">
      <Wordmark width={220} />
      <p>{t("frontdoor.tagline")}</p>
      <p class="soft">{t("frontdoor.building")}</p>
    </div>,
    app,
  );
}
