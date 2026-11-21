// Convidar para sair, on this phone (Task 10.13, D-10.3 to D-10.5): the ask that arrives and its three answers
// ("Vamos", "Agora não", another place), the answer to one's own, and, once agreed, a chip that says who one is out
// with and where, from which a táxi for two is called or the outing ended. The zone decides everything; this shows
// what it says. Fetched the first time someone's card is opened or an ask arrives: the way in is full (F-226).

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { type WorldEvent } from "@nzila/protocol";
import { SAIR_DITOS, SAIR_FINS, SAIR_RECUSAS, encodeSair } from "@nzila/protocol/sair";
import { Button, Glyph, type CompassMark, type GlyphName } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import "./sair.css";

// The words of this came with it.
tr.extend(ptAOLater);

/** A place two may go out to: the pack's, in the pack's order. Metres. */
export interface Lugar {
  readonly id: string;
  /** As the chooser names it ("O Pontão ao pôr do sol"), and as one goes to it ("ao Pontão"). */
  readonly nome: string;
  readonly a: string;
  readonly glyph: string;
  readonly x: number;
  readonly z: number;
}

/** A pack's places for an outing, with their words: how the chooser names each and how one goes to it, or its name when the pack has neither. */
export function lugaresDe(pois: readonly { readonly id: string; readonly nameKey: string; readonly glyph?: string | undefined; readonly outing?: boolean | undefined; readonly pos: readonly [number, number, number] }[], word: (key: string) => string): Lugar[] {
  return pois.filter((one) => one.outing === true).map((one) => {
    const stem = one.nameKey.replace(/\.name$/, "");
    const nome = word(one.nameKey);
    const or = (key: string): string => (word(key) === key ? nome : word(key));
    return { id: one.id, nome: or(`${stem}.sair`), a: or(`${stem}.a`), glyph: one.glyph ?? "ponto", x: one.pos[0], z: one.pos[2] };
  });
}

/** What the street page gives this: the line to the zone, as far as an outing needs it. */
export interface Linha {
  readonly current: { saidas: WorldEvent[]; post(bytes: Uint8Array): void; who(entity: number): { name: string } | null } | null;
}

interface Convite {
  readonly entidade: number;
  readonly nome: string;
  readonly lugar: number;
  /** It answers the player's own ask with another place. */
  readonly outro: boolean;
  readonly ate: number;
}

export interface Saida {
  readonly entidade: number;
  readonly nome: string;
  readonly lugar: number;
  readonly chegou: boolean;
}

/** How long an ask stays on the screen (the zone forgets it a little later). */
const ASK_SHOWN_MS = 80_000;

export class Sair {
  readonly lugares: readonly Lugar[];
  convite: Convite | null = null;
  saida: Saida | null = null;
  aviso: { readonly text: string; readonly bom: boolean; readonly ate: number } | null = null;
  /** Where the player stands, for how far the place is. */
  x = 0;
  z = 0;
  private readonly listeners = new Set<() => void>();

  constructor(lugares: readonly Lugar[]) {
    this.lugares = lugares;
  }

