// The first house components (UX_UI_SPEC.md §1.6). Each one takes what it
// shows as properties and holds no words of its own: every word a player
// reads comes from the catalog, and every colour from tokens.css.
//
// Built in Task 0.7 and redrawn the same day at the founder's word ("it must
// feel like a game"): things you press have depth and sink, things that
// arrive spring in, and the road of the wordmark is the sign that something
// is under way. The motion is all in ui.css.
//
// These are the pieces a screen is made of. The ones that need the
// world or touch input (the joystick, the compass, the Telemóvel sheet, the
// emote wheel, the chat bar) are built with them in Tasks 1.4 and 1.7.

import { type ComponentChildren } from "preact";
import { ptAOTranslator as tr } from "@nzila/i18n";
import { GLYPHS, type GlyphName } from "./glyphs.ts";

/** A house glyph. It is decoration unless given a label, which a screen reader then reads. */
export function Glyph({ name, size = 24, label }: { name: GlyphName; size?: number; label?: string }) {
  return (
    <svg class="n-glyph" width={size} height={size} viewBox="0 0 24 24" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : "true"}>
      <path d={GLYPHS[name]} />
    </svg>
  );
}

/** The wordmark, drawn for Nzila: the z is a road, the dot of the i is the low sun. */
export function Wordmark({ width = 160 }: { width?: number }) {
  const z = "M126 72H196L126 150H196";
  return (
    <svg class="n-wordmark" width={width} viewBox="0 0 396 176" role="img" aria-label={tr.t("app.name")}>
      <g class="n-wordmark-ink">
        <path d="M28 150V72M28 104Q28 72 59 72Q90 72 90 104V150" />
        <path d={z} />
        <path d="M236 84V150" />
        <path d="M276 26V150" />
        <circle cx="336" cy="111" r="30" />
        <path d="M366 72V150" />
      </g>
      <path class="n-wordmark-road" d={z} />
      <circle class="n-wordmark-sun" cx="236" cy="42" r="16" />
    </svg>
  );
}

/**
 * The mark in motion: the road of the wordmark's z, small. While something is
 * under way its centre line runs; when it is done the sun comes up over it;
 * when it cannot go on the line stops and the sun is red. It is the game's
 * only "loading" sign: there is no spinner anywhere.
 */
export function RoadMark({ state = "moving", size = 22 }: { state?: "moving" | "done" | "stopped"; size?: number }) {
  const z = "M6 9H22L6 25H22";
  return (
    <svg class={`n-road n-road-${state}`} width={size} height={size} viewBox="0 0 28 30" aria-hidden="true">
      <path class="n-road-tar" d={z} />
      <path class="n-road-line" d={z} />
      <circle class="n-road-sun" cx="23" cy="5" r="3.5" />
    </svg>
  );
}

/** The blue and white van, from the side. Drawn for Nzila. */
export function Van({ width = 44 }: { width?: number }) {
  return (
    <svg class="n-van" width={width} viewBox="0 0 44 26" aria-hidden="true">
      <path class="n-van-body" d="M3 6.5A3.5 3.5 0 0 1 6.5 3H30c2.5 0 4.6 1.2 6 3.3l4.4 6.6c.4.6.6 1.3.6 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5z" />
      <path class="n-van-stripe" d="M3 13h38v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" />
      <path class="n-van-glass" d="M7 6h6v5H7zM15 6h6v5h-6zM23 6h6.5c1 0 2 .5 2.6 1.4L34.5 11H23z" />
      <circle class="n-van-wheel" cx="12" cy="21" r="3.6" />
      <circle class="n-van-wheel" cx="31" cy="21" r="3.6" />
      <circle class="n-van-hub" cx="12" cy="21" r="1.3" />
      <circle class="n-van-hub" cx="31" cy="21" r="1.3" />
    </svg>
  );
}

/** A plain button. `kind` "quiet" is for the second choice on a screen. */
export function Button({ children, kind = "solid", disabled, busy, onPress }: { children: ComponentChildren; kind?: "solid" | "quiet"; disabled?: boolean; busy?: boolean; onPress?: () => void }) {
  return (
    <button type="button" class={`n-button n-button-${kind}`} disabled={disabled || busy} aria-busy={busy ? "true" : undefined} onClick={onPress}>
      {children}
    </button>
  );
}

/** The one gold button. It says what it will do, and what it costs when it costs. */
export function ContextAction({ label, price, disabled, onPress }: { label: string; price?: number; disabled?: boolean; onPress?: () => void }) {
  const text = price === undefined ? label : tr.t("action.withPrice", { label, price: tr.makuta(price) });
  return (
    <button type="button" class="n-action" disabled={disabled} onClick={onPress}>
      {text}
    </button>
  );
}

