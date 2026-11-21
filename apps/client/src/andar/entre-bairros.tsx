// From one bairro to another (Task 11.2, D-11.2 and D-11.4): at a paragem that leads elsewhere, the candongueiro
// there. The sheet says where it goes, what the corrida costs (the first of each day is on the house), and how
// many megabytes the other bairro is to carry in, before anything is paid or fetched. Paid through the API on the
// zone's word that the player stands at the way out; then the phone leaves this street and opens the other at the
// paragem one gets off at. The corrida is when the other bairro comes down (Task 11.2: "streams its first chunks
// while a short travel moment plays"): while the van is on the road the phone fetches what it will see on getting
// off, counted on the meter and said on the card, and kept by the phone, so that one steps off into a street that
// is already there. Fetched the first time the player stands at such a paragem: the way in is full (F-270).

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { Button } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { meteredFetch } from "../net/data-meter.ts";
import { askAsPlayer } from "../world/account.ts";
import { traz, type Pedaco, type Tier as StreamTier } from "./traz.ts";
import "./entre-bairros.css";

// The words of this came with it.
tr.extend(ptAOLater);

/** A way out of the bairro: where it is (metres), the name of where it leads, and that name as one goes there. */
export interface Porta {
  readonly id: string;
  readonly nome: string;
  readonly a: string;
  readonly x: number;
  readonly z: number;
}

/** How near a way out the gold button offers it, in metres (inside the zone's seven). */
const REACH_M = 6;

/** A pack's ways out, with their words. */
export function portasDe(gateways: readonly { readonly id: string; readonly pos: readonly [number, number, number]; readonly nameKey?: string | undefined }[], word: (key: string) => string): Porta[] {
  return gateways.flatMap((one) => (one.nameKey ? [{ id: one.id, nome: word(one.nameKey), a: word(`${one.nameKey}.a`), x: one.pos[0], z: one.pos[2] }] : []));
}

/** The way out the player stands at, if any. */
export function portaAqui(portas: readonly Porta[], x: number, z: number): Porta | null {
  return portas.find((one) => Math.hypot(one.x - x, one.z - z) < REACH_M) ?? null;
}

interface Way {
  readonly gateway: string;
  readonly pack: string;
  readonly arrive: string;
}

/** What the API says of the paragem: the ways out the zone says the player stands at, and what a corrida costs now. */
interface Quote {
  readonly ways: readonly Way[];
  readonly price: number;
  readonly free: boolean;
}

/** As much of a bairro's manifest as the corrida needs: where one gets off, and what stands round it. */
interface Outro {
  readonly sizes?: { readonly firstView?: number };
  readonly chunks?: readonly Pedaco[];
  readonly paragens?: readonly { readonly id: string; readonly pos: readonly [number, number, number] }[];
  readonly spawns?: readonly { readonly id?: string; readonly pos: readonly [number, number, number] }[];
}

/** The corrida lasts at least this long, and waits for the other bairro at most this long. */
const ON_THE_ROAD_MS = 1700;
const AT_MOST_MS = 25_000;

/**
 * Brings down what will be seen on getting off at `arrive`: the same chunks, in the same models, that the street
 * would ask for there at this phone's tier. Only where the phone keeps what it fetches (the service worker): where
 * it does not, fetching here would be paying twice, and the street fetches for itself as it always has.
 */
