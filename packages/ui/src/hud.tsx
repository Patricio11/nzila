// The pieces of the HUD that need the world or a thumb (UX_UI_SPEC.md §1.6
// and §3.1), built in Task 1.4: the joystick, the compass, the run and
// gesture buttons with the gesture wheel, the Telemóvel button and the chat
// bar. Like the first components they hold no words and no colours of their
// own: words come from the catalog, colours from tokens.css, motion from ui.css.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { Glyph } from "./components.tsx";
import { type GlyphName } from "./glyphs.ts";

/**
 * The floating joystick, where the thumb landed. `x` and `y` are the middle
 * of its ring in pixels from the top left of its zone; `dx` and `dy` are the
 * push, each from -1 to 1. It draws; whoever owns the zone listens.
 */
export function Joystick({ x, y, dx, dy, active }: { x: number; y: number; dx: number; dy: number; active: boolean }) {
  const far = Math.hypot(dx, dy) > 1.3;
  return (
    <div class={`n-stick${active ? " n-stick-on" : ""}${far ? " n-stick-run" : ""}`} style={`transform: translate(${x - 60}px, ${y - 60}px)`} aria-hidden="true">
      <span class="n-stick-knob" style={`transform: translate(${dx * 36}px, ${dy * 36}px)`} />
    </div>
  );
}

/** A round HUD button with a glyph: run, gestures, the Telemóvel. `on` holds it down. */
export function HudButton({ glyph, label, on, onPress }: { glyph: GlyphName; label: string; on?: boolean; onPress?: () => void }) {
  return (
    <button type="button" class={`n-hud-button${on ? " n-hud-button-on" : ""}`} aria-label={label} aria-pressed={on === undefined ? undefined : on ? "true" : "false"} onClick={onPress}>
      <Glyph name={glyph} size={24} />
    </button>
  );
}

/** The gestures, rising out of their button. Each comes with its word, already from the catalog. */
export function EmoteWheel<T extends string>({ open, emotes, onPick }: { open: boolean; emotes: readonly { id: T; label: string }[]; onPick?: (id: T) => void }) {
  if (!open) return null;
  return (
    <div class="n-wheel" role="menu" aria-label={tr.t("hud.emotes")}>
      {emotes.map((emote, i) => (
        <button type="button" role="menuitem" class="n-wheel-item" style={`--i: ${i}`} onClick={() => onPick?.(emote.id)}>
          {emote.label}
        </button>
      ))}
    </div>
  );
}

export interface CompassMark {
  /** Degrees clockwise from north. */
  readonly bearing: number;
  /** Metres away. */
  readonly metres: number;
  readonly kind: "paragem" | "kamba" | "target";
}

/**
 * The compass: a small round map of the block with you in the middle. It
 * turns with the way you are looking, so what is ahead is at the top; north
 * is the gold tick. Marks farther than its reach sit on the rim.
 */
export function Compass({ heading, marks, reachM = 80, onPress }: { heading: number; marks: readonly CompassMark[]; reachM?: number; onPress?: () => void }) {
  const place = (bearing: number, metres: number): string => {
    const angle = ((bearing - heading - 90) * Math.PI) / 180;
    const r = Math.min(1, metres / reachM) * 21;
    return `transform: translate(${(Math.cos(angle) * r).toFixed(1)}px, ${(Math.sin(angle) * r).toFixed(1)}px)`;
  };
  return (
    <button type="button" class="n-compass" aria-label={tr.t("hud.compass")} onClick={onPress}>
      <span class="n-compass-north" style={`transform: rotate(${(-heading).toFixed(1)}deg)`} />
      {marks.map((mark) => (
        <span class={`n-compass-mark n-compass-${mark.kind}`} style={place(mark.bearing, mark.metres)} />
      ))}
      <span class="n-compass-you" />
    </button>
  );
}

/** The chat bar. It is here from the first walk so that the layout is right; it wakes in Task 3.5. */
export function ChatBar({ disabled, onOpen }: { disabled?: boolean; onOpen?: () => void }) {
  return (
    <button type="button" class="n-chatbar" disabled={disabled} onClick={onOpen}>
      <Glyph name="conversa" size={18} />
      <span>{tr.t("chat.placeholder")}</span>
    </button>
  );
}

/** The name of a place, set over the world for a moment on arriving. */
export function Arrival({ place }: { place: string }) {
  return (
    <p class="n-arrival n-display" role="status">
      {place}
    </p>
  );
}