/** Cash on hand. `change` makes the amount jump, green or red, when it has just moved. */
export function WalletChip({ amount, change }: { amount: number; change?: "in" | "out" }) {
  return (
    <span class={`n-chip n-wallet${change ? ` n-wallet-${change}` : ""}`}>
      <span class="n-coin">
        <Glyph name="carteira" size={16} label={tr.t("hud.wallet")} />
      </span>
      <span class="n-num n-display">{tr.makuta(amount)}</span>
    </span>
  );
}

/** The world clock, with the leaf when Modo Poupança is on. */
export function ClockChip({ secondOfDay, poupanca }: { secondOfDay: number; poupanca?: boolean }) {
  return (
    <span class="n-chip">
      {poupanca ? <Glyph name="poupanca" size={18} label={tr.t("hud.poupanca")} /> : null}
      <span class="n-num n-display">{tr.clock(secondOfDay)}</span>
    </span>
  );
}

/** Fome and Energia, 0 to 10 000 each. Hidden while both are above half. */
export function NeedsBars({ fome, energia }: { fome: number; energia: number }) {
  if (fome > 5000 && energia > 5000) return null;
  const bar = (glyph: GlyphName, label: string, value: number) => (
    <span class={`n-need${value < 2000 ? " n-need-low" : ""}`}>
      <Glyph name={glyph} size={14} label={label} />
      <span class="n-need-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value / 100)}>
        <span class="n-need-fill" style={{ width: `${Math.max(0, Math.min(100, value / 100))}%` }} />
      </span>
    </span>
  );
  return (
    <span class="n-needs">
      {bar("fome", tr.t("needs.fome"), fome)}
      {bar("energia", tr.t("needs.energia"), energia)}
    </span>
  );
}

/**
 * The single system line at the top: saving, saved, reconnecting, offline.
 * The road mark beside the words says which without being read.
 */
export function Banner({ children, state = "moving" }: { children: ComponentChildren; state?: "moving" | "done" | "stopped" }) {
  return (
    <div class={`n-banner n-banner-${state}`} role="status">
      <RoadMark state={state} />
      <span>{children}</span>
    </div>
  );
}

/** One calm line on entering a hot block. Heat always has a word and a glyph with its colour. */
export function HeatLine({ band }: { band: 1 | 2 | 3 }) {
  return (
    <div class={`n-heat n-heat-${band}`} role="status">
      <Glyph name="calor" size={18} />
      <span>{tr.t("heat.line")}</span>
    </div>
  );
}

/** A cost shown before the tap: Makuta, minutes or megabytes. */
export function PriceTag({ kind, value }: { kind: "makuta" | "minutes" | "data"; value: number }) {
  const glyph: GlyphName = kind === "makuta" ? "carteira" : kind === "minutes" ? "relogio" : "dados";
  const text = kind === "makuta" ? tr.makuta(value) : kind === "minutes" ? tr.t("time.minutes", { n: value }) : tr.dataSize(value);
  return (
    <span class="n-price">
      <Glyph name={glyph} size={16} />
      <span class="n-num">{text}</span>
    </span>
  );
}

export interface ReceiptLine {
  readonly label: string;
  readonly qty?: number;
  readonly amount: number;
}

/** Paper. What, how many, how much, the total in display type, when, where, a reference. */
export function Receipt({ title, lines, total, at, place, reference }: { title: string; lines: readonly ReceiptLine[]; total: number; at: string; place: string; reference: string }) {
  return (
    <article class="n-paper n-receipt">
      <h3 class="n-receipt-title">{title}</h3>
      <dl class="n-receipt-lines">
        {lines.map((line) => (
          <>
            <dt>{line.qty === undefined ? line.label : tr.t("receipt.line", { qty: line.qty, label: line.label })}</dt>
            <dd class="n-num">{tr.makuta(line.amount)}</dd>
          </>
        ))}
      </dl>
      <p class="n-receipt-total">
        <span>{tr.t("receipt.total")}</span>
        <strong class="n-num">{tr.makuta(total)}</strong>
      </p>
      <p class="n-receipt-foot">{tr.t("receipt.foot", { at, place, reference })}</p>
    </article>
  );
}