async function carry(pack: string, outro: Outro | null, arrive: string, tier: StreamTier, said: (done: number, all: number) => void): Promise<void> {
  const at = [...(outro?.paragens ?? []), ...(outro?.spawns ?? [])].find((one) => one.id === arrive)?.pos;
  if (!outro?.chunks || !at || !navigator.serviceWorker?.controller) return;
  const want = traz(outro.chunks, at[0], at[2], tier);
  const all = want.reduce((sum, one) => sum + one.bytes, 0);
  let done = 0;
  let next = 0;
  said(0, all);
  const worker = async (): Promise<void> => {
    while (next < want.length) {
      const one = want[next++]!;
      await meteredFetch(`/packs/${pack}/${one.model}`).catch(() => {});
      done += one.bytes;
      said(done, all);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

/**
 * How much of the world this phone draws: what the address says, else what the Definições keep (`nzila.settings`,
 * written by world/provider.ts the moment it is changed), else Normal. Read here and not handed down by the street's
 * page, which has no room for one more thing (F-281).
 */
function tierNow(): StreamTier {
  const asked = new URLSearchParams(location.search).get("tier");
  let kept: { tier?: string; poupanca?: boolean } = {};
  try {
    kept = JSON.parse(localStorage.getItem("nzila.settings") ?? "{}") as typeof kept;
  } catch {
    // Storage is off: Normal.
  }
  const tier = kept.poupanca ? "poupanca" : (asked ?? kept.tier);
  return tier === "poupanca" || tier === "alta" ? tier : "normal";
}

/** A key for one crossing: asked twice, it is paid once. */
const newKey = (): string => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/**
 * The sheet of a crossing. `leave` takes the player out of this street before the other is opened; `go` opens it
 * (the page for that pack, at the paragem one arrives at). `portas` are all the ways out of this bairro: when the
 * paragem leads to more than one bairro, the sheet first asks where to.
 */
export function Viagem({ porta: near, portas, onClose, leave, go }: { porta: Porta; portas: readonly Porta[]; onClose: () => void; leave: () => void; go: (pack: string, arrive: string) => void }) {
  const [outro, setOutro] = useState<Outro | null>(null);
  const [carried, setCarried] = useState<{ done: number; all: number } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [chosen, setChosen] = useState<Way | null>(null);
  const [megabytes, setMegabytes] = useState<number | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [going, setGoing] = useState(false);
  const [key] = useState(newKey);
  useEffect(() => {
    let alive = true;
    void askAsPlayer<Quote>("GET", "/v1/viagens").then(({ answer }) => {
      if (!alive) return;
      if (!answer) return setSaid(tr.t("viagem.longe"));
      setQuote(answer);
      if (answer.ways.length === 1) setChosen(answer.ways[0]!);
    });
    return () => void (alive = false);
  }, []);
  useEffect(() => {
    if (!chosen) return;
    let alive = true;
    // What the other bairro weighs, from its own manifest: a few kilobytes that the journey needs anyway.
    void fetch(`/packs/${chosen.pack}/manifest.json`)
      .then((res) => (res.ok ? (res.json() as Promise<Outro>) : null))
      .then((manifest) => alive && manifest && (setOutro(manifest), manifest.sizes?.firstView && setMegabytes(manifest.sizes.firstView / 1_000_000)))
      .catch(() => {});
    return () => void (alive = false);
  }, [chosen]);
  const porta = (chosen && portas.find((one) => one.id === chosen.gateway)) || near;
  const ride = async (): Promise<void> => {
    if (!chosen) return;
    setBusy(true);
    setSaid(null);
    const { answer, error } = await askAsPlayer<Way>("POST", "/v1/viagens", { gateway: chosen.gateway, key });
    setBusy(false);
    if (!answer) return setSaid(tr.t(error === "insufficient" ? "viagem.falta" : error === "not_there" ? "viagem.longe" : "viagem.falhou"));
    // Paid: out of this street, and on the road; the other bairro comes down while the van goes, and then one gets off.
    setGoing(true);
    leave();
    const since = Date.now();
    await Promise.race([carry(answer.pack, outro, answer.arrive, tierNow(), (done, all) => setCarried({ done, all })).catch(() => {}), new Promise((late) => setTimeout(late, AT_MOST_MS))]);
    setTimeout(() => go(answer.pack, answer.arrive), Math.max(0, ON_THE_ROAD_MS - (Date.now() - since)));
  };
  if (going) {
    return (
      <div class="eb-caminho" role="status">
        <span class="n-pano-faixa n-pano-faixa-vermelha" aria-hidden="true" />
        <div class="eb-estrada" aria-hidden="true">
          <span class="eb-po" />
          <span class="eb-van" />
        </div>
        <p>{tr.t("viagem.caminho", { a: porta.a })}</p>
        {carried && carried.all > 0 ? (
          <p class="eb-dados" data-carried={carried.done >= carried.all ? "all" : "some"}>
            {/* A light bairro at Poupança is some tens of kilobytes: said in the unit that shows it. */}
            {carried.all >= 1_000_000
              ? tr.t("viagem.traz", { feito: tr.number(Math.round(carried.done / 100_000) / 10), todo: tr.number(Math.round(carried.all / 100_000) / 10) })
              : tr.t("viagem.traz.pouco", { feito: tr.number(Math.round(carried.done / 1000)), todo: tr.number(Math.round(carried.all / 1000)) })}
          </p>
        ) : null}
      </div>
    );
  }
  if (quote && !chosen) {
    // More than one candongueiro leaves from here: where to, before anything else.
    return (
      <div class="eb-back" onClick={(event) => event.target === event.currentTarget && onClose()}>
        <section class="eb-sheet n-on-dark" role="dialog" aria-label={tr.t("viagem.onde")}>
          <span class="n-pano-faixa n-pano-faixa-vermelha" aria-hidden="true" />
          <div class="eb-in">
            <span class="eb-van eb-van-parada" aria-hidden="true" />
            <h3>{tr.t("viagem.onde")}</h3>
            <p class="eb-preco">{quote.free ? tr.t("viagem.gratis") : tr.t("viagem.preco", { preco: tr.makuta(quote.price) })}</p>
            <div class="eb-onde">
              {quote.ways.map((way) => (
                <Button key={way.gateway} onPress={() => setChosen(way)}>
                  {portas.find((one) => one.id === way.gateway)?.nome ?? way.pack}
                </Button>
              ))}
            </div>
            <Button kind="quiet" onPress={onClose}>
              {tr.t("viagem.ficar")}
            </Button>
          </div>
        </section>
      </div>
    );
  }
  return (
    <div class="eb-back" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section class="eb-sheet n-on-dark" role="dialog" aria-label={tr.t("viagem.titulo", { a: porta.a })}>
        <span class="n-pano-faixa n-pano-faixa-vermelha" aria-hidden="true" />
        <div class="eb-in">
          <span class="eb-van eb-van-parada" aria-hidden="true" />
          <h3>{tr.t("viagem.titulo", { a: porta.a })}</h3>
          {quote ? <p class="eb-preco">{quote.free ? tr.t("viagem.gratis") : tr.t("viagem.preco", { preco: tr.makuta(quote.price) })}</p> : null}
          {megabytes !== null ? <p class="eb-dados">{tr.t("viagem.dados", { mb: tr.number(Math.round(megabytes * 10) / 10) })}</p> : null}
          {said ? (
            <p class="eb-said" role="status">
              {said}
            </p>
          ) : null}
          <div class="eb-keys">
            <Button kind="quiet" onPress={onClose}>
              {tr.t("viagem.ficar")}
            </Button>
            <Button disabled={!chosen} busy={busy} onPress={() => void ride()}>
              {tr.t("viagem.ir", { a: porta.a })}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
