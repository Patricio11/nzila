// The Telemóvel (UX_UI_SPEC.md §4): a sheet that rises over three quarters of
// the screen, the world still showing above it. Every system of the game is
// an app on its home grid, three by three. This file is the sheet and the
// grid; what an app shows is the game's to give.

import { type ComponentChildren } from "preact";
import { ptAOTranslator as tr } from "@nzila/i18n";
import { Glyph } from "./components.tsx";
import { type GlyphName } from "./glyphs.ts";

export interface PhoneApp<T extends string = string> {
  readonly id: T;
  readonly glyph: GlyphName;
  /** Already from the catalog. */
  readonly label: string;
}

/**
 * The phone sheet. With no `app` it shows the home grid; with one, that app's
 * name, a way back to the grid, and `children`.
 */
export function PhoneSheet<T extends string>({ open, apps, app, onOpen, onBack, onClose, children }: { open: boolean; apps: readonly PhoneApp<T>[]; app: T | null; onOpen?: (id: T) => void; onBack?: () => void; onClose?: () => void; children?: ComponentChildren }) {
  if (!open) return null;
  const current = apps.find((a) => a.id === app);
  return (
    <section class="n-phone" role="dialog" aria-label={tr.t("phone.title")}>
      <header class="n-phone-bar">
        {current ? (
          <button type="button" class="n-phone-key" aria-label={tr.t("phone.back")} onClick={onBack}>
            <Glyph name="voltar" size={22} />
          </button>
        ) : (
          <span class="n-phone-key n-phone-key-none" />
        )}
        <h2 class="n-phone-title">{current ? current.label : tr.t("phone.title")}</h2>
        <button type="button" class="n-phone-key" aria-label={tr.t("phone.close")} onClick={onClose}>
          <Glyph name="fechar" size={22} />
        </button>
      </header>
      {current ? (
        <div class="n-phone-app">{children}</div>
      ) : (
        <ul class="n-phone-grid">
          {apps.map((a) => (
            <li>
              <button type="button" class="n-phone-icon" onClick={() => onOpen?.(a.id)}>
                <span class="n-phone-tile">
                  <Glyph name={a.glyph} size={30} />
                </span>
                <span>{a.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One of a few choices, side by side: the quality of the picture, the hand. */
export function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: readonly { id: T; label: string }[]; value: T; onChange?: (id: T) => void }) {
  return (
    <div class="n-choice" role="radiogroup" aria-label={label}>
      <span class="n-choice-label">{label}</span>
      <span class="n-choice-options">
        {options.map((option) => (
          <button type="button" role="radio" aria-checked={option.id === value ? "true" : "false"} class={`n-choice-option${option.id === value ? " n-choice-on" : ""}`} onClick={() => onChange?.(option.id)}>
            {option.label}
          </button>
        ))}
      </span>
    </div>
  );
}
