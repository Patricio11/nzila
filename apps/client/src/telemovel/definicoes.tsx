// Definições: the picture's quality, Modo Poupança, data used, sound, the hand, the pano.
// Fetched when it is first opened, not before (the megabytes rule: finding F-188).

import { ptAOTranslator as tr } from "@nzila/i18n";
import { Choice, DataMeter, Pano, Swatches, Toggle } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { PANOS } from "../world/pano.ts";
import { type WorldProvider } from "../world/provider.ts";
import { ptAOLater } from "@nzila/i18n/later";
import "@nzila/ui/later.css";
import "./telemovel.css";

// The words of this app came with it (F-195).
tr.extend(ptAOLater);

/** The token each pano's ground is painted with. */
const PANO_TOKEN = { vermelho: "vermelho", azul: "azul", preto: "noite-2", dourado: "dourado" } as const;

export function Definicoes({ world }: { world: WorldProvider }) {
  const [, redraw] = useState(0);
  useEffect(() => world.watch(() => redraw((n) => n + 1)), []);
  useEffect(() => {
    // What has been downloaded goes on being counted while the app is open.
    const timer = window.setInterval(() => redraw((n) => n + 1), 1500);
    return () => window.clearInterval(timer);
  }, []);
  const settings = world.settings;
  const used = world.dataUsed();
  return (
    <div class="tm-settings">
      <Choice
        label={tr.t("settings.quality")}
        options={[
          { id: "poupanca", label: tr.t("settings.quality.poupanca") },
          { id: "normal", label: tr.t("settings.quality.normal") },
          { id: "alta", label: tr.t("settings.quality.alta") },
        ]}
        value={settings.poupanca ? "poupanca" : settings.tier}
        onChange={(tier) => world.change({ tier, poupanca: false })}
      />
      <div class="tm-pano">
        <Swatches label={tr.t("settings.pano")} options={PANOS.map((pano) => ({ id: pano, label: tr.t(`settings.pano.${pano}`), colour: `var(--n-${PANO_TOKEN[pano]})` }))} value={settings.pano} onChange={(pano) => world.change({ pano })} />
        <div class="tm-pano-sample" aria-hidden="true">
          <Pano scale={0.5} shiftY={-6} />
        </div>
      </div>
      <Toggle label={tr.t("hud.poupanca")} on={settings.poupanca} onChange={(poupanca) => world.change({ poupanca })} />
      <p class="tm-note">{tr.t("settings.poupanca.note")}</p>
      <div class="tm-row">
        <span>{tr.t("data.label")}</span>
        <DataMeter sessionBytes={used.session} monthBytes={used.month} />
      </div>
      <Toggle label={tr.t("settings.sound")} on={settings.sound && !settings.poupanca} onChange={(sound) => world.change({ sound })} />
      <Choice
        label={tr.t("settings.hand")}
        options={[
          { id: "direita", label: tr.t("settings.hand.right") },
          { id: "esquerda", label: tr.t("settings.hand.left") },
        ]}
        value={settings.leftHanded ? "esquerda" : "direita"}
        onChange={(hand) => world.change({ leftHanded: hand === "esquerda" })}
      />
    </div>
  );
}