/** The BI: the player's card everywhere. `photo` is whatever draws the avatar. */
export function IdCard({ name, number, bairro, arrived, shielded, photo }: { name: string; number: string; bairro: string; arrived: string; shielded?: boolean; photo?: ComponentChildren }) {
  const field = (label: string, value: string) => (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
  return (
    <article class="n-paper n-bi">
      <div class="n-bi-band" aria-hidden="true" />
      <div class="n-bi-photo">{photo}</div>
      <div class="n-bi-body">
        <h3 class="n-bi-name">{name}</h3>
        <dl class="n-bi-fields">
          {field(tr.t("bi.number"), number)}
          {field(tr.t("bi.bairro"), bairro)}
          {field(tr.t("bi.arrived"), arrived)}
        </dl>
        <span class="n-bi-stamp" aria-hidden="true">
          <RoadMark state="done" size={26} />
        </span>
        {shielded ? (
          <p class="n-bi-shield">
            <Glyph name="escudo" size={16} />
            {tr.t("bi.novato")}
          </p>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Shown while riding: the linha on the van's own plate, the road with its
 * stops, and the van driving along it. `next` is the stop ahead and
 * `progress` (0 to 1) how far the van is from the stop behind toward it;
 * `waiting` means it is standing at `next` with the door open.
 * `stopsAt` gives each stop as one is said to be at it, with the preposition the
 * place takes ("na Marginal", "no Kilamba", "em Cazenga"): Portuguese has no one word for "at".
 */
export function RouteBand({ line, stops, stopsAt, next, progress = 0, waiting }: { line: string; stops: readonly string[]; stopsAt?: readonly string[]; next: number; progress?: number; waiting?: boolean }) {
  const last = Math.max(1, stops.length - 1);
  const at = waiting ? next : Math.max(0, next - 1 + Math.max(0, Math.min(1, progress)));
  return (
    <div class={`n-route${waiting ? " n-route-waiting" : ""}`} role="status">
      <div class="n-route-top">
        <strong class="n-route-plate">{line}</strong>
        <span class="n-route-next">
          <small>{tr.t(waiting ? "route.atStop" : "route.next")}</small>{" "}
          <b>{waiting ? (stopsAt?.[next] ?? stops[next]) : stops[next]}</b>
        </span>
      </div>
      <div class="n-route-road">
        <div class="n-route-lane">
          <span class="n-route-dashes" aria-hidden="true" />
          {stops.map((_, i) => (
            <span class={`n-route-post${i < next ? " n-post-past" : i === next ? " n-post-next" : ""}`} style={{ left: `${(i / last) * 100}%` }} aria-hidden="true" />
          ))}
          <span class="n-route-van" style={{ left: `${(at / last) * 100}%` }}>
            <Van />
          </span>
        </div>
      </div>
      <ol class="n-route-stops">
        {stops.map((stop, i) => (
          <li class={i < next ? "n-stop-past" : i === next ? "n-stop-next" : undefined} aria-current={i === next ? "step" : undefined}>
            {stop}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Words over a head. Too far away to read, it is a balloon with no words in it. */
export function SpeechBalloon({ text, typing }: { text?: string; typing?: boolean }) {
  return (
    <span class={`n-balloon${text || typing ? "" : " n-balloon-far"}`}>
      {typing ? (
        <span class="n-dots" role="img" aria-label={tr.t("chat.typing")}>
          <i />
          <i />
          <i />
        </span>
      ) : (
        (text ?? "")
      )}
    </span>
  );
}

/** What the game has downloaded, in megabytes: this session, and this month on this device. */
export function DataMeter({ sessionBytes, monthBytes }: { sessionBytes: number; monthBytes?: number }) {
  return (
    <span class="n-data" role="status" aria-label={tr.t("data.label")}>
      <Glyph name="dados" size={16} />
      <span class="n-num">{tr.t("data.session", { size: tr.dataSize(sessionBytes) })}</span>
      {monthBytes === undefined ? null : <span class="n-num n-data-month">{tr.t("data.month", { size: tr.dataSize(monthBytes) })}</span>}
    </span>
  );
}

/** An honest empty state: what is not here yet, and what to do about it. */
export function EmptyState({ glyph, title, children }: { glyph: GlyphName; title: string; children?: ComponentChildren }) {
  return (
    <div class="n-empty">
      <Glyph name={glyph} size={32} />
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

/** A placeholder with the shape of what is loading. Never a bare spinner. */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div class="n-skeleton" aria-busy="true">
      {Array.from({ length: lines }, () => (
        <span />
      ))}
    </div>
  );
}

/** A switch with its label. */
export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange?: (on: boolean) => void }) {
  return (
    <button type="button" class="n-toggle" role="switch" aria-checked={on ? "true" : "false"} onClick={() => onChange?.(!on)}>
      <span>{label}</span>
      <span class="n-toggle-track" aria-hidden="true" />
    </button>
  );
}
