// The cantina and the Mochila (Tasks 4.2, 4.3; UX_UI_SPEC.md §5.1, §5.2). Fetched the first time either is
// opened, not before (the megabytes rule, F-188).
//
// The cantina is a sheet painted like its own front: the yellow wall, the name lettered in red on a white board,
// the row of pierced blocks under the roof, and the white grille the dona talks through. Her shelves are rows:
// the thing's picture, its name and her word on it, the price, a stepper. The total is on the gold button; short
// of cash it says how much is missing and is not gold. Then the receipt prints, line by line, like paper out of a
// machine. The phone proposes the basket; the zone says the player is at the grille; the server prices it.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { Button, EmptyState, Receipt, SpeechBalloon } from "@nzila/ui";
import { type ComponentChildren } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { account } from "../world/account.ts";
import { buyThings, thingsNow, type BuySaid, type Bought, type Things } from "../world/money.ts";
import { Coisa } from "./coisas.tsx";
import "./cantina.css";
import "@nzila/ui/later.css";

// The words of this sheet came with it (F-195).
tr.extend(ptAOLater);

/** The most of one thing in one purchase; the server says the same (packages/economy, MOST_OF_ONE). */
const MOST_OF_ONE = 20;
const THANKS = 3;
/** Each kind of shop speaks for itself (the first word of the place's name in the pack): how many things its keeper says. */
const KEEPERS: Readonly<Record<string, number>> = { cantina: 6, banca: 4, gelados: 4 };
/** The shelves, in the order the dona keeps them, and which kinds of thing sit on each. */
const SHELVES = [
  { id: "presentes", kinds: ["presente"] },
  { id: "comer", kinds: ["comida", "mimo"] },
  { id: "beber", kinds: ["bebida"] },
  { id: "cozinha", kinds: ["cozinha"] },
  { id: "casa", kinds: ["casa"] },
] as const;

