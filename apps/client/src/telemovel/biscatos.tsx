// The Biscatos app (UX_UI_SPEC.md §4.4, Task 4.5): what is open in the district, nearest first, each with what it
// pays, how long it takes and how far it is ("Zungar · As kitandeiras da Marginal · 150 a 500 Mk · 1 min 15 s · a 80
// m"), and "Marcar" to have the compass point to it; above them, what today's biscatos have paid and how the day's
// taper stands. Fetched when it is first opened.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { Button, EmptyState, Glyph, Skeleton } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { askAsPlayer } from "../world/account.ts";
import { type WorldProvider } from "../world/provider.ts";
import type { Marked } from "./telemovel.tsx";
import "./biscatos.css";

// The words of this app came with it.
tr.extend(ptAOLater);

/** What the API says of biscatos: what each pays and lasts, what today's have paid, and the day's taper. */
interface Dia {
  readonly paidToday: number;
  readonly percent: number;
  readonly kinds: Readonly<Record<string, { readonly leastMk: number; readonly mostMk: number; readonly seconds: number } | undefined>>;
  readonly taper: readonly { readonly fromMk: number; readonly percent: number }[];
}

/** "1 min 15 s", "1 min 30 s", "2 min". */
function howLong(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? tr.t("biscatos.min", { m: minutes }) : tr.t("biscatos.minSeg", { m: minutes, s: rest });
}

export function Biscatos({ world, marked, onMark }: { world: WorldProvider; marked: Marked | null; onMark: (place: Marked | null) => void }) {
  const [dia, setDia] = useState<Dia | "sem-rede" | null>(null);
  useEffect(() => {
    void askAsPlayer<Dia>("GET", "/v1/biscatos").then(({ answer }) => setDia(answer ?? "sem-rede"));
  }, []);
  const at = world.player;
  const spots = (world.district()?.pois ?? [])
    .flatMap((poi) => {
      const kind = /^biscato-([a-z]+)-/.exec(poi.id)?.[1];
      return kind ? [{ kind, x: poi.pos[0], z: poi.pos[2], name: world.word(poi.nameKey), metres: at ? Math.hypot(poi.pos[0] - at.x, poi.pos[2] - at.z) : 0 }] : [];
    })
    .sort((a, b) => a.metres - b.metres);
  if (dia === null) return <Skeleton lines={4} />;
  if (spots.length === 0) return <EmptyState glyph="biscatos" title={tr.t("app.biscatos")}>{tr.t("app.biscatos.soon")}</EmptyState>;
  const next = dia === "sem-rede" ? undefined : dia.taper.find((step) => step.fromMk > dia.paidToday);
  return (
    <div class="tb">
      {dia === "sem-rede" ? (
        <p class="tm-note">{tr.t("biscatos.semRede")}</p>
      ) : (
        <p class="tb-hoje">
          {dia.paidToday > 0 ? tr.t("biscatos.hoje", { mk: tr.makuta(dia.paidToday) }) : tr.t("biscatos.hojeNada")}{" "}
          {dia.percent < 100 ? tr.t("biscatos.taper", { percent: dia.percent }) : next ? tr.t("biscatos.inteiro", { mk: tr.makuta(next.fromMk) }) : ""}
        </p>
      )}
      <ul class="tb-lista">
        {spots.map((spot) => {
          const rules = dia === "sem-rede" ? undefined : dia.kinds[spot.kind];
          const isMarked = marked !== null && marked.x === spot.x && marked.z === spot.z;
          return (
            <li class="tm-place tb-um">
              <span class="tb-cima">
                <Glyph name="biscatos" size={20} />
                <strong>{tr.t(`action.${spot.kind}` as "action.pratos")}</strong>
              </span>
              <p>{spot.name}</p>
              <p class="tb-numeros">
                {[rules ? tr.t("biscatos.paga", { de: tr.number(rules.leastMk), ate: tr.makuta(rules.mostMk) }) : null, rules ? howLong(rules.seconds) : null, at ? tr.t("biscatos.longe", { m: Math.max(5, Math.round(spot.metres / 5) * 5) }) : null].filter(Boolean).join(" · ")}
              </p>
              <Button kind={isMarked ? "quiet" : "solid"} onPress={() => onMark(isMarked ? null : { x: spot.x, z: spot.z, name: spot.name })}>
                {tr.t(isMarked ? "map.unmark" : "map.mark")}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
