// /styleguide: every house component in every state it has, on the two
// surfaces the game puts things on (the world and a dark sheet). A page for
// the team and the founder, not for players, so its own headings are plain
// English and are not in the catalog.

import { t } from "@nzila/i18n";
import {
  APP_GLYPHS,
  Banner,
  Button,
  ClockChip,
  ContextAction,
  DataMeter,
  EmptyState,
  GLYPHS,
  Glyph,
  HeatLine,
  IdCard,
  Pano,
  NeedsBars,
  PriceTag,
  Receipt,
  RoadMark,
  RouteBand,
  Skeleton,
  SpeechBalloon,
  Toggle,
  WalletChip,
  Wordmark,
  type GlyphName,
} from "@nzila/ui";
import { type ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import * as sample from "./fixtures.ts";
import "./styleguide.css";

const TOKENS: readonly (readonly [string, readonly string[]])[] = [
  ["Sheets and chips", ["noite", "noite-2", "luz", "luz-suave"]],
  ["Paper", ["papel", "papel-2", "tinta", "tinta-suave"]],
  ["The cloth", ["vermelho", "dourado", "pano-preto", "luz", "azul"]],
  ["Identity", ["dourado", "azul", "mar", "terra"]],
  ["Meaning", ["ganho", "gasto", "escudo", "calor-1", "calor-2", "calor-3"]],
];

const TYPE: readonly (readonly [keyof typeof sample.typeSamples, string])[] = [
  ["place", "place · 28 / display 700"],
  ["number", "number-l · 32 / display 700"],
  ["title", "title · 20 / display 600"],
  ["body", "body · 16 / system"],
  ["label", "label · 15 / system 600"],
  ["small", "small · 14 / system"],
];

function Section({ title, note, children }: { title: string; note?: string; children: ComponentChildren }) {
  return (
    <section class="sg-section">
      <h2>{title}</h2>
      {note ? <p class="sg-note">{note}</p> : null}
      {children}
    </section>
  );
}

function Case({ name, on = "sheet", children }: { name: string; on?: "sheet" | "world" | "night"; children: ComponentChildren }) {
  return (
    <figure class="sg-case">
      <div class={`sg-stage sg-on-${on}`}>{children}</div>
      <figcaption>{name}</figcaption>
    </figure>
  );
}

export function Styleguide() {
  const [poupanca, setPoupanca] = useState(true);
  const [ride, setRide] = useState(0.35);
  const [paid, setPaid] = useState(0);
  const hud = Object.keys(GLYPHS).filter((name) => !(APP_GLYPHS as readonly string[]).includes(name)) as GlyphName[];
  return (
    <main class="sg">
      <header class="sg-head">
        <div class="sg-marks">
          <span class="sg-plate sg-plate-paper"><Wordmark width={200} /></span>
          <span class="sg-plate n-on-dark"><Wordmark width={200} /></span>
        </div>
        <h1>Styleguide</h1>
        <div class="sg-marks">
          <span class="sg-plate"><RoadMark size={44} /></span>
          <span class="sg-plate"><RoadMark size={44} state="done" /></span>
          <span class="sg-plate"><RoadMark size={44} state="stopped" /></span>
        </div>
        <p class="sg-note">Hora Dourada. Every house component in every state. The sample names and amounts are placeholders.</p>
      </header>

      <Section title="Type" note="Fraunces for places, totals, the BI and titles. The phone's own font for everything else.">
        <div class="sg-type">
          {TYPE.map(([key, label]) => (
            <div class="sg-type-row">
              <span class={`sg-t-${key}`}>{sample.typeSamples[key]}</span>
              <small>{label}</small>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Colour" note="Gold is only ever the thing to press. Blue is only ever transport. Red is only ever loss or danger.">
        {TOKENS.map(([group, names]) => (
          <div class="sg-swatches">
            <h3>{group}</h3>
            {names.map((name) => (
              <span class="sg-swatch">
                <i style={{ background: `var(--n-${name})` }} />
                <small>{name}</small>
              </span>
            ))}
          </div>
        ))}
      </Section>

      <Section title="Glyphs" note="Drawn for Nzila on a 24 px grid. First drawings, for the founder to approve or send back.">
        <h3>The HUD</h3>
        <div class="sg-glyphs">
          {hud.map((name) => (
            <span class="sg-glyph"><Glyph name={name} /><small>{name}</small></span>
          ))}
        </div>
        <h3>The nine apps of the Telemóvel</h3>
        <div class="sg-glyphs">
          {APP_GLYPHS.map((name) => (
            <span class="sg-glyph sg-app"><Glyph name={name} size={28} /><small>{name}</small></span>
          ))}
        </div>
      </Section>

      <Section title="The context action" note="The one gold button. At most one on a screen.">
        <div class="sg-grid">
          <Case name="plain" on="world"><ContextAction label={t("action.enter")} /></Case>
          <Case name="with a price" on="world"><ContextAction label={t("action.board")} price={sample.wallet.fare} /></Case>
          <Case name="at night" on="night"><ContextAction label={t("action.talk")} /></Case>
          <Case name="disabled" on="world"><ContextAction label={t("action.buy")} disabled /></Case>
        </div>
      </Section>

      <Section title="On the world" note="Chips carry their own scrim, so they read over the brightest and the darkest frame.">
        <div class="sg-grid">
          <Case name="wallet" on="world"><WalletChip amount={sample.wallet.amount} /></Case>
          <Case name="wallet, Makuta in" on="world"><WalletChip amount={sample.wallet.amount + sample.wallet.fare} change="in" /></Case>
          <Case name="wallet, Makuta out" on="night"><WalletChip amount={sample.wallet.amount - sample.wallet.fare} change="out" /></Case>
          <Case name="pay a fare (press it)" on="world">
            <WalletChip key={paid} amount={sample.wallet.amount - paid * sample.wallet.fare} {...(paid > 0 ? { change: "out" as const } : {})} />
            <ContextAction label={t("action.board")} price={sample.wallet.fare} onPress={() => setPaid((n) => n + 1)} />
          </Case>
          <Case name="clock" on="world"><ClockChip secondOfDay={17 * 3600 + 42 * 60} /></Case>
          <Case name="clock, Modo Poupança" on="night"><ClockChip secondOfDay={21 * 3600 + 5 * 60} poupanca /></Case>
          <Case name="needs: hidden above half" on="world"><NeedsBars fome={8000} energia={9000} /><small class="sg-ghost">nothing shown</small></Case>
          <Case name="needs: getting low" on="world"><NeedsBars fome={4200} energia={7000} /></Case>
          <Case name="needs: very low" on="night"><NeedsBars fome={1200} energia={900} /></Case>
          <Case name="heat: warm" on="world"><HeatLine band={1} /></Case>
          <Case name="heat: hot" on="night"><HeatLine band={2} /></Case>
          <Case name="heat: very hot" on="night"><HeatLine band={3} /></Case>
          <Case name="balloon, near" on="world"><SpeechBalloon text={sample.balloon} /></Case>
          <Case name="balloon, typing" on="world"><SpeechBalloon typing /></Case>
          <Case name="balloon, too far to read" on="night"><SpeechBalloon /></Case>
        </div>
      </Section>

      <Section title="The route band" note="Shown while riding. The linha on the van's plate, the road with its stops, and the van driving along it.">
        <div class="sg-grid sg-wide">
          <Case name="waiting at the first stop" on="world"><RouteBand line={sample.route.line} stops={sample.route.stops} stopsAt={sample.route.stopsAt} next={0} waiting /></Case>
          <Case name={`on the road (press Drive: ${Math.round(ride * 100)}%)`} on="world"><RouteBand line={sample.route.line} stops={sample.route.stops} next={Math.min(3, Math.floor(ride * 3) + 1)} progress={(ride * 3) % 1} /></Case>
          <Case name="arriving at the last stop" on="night"><RouteBand line={sample.route.line} stops={sample.route.stops} next={3} progress={0.8} /></Case>
          <Case name="drive the van"><Button onPress={() => setRide((r) => (r >= 0.95 ? 0 : r + 0.12))}>{t("action.board")}</Button></Case>
        </div>
      </Section>

      <Section title="The system line" note="One banner at the top, never a popup. The road of the wordmark is the sign that something is under way; there is no spinner in the game.">
        <div class="sg-grid sg-wide">
          <Case name="saving: the road runs" on="world"><Banner>{t("state.saving")}</Banner></Case>
          <Case name="saved: the sun comes up" on="world"><Banner state="done">{t("state.saved")}</Banner></Case>
          <Case name="reconnecting" on="night"><Banner>{t("state.reconnecting")}</Banner></Case>
          <Case name="offline: the road stops" on="night"><Banner state="stopped">{t("state.offline")}</Banner></Case>
        </div>
      </Section>

      <Section title="The pano" note="Our drawing of a Samakaka cloth: the game's identity (founder, 2026-11-15). The whole cloth for the back of a card or a wide head; the band of triangles for an edge. An accent, never a wall.">
        <div class="sg-grid sg-wide">
          {(["vermelho", "azul", "preto", "dourado"] as const).map((colour) => (
            <Case name={colour}>
              <div class="sg-pano">
                <Pano colour={colour} />
              </div>
            </Case>
          ))}
          <Case name="the band">
            <div class="sg-pano-band">
              <i class="n-pano-faixa n-pano-faixa-vermelha" />
            </div>
          </Case>
        </div>
      </Section>

      <Section title="Paper" note="The BI and the receipt. Paper is not rounded, and a receipt sits one degree off straight.">
        <div class="sg-grid sg-wide">
          <Case name="receipt" on="world"><Receipt {...sample.receipt} /></Case>
          <Case name="BI" on="world"><IdCard {...sample.player} photo={<Glyph name="bi" size={32} />} /></Case>
          <Case name="BI, novato" on="night"><IdCard {...sample.player} shielded photo={<Glyph name="bi" size={32} />} /></Case>
        </div>
      </Section>

      <Section title="Costs" note="Every action that costs Makuta, time or megabytes says how much before the tap.">
        <div class="sg-grid">
          <Case name="Makuta"><PriceTag kind="makuta" value={sample.receipt.total} /></Case>
          <Case name="one minute"><PriceTag kind="minutes" value={1} /></Case>
          <Case name="minutes"><PriceTag kind="minutes" value={12} /></Case>
          <Case name="megabytes"><PriceTag kind="data" value={3_200_000} /></Case>
          <Case name="kilobytes"><PriceTag kind="data" value={340_000} /></Case>
          <Case name="data meter, this session"><DataMeter sessionBytes={340_000} /></Case>
          <Case name="data meter, with the month"><DataMeter sessionBytes={3_200_000} monthBytes={41_000_000} /></Case>
        </div>
      </Section>

      <Section title="Buttons and switches">
        <div class="sg-grid">
          <Case name="button"><Button>{t("state.retry")}</Button></Case>
          <Case name="button, quiet"><Button kind="quiet">{t("state.retry")}</Button></Case>
          <Case name="button, busy"><Button busy>{t("state.saving")}</Button></Case>
          <Case name="button, disabled"><Button disabled>{t("state.retry")}</Button></Case>
          <Case name={poupanca ? "switch, on (press it)" : "switch, off (press it)"}><Toggle label={t("hud.poupanca")} on={poupanca} onChange={setPoupanca} /></Case>
        </div>
      </Section>

      <Section title="Empty and loading" note="Empty is honest and inviting. Loading has the shape of what is coming, never a bare spinner.">
        <div class="sg-grid sg-wide">
          <Case name="empty"><EmptyState glyph="mensagens" title={sample.empty.title}>{sample.empty.body}</EmptyState></Case>
          <Case name="soon"><EmptyState glyph="garagem" title={t("state.soon")} /></Case>
          <Case name="loading"><Skeleton /></Case>
        </div>
      </Section>
    </main>
  );
}