const nameOf = (item: string): string => tr.t(`item.${item}` as "item.pao");
const lineOf = (item: string): string => tr.t(`item.${item}.line` as "item.pao.line");
const day = (iso: string): string => new Date(iso).toLocaleString("pt-AO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const reference = (id: number): string => id.toString(36).toUpperCase().padStart(4, "0");
const pick = (count: number): number => Math.floor(Math.random() * count);

/** The room things take: the Mochila as it is, and what is in the basket beside it. */
type About = Things["about"];
type Lines = Iterable<readonly [string, number]>;
const unitsOf = (about: About, lines: Lines): number => {
  let units = 0;
  for (const [item, quantity] of lines) units += (about[item]?.size ?? 0) * quantity;
  return units;
};

/** The thin bar of what the Mochila holds, and what the basket would add to it. */
function Room({ units, adding, carry, words = "cantina.room" }: { units: number; adding: number; carry: number; words?: "cantina.room" | "mochila.room" }) {
  const over = units + adding > carry;
  return (
    <div class={`ct-room${over ? " ct-room-over" : ""}`}>
      <span class="ct-room-bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, (units / carry) * 100)}%` }} />
        <b style={{ left: `${Math.min(100, (units / carry) * 100)}%`, width: `${Math.max(0, Math.min(100 - (units / carry) * 100, (adding / carry) * 100))}%` }} />
      </span>
      <small>{tr.t(words, { units: units + adding, carry })}</small>
    </div>
  );
}

/** The sheet's back, its paint, and a tap outside it to shut it. */
function Sheet({ label, onClose, children, kind }: { label: string; onClose: () => void; children: ComponentChildren; kind: string }) {
  return (
    <div class="ct-back" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section class={`ct-sheet ${kind} n-on-dark`} role="dialog" aria-label={label}>
        {children}
      </section>
    </div>
  );
}

/**
 * The cantina's grille. `shop` is the place in the pack the phone sees the player at; `second` the hour of the
 * day in the game (the dona says good morning or good evening); `place` the bairro, for the receipt.
 */
export function Cantina({ shop, second, place, onClose }: { shop: { id: string; name: string }; second: number; place: string; onClose: () => void }) {
  const [things, setThings] = useState<Things | null>(null);
  const [far, setFar] = useState(false);
  const [basket, setBasket] = useState<ReadonlyMap<string, number>>(new Map());
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<BuySaid | null>(null);
  const [receipt, setReceipt] = useState<Bought | null>(null);
  const hour = second / 3600;
  // The banca and the gelados have their own keeper and their own paint; anything else is a cantina.
  const kind = shop.id.split("-")[0]! in KEEPERS ? shop.id.split("-")[0]! : "cantina";
  const hello = tr.t(`${kind}.hello.${hour < 12 ? "dia" : hour < 19 ? "tarde" : "noite"}` as "cantina.hello.dia");
  const [chat] = useState(() => tr.t(`${kind}.chat.${pick(KEEPERS[kind]!)}` as "cantina.chat.0"));
  const [thanks, setThanks] = useState(0);
  // The cantina's card: a stamp for each day of buying here; the seventh, and the bread is the dona's.
  const [stamps, setStamps] = useState<{ stamps: number; of: number; filled: boolean } | null>(null);

  // The shelves, from the server: asked again a moment later when the zone has not yet said the player is here.
  useEffect(() => {
    let alive = true;
    void (async () => {
      for (let tries = 0; tries < 4 && alive; tries++) {
        const now = await thingsNow();
        if (!alive) return;
        if (now?.shop?.id === shop.id) {
          if (now.shop.card) setStamps({ stamps: now.shop.card.stamps, of: now.shop.card.of, filled: false });
          return setThings(now);
        }
        if (!now) break;
        await new Promise((done) => setTimeout(done, 700));
      }
      if (alive) setFar(true);
    })();
    return () => void (alive = false);
  }, [shop.id]);

  // What the Carteira holds: as the server said on opening, then as each purchase leaves it.
  const cash = account()?.wallet?.cash ?? things?.cash ?? 0;
  const stock = things?.shop?.stock ?? [];
  const priceOf = useMemo(() => new Map(stock.map((line) => [line.item, line.price])), [things]);
  let total = 0;
  for (const [item, quantity] of basket) total += (priceOf.get(item) ?? 0) * quantity;
  const adding = things ? unitsOf(things.about, basket) : 0;
  const heavy = things !== null && things.units + adding > things.carryUnits;
  const count = [...basket.values()].reduce((sum, n) => sum + n, 0);

  const change = (item: string, by: number): void => {
    setSaid(null);
    const next = new Map(basket);
    const now = Math.max(0, Math.min(MOST_OF_ONE, (next.get(item) ?? 0) + by));
    if (now === 0) next.delete(item);
    else next.set(item, now);
    setBasket(next);
  };
  const pay = async (): Promise<void> => {
    setBusy(true);
    setSaid(null);
    const answer = await buyThings(shop.id, [...basket].map(([item, quantity]) => ({ item, quantity })));
    setBusy(false);
    if (answer.said !== "ok" || !answer.receipt) return setSaid(answer.said);
    setReceipt(answer.receipt);
    setThanks(pick(THANKS));
    if (answer.card) setStamps({ stamps: answer.card.stamps, of: answer.card.of, filled: answer.card.filled });
    setBasket(new Map());
    if (things && answer.items) setThings({ ...things, items: answer.items, units: unitsOf(things.about, answer.items.map((one) => [one.item, one.quantity] as const)) });
  };

  return (
    <Sheet label={shop.name} onClose={onClose} kind={`ct-cantina ct-de-${kind}`}>
      <header class="ct-front">
        <span class="ct-blocks" aria-hidden="true" />
        <h2 class="ct-board">
          <span>{shop.name}</span>
        </h2>
        <div class="ct-grille">
          <SpeechBalloon text={receipt ? (stamps?.filled ? tr.t("cantina.cartao.cheio") : tr.t(`${kind}.thanks.${thanks}` as "cantina.thanks.0")) : far ? tr.t(`${kind}.far` as "cantina.far") : things ? `${hello} ${chat}` : tr.t(`${kind}.reading` as "cantina.reading")} />
        </div>
        {stamps ? (
          <div class="ct-card" aria-label={tr.t("cantina.cartao.diz", { stamps: stamps.filled ? stamps.of : stamps.stamps, of: stamps.of })}>
            <span class="ct-card-name">{tr.t("cantina.cartao")}</span>
            <span class="ct-card-stamps" aria-hidden="true">
              {Array.from({ length: stamps.of }, (_, n) => (
                <i key={n} class={n < stamps.stamps ? (n === stamps.stamps - 1 && receipt ? "ct-stamp ct-stamp-new" : "ct-stamp") : ""} />
              ))}
            </span>
          </div>
        ) : null}
      </header>
      {receipt ? (
        <div class="ct-printed">
          <div class="ct-print">
            <Receipt title={shop.name} lines={receipt.lines.map((line) => ({ label: nameOf(line.item), qty: line.quantity, amount: line.amount }))} total={receipt.total} at={day(receipt.at)} place={place} reference={reference(receipt.id)} />
          </div>
          <div class="ct-keys">
            <Button kind="quiet" onPress={() => setReceipt(null)}>
              {tr.t("cantina.again")}
            </Button>
            <Button onPress={onClose}>{tr.t("cantina.done")}</Button>
          </div>
        </div>
      ) : things ? (
        <>
          <div class="ct-shelves">
            {SHELVES.map((shelf) => {
              const rows = stock.filter((line) => (shelf.kinds as readonly string[]).includes(things.about[line.item]?.kind ?? ""));
              return rows.length === 0 ? null : (
                <section class="ct-shelf" key={shelf.id}>
                  <h3>{tr.t(`cantina.shelf.${shelf.id}`)}</h3>
                  <ul>
                    {rows.map((line) => {
                      const quantity = basket.get(line.item) ?? 0;
                      return (
                        <li key={line.item} class={quantity > 0 ? "ct-row ct-row-on" : "ct-row"}>
                          <button type="button" class="ct-pick" onClick={() => change(line.item, 1)} data-item={line.item}>
                            <Coisa item={line.item} size={40} />
                            <span class="ct-what">
                              <b>{nameOf(line.item)}</b>
                              <small>{lineOf(line.item)}</small>
                            </span>
                            <span class="ct-price n-num">{tr.makuta(line.price)}</span>
                          </button>
                          {quantity > 0 ? (
                            <span class="ct-stepper">
                              <button type="button" aria-label={tr.t("cantina.less")} onClick={() => change(line.item, -1)}>
                                <svg viewBox="0 0 16 16" aria-hidden="true">
                                  <path d="M3 8h10" />
                                </svg>
                              </button>
                              <output class="n-num">{quantity}</output>
                              <button type="button" aria-label={tr.t("cantina.more")} onClick={() => change(line.item, 1)} disabled={quantity >= MOST_OF_ONE}>
                                <svg viewBox="0 0 16 16" aria-hidden="true">
                                  <path d="M3 8h10 M8 3v10" />
                                </svg>
                              </button>
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
          <footer class="ct-foot">
            <Room units={things.units} adding={adding} carry={things.carryUnits} />
            <p class="ct-said" role="status">
              {said && said !== "ok" && said !== "far" ? tr.t(`cantina.said.${said}`) : said === "far" ? tr.t(`${kind}.far` as "cantina.far") : ""}
            </p>
            {count === 0 ? (
              <Button kind="quiet" disabled>
                {tr.t("cantina.pick")}
              </Button>
            ) : heavy ? (
              <Button kind="quiet" disabled>
                {tr.t("cantina.heavy")}
              </Button>
            ) : total > cash ? (
              <Button kind="quiet" disabled>
                {tr.t("cantina.short", { amount: tr.makuta(total - cash) })}
              </Button>
            ) : (
              <Button busy={busy} onPress={() => void pay()}>
                {tr.t("cantina.pay", { amount: tr.makuta(total) })}
              </Button>
            )}
          </footer>
        </>
      ) : far ? (
        <div class="ct-keys">
          <Button onPress={onClose}>{tr.t("player.close")}</Button>
        </div>
      ) : (
        <div class="ct-wait" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      )}
    </Sheet>
  );
}

/** The zone, as far as eating is concerned (net/session.ts): it is asked, and answers by `onAte`. */
interface EatsThrough {
  eat(item: string): boolean;
  onAte: ((item: string | null, why: string | null) => void) | null;
}

/** Eats or drinks one of a thing through the zone, which keeps Fome and Energia (Task 4.4): "ok", or why not. */
function eatThrough(zone: EatsThrough | null, item: string): Promise<"ok" | "nao_tens" | "nao_se_come" | "offline"> {
  return new Promise((done) => {
    if (!zone) return done("offline");
    const timer = setTimeout(() => ((zone.onAte = null), done("offline")), 6000);
    zone.onAte = (ate, why) => {
      clearTimeout(timer);
      zone.onAte = null;
      done(ate ? "ok" : why === "nao_se_come" ? "nao_se_come" : "nao_tens");
    };
    if (!zone.eat(item)) {
      clearTimeout(timer);
      zone.onAte = null;
      done("offline");
    }
  });
}

/** The Mochila: what the player carries, how much room is left, and eating or drinking what can be. */
export function Mochila({ zone = null, onClose }: { zone?: EatsThrough | null; onClose: () => void }) {
  const [things, setThings] = useState<Things | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ item: string; text: string; at: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void thingsNow().then((now) => alive && (now ? setThings(now) : setOffline(true)));
    return () => void (alive = false);
  }, []);
  const use = async (item: string, how: "comer" | "beber"): Promise<void> => {
    setBusy(item);
    const answer = await eatThrough(zone, item);
    if (answer !== "ok") {
      setBusy(null);
      return setSaid({ item, text: tr.t(answer === "offline" ? "mochila.offline" : `mochila.${answer}`), at: Date.now() });
    }
    // What is left, as the server has it.
    const now = await thingsNow();
    setBusy(null);
    if (now) setThings(now);
    setSaid({ item, text: tr.t(how === "comer" ? "mochila.ate" : "mochila.drank"), at: Date.now() });
  };
  return (
    <Sheet label={tr.t("mochila.title")} onClose={onClose} kind="ct-mochila">
      <header class="ct-mochila-head">
        <span class="n-pano-faixa n-pano-faixa-vermelha" aria-hidden="true" />
        <h2>{tr.t("mochila.title")}</h2>
        {things ? <Room units={things.units} adding={0} carry={things.carryUnits} words="mochila.room" /> : null}
        <p class="ct-said" role="status">
          {said?.text ?? ""}
        </p>
      </header>
      {things === null ? (
        offline ? (
          <p class="ct-said">{tr.t("mochila.offline")}</p>
        ) : (
          <div class="ct-wait" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        )
      ) : things.items.length === 0 ? (
        <EmptyState glyph="mochila" title={tr.t("mochila.empty")}>
          {tr.t("mochila.empty.line")}
        </EmptyState>
      ) : (
        <ul class="ct-held">
          {things.items.map((one) => {
            const how = things.about[one.item]?.use ?? null;
            return (
              <li key={one.item} class={said?.item === one.item ? "ct-held-row ct-held-used" : "ct-held-row"}>
                <span class="ct-held-pic">
                  <Coisa item={one.item} size={44} />
                  <b class="ct-count n-num">{one.quantity}</b>
                </span>
                <span class="ct-what">
                  <b>{nameOf(one.item)}</b>
                  <small>{how ? lineOf(one.item) : tr.t(things.about[one.item]?.kind === "presente" ? "mochila.oferecer" : "mochila.keep")}</small>
                </span>
                {how ? (
                  <Button kind="quiet" busy={busy === one.item} onPress={() => void use(one.item, how)}>
                    {tr.t(how === "comer" ? "mochila.comer" : "mochila.beber")}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <div class="ct-keys">
        <Button kind="quiet" onPress={onClose}>
          {tr.t("player.close")}
        </Button>
      </div>
    </Sheet>
  );
}
