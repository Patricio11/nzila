import { t } from "@nzila/i18n";
import { Wordmark } from "@nzila/ui";
import "@nzila/ui/tokens.css";
import "@nzila/ui/ui.css";
import { render } from "preact";
import "./shell.css";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("#app missing");

if (location.pathname.replace(/\/$/, "") === "/styleguide") {
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
