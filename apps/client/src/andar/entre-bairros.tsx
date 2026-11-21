// From one bairro to another (Task 11.2, D-11.2 and D-11.4): at a paragem that leads elsewhere, the candongueiro
// there. The sheet says where it goes, what the corrida costs (the first of each day is on the house), and how
// many megabytes the other bairro is to carry in, before anything is paid or fetched. Paid through the API on the
// zone's word that the player stands at the way out; then the phone leaves this street and opens the other at the
// paragem one gets off at. Fetched the first time the player stands at such a paragem: the way in is full (F-270).

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { Button } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { askAsPlayer } from "../world/account.ts";
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

interface Quote {
  readonly pack: string;
  readonly arrive: string;
  readonly price: number;
  readonly free: boolean;
}

/** A key for one crossing: asked twice, it is paid once. */
const newKey = (): string => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/**
 * The sheet of a crossing. `leave` takes the player out of this street before the other is opened; `go` opens it
 * (the page for that pack, at the paragem one arrives at).
 */
export function Viagem({ porta, onClose, leave, go }: { porta: Porta; onClose: () => void; leave: () => void; go: (pack: string, arrive: string) => void }) {
  const [quote, setQuote] = useState<Quote | null>(null);
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
      // What the other bairro weighs, from its own manifest: a few kilobytes that the journey needs anyway.
      void fetch(`/packs/${answer.pack}/manifest.json`)
        .then((res) => (res.ok ? (res.json() as Promise<{ sizes?: { firstView?: number } }>) : null))
        .then((manifest) => alive && manifest?.sizes?.firstView && setMegabytes(manifest.sizes.firstView / 1_000_000))
        .catch(() => {});
    });
    return () => void (alive = false);
  }, []);
  const ride = async (): Promise<void> => {
    if (!quote) return;
    setBusy(true);
    setSaid(null);
    const { answer, error } = await askAsPlayer<Quote>("POST", "/v1/viagens", { key });
    setBusy(false);
    if (!answer) return setSaid(tr.t(error === "insufficient" ? "viagem.falta" : error === "not_there" ? "viagem.longe" : "viagem.falhou"));
    // Paid: out of this street, a moment on the road, and into the other.
    setGoing(true);
    leave();
    setTimeout(() => go(answer.pack, answer.arrive), 1700);
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
            <Button disabled={!quote} busy={busy} onPress={() => void ride()}>
              {tr.t("viagem.ir", { a: porta.a })}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