  listen(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  private say(text: string, bom: boolean, ms = 6000): void {
    this.aviso = { text, bom, ate: performance.now() + ms };
  }

  /** Reads what the zone has said of outings since last asked. */
  hear(net: Linha, x: number, z: number): void {
    this.x = x;
    this.z = z;
    const session = net.current;
    const now = performance.now();
    let changed = false;
    if (this.convite && this.convite.ate < now) {
      this.convite = null;
      changed = true;
    }
    for (const event of session?.saidas.splice(0) ?? []) {
      changed = true;
      const what = SAIR_DITOS[event.args[0] ?? -1];
      const n = event.args[1] ?? 0;
      const nome = session?.who(event.subject)?.name ?? this.saida?.nome ?? "";
      const a = this.lugares[n]?.a ?? "";
      if (what === "convite" && this.lugares[n]) this.convite = { entidade: event.subject, nome, lugar: n, outro: event.args[2] === 1, ate: now + ASK_SHOWN_MS };
      else if (what === "nao") this.say(tr.t("sair.disse.nao", { nome }), false);
      else if (what === "combinado" && this.lugares[n]) {
        // Told again on coming back to the street: said once.
        if (!this.saida) this.say(tr.t("sair.combinado", { nome, a }), true, 7000);
        this.saida = { entidade: event.subject, nome, lugar: n, chegou: this.saida?.chegou ?? false };
        this.convite = null;
      } else if (what === "chegaram" && this.saida) {
        this.saida = { ...this.saida, chegou: true };
        this.say(tr.t("sair.chegaram", { a: this.lugares[this.saida.lugar]?.a ?? "" }), true, 8000);
      } else if (what === "fim") {
        const porque = SAIR_FINS[n] ?? "terminou";
        this.say(tr.t(`sair.fim.${porque}` as "sair.fim.terminou", { nome: this.saida?.nome ?? nome }), false, 7000);
        this.saida = null;
      } else if (what === "recusado") {
        const porque = SAIR_RECUSAS[n] ?? "nao_pode";
        this.say(tr.t(`sair.recusado.${porque}` as "sair.recusado.nao_pode", { nome }), false);
        if (porque === "convite") this.convite = null;
      }
    }
    if (this.aviso && this.aviso.ate < now) {
      this.aviso = null;
      changed = true;
    }
    if (changed) this.changed();
  }

  /** Asks someone out to a place, from their card. */
  convidar(net: Linha, entidade: number, lugar: number): void {
    net.current?.post(encodeSair({ op: "convidar", entidade, lugar }));
  }

  /** "Vamos" or "Agora não" to the ask on the screen. */
  responder(net: Linha, sim: boolean): void {
    const convite = this.convite;
    if (!convite) return;
    net.current?.post(encodeSair({ op: sim ? "aceitar" : "recusar", entidade: convite.entidade }));
    this.convite = null;
    this.changed();
  }

  /** Another place, in answer to the ask on the screen. */
  outro(net: Linha, lugar: number): void {
    const convite = this.convite;
    if (!convite) return;
    net.current?.post(encodeSair({ op: "outro", entidade: convite.entidade, lugar }));
    this.say(tr.t("sair.enviado", { name: convite.nome, a: this.lugares[lugar]?.a ?? "" }), true, 4000);
    this.convite = null;
    this.changed();
  }

  terminar(net: Linha): void {
    net.current?.post(encodeSair({ op: "terminar" }));
  }

  /** How far the place of the outing is, in metres. */
  longe(): number {
    const lugar = this.saida ? this.lugares[this.saida.lugar] : undefined;
    return lugar ? Math.hypot(lugar.x - this.x, lugar.z - this.z) : 0;
  }

  /** The place of the outing on the compass, while one is on. */
  marks(x: number, z: number): CompassMark[] {
    const lugar = this.saida ? this.lugares[this.saida.lugar] : undefined;
    return lugar ? [{ bearing: ((Math.atan2(lugar.x - x, -(lugar.z - z)) * 180) / Math.PI + 360) % 360, metres: Math.hypot(lugar.x - x, lugar.z - z), kind: "target" }] : [];
  }

  /** For the tests: how it stands. */
  probe(): { convite: number | null; saida: number | null; chegou: boolean; aviso: string | null } {
    return { convite: this.convite?.lugar ?? null, saida: this.saida?.lugar ?? null, chegou: this.saida?.chegou ?? false, aviso: this.aviso?.text ?? null };
  }
}

function useSair(sair: Sair): void {
  const [, redraw] = useState(0);
  useEffect(() => sair.listen(() => redraw((n) => n + 1)), [sair]);
  // The metres to the place count down as the player walks.
  useEffect(() => {
    const ticking = setInterval(() => redraw((n) => n + 1), 800);
    return () => clearInterval(ticking);
  }, []);
}

/** The places, to choose one from: each with its sign and its name. */
export function Lugares({ lugares, skip, onPick }: { lugares: readonly Lugar[]; skip?: number; onPick: (lugar: number) => void }) {
  return (
    <div class="sr-lugares">
      {lugares.map((lugar, n) =>
        n === skip ? null : (
          <button key={lugar.id} type="button" class="sr-lugar" data-lugar={lugar.id} onClick={() => onPick(n)}>
            <span class="sr-lugar-sinal" aria-hidden="true">
              <Glyph name={lugar.glyph as GlyphName} size={26} />
            </span>
            <span>{lugar.nome}</span>
          </button>
        ),
      )}
    </div>
  );
}

/** The ask that arrives, with its three answers; and what the zone has just said of an outing. */
export function Ui({ sair, net }: { sair: Sair; net: Linha }) {
  useSair(sair);
  const [choosing, setChoosing] = useState(false);
  const convite = sair.convite;
  useEffect(() => void (!convite && setChoosing(false)), [convite === null]);
  const aviso = sair.aviso;
  if (!convite) {
    return aviso ? (
      <p class={`sr-aviso${aviso.bom ? "" : " sr-aviso-nao"}`} role="status">
        {aviso.text}
      </p>
    ) : null;
  }
  const lugar = sair.lugares[convite.lugar]!;
  const metros = Math.round(Math.hypot(lugar.x - sair.x, lugar.z - sair.z));
  const pergunta = tr.t(convite.outro ? "sair.prefere" : "sair.pergunta", { nome: convite.nome, a: lugar.a });
  return (
    <div class="sr-convite" role="dialog" aria-label={pergunta}>
      <div class="sr-band" aria-hidden="true" />
      {choosing ? (
        <>
          <p class="sr-quem">{tr.t("sair.escolher")}</p>
          <Lugares lugares={sair.lugares} skip={convite.lugar} onPick={(n) => sair.outro(net, n)} />
          <div class="sr-foot">
            <Button kind="quiet" onPress={() => setChoosing(false)}>
              {tr.t("sair.voltar")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <span class="sr-sinal" aria-hidden="true">
            <Glyph name={lugar.glyph as GlyphName} size={30} />
          </span>
          <p class="sr-quem">{pergunta}</p>
          <p class="sr-onde">{tr.t("sair.onde", { lugar: lugar.nome, metros })}</p>
          <div class="sr-foot">
            <Button kind="quiet" onPress={() => sair.responder(net, false)}>
              {tr.t("sair.nao")}
            </Button>
            {sair.lugares.length > 1 ? (
              <Button kind="quiet" onPress={() => setChoosing(true)}>
                {tr.t("sair.outro")}
              </Button>
            ) : null}
            <Button onPress={() => sair.responder(net, true)}>{tr.t("sair.sim")}</Button>
          </div>
        </>
      )}
    </div>
  );
}

/** The ride module as far as an outing needs it: what the táxi costs now, and the calling of one for two (what went wrong, or null). */
interface Corrida {
  precos(): Promise<{ taxi: number } | null>;
  pedir(net: never, kind: "taxi", to: { x: number; z: number }, dois: boolean): Promise<string | null>;
}
interface Pedir {
  /** The ride module, fetched when a táxi is first thought of. */
  corrida(): Promise<Corrida>;
}

/**
 * The chip of an outing, under the wallet: who, and where. Pressed, it offers a táxi for two (at the fare `preco`
 * says, paid by whoever calls it) and the end of the outing.
 */
export function Chip({ sair, net, corrida }: { sair: Sair; net: Linha } & Pedir) {
  useSair(sair);
  const [open, setOpen] = useState(false);
  const [fare, setFare] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const saida = sair.saida;
  useEffect(() => void (!saida && (setOpen(false), setSaid(null))), [saida === null]);
  useEffect(() => {
    if (open && fare === null) void corrida().then(async (rides) => setFare((await rides.precos())?.taxi ?? null));
  }, [open]);
  if (!saida) return null;
  const lugar = sair.lugares[saida.lugar]!;
  const call = async (): Promise<void> => {
    setBusy(true);
    const why = await (await corrida()).pedir(net as never, "taxi", { x: lugar.x, z: lugar.z }, true);
    setBusy(false);
    if (why === null) return setOpen(false);
    setSaid(tr.t(why === "insufficient" ? "sair.taxi.falta" : "sair.taxi.falhou"));
  };
  return (
    <div class={`sr-chip${saida.chegou ? " sr-chip-la" : ""}`}>
      <button type="button" class="sr-chip-face" aria-expanded={open} aria-label={tr.t("sair.menu", { nome: saida.nome })} onClick={() => setOpen(!open)}>
        <span class="sr-chip-sinal" aria-hidden="true">
          <Glyph name={lugar.glyph as GlyphName} size={22} />
        </span>
        <span class="sr-chip-words">
          <b>{tr.t("sair.chip", { nome: saida.nome })}</b>
          <span>{saida.chegou ? tr.t("sair.chip.la", { lugar: lugar.nome }) : tr.t("sair.chip.onde", { lugar: lugar.nome, metros: Math.round(sair.longe()) })}</span>
        </span>
      </button>
      {open ? (
        <div class="sr-menu">
          {said ? (
            <p class="sr-menu-said" role="status">
              {said}
            </p>
          ) : null}
          {saida.chegou ? null : (
            <Button busy={busy} onPress={() => void call()}>
              {fare === null ? tr.t("sair.taxi.semPreco") : tr.t("sair.taxi", { preco: tr.makuta(fare) })}
            </Button>
          )}
          <Button kind="quiet" onPress={() => (sair.terminar(net), setOpen(false))}>
            {tr.t("sair.terminar")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
