// The first house components (UX_UI_SPEC.md §1.6). Each one takes what it
// shows as properties and holds no words of its own: every word a player
// reads comes from the catalog, and every colour from tokens.css.
//
// Built in Task 0.7: the pieces a screen is made of. The ones that need the
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

/** Cash on hand. `change` flashes green or red when the amount has just moved. */
export function WalletChip({ amount, change }: { amount: number; change?: "in" | "out" }) {
  return (
    <span class={`n-chip n-wallet${change ? ` n-wallet-${change}` : ""}`}>
      <Glyph name="carteira" size={18} label={tr.t("hud.wallet")} />
      <span class="n-num">{tr.makuta(amount)}</span>
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

/** The single system line at the top: reconnecting, saving, offline. */
export function Banner({ children, tone = "calm" }: { children: ComponentChildren; tone?: "calm" | "problem" }) {
  return (
    <div class={`n-banner n-banner-${tone}`} role="status">
      {children}
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

/** The blue and white band shown while riding: the linha, its stops, the next one. */
export function RouteBand({ line, stops, next }: { line: string; stops: readonly string[]; next: number }) {
  return (
    <div class="n-route" role="status">
      <strong class="n-route-line">{line}</strong>
      <ol class="n-route-stops">
        {stops.map((stop, i) => (
          <li class={i < next ? "n-stop-past" : i === next ? "n-stop-next" : undefined} aria-current={i === next ? "step" : undefined}>
            <span class="n-stop-dot" aria-hidden="true" />
            <span class="n-stop-name">{stop}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Words over a head. Too far away to read, it is a balloon with no words in it. */
export function SpeechBalloon({ text, typing }: { text?: string; typing?: boolean }) {
  return (
    <span class={`n-balloon${text ? "" : " n-balloon-far"}`}>
      {typing ? <span class="n-dots" role="img" aria-label={tr.t("chat.typing")} /> : (text ?? "")}
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
