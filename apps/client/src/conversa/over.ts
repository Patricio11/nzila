// What hangs over heads (Task 3.5): the words of whoever spoke, three dots
// over whoever is typing, an empty balloon over someone seen to speak from
// too far to read. So a conversation is visible from across the street
// before it can be read.
//
// A handful of balloons, made once and moved every frame to where their
// speakers' heads are on the screen. They are moved by hand and not by the
// interface's own drawing, which runs a few times a second: a balloon must
// ride its speaker without stuttering.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { Vector3, type Camera } from "three";
import { type Balloon } from "../net/talking.ts";

/** How many balloons are shown at once, the nearest first: a market is not a wall of text. */
export const BALLOONS_AT_ONCE = 6;
/** How far over the top of a head a balloon's tail is, in metres: clear of the name. */
const OVER_HEAD_M = 0.95;

/**
 * Makes the camera's own account of where it is current. The page moves the camera every frame, and what the camera
 * keeps for turning a place in the world into a place on the screen is only brought up to date when a picture is
 * drawn: asked between the two, it answers for where it was (finding F-170).
 */
export function sight(camera: Camera): void {
  camera.updateWorldMatrix(true, false);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
}

export interface Speaking {
  readonly id: number;
  /** The top of the speaker's head, in metres. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly balloon: Balloon;
}

export class Over {
  private readonly box: HTMLElement;
  private readonly pool: HTMLElement[] = [];
  private readonly at = new Vector3();
  /** What each balloon last showed, so that the page is not rewritten when nothing changed. */
  private readonly showing: string[] = [];

  constructor(box: HTMLElement) {
    this.box = box;
    for (let n = 0; n < BALLOONS_AT_ONCE; n++) {
      const balloon = document.createElement("span");
      balloon.className = "n-balloon";
      balloon.hidden = true;
      box.append(balloon);
      this.pool.push(balloon);
      this.showing.push("");
    }
  }

  /** How many balloons are on the screen now: for the tests. */
  shown = 0;

  /** Puts each speaker's balloon over their head. `viewer` is where the player stands: the nearest speakers are the ones shown. */
  update(camera: Camera, speakers: readonly Speaking[], viewerX: number, viewerZ: number): void {
    const wide = this.box.clientWidth;
    const high = this.box.clientHeight;
    sight(camera);
    const nearest = [...speakers].sort((a, b) => Math.hypot(a.x - viewerX, a.z - viewerZ) - Math.hypot(b.x - viewerX, b.z - viewerZ)).slice(0, BALLOONS_AT_ONCE);
    let used = 0;
    for (const one of nearest) {
      this.at.set(one.x, one.y + OVER_HEAD_M, one.z).project(camera);
      // Behind the camera, or off the screen: nothing to hang it on.
      if (this.at.z > 1 || Math.abs(this.at.x) > 1.1 || Math.abs(this.at.y) > 1.1) continue;
      const balloon = this.pool[used]!;
      const key = one.balloon.typing ? "…" : `:${one.balloon.text}`;
      if (this.showing[used] !== key) {
        this.showing[used] = key;
        balloon.replaceChildren();
        balloon.className = `n-balloon${one.balloon.typing || one.balloon.text ? "" : " n-balloon-far"}`;
        if (one.balloon.typing) {
          const dots = document.createElement("span");
          dots.className = "n-dots";
          dots.setAttribute("role", "img");
          dots.setAttribute("aria-label", tr.t("chat.typing"));
          dots.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
          balloon.append(dots);
        } else {
          // As text, never as markup: these are another player's words.
          balloon.textContent = one.balloon.text;
        }
      }
      // The tail of the balloon, its lower left corner, is at the head; farther speakers' balloons are a little smaller.
      const far = Math.hypot(one.x - viewerX, one.z - viewerZ);
      const size = Math.max(0.72, Math.min(1, 1.15 - far / 22));
      balloon.hidden = false;
      // Kept whole on the screen: a balloon whose speaker stands at the edge slides in beside them, and one whose
      // speaker's head is at the very top hangs just under the edge.
      const left = Math.min(Math.max(8, ((this.at.x + 1) / 2) * wide), Math.max(8, wide - balloon.offsetWidth * size - 8));
      const foot = Math.max(balloon.offsetHeight * size + 8, ((1 - this.at.y) / 2) * high);
      balloon.style.transform = `translate(${left.toFixed(1)}px, ${foot.toFixed(1)}px) translate(0, -100%) scale(${size.toFixed(2)})`;
      used++;
    }
    for (let n = used; n < this.pool.length; n++) {
      if (!this.pool[n]!.hidden) this.pool[n]!.hidden = true;
      this.showing[n] = "";
    }
    this.shown = used;
  }

  close(): void {
    for (const balloon of this.pool) balloon.remove();
  }
}

/** The body nearest a touch on the screen, within a finger's width; null when the touch landed on nobody. */
export function touched(camera: Camera, heads: readonly { id: number; x: number; y: number; z: number }[], touchX: number, touchY: number, wide: number, high: number): number | null {
  const at = new Vector3();
  sight(camera);
  let best: number | null = null;
  let bestFar = 44;
  for (const one of heads) {
    // The middle of the body, about a metre under the top of the head.
    at.set(one.x, one.y - 0.75, one.z).project(camera);
    if (at.z > 1) continue;
    const head = new Vector3(one.x, one.y, one.z).project(camera);
    // A body is taller than it is wide: the touch may be anywhere down its height.
    const x = ((at.x + 1) / 2) * wide;
    const top = ((1 - head.y) / 2) * high;
    const middle = ((1 - at.y) / 2) * high;
    const tall = Math.max(24, (middle - top) * 2);
    const dx = Math.abs(touchX - x);
    const dy = Math.max(0, Math.abs(touchY - middle) - tall / 2);
    const far = Math.hypot(dx, dy);
    if (far < bestFar) {
      bestFar = far;
      best = one.id;
    }
  }
  return best;
}
