// The ride on the screen (UX_UI_SPEC.md §3.3; the founder, 2026-11-20: the band was in the middle of the view). While
// riding, a small chip sits under the wallet: the linha on its plate, where the van is ("Estamos na Marginal",
// "Próxima · Porto") and a little road with the van along it. The whole band is a drawer that comes down from the top
// by itself as the van comes into a paragem and while it stands there, and goes back up when it drives off. A thumb
// slides it: down on the chip to bring it, up on the band to put it away. Fetched when a van is near (F-226).

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { SpeechBalloon, Van } from "@nzila/ui";
import { useEffect, useRef, useState } from "preact/hooks";
import "./carrinha.css";

// The words of this came with it.
tr.extend(ptAOLater);

/** The ride as the street page last saw it. */
export interface RideSaid {
  readonly line: string;
  readonly stops: readonly string[];
  readonly stopsAt: readonly string[];
  /** The paragem ahead, or the one the van stands at when `waiting`. */
  readonly next: number;
  /** From the paragem behind toward `next`, 0 to 1. */
  readonly progress: number;
  readonly waiting: boolean;
  /** What the cobrador is calling, if anything. */
  readonly said: string | null;
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

/** How far toward the next paragem the band comes down by itself. */
export const NEAR_STOP = 0.75;
/** How long the band stays down after boarding, in milliseconds: the player sees where the van goes. */
const BOARDED_MS = 4000;
/** How far a thumb slides before it counts as a slide and not a tap, in pixels. */
const SLIDE_PX = 18;

/**
 * Whether the band is down. Pulled down by the player, it stays until pushed up. Otherwise it is down while the van
 * stands at a paragem or comes into one, and just after boarding, unless the player pushed it up for this paragem.
 */
export function bandDown(ride: Pick<RideSaid, "next" | "progress" | "waiting">, kept: { pulled: boolean; pushedFor: number | null; fresh: boolean }): boolean {
  if (kept.pulled) return true;
  return (ride.waiting || ride.progress >= NEAR_STOP || kept.fresh) && kept.pushedFor !== ride.next;
}

/** The chip and the band. `boarded` is false for a ride already under way (the styleguide's stills). */
export function Viagem({ ride, boarded = true }: { ride: RideSaid; boarded?: boolean }) {
  const [pulled, setPulled] = useState(false);
  const [pushedFor, setPushedFor] = useState<number | null>(null);
  const [fresh, setFresh] = useState(boarded);
  useEffect(() => {
    const after = setTimeout(() => setFresh(false), BOARDED_MS);
    return () => clearTimeout(after);
  }, []);
  const open = bandDown(ride, { pulled, pushedFor, fresh });
  const put = (down: boolean): void => {
    setPulled(down);
    if (!down) {
      setPushedFor(ride.next);
      setFresh(false);
    }
  };
  // A slide is told from a tap by how far the thumb went; the click that follows a slide is not a tap.
  const from = useRef<number | null>(null);
  const slid = useRef(false);
  const thumb = {
    onPointerDown: (event: PointerEvent): void => {
      from.current = event.clientY;
      slid.current = false;
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event: PointerEvent): void => {
      if (from.current === null) return;
      const dy = event.clientY - from.current;
      if (Math.abs(dy) < SLIDE_PX) return;
      from.current = null;
      slid.current = true;
      put(dy > 0);
    },
    onPointerUp: (): void => void (from.current = null),
    onPointerCancel: (): void => void (from.current = null),
    onClick: (): void => {
      if (slid.current) slid.current = false;
      else put(!open);
    },
  };
  const where = ride.waiting ? (ride.stopsAt[ride.next] ?? ride.stops[ride.next] ?? "") : (ride.stops[ride.next] ?? "");
  const last = Math.max(1, ride.stops.length - 1);
  const at = ride.waiting ? ride.next : Math.max(0, ride.next - 1 + Math.max(0, Math.min(1, ride.progress)));
  return (
    <>
      <button type="button" class={`cr-chip${open ? " cr-chip-hidden" : ""}`} aria-expanded={open} aria-label={`${tr.t(ride.waiting ? "route.atStop" : "route.next")} ${where}. ${tr.t(open ? "ride.band.hide" : "ride.band.show")}`} {...thumb}>
        <span class="cr-plate">{ride.line}</span>
        <span class="cr-where">
          <small>{tr.t(ride.waiting ? "route.atStop" : "route.next")}</small> <b>{where}</b>
        </span>
        <span class="cr-road" aria-hidden="true">
          {ride.stops.map((_, i) => (
            <i class={i < ride.next ? "cr-past" : i === ride.next ? "cr-next" : undefined} style={{ left: `${(i / last) * 100}%` }} />
          ))}
          <span class="cr-van" style={{ left: `${(at / last) * 100}%` }}>
            <Van width={24} />
          </span>
        </span>
        <span class="cr-grab" aria-hidden="true" />
      </button>
      {ride.said && !open ? (
        <p class="cr-said">
          <SpeechBalloon text={ride.said} />
        </p>
      ) : null}
      <div class={`cr-band${open ? " cr-band-down" : ""}`} aria-hidden={!open} {...thumb}>
        <div class="cr-paper">
          <RouteBand line={ride.line} stops={ride.stops} stopsAt={ride.stopsAt} next={ride.next} progress={ride.progress} waiting={ride.waiting} />
          <span class="cr-grab cr-grab-band" aria-hidden="true" />
        </div>
        {ride.said ? (
          <p class="cr-said cr-said-band">
            <SpeechBalloon text={ride.said} />
          </p>
        ) : null}
      </div>
    </>
  );
}
